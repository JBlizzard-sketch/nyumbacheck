#!/usr/bin/env python3
"""
NyumbaCheck — GitHub API Push Script (Python)
Pushes all project files to GitHub using the Git Data API.
Works with empty repos (initial commit) and non-empty repos (incremental).
Usage: python3 scripts/github_push.py [commit message]
"""

import base64
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

OWNER = "JBlizzard-sketch"
REPO = "nyumbacheck"
BRANCH = "main"
API = "https://api.github.com"
TOKEN = os.environ["GITHUB_PERSONAL_ACCESS_TOKEN"]

EXCLUDE_DIRS = {
    ".git", "node_modules", ".local", ".cache", "__pycache__",
    "pgdata", "redisdata", ".venv", "venv", "dist", "build",
    ".next", "playwright-browsers", ".pytest_cache", ".mypy_cache",
    ".ruff_cache", "htmlcov",
}
EXCLUDE_EXTS = {
    ".pyc", ".pyo", ".egg", ".jpg", ".jpeg", ".png", ".gif",
    ".ico", ".mp4", ".webm", ".zip", ".tar", ".gz",
}
EXCLUDE_FILES = {".env", ".env.local", "pnpm-lock.yaml"}


def api_request(method: str, path: str, data: dict | None = None) -> dict:
    url = f"{API}{path}"
    headers = {
        "Authorization": f"token {TOKEN}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "NyumbaCheck-Push-Script/1.0",
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {body[:300]}")


def collect_files(root: Path) -> list[Path]:
    files = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        parts = path.parts
        if any(excl in parts for excl in EXCLUDE_DIRS):
            continue
        if path.name in EXCLUDE_FILES:
            continue
        if path.suffix in EXCLUDE_EXTS:
            continue
        if path.name.endswith(".tsbuildinfo"):
            continue
        files.append(path)
    return sorted(files)


def create_blob(content_bytes: bytes) -> str:
    encoded = base64.b64encode(content_bytes).decode("ascii")
    resp = api_request("POST", f"/repos/{OWNER}/{REPO}/git/blobs", {
        "content": encoded,
        "encoding": "base64",
    })
    return resp["sha"]


def get_parent_commit() -> str | None:
    try:
        resp = api_request("GET", f"/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}")
        return resp["object"]["sha"]
    except RuntimeError as e:
        if "409" in str(e) or "404" in str(e):
            return None
        raise


def get_base_tree(commit_sha: str) -> str:
    resp = api_request("GET", f"/repos/{OWNER}/{REPO}/git/commits/{commit_sha}")
    return resp["tree"]["sha"]


def create_tree(tree_items: list[dict], base_tree: str | None) -> str:
    payload = {"tree": tree_items}
    if base_tree:
        payload["base_tree"] = base_tree
    resp = api_request("POST", f"/repos/{OWNER}/{REPO}/git/trees", payload)
    return resp["sha"]


def create_commit(message: str, tree_sha: str, parent_sha: str | None) -> str:
    payload = {"message": message, "tree": tree_sha, "parents": [parent_sha] if parent_sha else []}
    resp = api_request("POST", f"/repos/{OWNER}/{REPO}/git/commits", payload)
    return resp["sha"]


def update_ref(commit_sha: str, parent_sha: str | None) -> None:
    if parent_sha:
        api_request("PATCH", f"/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}", {"sha": commit_sha})
    else:
        api_request("POST", f"/repos/{OWNER}/{REPO}/git/refs", {
            "ref": f"refs/heads/{BRANCH}",
            "sha": commit_sha,
        })


def main():
    msg = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else f"chore: auto-sync"
    root = Path(__file__).parent.parent

    print(f"==> NyumbaCheck GitHub API Push")
    print(f"==> Repo  : {OWNER}/{REPO}")
    print(f"==> Branch: {BRANCH}")
    print(f"==> Msg   : {msg}")
    print()

    files = collect_files(root)
    print(f"==> Found {len(files)} files to push")

    # Create blobs
    print("==> Creating blobs...")
    tree_items = []
    for i, filepath in enumerate(files):
        relpath = filepath.relative_to(root).as_posix()
        try:
            content = filepath.read_bytes()
            sha = create_blob(content)
            tree_items.append({
                "path": relpath,
                "mode": "100644",
                "type": "blob",
                "sha": sha,
            })
            print(f"  [{i+1}/{len(files)}] {relpath}")
        except Exception as e:
            print(f"  WARNING: Skipping {relpath}: {e}")

    # Make scripts executable
    for item in tree_items:
        if item["path"].endswith(".sh") or "scripts/" in item["path"]:
            item["mode"] = "100755"

    print(f"\n==> Created {len(tree_items)} blobs")

    # Get parent commit
    print("==> Getting parent commit...")
    parent_sha = get_parent_commit()
    base_tree = get_base_tree(parent_sha) if parent_sha else None
    print(f"==> Parent: {parent_sha or '(none — empty repo)'}")

    # Create tree
    print("==> Creating tree...")
    tree_sha = create_tree(tree_items, base_tree)
    print(f"==> Tree SHA: {tree_sha}")

    # Create commit
    print("==> Creating commit...")
    commit_sha = create_commit(msg, tree_sha, parent_sha)
    print(f"==> Commit SHA: {commit_sha}")

    # Update ref
    print("==> Updating branch ref...")
    update_ref(commit_sha, parent_sha)

    print()
    print("==> SUCCESS!")
    print(f"==> https://github.com/{OWNER}/{REPO}")


if __name__ == "__main__":
    main()
