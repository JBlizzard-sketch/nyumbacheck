/**
 * Report Simulation Engine
 *
 * A background worker that processes pending report requests and generates
 * realistic fraud analysis results. In production this would be replaced by
 * the Python Celery pipeline.
 *
 * Lifecycle:
 *   pending (t=0) → processing (t+15s) → complete (t+45s)
 */

import { db } from "@workspace/db";
import {
  reportRequestsTable,
  fraudScoresTable,
  rawListingsTable,
  dedupClustersTable,
  dedupClusterMembersTable,
} from "@workspace/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { logger } from "./logger";

// ── Seeded pseudo-random helpers ─────────────────────────────────────────────

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededFloat(seed: number, seq: number): number {
  const s = hashSeed(`${seed}_${seq}`);
  return s / 4294967295;
}

function seededInt(seed: number, seq: number, min: number, max: number): number {
  return Math.floor(seededFloat(seed, seq) * (max - min + 1)) + min;
}

function seededChoice<T>(seed: number, seq: number, arr: T[]): T {
  return arr[Math.floor(seededFloat(seed, seq) * arr.length)];
}

// ── Fraud score generator ────────────────────────────────────────────────────

type FraudSignal = {
  type: string;
  label: string;
  description: string;
  weight: number;
  value: number | string | null;
  contribution: number;
};

type GeneratedFraudData = {
  score: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
  signals: FraudSignal[];
  platformCount: number;
  priceMin: number;
  priceMax: number;
  neighbourhood: string;
  listingType: "rent" | "sale";
  bedrooms: number;
  priceKsh: number;
};

const NEIGHBOURHOODS = [
  "Westlands", "Kilimani", "Karen", "Kileleshwa", "Parklands",
  "Lavington", "Runda", "Muthaiga", "South C", "Kasarani",
];

const FRAUD_SUMMARIES_LOW = [
  "This listing appears legitimate. The price is consistent with neighbourhood median values, no duplicate images were detected, and the agent contact has no prior fraud reports.",
  "Low fraud risk detected. The property details are consistent across platforms and the agent phone number is clean in our registry.",
  "No significant fraud signals found. Price and location details match market expectations for this neighbourhood.",
];

const FRAUD_SUMMARIES_MEDIUM = [
  "Moderate risk detected. The listing has been active for longer than typical, and the price is slightly below the neighbourhood median. Recommend verifying the property in person before paying any deposit.",
  "Some caution advised. This listing appears on two platforms with minor price discrepancies. The agent has not been reported previously, but the listing description is recycled from an older post.",
  "Medium risk. Price undercuts the area median by 18%. While not conclusive, below-market pricing is a common fraud indicator. View the property before committing.",
];

const FRAUD_SUMMARIES_HIGH = [
  "High fraud risk. This listing is advertised on 3 platforms simultaneously with different prices. The agent phone number has appeared in previous suspicious listings.",
  "High risk detected. Photo reverse-search found matching images used in listings across different neighbourhoods. This is a classic ghost listing pattern.",
  "High risk. The price is 35% below the area median with an unusually long time on market. The contact phone is linked to 2 other active listings in different areas.",
];

const FRAUD_SUMMARIES_CRITICAL = [
  "CRITICAL: This listing matches a confirmed fraud pattern. The phone number is in our scammer registry with 7 prior reports. Do not send any money or personal documents.",
  "CRITICAL: Identical photos appear in listings across 5 platforms in 3 different Nairobi neighbourhoods simultaneously. This property almost certainly does not exist as described.",
  "CRITICAL: The agent contact is linked to 12 ghost listings across multiple platforms. This is a high-confidence fraudulent listing — do not engage.",
];

function getSummaries(riskLevel: string): string[] {
  if (riskLevel === "critical") return FRAUD_SUMMARIES_CRITICAL;
  if (riskLevel === "high") return FRAUD_SUMMARIES_HIGH;
  if (riskLevel === "medium") return FRAUD_SUMMARIES_MEDIUM;
  return FRAUD_SUMMARIES_LOW;
}

