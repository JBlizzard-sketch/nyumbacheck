# NyumbaCheck 🏠

**Real estate fraud detection and market intelligence platform for Nairobi, Kenya.**

NyumbaCheck audits the Nairobi property market — detecting ghost listings, duplicate entries, price manipulation, and fraudulent agents — and turns that raw data into clean market intelligence for buyers, investors, and proptech developers.

**GitHub:** https://github.com/JBlizzard-sketch/nyumbacheck &nbsp;|&nbsp; **Deployment guide:** [Deployment](#deployment)

---

## Table of Contents

- [The Problem](#the-problem)
- [What NyumbaCheck Builds](#what-nyumbacheck-builds)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Scraper](#scraper)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## The Problem

The Nairobi property market — both rental and sale — is riddled with fake, duplicate, and ghost listings. A flat in Kilimani appears across four platforms at four different prices, three of which are already occupied. Buyers and tenants waste days chasing listings that don't exist, visiting properties already gone, or paying "viewing fees" to agents who don't control the property.

**BuyRentKenya, JumiaHouses, and Facebook Marketplace are full of this. There is no service that audits it.**

---

## What NyumbaCheck Builds

### Product 1 — Fraud Detection Report
A landlord or serious buyer submits a listing URL or property address. Within hours they receive a report showing:
- How many times this property appears across platforms
- Price inconsistencies and spread (e.g. Ksh 45k–80k for the same flat)
- Agent legitimacy check (phone number fingerprint across listings)
- Days-on-market anomalies
- An explainable fraud risk score (not a black box)

### Product 2 — Market Intelligence Subscription
Monthly subscription for buyers, investors, and agents:
- Real price per sqft by neighbourhood (Kilimani, Westlands, Lavington, Karen, etc.)
- Actual days-on-market (not inflated by ghost listings)
- Listing velocity index (how fast properties move by area)
- Neighbourhood price trend charts
- Deduplicated, clean data — this doesn't exist cleanly anywhere in Kenya

### Expanding Platform
- **Browser Extension** — Overlays a fraud score directly on BuyRentKenya/JumiaHouses listing pages
- **Agent Reputation Scores** — Built from listing quality, price consistency, ghost listing rate, user reports
- **Verified Listing Badge** — Landlords pay to have their property certified clean
- **Price & Listing Alerts** — Email/SMS when saved properties change or new matches appear
- **Scammer Phone Registry** — Public lookup of numbers linked to fraudulent listings
- **Data API** — Paid API for proptech developers building on top of NyumbaCheck's dataset
- **Landlord Portal** — Landlords claim their property and monitor for unauthorised duplicates

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                       │
│  Landing · Report Form · Report Viewer · Market Dashboard        │
│  Agent Scores · Alerts · Verified Badge · API Docs               │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST / JSON
┌───────────────────────────────▼─────────────────────────────────┐
│                    API SERVER (Express / Node.js)                 │
│  Reports · Listings · Agents · Market Data · Auth · Webhooks     │
└──────────┬──────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│                   PYTHON BACKEND (FastAPI + Celery)              │
│  Scrapers · Dedup Engine · Fraud Scorer · Address Normaliser     │
│  Image Hasher · Alert Dispatcher · Job Scheduler (Celery Beat)   │
└──────────┬──────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│                        DATA LAYER                                 │
│  PostgreSQL (listings, agents, fraud_scores, market_data)        │
│  Redis (job queue, rate limit cache, dedup cache)                │
│  S3/Cloudflare R2 (listing images, report PDFs)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
nyumbacheck/
├── scraper/                    # Python backend — scraping + intelligence
│   └── nyumbacheck/
│       ├── scrapers/           # Platform-specific scrapers
│       │   ├── buyrentkenya/   # BuyRentKenya scraper
│       │   ├── jumiahouseske/  # JumiaHouses Kenya scraper
│       │   └── propertysearch/ # PropertySearch.co.ke scraper
│       ├── pipeline/           # Data processing pipeline
│       │   ├── dedup/          # Duplicate detection engine
│       │   ├── fraud/          # Fraud scoring engine
│       │   ├── address/        # Address normalisation
│       │   └── images/         # Image hashing (pHash)
│       ├── models/             # SQLAlchemy ORM models
│       ├── api/                # FastAPI routes
│       ├── jobs/               # Celery tasks and scheduler
│       ├── utils/              # Shared utilities
│       ├── migrations/         # Alembic migrations
│       └── tests/              # Pytest test suite
│
├── artifacts/
│   └── api-server/             # Node.js/Express API server
│       └── src/
│           ├── routes/         # API route handlers
│           ├── middlewares/    # Auth, rate limiting, etc.
│           └── lib/            # Shared utilities
│
├── lib/
│   ├── api-spec/               # OpenAPI spec (source of truth)
│   ├── api-client-react/       # Auto-generated React Query hooks
│   ├── api-zod/                # Auto-generated Zod schemas
│   └── db/                     # Drizzle ORM schema + client
│
├── frontend/                   # Next.js frontend (planned)
│   └── src/
│       ├── app/                # App Router pages
│       ├── components/         # UI components
│       ├── hooks/              # Custom hooks
│       ├── lib/                # Utilities
│       └── types/              # TypeScript types
│
├── docs/                       # Documentation
├── scripts/
│   ├── git-push.sh             # Periodic git push script
│   └── post-merge.sh           # Post-merge setup
├── docker-compose.yml          # Full local dev stack
├── docker-compose.prod.yml     # Production stack
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| **API Server** | Node.js, Express 5, TypeScript, Drizzle ORM |
| **Python Backend** | Python 3.12, FastAPI, Celery, Playwright, aiohttp |
| **Database** | PostgreSQL 16 |
| **Cache / Queue** | Redis 7 |
| **ORM (Node)** | Drizzle ORM |
| **ORM (Python)** | SQLAlchemy 2, Alembic |
| **Image Processing** | imagehash (pHash), Pillow |
| **Address Matching** | rapidfuzz, custom Nairobi neighbourhood mapping |
| **Auth** | Clerk |
| **Payments** | Stripe + M-Pesa (Safaricom Daraja API) |
| **Email** | Resend |
| **SMS** | Africa's Talking |
| **Object Storage** | Cloudflare R2 / AWS S3 |
| **Containerisation** | Docker, Docker Compose |
| **Scraper Hosting** | Railway / VPS |
| **Frontend Hosting** | Vercel |
| **API Hosting** | Railway |
| **Monitoring** | Sentry, Pino logs |
| **CI/CD** | GitHub Actions |

---

## Getting Started

### Prerequisites

- Node.js 24+, pnpm 9+
- Python 3.12+, uv or pip
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### 1. Clone the repository

```bash
git clone https://github.com/JBlizzard-sketch/nyumbacheck.git
cd nyumbacheck
```

### 2. Install Node.js dependencies

```bash
pnpm install
```

### 3. Install Python dependencies

```bash
cd scraper
pip install -r requirements.txt
# or with uv:
uv pip install -r requirements.txt
```

### 4. Configure environment variables

```bash
cp .env.example .env
# Fill in values — see Environment Variables section below
```

### 5. Start the full local dev stack with Docker

```bash
docker-compose up -d
```

### 6. Run database migrations

```bash
# Node.js (Drizzle)
pnpm --filter @workspace/db run push

# Python (Alembic)
cd scraper && alembic upgrade head
```

### 7. Start individual services

```bash
# Node.js API server
pnpm --filter @workspace/api-server run dev

# Python FastAPI
cd scraper && uvicorn nyumbacheck.api.main:app --reload

# Celery worker
cd scraper && celery -A nyumbacheck.jobs.celery_app worker --loglevel=info

# Celery Beat scheduler
cd scraper && celery -A nyumbacheck.jobs.celery_app beat --loglevel=info
```

---

## Environment Variables

Create a `.env` file in the root. See `.env.example` for the full list.

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub token for CI/CD | Dev only |
| `CLERK_SECRET_KEY` | Clerk auth secret | Yes |
| `STRIPE_SECRET_KEY` | Stripe payments | Yes |
| `MPESA_CONSUMER_KEY` | Safaricom Daraja API key | Yes |
| `MPESA_CONSUMER_SECRET` | Safaricom Daraja secret | Yes |
| `RESEND_API_KEY` | Email delivery | Yes |
| `AFRICAS_TALKING_API_KEY` | SMS for Kenyan numbers | Yes |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 storage | Yes |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 storage | Yes |
| `R2_BUCKET_NAME` | R2 bucket name | Yes |
| `SCRAPER_PROXY_URL` | Rotating proxy for scrapers | Recommended |
| `SENTRY_DSN` | Error monitoring | Production |

---

## Database

NyumbaCheck uses PostgreSQL with two ORM layers:
- **Drizzle ORM** for the Node.js API server
- **SQLAlchemy + Alembic** for the Python scraper/pipeline

### Core Tables

| Table | Purpose |
|---|---|
| `platforms` | Property listing platforms (BuyRentKenya, JumiaHouses, etc.) |
| `raw_listings` | Every listing scraped, deduplicated at source |
| `properties` | Canonical property records (one per real property) |
| `agents` | Agent profiles with reputation scores |
| `agent_phone_numbers` | Phone numbers linked to agents |
| `dedup_clusters` | Groups of listings that refer to the same property |
| `dedup_cluster_members` | Listings belonging to a dedup cluster |
| `fraud_scores` | Fraud score records with explainability data |
| `fraud_signals` | Individual fraud signals contributing to a score |
| `market_snapshots` | Neighbourhood market data snapshots |
| `price_alerts` | User-configured price/listing alerts |
| `verified_listings` | Landlord-verified listing certifications |
| `scammer_registry` | Crowd-sourced + auto-detected scammer numbers |
| `report_requests` | User-submitted fraud report requests |
| `scrape_jobs` | Scraper job tracking and audit log |

---

## Scraper

The Python scraper runs on a daily schedule via Celery Beat.

### Supported Platforms

| Platform | Status | Coverage |
|---|---|---|
| BuyRentKenya | ✅ Active | Nairobi metro |
| JumiaHouses Kenya | ✅ Active | Nairobi metro |
| PropertySearch.co.ke | 🔄 Planned | Nairobi metro |
| HassConsult | 🔄 Planned | Nairobi metro |
| Private Property KE | 🔄 Planned | Nairobi metro |
| Facebook Groups | ⚠️ Limited | Public groups only |

### Duplicate Detection Pipeline

1. **Address normalisation** — fuzzy match + Nairobi neighbourhood canonical map
2. **Image hashing** — pHash on listing photos; match threshold < 10 hamming distance
3. **Price clustering** — group listings within 15% price proximity
4. **Agent fingerprinting** — match phone numbers across platforms
5. **Confidence scoring** — weighted combination → dedup cluster confidence score

### Fraud Score Components

| Signal | Weight | Description |
|---|---|---|
| Platform count | 25% | Number of platforms listing this property |
| Price spread | 20% | % spread between lowest and highest price |
| Agent phone overlap | 20% | Same phone number on many listings |
| Days on market | 15% | Abnormally long listing age |
| Image reuse rate | 10% | Same photos appearing on other listings |
| Price anomaly | 10% | Price vs. neighbourhood median |

---

## API Reference

Base URL: `/api`

### Core Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Health check |
| `POST` | `/reports` | Submit a fraud report request |
| `GET` | `/reports/:id` | Get fraud report status and results |
| `GET` | `/listings` | Search listings (with filters) |
| `GET` | `/listings/:id` | Get listing details + fraud score |
| `GET` | `/properties/:id` | Get canonical property record |
| `GET` | `/agents` | List/search agents |
| `GET` | `/agents/:id` | Get agent profile + reputation score |
| `GET` | `/market/neighbourhoods` | List tracked neighbourhoods |
| `GET` | `/market/stats` | Neighbourhood market statistics |
| `GET` | `/market/trends` | Price trend time series |
| `GET` | `/alerts` | List user alerts |
| `POST` | `/alerts` | Create price/listing alert |
| `GET` | `/scammer-registry/lookup` | Look up phone number |
| `POST` | `/verify/submit` | Submit listing for verification |

Full API docs available at `/api/docs` (Swagger UI).

---

## Deployment

### Docker Compose (local / VPS)

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Scraper on Railway

```bash
# Push to Railway
railway up --service scraper
```

### Frontend on Vercel

```bash
cd frontend && vercel deploy --prod
```

### GitHub Actions CI/CD

Automated on push to `main`:
- Typecheck all packages
- Run Python tests (pytest)
- Build Docker images
- Deploy to Railway (scraper + API)
- Deploy to Vercel (frontend)

---

## Roadmap

| Phase | Feature | Status |
|---|---|---|
| 1 | PostgreSQL schema + Drizzle ORM | ✅ Complete |
| 2 | Python scraper infrastructure | ✅ Complete |
| 3 | BuyRentKenya + JumiaHouses scrapers | ✅ Complete |
| 4 | Address normalisation engine | ✅ Complete |
| 5 | Image hashing + dedup (pHash) | ✅ Complete |
| 6 | Duplicate clustering engine | ✅ Complete |
| 7 | Fraud score v1 (explainable, 6 signals) | ✅ Complete |
| 8 | Express API routes + HTML report generator + email delivery | ✅ Complete |
| 9 | Next.js frontend v1 | 📋 Planned |
| 10 | Market intelligence dashboard | 📋 Planned |
| 11 | Agent reputation system | 📋 Planned |
| 12 | User accounts + subscriptions | 📋 Planned |
| 13 | Price & listing alerts | 📋 Planned |
| 14 | Verified listing badge | 📋 Planned |
| 15 | Platform scrapers v2 | 📋 Planned |
| 16 | Browser extension | 📋 Planned |
| 17 | Scammer registry | 📋 Planned |
| 18 | Data API (proptech tier) | 📋 Planned |
| 19 | Landlord portal | 📋 Planned |
| 20 | Expansion + partnerships | 📋 Planned |

---

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please follow the existing code style and include tests for new pipeline logic.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

*Built for Kenya. Powered by data. Fighting fraud one listing at a time.*
