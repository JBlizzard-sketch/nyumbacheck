/**
 * Admin API routes
 *
 * Returns aggregate stats and management data for the operator dashboard.
 * These are read-only public aggregations (the admin UI adds client-side access control).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  reportRequestsTable,
  fraudScoresTable,
  scammerRegistryTable,
  rawListingsTable,
  dedupClustersTable,
  neighbourhoodsTable,
} from "@workspace/db/schema";
import { sql, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { processReport } from "../lib/report-simulator";

const router: IRouter = Router();

// ── GET /admin/stats ──────────────────────────────────────────────────────────

router.get("/admin/stats", async (_req: Request, res: Response) => {
  try {
    const [reports] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`,
        processing: sql<number>`COUNT(*) FILTER (WHERE status = 'processing')`,
        complete: sql<number>`COUNT(*) FILTER (WHERE status = 'complete')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')`,
        awaitingPayment: sql<number>`COUNT(*) FILTER (WHERE status = 'awaiting_payment')`,
        paid: sql<number>`COUNT(*) FILTER (WHERE is_paid = 1)`,
      })
      .from(reportRequestsTable);

    const [scores] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        avgScore: sql<number>`ROUND(AVG(score)::numeric, 1)`,
        critical: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'critical')`,
        high: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'high')`,
        medium: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'medium')`,
        low: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'low')`,
      })
      .from(fraudScoresTable);

    const [scammers] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE is_confirmed = true)`,
      })
      .from(scammerRegistryTable);

    const [listings] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(rawListingsTable);

    const [clusters] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(dedupClustersTable);

    res.json({
      reports,
      fraudScores: scores,
      scammerRegistry: scammers,
      listings,
      clusters,
    });
  } catch (err) {
    logger.error({ err }, "admin.stats_error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /admin/reports ────────────────────────────────────────────────────────

router.get("/admin/reports", async (req: Request, res: Response) => {
  const { limit = "20", offset = "0", status } = req.query as Record<string, string>;

  try {
    const rows = await db
      .select({
        id: reportRequestsTable.id,
        email: reportRequestsTable.email,
        status: reportRequestsTable.status,
        inputUrl: reportRequestsTable.inputUrl,
        inputAddress: reportRequestsTable.inputAddress,
        isPaid: reportRequestsTable.isPaid,
        createdAt: reportRequestsTable.createdAt,
        score: fraudScoresTable.score,
        riskLevel: fraudScoresTable.riskLevel,
      })
      .from(reportRequestsTable)
      .leftJoin(fraudScoresTable, eq(reportRequestsTable.fraudScoreId, fraudScoresTable.id))
      .where(status ? eq(reportRequestsTable.status, status as "pending" | "complete" | "failed" | "processing" | "awaiting_payment") : sql`TRUE`)
      .orderBy(desc(reportRequestsTable.createdAt))
      .limit(Math.min(parseInt(limit, 10) || 20, 100))
      .offset(parseInt(offset, 10) || 0);

    res.json({ reports: rows });
  } catch (err) {
    logger.error({ err }, "admin.reports_error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /admin/scammers ───────────────────────────────────────────────────────

router.get("/admin/scammers", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(scammerRegistryTable)
      .orderBy(desc(scammerRegistryTable.reportCount))
      .limit(100);
    res.json({ scammers: rows });
  } catch (err) {
    logger.error({ err }, "admin.scammers_error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /admin/reports/:id/simulate ─────────────────────────────────────────

router.post("/admin/reports/:id/simulate", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  try {
    const [report] = await db
      .select({ id: reportRequestsTable.id, status: reportRequestsTable.status })
      .from(reportRequestsTable)
      .where(eq(reportRequestsTable.id, id))
      .limit(1);

    if (!report) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (report.status === "complete") {
      res.status(400).json({ error: "already_complete" });
      return;
    }

    // Advance to processing if not already there
    if (report.status !== "processing") {
      await db
        .update(reportRequestsTable)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(reportRequestsTable.id, id));
    }

    // Run the simulator synchronously so this request resolves when done
    await processReport(id);

    const [updated] = await db
      .select({ status: reportRequestsTable.status })
      .from(reportRequestsTable)
      .where(eq(reportRequestsTable.id, id))
      .limit(1);

    logger.info({ reportId: id, newStatus: updated?.status }, "admin.simulate_report");
    res.json({ ok: true, status: updated?.status ?? "complete" });
  } catch (err) {
    logger.error({ err, id }, "admin.simulate_report_error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /admin/scammers/:id/confirm ─────────────────────────────────────────

const ConfirmSchema = z.object({ confirmed: z.boolean() });

router.post("/admin/scammers/:id/confirm", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string, 10);
  const parsed = ConfirmSchema.safeParse(req.body);
  if (!parsed.success || isNaN(id)) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  try {
    const [updated] = await db
      .update(scammerRegistryTable)
      .set({
        isConfirmed: parsed.data.confirmed,
        confirmedAt: parsed.data.confirmed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(scammerRegistryTable.id, id))
      .returning();

    res.json({ scammer: updated });
  } catch (err) {
    logger.error({ err, id }, "admin.confirm_scammer_error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
