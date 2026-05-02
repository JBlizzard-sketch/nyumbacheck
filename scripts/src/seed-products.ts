/**
 * NyumbaCheck — Stripe product seed script
 *
 * Creates the "NyumbaCheck Fraud Report" one-time payment product in Stripe.
 * Safe to run multiple times (idempotent).
 *
 * Run with:
 *   pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 */

import { getUncachableStripeClient } from "../../artifacts/api-server/src/lib/stripeClient";

async function main() {
  const stripe = await getUncachableStripeClient();

  console.log("Checking for existing NyumbaCheck products...");

  const existing = await stripe.products.search({
    query: "name:'NyumbaCheck Fraud Report' AND active:'true'",
  });

  if (existing.data.length > 0) {
    const product = existing.data[0];
    console.log(`Product already exists: ${product.name} (${product.id})`);

    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 5 });
    console.log(`Existing prices:`);
    for (const price of prices.data) {
      console.log(`  ${price.id} — ${price.currency.toUpperCase()} ${((price.unit_amount ?? 0) / 100).toFixed(2)}`);
    }
    return;
  }

  console.log("Creating NyumbaCheck Fraud Report product...");

  const product = await stripe.products.create({
    name: "NyumbaCheck Fraud Report",
    description:
      "Comprehensive Nairobi property fraud risk analysis: cross-platform duplicate detection, agent registry check, price anomaly scoring, and explainable fraud signals.",
    metadata: {
      category: "report",
      market: "nairobi",
    },
  });

  console.log(`Created product: ${product.name} (${product.id})`);

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 400, // $4.00 USD ≈ KSh 500
    currency: "usd",
    metadata: {
      displayPrice: "KSh 500",
    },
  });

  console.log(`Created price: $4.00 USD (${price.id})`);
  console.log("Done. Webhooks will sync this data to the database automatically.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
