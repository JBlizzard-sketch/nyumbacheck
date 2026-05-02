import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { reportRequestsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const MpesaInitSchema = z.object({
  phone: z
    .string()
    .regex(/^(?:254|\+254|0)?[17]\d{8}$/, "Invalid Kenyan phone number")
    .transform((p) => {
      const digits = p.replace(/\D/g, "");
      if (digits.startsWith("254")) return digits;
      if (digits.startsWith("0")) return "254" + digits.slice(1);
      return "254" + digits;
    }),
  amount: z.number().int().min(1).max(100000),
  reportRequestId: z.number().int().positive(),
});

const MpesaCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(z.object({ Name: z.string(), Value: z.unknown() })),
        })
        .optional(),
    }),
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getMpesaAccessToken(): Promise<string> {
  const consumerKey = process.env["MPESA_CONSUMER_KEY"];
  const consumerSecret = process.env["MPESA_CONSUMER_SECRET"];
  if (!consumerKey || !consumerSecret) {
    throw new Error("M-Pesa credentials not configured");
  }
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const isProduction = process.env["MPESA_ENV"] === "production";
  const tokenUrl = isProduction
    ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  const res = await fetch(tokenUrl, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`M-Pesa token fetch failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function mpesaTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, "")
    .slice(0, 14);
}

function mpesaPassword(timestamp: string): string {
  const shortCode = process.env["MPESA_SHORTCODE"] ?? "";
  const passkey = process.env["MPESA_PASSKEY"] ?? "";
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
}

function isMpesaConfigured(): boolean {
  return !!(
    process.env["MPESA_CONSUMER_KEY"] &&
    process.env["MPESA_CONSUMER_SECRET"] &&
    process.env["MPESA_SHORTCODE"] &&
    process.env["MPESA_PASSKEY"]
  );
}

// Store pending simulated checkouts: checkoutRequestId → reportRequestId + resolved time
const simulatedCheckouts = new Map<string, { reportId: number; resolveAt: number }>();

// ── POST /api/payments/mpesa/initiate ─────────────────────────────────────────

router.post("/mpesa/initiate", async (req, res) => {
  const parsed = MpesaInitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { phone, amount, reportRequestId } = parsed.data;

  // Verify the report exists and is awaiting payment
  try {
    const [report] = await db
      .select({ id: reportRequestsTable.id, status: reportRequestsTable.status })
      .from(reportRequestsTable)
      .where(eq(reportRequestsTable.id, reportRequestId))
      .limit(1);

    if (!report) {
      res.status(404).json({ error: "not_found", message: "Report not found" });
      return;
    }

    if (report.status !== "awaiting_payment") {
      res.status(409).json({ error: "already_paid", message: "Report is not awaiting payment" });
      return;
    }
  } catch (err) {
    logger.error({ err }, "mpesa.initiate.db_error");
    res.status(500).json({ error: "internal_error" });
    return;
  }

  // ── Simulation mode (no Daraja credentials) ───────────────────────────────
  if (!isMpesaConfigured()) {
    const fakeCheckoutRequestId = `SIM-${Date.now()}-${reportRequestId}`;

    // Register in simulation map — resolves after 6 seconds
    simulatedCheckouts.set(fakeCheckoutRequestId, {
      reportId: reportRequestId,
      resolveAt: Date.now() + 6_000,
    });

    // Store checkoutRequestId + payment method on report
    try {
      await db.execute(
        sql`UPDATE report_requests SET mpesa_checkout_request_id = ${fakeCheckoutRequestId}, payment_method = 'mpesa', updated_at = NOW() WHERE id = ${reportRequestId}`
      );
    } catch (_) { /* column may not exist yet, non-fatal */ }

    // After 6s: mark report pending (simulates successful M-Pesa push)
    setTimeout(async () => {
      try {
        await db
          .update(reportRequestsTable)
          .set({ status: "pending", isPaid: 1, paymentRef: fakeCheckoutRequestId, updatedAt: new Date() })
          .where(eq(reportRequestsTable.id, reportRequestId));
        logger.info({ reportRequestId, fakeCheckoutRequestId }, "mpesa.simulation.payment_confirmed");
        simulatedCheckouts.delete(fakeCheckoutRequestId);
      } catch (err) {
        logger.error({ err, reportRequestId }, "mpesa.simulation.confirm_error");
      }
    }, 6_000);

    logger.info({ reportRequestId, phone, mode: "simulation" }, "mpesa.initiate.simulation");

    res.json({
      mode: "simulation",
      checkoutRequestId: fakeCheckoutRequestId,
      merchantRequestId: `SIM-MR-${Date.now()}`,
      responseCode: "0",
      responseDescription: "Success. Request accepted for processing",
      customerMessage: "Success. Request accepted for processing",
    });
    return;
  }

  // ── Real Daraja STK Push ───────────────────────────────────────────────────
  const shortCode = process.env["MPESA_SHORTCODE"];
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  const callbackUrl =
    process.env["MPESA_CALLBACK_URL"] ??
    (domain
      ? `https://${domain}/api/payments/mpesa/callback`
      : `https://nyumbacheck.co.ke/api/payments/mpesa/callback`);

  try {
    const token = await getMpesaAccessToken();
    const timestamp = mpesaTimestamp();
    const password = mpesaPassword(timestamp);

    const mpesaPayload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: shortCode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: `NyumbaCheck-${reportRequestId}`,
      TransactionDesc: `NyumbaCheck report #${reportRequestId}`,
    };

    const isProduction = process.env["MPESA_ENV"] === "production";
    const stkUrl = isProduction
      ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

    const mpesaRes = await fetch(stkUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mpesaPayload),
    });

    const mpesaData = (await mpesaRes.json()) as Record<string, unknown>;

    const checkoutRequestId = mpesaData["CheckoutRequestID"] as string;

    // Persist the checkoutRequestId on the report
    if (checkoutRequestId) {
      try {
        await db.execute(
          sql`UPDATE report_requests SET mpesa_checkout_request_id = ${checkoutRequestId}, payment_method = 'mpesa', updated_at = NOW() WHERE id = ${reportRequestId}`
        );
      } catch (_) { /* non-fatal */ }
    }

    logger.info({ mpesaData, reportRequestId }, "mpesa.stk_push.initiated");

    res.status(200).json({
      mode: "live",
      checkoutRequestId,
      merchantRequestId: mpesaData["MerchantRequestID"],
      responseCode: mpesaData["ResponseCode"],
      responseDescription: mpesaData["ResponseDescription"],
      customerMessage: mpesaData["CustomerMessage"],
    });
  } catch (err) {
    logger.error({ err }, "mpesa.stk_push.error");
    res.status(502).json({ error: "mpesa_error", message: "Failed to initiate M-Pesa payment" });
  }
});

