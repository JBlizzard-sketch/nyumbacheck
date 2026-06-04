#!/usr/bin/env bash
# NyumbaCheck — manual sync script.
# Pushes current main branch to both gitsafe-backup and github remotes.
#
# Usage: bash scripts/sync-github.sh
#
# Requires GITHUB_PERSONAL_ACCESS_TOKEN to be set in the environment.

set -euo pipefail

if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN is not set." >&2
  exit 1
fi

GITHUB_URL="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/JBlizzard-sketch/nyumbacheck.git"

git remote set-url github "$GITHUB_URL" 2>/dev/null || git remote add github "$GITHUB_URL"

echo "Pushing to gitsafe-backup..."
git push gitsafe-backup main 2>&1

echo "Pushing to github..."
git push github main 2>&1

echo "Sync complete. All commits mirrored to both remotes."
