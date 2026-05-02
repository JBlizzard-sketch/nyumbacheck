import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { neighbourhoodsTable, marketSnapshotsTable } from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── GET /market/neighbourhoods ────────────────────────────────────────────────

router.get("/market/neighbourhoods", async (_req: Request, res: Response) => {
  try {
    const neighbourhoods = await db
      .select()
      .from(neighbourhoodsTable)
      .where(eq(neighbourhoodsTable.isTracked, 1))
      .orderBy(neighbourhoodsTable.name);

    res.json({ neighbourhoods });
  } catch (err) {
    logger.error({ err }, "market.neighbourhoods_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch neighbourhoods" });
  }
});

// ── GET /market/stats ─────────────────────────────────────────────────────────

const MarketStatsQuerySchema = z.object({
  neighbourhood: z.string(),
  listingType: z.enum(["rent", "sale"]).default("rent"),
  days: z.coerce.number().int().default(30),
});

router.get("/market/stats", async (req: Request, res: Response) => {
  const parsed = MarketStatsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: "neighbourhood is required" });
    return;
  }

  const { neighbourhood, listingType, days } = parsed.data;

  try {
    const [nbhd] = await db
      .select()
      .from(neighbourhoodsTable)
      .where(eq(neighbourhoodsTable.slug, neighbourhood))
      .limit(1);

    if (!nbhd) {
      res.status(404).json({ error: "not_found", message: "Neighbourhood not found" });
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Aggregate across all snapshots in the period
    const [stats] = await db
      .select({
        totalActiveListings: sql<number>`SUM(${marketSnapshotsTable.activeListings})`,
        totalUniqueProperties: sql<number>`SUM(${marketSnapshotsTable.uniqueProperties})`,
        avgDuplicateRate: sql<number>`AVG(${marketSnapshotsTable.duplicateRate})`,
        avgMedianPriceKsh: sql<number>`AVG(${marketSnapshotsTable.medianPriceKsh})`,
        avgMedianPricePerSqft: sql<number>`AVG(${marketSnapshotsTable.medianPricePerSqftKsh})`,
        avgP25Price: sql<number>`AVG(${marketSnapshotsTable.p25PriceKsh})`,
        avgP75Price: sql<number>`AVG(${marketSnapshotsTable.p75PriceKsh})`,
        avgDaysOnMarket: sql<number>`AVG(${marketSnapshotsTable.medianDaysOnMarket})`,
        avgVelocity: sql<number>`AVG(${marketSnapshotsTable.listingVelocityIndex})`,
        totalHighFraud: sql<number>`SUM(${marketSnapshotsTable.highFraudListings})`,
        avgFraudScore: sql<number>`AVG(${marketSnapshotsTable.avgFraudScore})`,
      })
      .from(marketSnapshotsTable)
      .where(
        and(
          eq(marketSnapshotsTable.neighbourhoodId, nbhd.id),
          eq(marketSnapshotsTable.listingType, listingType),
          gte(marketSnapshotsTable.snapshotDate, cutoffDate.toISOString().split("T")[0])
        )
      )
      .limit(1);

    res.json({
      neighbourhood,
      listingType,
      period: `Last ${days} days`,
      activeListings: stats?.totalActiveListings ?? 0,
      uniqueProperties: stats?.totalUniqueProperties ?? 0,
      duplicateRate: stats?.avgDuplicateRate ?? null,
      medianPriceKsh: stats?.avgMedianPriceKsh ?? null,
      medianPricePerSqftKsh: stats?.avgMedianPricePerSqft ?? null,
      p25PriceKsh: stats?.avgP25Price ?? null,
      p75PriceKsh: stats?.avgP75Price ?? null,
      medianDaysOnMarket: stats?.avgDaysOnMarket ?? null,
      listingVelocityIndex: stats?.avgVelocity ?? null,
      highFraudListings: stats?.totalHighFraud ?? 0,
      avgFraudScore: stats?.avgFraudScore ?? null,
    });
  } catch (err) {
    logger.error({ err }, "market.stats_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch market stats" });
  }
});

// ── GET /market/trends ────────────────────────────────────────────────────────

const MarketTrendsQuerySchema = z.object({
  neighbourhood: z.string(),
  listingType: z.enum(["rent", "sale"]).default("rent"),
  days: z.coerce.number().int().default(90),
});

router.get("/market/trends", async (req: Request, res: Response) => {
  const parsed = MarketTrendsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: "neighbourhood is required" });
    return;
  }

  const { neighbourhood, listingType, days } = parsed.data;

  try {
    const [nbhd] = await db
      .select()
      .from(neighbourhoodsTable)
      .where(eq(neighbourhoodsTable.slug, neighbourhood))
      .limit(1);

    if (!nbhd) {
      res.status(404).json({ error: "not_found", message: "Neighbourhood not found" });
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const snapshots = await db
      .select({
        date: marketSnapshotsTable.snapshotDate,
        medianPriceKsh: marketSnapshotsTable.medianPriceKsh,
        activeListings: marketSnapshotsTable.activeListings,
        newListings: marketSnapshotsTable.newListings,
        medianDaysOnMarket: marketSnapshotsTable.medianDaysOnMarket,
      })
      .from(marketSnapshotsTable)
      .where(
        and(
          eq(marketSnapshotsTable.neighbourhoodId, nbhd.id),
          eq(marketSnapshotsTable.listingType, listingType),
          gte(marketSnapshotsTable.snapshotDate, cutoffDate.toISOString().split("T")[0])
        )
      )
      .orderBy(marketSnapshotsTable.snapshotDate);

    res.json({
      neighbourhood,
      listingType,
      dataPoints: snapshots.map((s) => ({
        date: s.date,
        medianPriceKsh: s.medianPriceKsh,
        activeListings: s.activeListings,
        newListings: s.newListings,
        medianDaysOnMarket: s.medianDaysOnMarket,
      })),
    });
  } catch (err) {
    logger.error({ err }, "market.trends_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch trends" });
  }
});

export default router;