// ── POST /api/payments/mpesa/callback  (called by Safaricom) ──────────────────

router.post("/mpesa/callback", async (req, res) => {
  // Always respond 200 immediately — Safaricom times out quickly
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  const parsed = MpesaCallbackSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ body: req.body }, "mpesa.callback.invalid_body");
    return;
  }

  const { stkCallback } = parsed.data.Body;
  const { ResultCode, CheckoutRequestID, CallbackMetadata } = stkCallback;

  if (ResultCode === 0) {
    // Payment confirmed — find and unlock the report
    const meta: Record<string, unknown> = {};
    for (const item of CallbackMetadata?.Item ?? []) {
      meta[item.Name] = item.Value;
    }

    try {
      // Find the report with this checkout request ID
      const reports = await db
        .select({ id: reportRequestsTable.id })
        .from(reportRequestsTable)
        .where(
          sql`mpesa_checkout_request_id = ${CheckoutRequestID} AND status = 'awaiting_payment'`
        )
        .limit(1);

      if (reports.length > 0) {
        const reportId = reports[0].id;
        const mpesaRef = (meta["MpesaReceiptNumber"] as string) ?? CheckoutRequestID;
        const amountPaid = (meta["Amount"] as number) ?? null;

        await db
          .update(reportRequestsTable)
          .set({
            status: "pending",
            isPaid: 1,
            paymentRef: mpesaRef,
            pricePaid: amountPaid,
            updatedAt: new Date(),
          })
          .where(eq(reportRequestsTable.id, reportId));

        logger.info({ reportId, CheckoutRequestID, mpesaRef }, "mpesa.callback.payment_confirmed");
      } else {
        logger.warn({ CheckoutRequestID }, "mpesa.callback.report_not_found");
      }
    } catch (err) {
      logger.error({ err, CheckoutRequestID }, "mpesa.callback.db_error");
    }
  } else {
    logger.warn({ CheckoutRequestID, ResultCode }, "mpesa.callback.payment_failed");
  }
});

// ── GET /api/payments/mpesa/status/:checkoutRequestId ────────────────────────

router.get("/mpesa/status/:checkoutRequestId", async (req, res) => {
  const checkoutRequestId = req.params["checkoutRequestId"] as string;
  if (!checkoutRequestId) {
    res.status(400).json({ error: "invalid_request", message: "Missing checkoutRequestId" });
    return;
  }

  // Simulation mode: check if this is a simulated checkout
  if (checkoutRequestId.startsWith("SIM-")) {
    const sim = simulatedCheckouts.get(checkoutRequestId);
    if (sim) {
      const confirmed = Date.now() >= sim.resolveAt;
      res.json({
        mode: "simulation",
        resultCode: confirmed ? "0" : "1032",
        resultDesc: confirmed ? "The service request is processed successfully." : "Request cancelled by user",
        checkoutRequestId,
        reportStatus: confirmed ? "pending" : "awaiting_payment",
      });
    } else {
      // Already resolved (removed from map)
      res.json({
        mode: "simulation",
        resultCode: "0",
        resultDesc: "The service request is processed successfully.",
        checkoutRequestId,
        reportStatus: "pending",
      });
    }
    return;
  }

  if (!isMpesaConfigured()) {
    res.status(503).json({ error: "mpesa_not_configured", message: "M-Pesa not configured" });
    return;
  }

  try {
    const token = await getMpesaAccessToken();
    const timestamp = mpesaTimestamp();
    const password = mpesaPassword(timestamp);
    const shortCode = process.env["MPESA_SHORTCODE"];

    const isProduction = process.env["MPESA_ENV"] === "production";
    const queryUrl = isProduction
      ? "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query";

    const queryRes = await fetch(queryUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });

    const data = await queryRes.json();
    res.status(200).json({ mode: "live", ...data as Record<string, unknown> });
  } catch (err) {
    logger.error({ err }, "mpesa.status.error");
    res.status(502).json({ error: "mpesa_error", message: "Failed to query M-Pesa status" });
  }
});

export default router;
