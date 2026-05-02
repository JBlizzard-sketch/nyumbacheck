import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { scammerRegistryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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

export default router;
