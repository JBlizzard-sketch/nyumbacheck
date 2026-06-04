#!/usr/bin/env bash
# NyumbaCheck post-commit hook — auto-push to GitHub after every commit.
#
# Install into the local repo by running:
#   scripts/install-hooks.sh
#
# Requires GITHUB_PERSONAL_ACCESS_TOKEN to be set in the environment.

if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  echo "[post-commit] GITHUB_PERSONAL_ACCESS_TOKEN not set — skipping GitHub push." >&2
  exit 0
fi

GITHUB_URL="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/JBlizzard-sketch/nyumbacheck.git"

git remote set-url github "$GITHUB_URL" 2>/dev/null || git remote add github "$GITHUB_URL"

echo "[post-commit] Pushing to gitsafe-backup..."
git push gitsafe-backup main 2>&1 || echo "[post-commit] WARN: gitsafe-backup push failed." >&2

echo "[post-commit] Pushing to github..."
git push github main 2>&1 || echo "[post-commit] WARN: GitHub push failed." >&2

exit 0
