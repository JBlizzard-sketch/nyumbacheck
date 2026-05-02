#!/usr/bin/env bash
# =============================================================================
# NyumbaCheck — Git Push Script
# Commits all changes and pushes to GitHub.
# Designed to be run manually or via a cron job / CI step.
# Usage: ./scripts/git-push.sh [commit message]
# =============================================================================

set -euo pipefail

REPO_URL="https://JBlizzard-sketch:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/JBlizzard-sketch/nyumbacheck.git"
BRANCH="main"
COMMIT_MSG="${1:-"chore: auto-sync $(date -u '+%Y-%m-%d %H:%M:%S UTC')"}"

echo "==> NyumbaCheck Git Push"
echo "==> Branch : $BRANCH"
echo "==> Message: $COMMIT_MSG"
echo ""

# Configure git identity if not already set
git config user.email "bot@nyumbacheck.co.ke" 2>/dev/null || true
git config user.name "NyumbaCheck Bot" 2>/dev/null || true

# Initialise repo if needed
if [ ! -d ".git" ]; then
  echo "==> Initialising git repository..."
  git init
  git branch -M "$BRANCH"
fi

# Set/update remote
if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

# Stage all changes
git add -A

# Check if there's anything to commit
if git diff --cached --quiet; then
  echo "==> Nothing to commit. Working tree clean."
  exit 0
fi

# Commit
git commit -m "$COMMIT_MSG"

# Pull remote changes (rebase to avoid merge commits)
echo "==> Pulling remote changes..."
git pull --rebase origin "$BRANCH" 2>/dev/null || true

# Push
echo "==> Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo ""
echo "==> Done! https://github.com/JBlizzard-sketch/nyumbacheck"