function generateFraudData(reportId: number, inputUrl?: string | null, inputAddress?: string | null): GeneratedFraudData {
  const rawInput = (inputUrl || inputAddress || `report_${reportId}`).toLowerCase();
  const seed = hashSeed(`${reportId}_${rawInput}`);

  // Bias score based on input characteristics
  let scoreBase = seededInt(seed, 0, 15, 88);

  // Jiji tends to have more fraud
  if (rawInput.includes("jiji")) scoreBase = Math.min(scoreBase + 12, 98);
  // Hassconsult is premium, lower fraud
  if (rawInput.includes("hassconsult") || rawInput.includes("hass")) scoreBase = Math.max(scoreBase - 15, 8);
  // Addresses with "deposit" in them
  if (rawInput.includes("deposit") || rawInput.includes("urgent")) scoreBase = Math.min(scoreBase + 20, 98);

  const score = scoreBase;
  const riskLevel: "low" | "medium" | "high" | "critical" =
    score < 25 ? "low" : score < 50 ? "medium" : score < 70 ? "high" : "critical";

  const neighbourhood = seededChoice(seed, 1, NEIGHBOURHOODS);
  const listingType: "rent" | "sale" = seededFloat(seed, 2) > 0.35 ? "rent" : "sale";
  const bedrooms = seededInt(seed, 3, 1, 5);
  const basePrice = listingType === "rent"
    ? seededInt(seed, 4, 30000, 180000)
    : seededInt(seed, 4, 4000000, 25000000);
  const priceKsh = basePrice;
  const platformCount = score < 25 ? 1 : score < 50 ? seededInt(seed, 5, 1, 2) : score < 70 ? seededInt(seed, 5, 2, 4) : seededInt(seed, 5, 3, 6);
  const priceSpread = score < 30 ? 0.02 : score < 55 ? 0.08 : score < 75 ? 0.22 : 0.42;
  const priceMin = Math.round(priceKsh * (1 - priceSpread / 2));
  const priceMax = Math.round(priceKsh * (1 + priceSpread / 2));

  const daysOnMarket = score < 30
    ? seededInt(seed, 6, 2, 20)
    : score < 60
    ? seededInt(seed, 6, 15, 60)
    : seededInt(seed, 6, 45, 180);

  const priceDeltaPct = score < 30 ? seededInt(seed, 7, -5, 10) : score < 60 ? seededInt(seed, 7, -20, -5) : seededInt(seed, 7, -45, -20);
  const phoneStatus = score < 50 ? "clean" : score < 70 ? "suspicious" : "flagged";
  const imageDupCount = score < 40 ? 0 : score < 65 ? seededInt(seed, 8, 1, 2) : seededInt(seed, 8, 2, 5);

  const signals: FraudSignal[] = [
    {
      type: "platform_count",
      label: "Cross-platform duplicate detection",
      description: platformCount > 1
        ? `Listing found on ${platformCount} platforms with price discrepancies of ${Math.round(priceSpread * 100)}%.`
        : "Listing found on a single platform — no cross-platform duplicates detected.",
      weight: 0.25,
      value: platformCount,
      contribution: Math.min(platformCount * 8, 30),
    },
    {
      type: "price_anomaly",
      label: "Price vs neighbourhood median",
      description: priceDeltaPct < -15
        ? `Listing price is ${Math.abs(priceDeltaPct)}% below the ${neighbourhood} median — a common ghost listing tactic.`
        : priceDeltaPct > 15
        ? `Price is ${priceDeltaPct}% above neighbourhood median. Within acceptable variance.`
        : "Price is within ±15% of the neighbourhood median.",
      weight: 0.2,
      value: priceDeltaPct,
      contribution: Math.max(0, Math.min((-priceDeltaPct / 45) * 20, 22)),
    },
    {
      type: "days_on_market",
      label: "Days on market",
      description: daysOnMarket > 60
        ? `Active for ${daysOnMarket} days — significantly above the ${neighbourhood} average of ~21 days. Stale listings are frequently ghost posts.`
        : `Listed for ${daysOnMarket} days, within normal range for this area.`,
      weight: 0.15,
      value: daysOnMarket,
      contribution: daysOnMarket > 60 ? Math.min((daysOnMarket / 180) * 18, 18) : 0,
    },
    {
      type: "agent_phone",
      label: "Agent contact history",
      description: phoneStatus === "flagged"
        ? "Phone number linked to prior fraud reports in our registry. High-confidence scam indicator."
        : phoneStatus === "suspicious"
        ? "Phone number appeared in 2 other listings across different neighbourhoods simultaneously."
        : "No prior fraud reports against this contact.",
      weight: 0.2,
      value: phoneStatus,
      contribution: phoneStatus === "flagged" ? 22 : phoneStatus === "suspicious" ? 10 : 0,
    },
    {
      type: "image_reuse",
      label: "Image fingerprint analysis",
      description: imageDupCount > 0
        ? `${imageDupCount} photo${imageDupCount > 1 ? "s" : ""} matched listings in different locations. Strong indicator of ghost listing.`
        : "No matching images found in our database. Photos appear unique to this listing.",
      weight: 0.2,
      value: imageDupCount,
      contribution: imageDupCount > 0 ? Math.min(imageDupCount * 9, 20) : 0,
    },
  ];

  const summaries = getSummaries(riskLevel);
  const summary = seededChoice(seed, 9, summaries);

  return {
    score,
    riskLevel,
    summary,
    signals,
    platformCount,
    priceMin,
    priceMax,
    neighbourhood,
    listingType,
    bedrooms,
    priceKsh,
  };
}

