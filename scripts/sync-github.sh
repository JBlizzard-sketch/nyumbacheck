#!/usr/bin/env bash
set -euo pipefail

if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN is not set." >&2
  exit 1
fi

GITHUB_URL="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/JBlizzard-sketch/nyumbacheck.git"

git remote set-url github "$GITHUB_URL" 2>/dev/null || git remote add github "$GITHUB_URL"

echo "Pushing to gitsafe-backup..."
git push gitsafe-backup main 2>&1 || echo "WARN: gitsafe-backup push failed (non-fatal)"

echo "Pushing to github..."
git push github main 2>&1

echo "Sync complete."
