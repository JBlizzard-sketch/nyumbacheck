/**
 * Stripe payment routes for NyumbaCheck
 *
 * POST /api/payments/stripe/checkout  — create a Stripe Checkout session for a report
 * GET  /api/payments/stripe/success   — landing page redirect after payment
 * GET  /api/payments/stripe/products  — list available report products
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { reportRequestsTable } from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CheckoutSchema = z.object({
  reportId: z.number().int().positive(),
  email: z.string().email(),
});

function getBaseUrl(req: Request): string {
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  if (domain) return `https://${domain}`;
  return `${req.protocol}://${req.get("host")}`;
}

// POST /api/payments/stripe/checkout
router.post("/stripe/checkout", async (req: Request, res: Response) => {
  const parsed = CheckoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { reportId, email } = parsed.data;

  try {
    // Verify the report exists
    const [report] = await db
      .select()
      .from(reportRequestsTable)
      .where(eq(reportRequestsTable.id, reportId))
      .limit(1);

    if (!report) {
      res.status(404).json({ error: "not_found", message: "Report not found" });
      return;
    }

    if (report.isPaid) {
      res.status(409).json({ error: "already_paid", message: "This report has already been paid for" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const baseUrl = getBaseUrl(req);

    // Look up the NyumbaCheck Report product in Stripe
    // Fall back to price_data if no product seeded yet
    let lineItems: Parameters<typeof stripe.checkout.sessions.create>[0]["line_items"];

    try {
      const products = await stripe.products.search({
        query: "name:'NyumbaCheck Report' AND active:'true'",
      });
      const product = products.data[0];

      if (product) {
        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
        const price = prices.data[0];
        if (price) {
          lineItems = [{ price: price.id, quantity: 1 }];
        }
      }
    } catch {
      // Fall through to price_data
    }

    if (!lineItems) {
      // Use inline price_data as fallback (no pre-seeded product)
      lineItems = [
        {
          price_data: {
            currency: "usd",
            unit_amount: 400, // $4.00 USD ≈ KSh 500
            product_data: {
              name: "NyumbaCheck Fraud Report",
              description: `Property fraud risk analysis report #${reportId}`,
            },
          },
          quantity: 1,
        },
      ];
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      customer_email: email,
      success_url: `${baseUrl}/reports/${reportId}?payment=success`,
      cancel_url: `${baseUrl}/reports/${reportId}?payment=cancelled`,
      metadata: {
        reportId: String(reportId),
        email,
      },
    });

    // Persist session ID so webhook can look it up
    await db.execute(
      sql`UPDATE report_requests SET stripe_session_id = ${session.id}, updated_at = NOW() WHERE id = ${reportId}`,
    );

    logger.info({ reportId, sessionId: session.id }, "stripe.checkout_session_created");

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    logger.error({ err, reportId }, "stripe.checkout_error");
    res.status(502).json({ error: "stripe_error", message: "Failed to create payment session" });
  }
});

// GET /api/payments/stripe/confirm/:sessionId
// Called from the frontend when Stripe redirects back with ?payment=success
// Verifies the session and unlocks the report for processing
router.get("/stripe/confirm/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    res.status(400).json({ error: "invalid_request", message: "sessionId is required" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      res.status(402).json({ error: "not_paid", message: "Payment not completed", status: session.payment_status });
      return;
    }

    const reportId = session.metadata?.["reportId"];
    if (!reportId) {
      res.status(404).json({ error: "not_found", message: "No report associated with this session" });
      return;
    }

    // Mark report as paid and ready for processing
    const updated = await db
      .update(reportRequestsTable)
      .set({
        status: "pending",
        isPaid: 1,
        paymentRef: sessionId,
        pricePaid: session.amount_total ? session.amount_total / 100 : null,
        updatedAt: new Date(),
      })
      .where(and(eq(reportRequestsTable.id, parseInt(reportId, 10)), eq(reportRequestsTable.status, "awaiting_payment")))
      .returning();

    logger.info({ reportId, sessionId, rowsUpdated: updated.length }, "stripe.confirm.report_unlocked");

    res.json({ success: true, reportId: parseInt(reportId, 10), status: "pending" });
  } catch (err) {
    logger.error({ err, sessionId }, "stripe.confirm_error");
    res.status(502).json({ error: "stripe_error", message: "Failed to verify payment" });
  }
});

// GET /api/payments/stripe/products
router.get("/stripe/products", async (_req: Request, res: Response) => {
  try {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active: true, limit: 10 });
    const prices = await stripe.prices.list({ active: true, limit: 20 });

    const result = products.data.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      prices: prices.data
        .filter((pr) => pr.product === p.id)
        .map((pr) => ({
          id: pr.id,
          unitAmount: pr.unit_amount,
          currency: pr.currency,
        })),
    }));

    res.json({ products: result });
  } catch (err) {
    logger.error({ err }, "stripe.products_error");
    res.status(502).json({ error: "stripe_error", message: "Failed to fetch products" });
  }
});

export default router;
