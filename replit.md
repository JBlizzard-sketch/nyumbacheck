# NyumbaCheck — Real Estate Fraud Detection Platform

## Overview

Nairobi real estate fraud detection and market intelligence platform. Two core products:
1. **Fraud Detection Reports** — Submit a listing URL/address, get an explainable fraud score report
2. **Market Intelligence** — Clean, deduplicated Nairobi property market data + price trend charts

## Stack

| Layer | Technology |
|---|---|
| **Monorepo** | pnpm workspaces, TypeScript 5.9 |
| **Frontend** | React + Vite, Tailwind v4, shadcn/ui, Clerk auth, Wouter routing, React Query |
| **Node API** | Express 5, Drizzle ORM, PostgreSQL, port 8080 |
| **Python Backend** | FastAPI, Celery, Playwright, aiohttp |
| **Scraping** | BuyRentKenya, JumiaHouses, PropertySearch.co.ke, HassConsult scrapers |
| **Dedup** | pHash image hashing + address fuzzy matching + agent phone fingerprint |
| **Fraud Scoring** | Explainable 6-signal weighted scorer |
| **Database** | PostgreSQL 16 + Redis 7 |
| **Payments** | Stripe Checkout (card) + M-Pesa STK Push (Safaricom Daraja API) |
| **Auth** | Clerk (proxied at /api/__clerk) |
| **CI/CD** | GitHub Actions → github.com/JBlizzard-sketch/nyumbacheck |

## Project Structure

```
nyumbacheck/
├── artifacts/
│   ├── api-server/          # Node.js Express API (port 8080, /api)
│   │   └── src/
│   │       ├── routes/      # reports, market, agents, listings, payments, scammer, stripe
│   │       └── lib/         # logger, stripeClient, webhookHandlers, report-simulator
│   ├── frontend/            # React+Vite frontend (port 18130, /)
│   │   └── src/
│   │       ├── pages/       # home, check, report, market, scammer, my-reports
│   │       ├── components/  # layout, shadcn/ui components
│   │       └── lib/         # local-storage.ts (report ID persistence)
│   └── mockup-sandbox/      # Design canvas (/__mockup)
├── lib/
│   ├── api-spec/            # OpenAPI spec (source of truth)
│   ├── api-client-react/    # Auto-generated React Query hooks (23+ hooks)
│   ├── api-zod/             # Auto-generated Zod schemas
│   └── db/src/schema/       # Drizzle ORM schema (all tables)
├── scraper/
│   └── nyumbacheck/
│       ├── scrapers/        # BuyRentKenya, JumiaHouses, PropertySearch, HassConsult
│       ├── pipeline/        # address/, images/, dedup/, fraud/
│       ├── jobs/            # Celery tasks + scheduler
│       └── api/             # FastAPI
├── scripts/
│   ├── github-push.mjs      # GitHub API push (node scripts/github-push.mjs "msg")
│   ├── seed-products.ts     # Stripe product seed (run once per env)
│   └── post-merge.sh        # Post-merge setup script
├── docker-compose.yml
└── .env.example
```

## Database Schema (lib/db/src/schema/)

| File | Tables |
|---|---|
| `platforms.ts` | platforms (5 seeded: buyrentkenya, propertysearch, hassconsult, jiji, jumia) |
| `agents.ts` | agents, agent_phone_numbers |
| `listings.ts` | raw_listings |
| `dedup.ts` | dedup_clusters, dedup_cluster_members |
| `fraud.ts` | fraud_scores, report_requests (+ stripe_session_id column) |
| `market.ts` | neighbourhoods (20 seeded), market_snapshots (900 seeded, 90-day history) |
| `alerts.ts` | price_alerts, scammer_registry (5 seeded), verified_listings, scrape_jobs |

### report_requests status flow

```
awaiting_payment  →  pending  →  processing  →  complete
                                              ↘  failed
```
- `awaiting_payment`: report created, Stripe checkout not yet completed
- `pending`: paid (or free mode) — simulator picks up after 15s
- `processing`: simulation running (30s window)
- `complete`: fraud score + cluster data attached

## Frontend Routes

| Route | Page | Auth |
|---|---|---|
| `/` | Landing (redirects signed-in users to /my-reports) | Public |
| `/check` | Submit listing URL or address + Stripe payment redirect | Public |
| `/reports/:id` | Report results — fraud gauge, signals, duplicate table. Polls while pending/processing/awaiting_payment. | Public |
| `/market` | Price trend line chart + stats cards by neighbourhood | Public |
| `/scammer` | Phone number registry lookup | Public |
| `/my-reports` | Past submitted reports (localStorage-backed) | Clerk-protected |
| `/sign-in`, `/sign-up` | Clerk auth pages | Public |

## API Routes (all under /api)

- `GET /healthz` — health check
- `POST /reports` — submit fraud report (creates Stripe checkout if connected, else free mode)
- `GET /reports/:id` — get report status + fraud score
- `GET /market/neighbourhoods` — list all tracked neighbourhoods
- `GET /market/stats?neighbourhood=&listingType=&days=` — market aggregates
- `GET /market/trends?neighbourhood=&listingType=&days=` — daily price series
- `GET /scammer-registry/lookup?phone=` — scammer phone lookup
- `GET /listings`, `GET /listings/:id` — raw listings
- `GET /agents`, `GET /agents/:id` — agent data
- `POST /payments/mpesa/initiate` — M-Pesa STK push
- `POST /payments/mpesa/callback` — Safaricom webhook
- `GET /payments/mpesa/status/:checkoutRequestId` — payment status
- `POST /payments/stripe/checkout` — create Stripe Checkout session for a report
- `GET /payments/stripe/confirm/:sessionId` — verify payment + unlock report
- `GET /payments/stripe/products` — list Stripe products
- `POST /api/stripe/webhook` — Stripe webhook (registered BEFORE express.json())

