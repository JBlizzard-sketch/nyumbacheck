import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { rawListingsTable, fraudScoresTable, platformsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── GET /listings ─────────────────────────────────────────────────────────────

const ListingsQuerySchema = z.object({
  neighbourhood: z.string().optional(),
  listingType: z.enum(["rent", "sale"]).optional(),
  minBedrooms: z.coerce.number().int().optional(),
  maxBedrooms: z.coerce.number().int().optional(),
  minPriceKsh: z.coerce.number().optional(),
  maxPriceKsh: z.coerce.number().optional(),
  platform: z.string().optional(),
  minFraudScore: z.coerce.number().optional(),
  page: z.coerce.number().int().default(1),
  pageSize: z.coerce.number().int().max(100).default(20),
});

router.get("/listings", async (req: Request, res: Response) => {
  const parsed = ListingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: "Invalid query parameters" });
    return;
  }

  const { neighbourhood, listingType, minBedrooms, maxBedrooms, minPriceKsh, maxPriceKsh, page, pageSize } = parsed.data;

  try {
    const conditions = [eq(rawListingsTable.isActive, true)];
    if (neighbourhood) conditions.push(eq(rawListingsTable.neighbourhood, neighbourhood));
    if (listingType) conditions.push(eq(rawListingsTable.listingType, listingType));
    if (minBedrooms != null) conditions.push(gte(rawListingsTable.bedrooms, minBedrooms));
    if (maxBedrooms != null) conditions.push(lte(rawListingsTable.bedrooms, maxBedrooms));
    if (minPriceKsh != null) conditions.push(gte(rawListingsTable.priceKsh, minPriceKsh));
    if (maxPriceKsh != null) conditions.push(lte(rawListingsTable.priceKsh, maxPriceKsh));

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [listings, [{ total }]] = await Promise.all([
      db
        .select({
          id: rawListingsTable.id,
          platform: platformsTable.slug,
          url: rawListingsTable.url,
          title: rawListingsTable.title,
          listingType: rawListingsTable.listingType,
          priceKsh: rawListingsTable.priceKsh,
          bedrooms: rawListingsTable.bedrooms,
          bathrooms: rawListingsTable.bathrooms,
          sqft: rawListingsTable.sqft,
          neighbourhood: rawListingsTable.neighbourhood,
          isActive: rawListingsTable.isActive,
          firstSeenAt: rawListingsTable.firstSeenAt,
          fraudScore: fraudScoresTable.score,
          riskLevel: fraudScoresTable.riskLevel,
        })
        .from(rawListingsTable)
        .innerJoin(platformsTable, eq(rawListingsTable.platformId, platformsTable.id))
        .leftJoin(fraudScoresTable, eq(fraudScoresTable.listingId, rawListingsTable.id))
        .where(where)
        .orderBy(sql`${rawListingsTable.firstSeenAt} DESC`)
        .limit(pageSize)
        .offset(offset),
      db
        .select({ total: count() })
        .from(rawListingsTable)
        .where(where),
    ]);

    res.json({
      listings,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    logger.error({ err }, "listings.list_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch listings" });
  }
});

// ── GET /listings/:id ─────────────────────────────────────────────────────────

router.get("/listings/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid listing ID" });
    return;
  }

  try {
    const [listing] = await db
      .select({
        id: rawListingsTable.id,
        platform: platformsTable.slug,
        url: rawListingsTable.url,
        title: rawListingsTable.title,
        listingType: rawListingsTable.listingType,
        priceKsh: rawListingsTable.priceKsh,
        bedrooms: rawListingsTable.bedrooms,
        bathrooms: rawListingsTable.bathrooms,
        sqft: rawListingsTable.sqft,
        neighbourhood: rawListingsTable.neighbourhood,
        rawAddress: rawListingsTable.rawAddress,
        imageUrls: rawListingsTable.imageUrls,
        agentRawName: rawListingsTable.agentRawName,
        agentRawPhone: rawListingsTable.agentRawPhone,
        daysOnMarket: rawListingsTable.daysOnMarket,
        isActive: rawListingsTable.isActive,
        firstSeenAt: rawListingsTable.firstSeenAt,
        fraudScore: fraudScoresTable.score,
        riskLevel: fraudScoresTable.riskLevel,
        fraudSummary: fraudScoresTable.summary,
        fraudSignals: fraudScoresTable.signals,
      })
      .from(rawListingsTable)
      .innerJoin(platformsTable, eq(rawListingsTable.platformId, platformsTable.id))
      .leftJoin(fraudScoresTable, eq(fraudScoresTable.listingId, rawListingsTable.id))
      .where(eq(rawListingsTable.id, id))
      .limit(1);

    if (!listing) {
      res.status(404).json({ error: "not_found", message: "Listing not found" });
      return;
    }

    res.json({
      ...listing,
      agentName: listing.agentRawName,
      agentPhone: listing.agentRawPhone,
      fraudScoreDetail: listing.fraudScore != null ? {
        score: listing.fraudScore,
        riskLevel: listing.riskLevel,
        summary: listing.fraudSummary,
        signals: listing.fraudSignals ?? [],
      } : null,
      duplicates: [],
    });
  } catch (err) {
    logger.error({ err, id }, "listings.get_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch listing" });
  }
});

export default router;
