import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { agentsTable, agentPhoneNumbersTable } from "@workspace/db/schema";
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

export default router;