## Auth Configuration

- Clerk publishable key: `VITE_CLERK_PUBLISHABLE_KEY`
- Clerk secret key: `CLERK_SECRET_KEY`
- Clerk proxy: frontend proxies `/api/__clerk/*` → Express → Clerk
- `publishableKeyFromHost()` used so Replit preview domain auto-resolves

## Payments

### Stripe (card payments)
- Integration: Replit native Stripe connector (`ccfg_stripe_01K611P4YQR0SZM11XFRQJC44Y`)
- Price: $4.00 USD ≈ KSh 500 per report
- Webhook registered BEFORE `express.json()` in `app.ts` (critical for signature verification)
- `stripe-replit-sync` runs `runMigrations()` on startup (creates `stripe` schema)
- `syncBackfill()` called async on startup
- **Seed products**: `pnpm --filter @workspace/scripts exec tsx src/seed-products.ts`
- When Stripe is not connected → graceful fallback to free/demo mode (status=pending directly)
- Files: `lib/stripeClient.ts`, `lib/webhookHandlers.ts`, `routes/stripe.ts`

### M-Pesa (STK Push)
- Env vars needed: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_ENV` (sandbox/production)
- Route: `artifacts/api-server/src/routes/payments.ts`

## Email Delivery

- **NOT YET CONFIGURED** — Resend OAuth was dismissed during setup
- To enable: set `RESEND_API_KEY` secret, install `resend` package, wire into report completion handler
- Alternative: Mailgun, SendGrid, or Postmark

## Report Simulation Engine

- File: `artifacts/api-server/src/lib/report-simulator.ts`
- Background `setInterval` worker (8s tick)
- Pending → Processing after 15s, Processing → Complete after 30s
- Generates deterministic fraud scores, signals, fake raw_listings, dedup_clusters
- Only processes `status='pending'` reports (not `awaiting_payment`)
- In production: replaced by Python Celery pipeline

## GitHub

- Repo: https://github.com/JBlizzard-sketch/nyumbacheck
- Push: `node scripts/github-push.mjs "commit message"`
- Token: `GITHUB_PERSONAL_ACCESS_TOKEN`

## Key Commands

```bash
pnpm run typecheck                              # full monorepo typecheck
pnpm --filter @workspace/api-spec run codegen  # regen React Query hooks + Zod
pnpm --filter @workspace/db run push           # push Drizzle schema to DB
pnpm --filter @workspace/api-server run dev    # run API server
pnpm --filter @workspace/frontend run dev      # run frontend
node scripts/github-push.mjs "msg"             # push to GitHub
pnpm --filter @workspace/scripts exec tsx src/seed-products.ts  # seed Stripe products
```

## Important Notes

- **Zod**: workspace uses v3 (`^3.25.76`). Use `z.string().email()` NOT `z.email()`
- **Clerk**: proxy path `/api/__clerk`. Do NOT set auth token getter for web — cookies handle it
- **API server**: Express 5, port 8080. Stripe webhook registered BEFORE `express.json()` in `app.ts`
- **Frontend**: port 18130. `tailwindcss({ optimize: false })` in vite.config.ts
- **index.css**: starts with `@layer theme, base, clerk, components, utilities;` — do NOT remove
- **Brand**: `--primary: 150 38% 16%` (#1a3a2a dark forest green)
- **Stripe**: uses `stripe-replit-sync` — do NOT create tables in `stripe` schema, do NOT INSERT into stripe.* tables

## Build Phases Completed

- Phase 1: PostgreSQL schema (Drizzle ORM) — all tables
- Phase 2: Python scraper infrastructure (HTTP client, rate limiter, retry)
- Phase 3: BuyRentKenya + JumiaHouses scrapers
- Phase 4: Address normalisation (Nairobi neighbourhood map + fuzzy matching)
- Phase 5: Image pHash duplicate detection
- Phase 6: Dedup clustering engine
- Phase 7: Explainable fraud scoring engine (6 weighted signals)
- Phase 8: React+Vite frontend (all 6 pages + Clerk auth + full shadcn/ui component library)
- Phase 9: M-Pesa STK push payment route
- Phase 10: PropertySearch.co.ke + HassConsult scrapers
- Phase 11: Database seeded (platforms, 20 neighbourhoods, 900 market snapshots, 5 scammer entries)
- Phase 12: GitHub push to JBlizzard-sketch/nyumbacheck
- Phase 13: Report simulation engine (background worker, deterministic fraud scores, fake listings + clusters)
- Phase 14: Bug fix — fetchFraudScoreData now uses `inArray` to fetch all cluster members
- Phase 15: Stripe Checkout integration (stripe-replit-sync, webhook handler, checkout/confirm routes, payment gate on check.tsx, awaiting_payment status in report.tsx)

## Remaining Work

- Email delivery of completed fraud reports (needs `RESEND_API_KEY` or alternative)
- Connect Stripe integration in Replit Integrations tab to enable live payments
- Run `scripts/src/seed-products.ts` once after Stripe is connected
- Python Celery pipeline wired to production Redis (currently simulation engine)
- Admin dashboard (scrape job monitoring, fraud queue)
- Price alert notifications (email/SMS when listing price drops)
- OpenAPI spec update for Stripe checkout endpoint + client regeneration
