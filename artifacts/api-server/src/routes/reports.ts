import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { reportRequestsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const SubmitReportSchema = z.object({
  inputUrl: z.string().url().optional(),
  inputAddress: z.string().min(5).optional(),
  email: z.string().email(),
}).refine(
  (d) => d.inputUrl || d.inputAddress,
  { message: "Either inputUrl or inputAddress must be provided" }
);

// ── POST /reports ─────────────────────────────────────────────────────────────

router.post("/reports", async (req: Request, res: Response) => {
  const parsed = SubmitReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      error: "validation_error",
      message: "Invalid request body",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { inputUrl, inputAddress, email } = parsed.data;

  try {
    const [report] = await db
      .insert(reportRequestsTable)
      .values({
        inputUrl: inputUrl ?? null,
        inputAddress: inputAddress ?? null,
        inputType: inputUrl ? "url" : "address",
        email,
        status: "pending",
      })
      .returning();

    logger.info({ reportId: report.id, email }, "report.submitted");

    // Fire-and-forget: trigger the Python pipeline via internal HTTP
    // In production this would be a Celery task enqueue via Redis
    triggerReportProcessing(report.id).catch((err) =>
      logger.error({ reportId: report.id, err }, "report.trigger_failed")
    );

    res.status(201).json({
      id: report.id,
      status: report.status,
      email: report.email,
      inputUrl: report.inputUrl,
      inputAddress: report.inputAddress,
      createdAt: report.createdAt,
      estimatedCompletionMinutes: 5,
    });
  } catch (err) {
    logger.error({ err }, "report.submit_error");
    res.status(500).json({ error: "internal_error", message: "Failed to create report request" });
  }
});

// ── GET /reports/:id ──────────────────────────────────────────────────────────

router.get("/reports/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid report ID" });
    return;
  }

  try {
    const [report] = await db
      .select()
      .from(reportRequestsTable)
      .where(eq(reportRequestsTable.id, id))
      .limit(1);

    if (!report) {
      res.status(404).json({ error: "not_found", message: "Report not found" });
      return;
    }

    // Fetch fraud score if available
    let fraudScore = null;
    let duplicateListings: unknown[] = [];
    let platformCount = null;
    let priceRangeKsh = null;

    if (report.fraudScoreId) {
      const scoreData = await fetchFraudScoreData(report.fraudScoreId, report.clusterId);
      fraudScore = scoreData.fraudScore;
      duplicateListings = scoreData.duplicateListings;
      platformCount = scoreData.platformCount;
      priceRangeKsh = scoreData.priceRangeKsh;
    }

    res.json({
      id: report.id,
      status: report.status,
      email: report.email,
      inputUrl: report.inputUrl,
      inputAddress: report.inputAddress,
      createdAt: report.createdAt,
      completedAt: report.status === "complete" ? report.updatedAt : null,
      reportUrl: report.reportUrl,
      fraudScore,
      duplicateListings,
      platformCount,
      priceRangeKsh,
      failureReason: report.failureReason,
    });
  } catch (err) {
    logger.error({ err, id }, "report.get_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch report" });
  }
});

// ── Internal helpers ──────────────────────────────────────────────────────────

async function triggerReportProcessing(reportId: number): Promise<void> {
  const scraperApiUrl = process.env.PYTHON_API_URL ?? "http://localhost:8000";
  try {
    const resp = await fetch(`${scraperApiUrl}/reports/process/${reportId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok) {
      logger.warn({ reportId, status: resp.status }, "report.trigger_non_ok");
    }
  } catch (err) {
    // Python API may not be running in dev — that's fine, report stays pending
    logger.warn({ reportId, err }, "report.trigger_unavailable");
  }
}

async function fetchFraudScoreData(
  fraudScoreId: number,
  clusterId: number | null
): Promise<{
  fraudScore: unknown;
  duplicateListings: unknown[];
  platformCount: number | null;
  priceRangeKsh: { min: number; max: number } | null;
}> {
  try {
    const { fraudScoresTable, dedupClustersTable, dedupClusterMembersTable, rawListingsTable, platformsTable } = await import("@workspace/db/schema");
    const { eq: eqOp } = await import("drizzle-orm");

    const [score] = await db
      .select()
      .from(fraudScoresTable)
      .where(eqOp(fraudScoresTable.id, fraudScoreId))
      .limit(1);

    if (!score) return { fraudScore: null, duplicateListings: [], platformCount: null, priceRangeKsh: null };

    const fraudScore = {
      score: score.score,
      riskLevel: score.riskLevel,
      summary: score.summary,
      signals: score.signals ?? [],
      platformCountScore: score.platformCountScore,
      priceSpreadScore: score.priceSpreadScore,
      agentPhoneOverlapScore: score.agentPhoneOverlapScore,
      daysOnMarketScore: score.daysOnMarketScore,
      imageReuseScore: score.imageReuseScore,
      priceAnomalyScore: score.priceAnomalyScore,
    };

    let duplicateListings: unknown[] = [];
    let platformCount: number | null = null;
    let priceRangeKsh: { min: number; max: number } | null = null;

    if (clusterId) {
      const [cluster] = await db
        .select()
        .from(dedupClustersTable)
        .where(eqOp(dedupClustersTable.id, clusterId))
        .limit(1);

      if (cluster) {
        platformCount = cluster.platformCount;
        if (cluster.priceMin != null && cluster.priceMax != null) {
          priceRangeKsh = { min: cluster.priceMin, max: cluster.priceMax };
        }

        // Fetch duplicate listings in this cluster
        const members = await db
          .select({
            listingId: dedupClusterMembersTable.listingId,
          })
          .from(dedupClusterMembersTable)
          .where(eqOp(dedupClusterMembersTable.clusterId, clusterId))
          .limit(20);

        if (members.length > 0) {
          const listingIds = members.map((m) => m.listingId);
          const listings = await db
            .select({
              id: rawListingsTable.id,
              url: rawListingsTable.url,
              priceKsh: rawListingsTable.priceKsh,
              agentPhone: rawListingsTable.agentRawPhone,
              platformSlug: platformsTable.slug,
            })
            .from(rawListingsTable)
            .innerJoin(platformsTable, eqOp(rawListingsTable.platformId, platformsTable.id))
            .where(eqOp(rawListingsTable.id, listingIds[0])) // simplified for now
            .limit(20);

          duplicateListings = listings.map((l) => ({
            platform: l.platformSlug,
            url: l.url,
            priceKsh: l.priceKsh,
            agentPhone: l.agentPhone,
          }));
        }
      }
    }

    return { fraudScore, duplicateListings, platformCount, priceRangeKsh };
  } catch {
    return { fraudScore: null, duplicateListings: [], platformCount: null, priceRangeKsh: null };
  }
}

export default router;
