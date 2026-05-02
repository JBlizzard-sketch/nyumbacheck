#!/usr/bin/env bash
# =============================================================================
# NyumbaCheck — First-time setup and initial GitHub push
# Run this once to initialise the repo and push everything to GitHub.
# =============================================================================

set -euo pipefail

REPO_URL="https://JBlizzard-sketch:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/JBlizzard-sketch/nyumbacheck.git"
BRANCH="main"

echo "==> NyumbaCheck — Initial GitHub Setup"
echo ""

# Configure git identity
git config user.email "bot@nyumbacheck.co.ke"
git config user.name "NyumbaCheck Bot"

# Initialise if needed
if [ ! -d ".git" ]; then
  echo "==> Initialising git..."
  git init
fi

git branch -M "$BRANCH"

# Set remote
if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

# Stage everything
git add -A

# Initial commit
if git log --oneline -1 &>/dev/null; then
  echo "==> Repository already has commits. Running incremental push..."
  git commit -m "feat: initial NyumbaCheck platform build — Phase 1 & 2" || echo "Nothing new to commit"
else
  echo "==> Creating initial commit..."
  git commit -m "feat: initial NyumbaCheck platform build

Phases 1-2:
- PostgreSQL schema (Drizzle ORM): platforms, agents, listings, dedup clusters, fraud scores, market data, alerts
- Python scraper infrastructure: BuyRentKenya + JumiaHouses scrapers
- Address normalisation with Nairobi neighbourhood map
- Image pHash duplicate detection
- Explainable fraud scoring engine
- Dedup clustering engine
- Celery task scheduler (daily scrape + pipeline jobs)
- FastAPI scraper API
- Docker Compose for full local dev stack
- Comprehensive README"
fi

# Try to pull (may fail on empty repo — that's fine)
git pull --rebase origin "$BRANCH" 2>/dev/null || true

# Push
echo "==> Pushing to GitHub..."
git push -u origin "$BRANCH"

echo ""
echo "==> Success! View at: https://github.com/JBlizzard-sketch/nyumbacheck"