// ── Platform IDs for fake listings ───────────────────────────────────────────

const PLATFORM_DATA = [
  { id: 1, slug: "buyrentkenya", urlBase: "https://www.buyrentkenya.com/listing" },
  { id: 2, slug: "propertysearch", urlBase: "https://www.propertysearch.co.ke/property" },
  { id: 3, slug: "hassconsult", urlBase: "https://www.hassconsult.co.ke/listing" },
  { id: 4, slug: "jiji", urlBase: "https://jiji.co.ke/nairobi/houses-apartments-for-rent" },
  { id: 5, slug: "jumia", urlBase: "https://house.jumia.co.ke/listing" },
];

// ── Main processing function ──────────────────────────────────────────────────

async function processReport(reportId: number): Promise<void> {
  const [report] = await db
    .select()
    .from(reportRequestsTable)
    .where(eq(reportRequestsTable.id, reportId))
    .limit(1);

  if (!report || report.status !== "processing") return;

  const fraudData = generateFraudData(reportId, report.inputUrl, report.inputAddress);
  const seed = hashSeed(`${reportId}_listings`);

  try {
    // ── 1. Insert fake raw_listings for each "platform duplicate" ────────────
    const platforms = PLATFORM_DATA.slice(0, fraudData.platformCount);
    const insertedListingIds: number[] = [];

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      const priceVariant = Math.round(
        fraudData.priceKsh * (1 + (seededFloat(seed, i * 10) - 0.5) * 0.12)
      );
      const uniqueUrl = `${platform.urlBase}/sim-${reportId}-${i}-${Date.now()}`;

      const [listing] = await db
        .insert(rawListingsTable)
        .values({
          platformId: platform.id,
          url: uniqueUrl,
          title: `${fraudData.bedrooms} BR ${fraudData.listingType === "rent" ? "for rent" : "for sale"} - ${fraudData.neighbourhood}`,
          listingType: fraudData.listingType,
          priceKsh: priceVariant,
          bedrooms: fraudData.bedrooms,
          neighbourhood: fraudData.neighbourhood,
          agentRawPhone: `+25470${seededInt(seed, i + 100, 1000000, 9999999)}`,
          isActive: true,
        })
        .returning();

      insertedListingIds.push(listing.id);
    }

    // ── 2. Create dedup cluster (only if multiple platforms) ─────────────────
    let clusterId: number | null = null;

    if (insertedListingIds.length > 1) {
      const [cluster] = await db
        .insert(dedupClustersTable)
        .values({
          canonicalListingId: insertedListingIds[0],
          neighbourhood: fraudData.neighbourhood,
          listingType: fraudData.listingType,
          bedrooms: fraudData.bedrooms,
          priceMin: fraudData.priceMin,
          priceMax: fraudData.priceMax,
          priceSpreadPct: ((fraudData.priceMax - fraudData.priceMin) / fraudData.priceMin) * 100,
          platformCount: fraudData.platformCount,
          listingCount: insertedListingIds.length,
        })
        .returning();

      clusterId = cluster.id;

      for (const listingId of insertedListingIds) {
        await db.insert(dedupClusterMembersTable).values({
          clusterId: cluster.id,
          listingId,
          matchReasons: ["address_fuzzy", "price_similar"],
          matchScore: 0.85 + seededFloat(seed, listingId) * 0.14,
        });
      }
    }

    // ── 3. Insert fraud score ────────────────────────────────────────────────
    const [fraudScore] = await db
      .insert(fraudScoresTable)
      .values({
        listingId: insertedListingIds[0] ?? null,
        clusterId,
        score: fraudData.score,
        riskLevel: fraudData.riskLevel,
        summary: fraudData.summary,
        signals: fraudData.signals,
        platformCountScore: Math.min(fraudData.platformCount * 8, 30),
        priceSpreadScore: ((fraudData.priceMax - fraudData.priceMin) / fraudData.priceMin) * 100,
        agentPhoneOverlapScore: fraudData.signals.find((s) => s.type === "agent_phone")?.contribution ?? 0,
        daysOnMarketScore: fraudData.signals.find((s) => s.type === "days_on_market")?.contribution ?? 0,
        imageReuseScore: fraudData.signals.find((s) => s.type === "image_reuse")?.contribution ?? 0,
        priceAnomalyScore: fraudData.signals.find((s) => s.type === "price_anomaly")?.contribution ?? 0,
      })
      .returning();

    // ── 4. Mark report complete ──────────────────────────────────────────────
    await db
      .update(reportRequestsTable)
      .set({
        status: "complete",
        fraudScoreId: fraudScore.id,
        clusterId,
        updatedAt: new Date(),
      })
      .where(eq(reportRequestsTable.id, reportId));

    logger.info(
      { reportId, score: fraudData.score, riskLevel: fraudData.riskLevel },
      "report.simulation.complete"
    );

    // ── 5. Send email notification (non-blocking, best-effort) ───────────────
    if (report.email) {
      const { sendReportEmail } = await import("./emailer");
      sendReportEmail({
        to: report.email,
        reportId,
        inputUrl: report.inputUrl,
        inputAddress: report.inputAddress,
        score: fraudData.score,
        riskLevel: fraudData.riskLevel,
        summary: fraudData.summary,
        signals: fraudData.signals.map((s) => ({
          label: s.label,
          description: s.description,
          contribution: s.contribution,
        })),
        platformCount: fraudData.platformCount,
      }).catch((err) => logger.error({ err, reportId }, "report.email_fire_error"));
    }
  } catch (err) {
    logger.error({ reportId, err }, "report.simulation.error");

    await db
      .update(reportRequestsTable)
      .set({ status: "failed", failureReason: "Simulation pipeline error", updatedAt: new Date() })
      .where(eq(reportRequestsTable.id, reportId));
  }
}

