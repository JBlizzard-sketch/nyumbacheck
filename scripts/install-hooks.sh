#!/usr/bin/env bash
# Install git hooks from scripts/ into .git/hooks/.
# Run once after cloning: bash scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

cp "$REPO_ROOT/scripts/post-commit-hook.sh" "$HOOKS_DIR/post-commit"
chmod +x "$HOOKS_DIR/post-commit"

echo "Installed post-commit hook -> $HOOKS_DIR/post-commit"
