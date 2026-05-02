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
  userId: z.string().optional(),
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

  const { inputUrl, inputAddress, email, userId } = parsed.data;

  try {
    // Try to create a Stripe checkout session. If Stripe is unavailable (dev/no keys),
    // fall back to free mode so the demo works without payment credentials.
    let stripeCheckoutUrl: string | null = null;
    let initialStatus: "awaiting_payment" | "pending" = "pending";

    try {
      const { getUncachableStripeClient } = await import("../lib/stripeClient");
      const stripe = await getUncachableStripeClient();

      // Temporarily insert with placeholder id to get an ID for the session metadata
      const [tempReport] = await db
        .insert(reportRequestsTable)
        .values({
          inputUrl: inputUrl ?? null,
          inputAddress: inputAddress ?? null,
          inputType: inputUrl ? "url" : "address",
          email,
          userId: userId ?? null,
          status: "awaiting_payment",
        })
        .returning();

      const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
      const baseUrl = domain ? `https://${domain}` : `http://localhost:${process.env["PORT"] ?? 8080}`;

      // Use inline price_data (fallback) — seed-products.ts creates a proper product
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: 400, // $4.00 ≈ KSh 500
              product_data: {
                name: "NyumbaCheck Fraud Report",
                description: `Comprehensive fraud risk analysis for property listing #${tempReport.id}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: email,
        success_url: `${baseUrl}/reports/${tempReport.id}?payment=success`,
        cancel_url: `${baseUrl}/reports/${tempReport.id}?payment=cancelled`,
        metadata: { reportId: String(tempReport.id), email },
      });

      // Persist the session ID so the webhook can look up this report
      await db.execute(
        (await import("drizzle-orm")).sql`UPDATE report_requests SET stripe_session_id = ${session.id}, updated_at = NOW() WHERE id = ${tempReport.id}`
      );

      logger.info({ reportId: tempReport.id, sessionId: session.id }, "report.stripe_checkout_created");

      res.status(201).json({
        id: tempReport.id,
        status: tempReport.status,
        email: tempReport.email,
        inputUrl: tempReport.inputUrl,
        inputAddress: tempReport.inputAddress,
        createdAt: tempReport.createdAt,
        estimatedCompletionMinutes: 5,
        checkoutUrl: session.url,
      });
      return;
    } catch (stripeErr) {
      // Stripe unavailable — run in free/demo mode
      logger.warn({ stripeErr }, "report.stripe_unavailable_fallback_to_free");
      initialStatus = "pending";
    }

    // Free mode: insert directly as pending
    const [report] = await db
      .insert(reportRequestsTable)
      .values({
        inputUrl: inputUrl ?? null,
        inputAddress: inputAddress ?? null,
        inputType: inputUrl ? "url" : "address",
        email,
        userId: userId ?? null,
        status: initialStatus,
      })
      .returning();

    logger.info({ reportId: report.id, email, stripeCheckoutUrl }, "report.submitted");

    res.status(201).json({
      id: report.id,
      status: report.status,
      email: report.email,
      inputUrl: report.inputUrl,
      inputAddress: report.inputAddress,
      createdAt: report.createdAt,
      estimatedCompletionMinutes: 5,
      checkoutUrl: null,
    });
  } catch (err) {
    logger.error({ err }, "report.submit_error");
    res.status(500).json({ error: "internal_error", message: "Failed to create report request" });
  }
});

// ── GET /reports/:id ──────────────────────────────────────────────────────────

router.get("/reports/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string, 10);
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

// ── GET /reports/mine ─────────────────────────────────────────────────────────

router.get("/reports/mine", async (req: Request, res: Response) => {
  const userId = z.string().min(1).safeParse(req.query.userId);
  if (!userId.success) {
    res.status(400).json({ error: "bad_request", message: "userId query parameter required" });
    return;
  }

  try {
    const { fraudScoresTable } = await import("@workspace/db/schema");
    const { eq: eqOp, desc } = await import("drizzle-orm");

    const reports = await db
      .select({
        id: reportRequestsTable.id,
        inputUrl: reportRequestsTable.inputUrl,
        inputAddress: reportRequestsTable.inputAddress,
        email: reportRequestsTable.email,
        status: reportRequestsTable.status,
        createdAt: reportRequestsTable.createdAt,
        score: fraudScoresTable.score,
        riskLevel: fraudScoresTable.riskLevel,
      })
      .from(reportRequestsTable)
      .leftJoin(fraudScoresTable, eqOp(reportRequestsTable.fraudScoreId, fraudScoresTable.id))
      .where(eqOp(reportRequestsTable.userId, userId.data))
      .orderBy(desc(reportRequestsTable.createdAt))
      .limit(50);

    res.json({ reports });
  } catch (err) {
    logger.error({ err }, "report.mine_error");
    res.status(500).json({ error: "internal_error" });
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
    const { eq: eqOp, inArray } = await import("drizzle-orm");

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
            .where(inArray(rawListingsTable.id, listingIds))
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