// ── Background worker ─────────────────────────────────────────────────────────

const PENDING_DELAY_MS = 15_000;   // transition pending → processing after 15s
const PROCESSING_DELAY_MS = 30_000; // transition processing → complete after 30s

export function startReportSimulator(): void {
  logger.info("report.simulator.started");

  // Every 8 seconds: advance reports through the pipeline
  setInterval(async () => {
    try {
      const now = new Date();

      // Pending → Processing (reports older than PENDING_DELAY_MS)
      const pendingCutoff = new Date(now.getTime() - PENDING_DELAY_MS);
      const pendingReports = await db
        .select({ id: reportRequestsTable.id })
        .from(reportRequestsTable)
        .where(
          and(
            eq(reportRequestsTable.status, "pending"),
            lte(reportRequestsTable.createdAt, pendingCutoff)
          )
        )
        .limit(5);

      for (const r of pendingReports) {
        await db
          .update(reportRequestsTable)
          .set({ status: "processing", updatedAt: new Date() })
          .where(eq(reportRequestsTable.id, r.id));
        logger.info({ reportId: r.id }, "report.simulation.processing");
      }

      // Processing → Complete (reports that have been processing for > PROCESSING_DELAY_MS)
      const processingCutoff = new Date(now.getTime() - PROCESSING_DELAY_MS);
      const processingReports = await db
        .select({ id: reportRequestsTable.id })
        .from(reportRequestsTable)
        .where(
          and(
            eq(reportRequestsTable.status, "processing"),
            lte(reportRequestsTable.updatedAt, processingCutoff)
          )
        )
        .limit(5);

      for (const r of processingReports) {
        await processReport(r.id);
      }
    } catch (err) {
      logger.error({ err }, "report.simulator.tick_error");
    }
  }, 8_000);
}
