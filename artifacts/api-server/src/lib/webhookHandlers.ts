import { getStripeSync } from "./stripeClient";
import { db } from "@workspace/db";
import { reportRequestsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " + typeof payload + ". " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // After standard processing, handle checkout.session.completed to unlock reports
    try {
      const stripe = (sync as unknown as { stripe: { webhooks: { constructEvent: Function } } }).stripe;
      const event = stripe?.webhooks?.constructEvent?.(payload, signature, "");
      if (event?.type === "checkout.session.completed") {
        await WebhookHandlers.handleCheckoutComplete(event.data.object);
      }
    } catch {
      // Signature verification is already handled by sync.processWebhook above
      // This secondary parse is best-effort for business logic
    }
  }

  static async handleCheckoutComplete(session: {
    id: string;
    metadata?: Record<string, string>;
    amount_total?: number;
  }): Promise<void> {
    const reportId = session.metadata?.["reportId"];
    if (!reportId) return;

    try {
      await db
        .update(reportRequestsTable)
        .set({
          status: "pending",
          isPaid: 1,
          paymentRef: session.id,
          pricePaid: session.amount_total ? session.amount_total / 100 : null,
          updatedAt: new Date(),
        })
        .where(eq(reportRequestsTable.id, parseInt(reportId, 10)));

      logger.info({ reportId, sessionId: session.id }, "stripe.checkout.report_unlocked");
    } catch (err) {
      logger.error({ err, reportId }, "stripe.checkout.unlock_error");
    }
  }
}

// Also handle checkout complete via direct SQL for resilience
export async function markReportPaidBySession(stripeSessionId: string): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`UPDATE report_requests
          SET status = 'pending', is_paid = 1, payment_ref = ${stripeSessionId}, updated_at = NOW()
          WHERE stripe_session_id = ${stripeSessionId}
            AND status = 'awaiting_payment'
          RETURNING id`,
    );
    return (result.rows?.length ?? 0) > 0;
  } catch (err) {
    logger.error({ err, stripeSessionId }, "stripe.mark_paid_error");
    return false;
  }
}
