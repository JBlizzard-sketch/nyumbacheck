import { Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";

const router = Router();

// ── M-Pesa STK Push (Daraja API) ────────────────────────────────────────────

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

async function getMpesaAccessToken(): Promise<string> {
  const consumerKey = process.env["MPESA_CONSUMER_KEY"];
  const consumerSecret = process.env["MPESA_CONSUMER_SECRET"];
  if (!consumerKey || !consumerSecret) {
    throw new Error("M-Pesa credentials not configured");
  }
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const res = await fetch(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: { Authorization: `Basic ${credentials}` },
    },
  );
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

// POST /api/payments/mpesa/initiate
router.post("/mpesa/initiate", async (req, res) => {
  const parsed = MpesaInitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }

  const { phone, amount, reportRequestId } = parsed.data;
  const shortCode = process.env["MPESA_SHORTCODE"];
  const callbackUrl =
    process.env["MPESA_CALLBACK_URL"] ??
    `${process.env["APP_URL"] ?? "https://nyumbacheck.co.ke"}/api/payments/mpesa/callback`;

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

    const mpesaData = await mpesaRes.json();
    logger.info({ mpesaData, reportRequestId }, "M-Pesa STK push initiated");

    res.status(200).json({
      checkoutRequestId: (mpesaData as Record<string, unknown>)["CheckoutRequestID"],
      merchantRequestId: (mpesaData as Record<string, unknown>)["MerchantRequestID"],
      responseCode: (mpesaData as Record<string, unknown>)["ResponseCode"],
      responseDescription: (mpesaData as Record<string, unknown>)["ResponseDescription"],
      customerMessage: (mpesaData as Record<string, unknown>)["CustomerMessage"],
    });
  } catch (err) {
    logger.error({ err }, "M-Pesa initiation error");
    res.status(502).json({ error: "mpesa_error", message: "Failed to initiate M-Pesa payment" });
  }
});

// POST /api/payments/mpesa/callback  (called by Safaricom)
router.post("/mpesa/callback", async (req, res) => {
  const parsed = MpesaCallbackSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ body: req.body }, "Invalid M-Pesa callback body");
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    return;
  }

  const { stkCallback } = parsed.data.Body;
  const { ResultCode, CheckoutRequestID, CallbackMetadata } = stkCallback;

  if (ResultCode === 0) {
    const meta: Record<string, unknown> = {};
    for (const item of CallbackMetadata?.Item ?? []) {
      meta[item.Name] = item.Value;
    }
    logger.info({ CheckoutRequestID, meta }, "M-Pesa payment confirmed");
    // TODO: update report_requests table: mark as paid, trigger report generation
  } else {
    logger.warn({ CheckoutRequestID, ResultCode }, "M-Pesa payment failed or cancelled");
  }

  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// GET /api/payments/mpesa/status/:checkoutRequestId
router.get("/mpesa/status/:checkoutRequestId", async (req, res) => {
  const checkoutRequestId = req.params["checkoutRequestId"] as string;
  if (!checkoutRequestId) {
    res.status(400).json({ error: "invalid_request", message: "Missing checkoutRequestId" });
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
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "M-Pesa status query error");
    res.status(502).json({ error: "mpesa_error", message: "Failed to query M-Pesa status" });
  }
});

export default router;
