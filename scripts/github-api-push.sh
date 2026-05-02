#!/usr/bin/env bash
# =============================================================================
# NyumbaCheck — GitHub API Push Script
# Pushes all project files to GitHub using the Git Data API (no git CLI needed).
# Supports empty repos (creates initial commit) and non-empty repos (appends).
# Usage: bash scripts/github-api-push.sh [commit message]
# =============================================================================

set -euo pipefail

OWNER="JBlizzard-sketch"
REPO="nyumbacheck"
BRANCH="main"
API="https://api.github.com"
TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
MSG="${1:-"chore: auto-sync $(date -u '+%Y-%m-%d %H:%M:%S UTC')"}"

# Files to exclude from push
EXCLUDE_PATTERNS=(
  ".git"
  "node_modules"
  ".local"
  ".cache"
  "__pycache__"
  "*.pyc"
  "pgdata"
  "redisdata"
  ".env"
  "*.log"
  ".pnp"
  "dist"
  "build"
  ".next"
  "*.tsbuildinfo"
  "playwright-browsers"
  ".venv"
  "venv"
)

# Build the find exclude args
FIND_EXCLUDES=()
for pat in "${EXCLUDE_PATTERNS[@]}"; do
  FIND_EXCLUDES+=(-not -path "*/${pat}/*" -not -name "${pat}")
done

echo "==> NyumbaCheck GitHub API Push"
echo "==> Repo  : ${OWNER}/${REPO}"
echo "==> Branch: ${BRANCH}"
echo "==> Msg   : ${MSG}"
echo ""

# Step 1: collect files
echo "==> Collecting files..."
mapfile -d '' FILES < <(find . \
  "${FIND_EXCLUDES[@]}" \
  -type f \
  -not -name "*.jpg" -not -name "*.png" -not -name "*.gif" -not -name "*.ico" \
  -print0 2>/dev/null | sort -z)

echo "==> Found ${#FILES[@]} files"

# Step 2: create blobs for each file
echo "==> Creating blobs..."
declare -A BLOB_SHAS

for filepath in "${FILES[@]}"; do
  relpath="${filepath#./}"
  # base64 encode the file content
  content=$(base64 < "$filepath" | tr -d '\n')
  
  response=$(curl -s -X POST \
    -H "Authorization: token ${TOKEN}" \
    -H "Content-Type: application/json" \
    "${API}/repos/${OWNER}/${REPO}/git/blobs" \
    -d "{\"content\":\"${content}\",\"encoding\":\"base64\"}")
  
  sha=$(echo "$response" | grep '"sha"' | head -1 | sed 's/.*"sha": *"\([^"]*\)".*/\1/')
  
  if [ -z "$sha" ]; then
    echo "  WARNING: Failed to create blob for ${relpath}"
    echo "  Response: $(echo "$response" | head -c 200)"
    continue
  fi
  
  BLOB_SHAS["$relpath"]="$sha"
  echo "  + ${relpath}"
done

echo ""
echo "==> Created ${#BLOB_SHAS[@]} blobs"

# Step 3: build the tree JSON
echo "==> Building tree..."
TREE_ITEMS="["
FIRST=true
for relpath in "${!BLOB_SHAS[@]}"; do
  sha="${BLOB_SHAS[$relpath]}"
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    TREE_ITEMS+=","
  fi
  TREE_ITEMS+="{\"path\":\"${relpath}\",\"mode\":\"100644\",\"type\":\"blob\",\"sha\":\"${sha}\"}"
done
TREE_ITEMS+="]"

# Step 4: get base tree SHA (if repo has commits)
BASE_TREE=""
REF_RESP=$(curl -s -H "Authorization: token ${TOKEN}" \
  "${API}/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}")
PARENT_SHA=$(echo "$REF_RESP" | grep '"sha"' | head -1 | sed 's/.*"sha": *"\([^"]*\)".*/\1/')

