import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { agentsTable, agentPhoneNumbersTable, rawListingsTable, fraudScoresTable, reportRequestsTable } from "@workspace/db/schema";
import { eq, and, gte, ilike, or, count, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── GET /agents ───────────────────────────────────────────────────────────────

const AgentsQuerySchema = z.object({
  q: z.string().optional(),
  minReputationScore: z.coerce.number().optional(),
  isBlacklisted: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  page: z.coerce.number().int().default(1),
  pageSize: z.coerce.number().int().max(100).default(20),
});

router.get("/agents", async (req: Request, res: Response) => {
  const parsed = AgentsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: "Invalid query" });
    return;
  }

  const { q, minReputationScore, isBlacklisted, page, pageSize } = parsed.data;

  try {
    const conditions = [];
    if (minReputationScore != null) conditions.push(gte(agentsTable.reputationScore, minReputationScore));
    if (isBlacklisted != null) conditions.push(eq(agentsTable.isBlacklisted, isBlacklisted));
    if (q) {
      conditions.push(or(
        ilike(agentsTable.name, `%${q}%`),
        ilike(agentsTable.company, `%${q}%`),
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * pageSize;

    const [agents, [{ total }]] = await Promise.all([
      db
        .select({
          id: agentsTable.id,
          name: agentsTable.name,
          company: agentsTable.company,
          reputationScore: agentsTable.reputationScore,
          totalListings: agentsTable.totalListings,
          ghostListingRate: agentsTable.ghostListingRate,
          isVerified: agentsTable.isVerified,
          isBlacklisted: agentsTable.isBlacklisted,
        })
        .from(agentsTable)
        .where(where)
        .orderBy(sql`${agentsTable.totalListings} DESC`)
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(agentsTable).where(where),
    ]);

    res.json({ agents, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    logger.error({ err }, "agents.list_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch agents" });
  }
});

// ── GET /agents/:id ───────────────────────────────────────────────────────────

router.get("/agents/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid agent ID" });
    return;
  }

  try {
    const [[agent], phones] = await Promise.all([
      db.select().from(agentsTable).where(eq(agentsTable.id, id)).limit(1),
      db.select({ phone: agentPhoneNumbersTable.phoneNumber })
        .from(agentPhoneNumbersTable)
        .where(eq(agentPhoneNumbersTable.agentId, id)),
    ]);

    if (!agent) {
      res.status(404).json({ error: "not_found", message: "Agent not found" });
      return;
    }

    res.json({
      id: agent.id,
      name: agent.name,
      company: agent.company,
      reputationScore: agent.reputationScore,
      totalListings: agent.totalListings,
      ghostListingRate: agent.ghostListingRate,
      priceConsistencyScore: agent.priceConsistencyScore,
      duplicateListingRate: agent.duplicateListingRate,
      isVerified: agent.isVerified,
      isBlacklisted: agent.isBlacklisted,
      blacklistReason: agent.blacklistReason,
      phoneNumbers: phones.map((p) => p.phone),
      recentListings: [],
    });
  } catch (err) {
    logger.error({ err, id }, "agents.get_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch agent" });
  }
});

// ── GET /agents/:id/reports ───────────────────────────────────────────────────

router.get("/agents/:id/reports", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid agent ID" });
    return;
  }

  try {
    const reports = await db
      .select({
        id: reportRequestsTable.id,
        inputUrl: reportRequestsTable.inputUrl,
        inputAddress: reportRequestsTable.inputAddress,
        createdAt: reportRequestsTable.createdAt,
        score: fraudScoresTable.score,
        riskLevel: fraudScoresTable.riskLevel,
        neighbourhood: rawListingsTable.neighbourhood,
        listingType: rawListingsTable.listingType,
      })
      .from(reportRequestsTable)
      .innerJoin(fraudScoresTable, eq(reportRequestsTable.fraudScoreId, fraudScoresTable.id))
      .innerJoin(rawListingsTable, eq(fraudScoresTable.listingId, rawListingsTable.id))
      .where(and(
        eq(rawListingsTable.agentId, id),
        eq(reportRequestsTable.status, "complete"),
      ))
      .orderBy(sql`${reportRequestsTable.createdAt} DESC`)
      .limit(10);

    const counts = reports.reduce(
      (acc, r) => {
        if (r.riskLevel === "high" || r.riskLevel === "critical") acc.highRisk++;
        if (r.score != null) { acc.scoreSum += r.score; acc.scoredCount++; }
        return acc;
      },
      { highRisk: 0, scoreSum: 0, scoredCount: 0 }
    );

    res.json({
      reports,
      total: reports.length,
      highRiskCount: counts.highRisk,
      avgScore: counts.scoredCount > 0 ? Math.round(counts.scoreSum / counts.scoredCount) : null,
    });
  } catch (err) {
    logger.error({ err, id }, "agents.reports_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch agent reports" });
  }
});

// ── GET /agents/by-phone/:phone ────────────────────────────────────────────────

router.get("/agents/by-phone/:phone", async (req: Request, res: Response) => {
  const raw = decodeURIComponent(req.params["phone"] as string).trim();
  if (!raw || raw.length < 7) {
    res.status(400).json({ error: "bad_request", message: "Invalid phone number" });
    return;
  }

  // normalise: strip non-digit/+, convert 07x → +2547x
  const digits = raw.replace(/[^\d+]/g, "");
  let normalised = digits;
  if (digits.startsWith("+254")) normalised = digits;
  else if (digits.startsWith("254")) normalised = "+" + digits;
  else if (digits.startsWith("07") || digits.startsWith("01")) normalised = "+254" + digits.slice(1);
  else if (digits.startsWith("7") || digits.startsWith("1")) normalised = "+254" + digits;

  try {
    const [phoneRow] = await db
      .select({ agentId: agentPhoneNumbersTable.agentId })
      .from(agentPhoneNumbersTable)
      .where(eq(agentPhoneNumbersTable.normalised, normalised))
      .limit(1);

    if (!phoneRow) {
      res.json({ found: false, agentId: null });
      return;
    }

    res.json({ found: true, agentId: phoneRow.agentId });
  } catch (err) {
    logger.error({ err, normalised }, "agents.by_phone_error");
    res.status(500).json({ error: "internal_error", message: "Lookup failed" });
  }
});

export default router;
