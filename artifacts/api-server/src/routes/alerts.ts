/**
 * Price alert routes
 *
 * POST   /alerts          — create a price alert for a neighbourhood
 * GET    /alerts          — list alerts for a user (by ?userId=xxx)
 * DELETE /alerts/:id      — delete an alert
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { priceAlertsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── POST /alerts ──────────────────────────────────────────────────────────────

const CreateAlertSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  neighbourhood: z.string().min(1),
  listingType: z.enum(["rent", "sale"]),
  maxPriceKsh: z.number().positive().optional(),
  minBedrooms: z.number().int().min(0).optional(),
  maxBedrooms: z.number().int().min(0).optional(),
});

router.post("/alerts", async (req: Request, res: Response) => {
  const parsed = CreateAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", details: parsed.error.flatten() });
    return;
  }

  const d = parsed.data;

  try {
    const [alert] = await db
      .insert(priceAlertsTable)
      .values({
        userId: d.userId,
        email: d.email,
        alertType: "search_alert",
        neighbourhood: d.neighbourhood,
        listingType: d.listingType,
        maxPriceKsh: d.maxPriceKsh ?? null,
        minBedrooms: d.minBedrooms ?? null,
        maxBedrooms: d.maxBedrooms ?? null,
        isActive: true,
      })
      .returning();

    logger.info({ alertId: alert.id, userId: d.userId, neighbourhood: d.neighbourhood }, "alert.created");
    res.status(201).json({ alert });
  } catch (err) {
    logger.error({ err }, "alert.create_error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /alerts ───────────────────────────────────────────────────────────────

router.get("/alerts", async (req: Request, res: Response) => {
  const userId = z.string().min(1).safeParse(req.query.userId);
  if (!userId.success) {
    res.status(400).json({ error: "bad_request", message: "userId query parameter is required" });
    return;
  }

  try {
    const alerts = await db
      .select()
      .from(priceAlertsTable)
      .where(and(eq(priceAlertsTable.userId, userId.data), eq(priceAlertsTable.isActive, true)))
      .orderBy(priceAlertsTable.createdAt);

    res.json({ alerts });
  } catch (err) {
    logger.error({ err }, "alert.list_error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── DELETE /alerts/:id ────────────────────────────────────────────────────────

router.delete("/alerts/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string, 10);
  const userId = z.string().min(1).safeParse(req.query.userId);

  if (isNaN(id) || !userId.success) {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  try {
    const [deleted] = await db
      .update(priceAlertsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(priceAlertsTable.id, id), eq(priceAlertsTable.userId, userId.data)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json({ status: "deleted" });
  } catch (err) {
    logger.error({ err, id }, "alert.delete_error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