if [ -n "$PARENT_SHA" ] && [ "$PARENT_SHA" != "null" ]; then
  echo "==> Parent commit: ${PARENT_SHA}"
  COMMIT_RESP=$(curl -s -H "Authorization: token ${TOKEN}" \
    "${API}/repos/${OWNER}/${REPO}/git/commits/${PARENT_SHA}")
  BASE_TREE=$(echo "$COMMIT_RESP" | grep -A2 '"tree"' | grep '"sha"' | head -1 | sed 's/.*"sha": *"\([^"]*\)".*/\1/')
  echo "==> Base tree: ${BASE_TREE}"
fi

# Step 5: create the tree
echo "==> Creating tree on GitHub..."
if [ -n "$BASE_TREE" ]; then
  TREE_PAYLOAD="{\"base_tree\":\"${BASE_TREE}\",\"tree\":${TREE_ITEMS}}"
else
  TREE_PAYLOAD="{\"tree\":${TREE_ITEMS}}"
fi

TREE_RESP=$(curl -s -X POST \
  -H "Authorization: token ${TOKEN}" \
  -H "Content-Type: application/json" \
  "${API}/repos/${OWNER}/${REPO}/git/trees" \
  -d "$TREE_PAYLOAD")

TREE_SHA=$(echo "$TREE_RESP" | grep '"sha"' | head -1 | sed 's/.*"sha": *"\([^"]*\)".*/\1/')
if [ -z "$TREE_SHA" ]; then
  echo "ERROR: Failed to create tree"
  echo "$TREE_RESP" | head -c 500
  exit 1
fi
echo "==> Tree SHA: ${TREE_SHA}"

# Step 6: create the commit
echo "==> Creating commit..."
if [ -n "$PARENT_SHA" ] && [ "$PARENT_SHA" != "null" ]; then
  COMMIT_PAYLOAD="{\"message\":\"${MSG}\",\"tree\":\"${TREE_SHA}\",\"parents\":[\"${PARENT_SHA}\"]}"
else
  COMMIT_PAYLOAD="{\"message\":\"${MSG}\",\"tree\":\"${TREE_SHA}\",\"parents\":[]}"
fi

COMMIT_RESP=$(curl -s -X POST \
  -H "Authorization: token ${TOKEN}" \
  -H "Content-Type: application/json" \
  "${API}/repos/${OWNER}/${REPO}/git/commits" \
  -d "$COMMIT_PAYLOAD")

COMMIT_SHA=$(echo "$COMMIT_RESP" | grep '"sha"' | head -1 | sed 's/.*"sha": *"\([^"]*\)".*/\1/')
if [ -z "$COMMIT_SHA" ]; then
  echo "ERROR: Failed to create commit"
  echo "$COMMIT_RESP" | head -c 500
  exit 1
fi
echo "==> Commit SHA: ${COMMIT_SHA}"

# Step 7: update or create the branch ref
echo "==> Updating branch ref..."
if [ -n "$PARENT_SHA" ] && [ "$PARENT_SHA" != "null" ]; then
  # Update existing ref
  REF_UPDATE=$(curl -s -X PATCH \
    -H "Authorization: token ${TOKEN}" \
    -H "Content-Type: application/json" \
    "${API}/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}" \
    -d "{\"sha\":\"${COMMIT_SHA}\"}")
else
  # Create new ref (first push to empty repo)
  REF_UPDATE=$(curl -s -X POST \
    -H "Authorization: token ${TOKEN}" \
    -H "Content-Type: application/json" \
    "${API}/repos/${OWNER}/${REPO}/git/refs" \
    -d "{\"ref\":\"refs/heads/${BRANCH}\",\"sha\":\"${COMMIT_SHA}\"}")
fi

if echo "$REF_UPDATE" | grep -q '"sha"'; then
  echo ""
  echo "==> SUCCESS!"
  echo "==> View at: https://github.com/${OWNER}/${REPO}"
else
  echo "ERROR: Failed to update ref"
  echo "$REF_UPDATE" | head -c 500
  exit 1
fi
