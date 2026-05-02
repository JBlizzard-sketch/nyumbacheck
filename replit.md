# NyumbaCheck — Real Estate Fraud Detection Platform

## Overview

Nairobi real estate fraud detection and market intelligence platform. Two core products:
1. **Fraud Detection Reports** — Submit a listing URL/address, get an explainable fraud score report
2. **Market Intelligence Subscription** — Clean, deduplicated Nairobi property market data

## Stack

| Layer | Technology |
|---|---|
| **Monorepo** | pnpm workspaces, TypeScript 5.9 |
| **Node API** | Express 5, Drizzle ORM, PostgreSQL |
| **Python Backend** | FastAPI, Celery, Playwright, aiohttp |
| **Scraping** | BuyRentKenya + JumiaHouses scrapers |
| **Dedup** | pHash image hashing + address fuzzy matching + agent phone fingerprint |
| **Fraud Scoring** | Explainable 6-signal weighted scorer |
| **Database** | PostgreSQL 16 + Redis 7 |
| **Build** | esbuild (CJS), Docker Compose |
| **CI/CD** | GitHub Actions → github.com/JBlizzard-sketch/nyumbacheck |

## Project Structure

```
nyumbacheck/
├── artifacts/
│   ├── api-server/          # Node.js Express API (preview path: /api)
│   └── mockup-sandbox/      # Design canvas (preview path: /__mockup)
├── lib/
│   ├── api-spec/            # OpenAPI spec (source of truth)
│   ├── api-client-react/    # Auto-generated React Query hooks
│   ├── api-zod/             # Auto-generated Zod schemas
│   └── db/src/schema/       # Drizzle ORM schema (all tables)
├── scraper/
│   └── nyumbacheck/
│       ├── scrapers/        # BuyRentKenya, JumiaHouses scrapers
│       ├── pipeline/        # address/, images/, dedup/, fraud/
│       ├── jobs/            # Celery tasks + scheduler
│       └── api/             # FastAPI
├── scripts/
│   ├── github-push.mjs      # GitHub API push script (run: node scripts/github-push.mjs)
│   └── git-push.sh          # Git CLI push script (for environments with git)
├── docker-compose.yml
├── .env.example
└── README.md
```

## Database Schema (lib/db/src/schema/)

| File | Tables |
|---|---|
| `platforms.ts` | platforms |
| `agents.ts` | agents, agent_phone_numbers |
| `listings.ts` | raw_listings |
| `dedup.ts` | dedup_clusters, dedup_cluster_members |
| `fraud.ts` | fraud_scores, report_requests |
| `market.ts` | neighbourhoods, market_snapshots |
| `alerts.ts` | price_alerts, scammer_registry, verified_listings, scrape_jobs |

## GitHub

- Repo: https://github.com/JBlizzard-sketch/nyumbacheck
- Push script: `node scripts/github-push.mjs "commit message"`
- Token secret: `GITHUB_PERSONAL_ACCESS_TOKEN`

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `node scripts/github-push.mjs "msg"` — push to GitHub via API
- `docker-compose up -d` — start full local stack (postgres + redis + api + celery)

## Build Phases Completed

- ✅ Phase 1: PostgreSQL schema (Drizzle ORM) — all tables
- ✅ Phase 2: Python scraper infrastructure (HTTP client, rate limiter, retry)
- ✅ Phase 3: BuyRentKenya + JumiaHouses scrapers
- ✅ Phase 4: Address normalisation (Nairobi neighbourhood map + fuzzy matching)
- ✅ Phase 5: Image pHash duplicate detection
- ✅ Phase 6: Dedup clustering engine
- ✅ Phase 7: Explainable fraud scoring engine (6 weighted signals)

## Next Phases

- Phase 8: Fraud report product (async job → email delivery)
- Phase 9: Next.js frontend (landing, report form, report viewer, market dashboard)
- Phase 10: Market intelligence dashboard (subscription-gated)
- Phase 11: Agent reputation system
- Phase 12: Auth + payments (Clerk + Stripe + M-Pesa)
