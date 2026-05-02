import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { scammerRegistryTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function normalisePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+254")) return digits;
  if (digits.startsWith("254")) return "+" + digits;
  if (digits.startsWith("07") || digits.startsWith("01")) return "+254" + digits.slice(1);
  if (digits.startsWith("7") || digits.startsWith("1")) return "+254" + digits;
  return digits;
}

// ── GET /scammer-registry/lookup ──────────────────────────────────────────────

router.get("/scammer-registry/lookup", async (req: Request, res: Response) => {
  const phone = z.string().min(7).safeParse(req.query.phone);
  if (!phone.success) {
    res.status(400).json({ error: "bad_request", message: "phone query parameter is required" });
    return;
  }

  const normalisedPhone = normalisePhone(phone.data);

  try {
    const [entry] = await db
      .select()
      .from(scammerRegistryTable)
      .where(eq(scammerRegistryTable.normalisedPhone, normalisedPhone))
      .limit(1);

    if (!entry) {
      res.json({
        phone: phone.data,
        normalisedPhone,
        isRegistered: false,
        reportCount: null,
        linkedListingCount: null,
        isConfirmed: null,
        notes: null,
      });
      return;
    }

    res.json({
      phone: phone.data,
      normalisedPhone,
      isRegistered: true,
      reportCount: entry.reportCount,
      linkedListingCount: entry.linkedListingCount,
      isConfirmed: entry.isConfirmed,
      notes: entry.notes,
    });
  } catch (err) {
    logger.error({ err, phone: normalisedPhone }, "scammer.lookup_error");
    res.status(500).json({ error: "internal_error", message: "Lookup failed" });
  }
});

// ── POST /scammer-registry/report ─────────────────────────────────────────────

const ReportSchema = z.object({
  phone: z.string().min(7).max(20),
  notes: z.string().max(500).optional(),
  evidenceUrls: z.array(z.string().url()).max(5).optional(),
});

router.post("/scammer-registry/report", async (req: Request, res: Response) => {
  const parsed = ReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.flatten().fieldErrors });
    return;
  }

  const normalisedPhone = normalisePhone(parsed.data.phone);

  try {
    const [existing] = await db
      .select()
      .from(scammerRegistryTable)
      .where(eq(scammerRegistryTable.normalisedPhone, normalisedPhone))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(scammerRegistryTable)
        .set({
          reportCount: sql`${scammerRegistryTable.reportCount} + 1`,
          notes: parsed.data.notes ?? existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(scammerRegistryTable.normalisedPhone, normalisedPhone))
        .returning();

      logger.info({ normalisedPhone, id: updated.id, reportCount: updated.reportCount }, "scammer.incremented");
      res.status(200).json({ status: "incremented", id: updated.id, reportCount: updated.reportCount });
    } else {
      const [inserted] = await db
        .insert(scammerRegistryTable)
        .values({
          phoneNumber: parsed.data.phone,
          normalisedPhone,
          reportCount: 1,
          linkedListingCount: 0,
          notes: parsed.data.notes ?? null,
          evidenceUrls: parsed.data.evidenceUrls ?? null,
          isConfirmed: false,
        })
        .returning();

      logger.info({ normalisedPhone, id: inserted.id }, "scammer.reported");
      res.status(201).json({ status: "created", id: inserted.id, reportCount: 1 });
    }
  } catch (err) {
    logger.error({ err, normalisedPhone }, "scammer.report_error");
    res.status(500).json({ error: "internal_error", message: "Failed to submit report" });
  }
});

// ── GET /scammer-registry/trending ────────────────────────────────────────────

router.get("/scammer-registry/trending", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: scammerRegistryTable.id,
        normalisedPhone: scammerRegistryTable.normalisedPhone,
        reportCount: scammerRegistryTable.reportCount,
        linkedListingCount: scammerRegistryTable.linkedListingCount,
        isConfirmed: scammerRegistryTable.isConfirmed,
        notes: scammerRegistryTable.notes,
        updatedAt: scammerRegistryTable.updatedAt,
      })
      .from(scammerRegistryTable)
      .orderBy(desc(scammerRegistryTable.reportCount), desc(scammerRegistryTable.updatedAt))
      .limit(10);

    res.json({ entries: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "scammer.trending_error");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch trending" });
  }
});

export default router;
