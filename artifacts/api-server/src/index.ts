import app from "./app";
import { logger } from "./lib/logger";
import { startReportSimulator } from "./lib/report-simulator";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

async function initStripe(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe init");
    return;
  }

  try {
    await runMigrations({ databaseUrl, schema: "stripe" });
    logger.info("stripe.schema_ready");

    const stripeSync = await getStripeSync();
    const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
    if (domain) {
      const webhookUrl = `https://${domain}/api/stripe/webhook`;
      await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      logger.info({ webhookUrl }, "stripe.webhook_configured");
    }

    stripeSync
      .syncBackfill()
      .then(() => logger.info("stripe.backfill_complete"))
      .catch((err) => logger.warn({ err }, "stripe.backfill_failed"));
  } catch (err) {
    logger.warn({ err }, "stripe.init_failed — payments will fall back to free mode");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  await initStripe();
  startReportSimulator();
});
