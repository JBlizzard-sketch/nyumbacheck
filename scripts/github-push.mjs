#!/usr/bin/env node
/**
 * NyumbaCheck — GitHub API Push Script (Node.js ESM)
 * Pushes all project files to GitHub via the Git Data API.
 * Works on empty repos (initial commit) and non-empty repos (incremental).
 * Usage: node scripts/github-push.mjs [commit message]
 */

import fs from "fs";
import path from "path";
import https from "https";

const OWNER = "JBlizzard-sketch";
const REPO = "nyumbacheck";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!TOKEN) {
  console.error("ERROR: GITHUB_PERSONAL_ACCESS_TOKEN not set");
  process.exit(1);
}

const EXCLUDE_DIRS = new Set([
  ".git", "node_modules", ".local", ".cache", "__pycache__",
  "pgdata", "redisdata", ".venv", "venv", "dist", "build",
  ".next", "playwright-browsers", ".pytest_cache", ".mypy_cache",
  ".ruff_cache", "htmlcov", ".expo",
]);
const EXCLUDE_EXTS = new Set([
  ".pyc", ".pyo", ".jpg", ".jpeg", ".png", ".gif", ".ico",
  ".mp4", ".webm", ".zip", ".tar", ".gz", ".tsbuildinfo",
]);
const EXCLUDE_FILES = new Set([".env", ".env.local", "pnpm-lock.yaml"]);

// ---- HTTP helper ----
function apiRequest(method, urlPath, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: "api.github.com",
      path: urlPath,
      method,
      headers: {
        Authorization: `token ${TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "NyumbaCheck-Push/1.0",
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(text);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} ${method} ${urlPath}: ${JSON.stringify(json).slice(0, 300)}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Non-JSON response ${res.statusCode}: ${text.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---- File collection ----
function collectFiles(root) {
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        if (EXCLUDE_FILES.has(entry.name)) continue;
        const ext = path.extname(entry.name);
        if (EXCLUDE_EXTS.has(ext)) continue;
        results.push(full);
      }
    }
  }
  walk(root);
  return results.sort();
}

// ---- Main ----
async function main() {
  const msg = process.argv.slice(2).join(" ") || `chore: auto-sync ${new Date().toISOString()}`;
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  console.log("==> NyumbaCheck GitHub API Push");
  console.log(`==> Repo  : ${OWNER}/${REPO}`);
  console.log(`==> Branch: ${BRANCH}`);
  console.log(`==> Msg   : ${msg.slice(0, 80)}`);
  console.log();

  const files = collectFiles(root);
  console.log(`==> Found ${files.length} files`);

  // Create blobs in batches
  console.log("==> Creating blobs...");
  const treeItems = [];
  const BATCH = 10;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(batch.map(async (filepath) => {
      const relpath = path.relative(root, filepath).replace(/\\/g, "/");
      try {
        const content = fs.readFileSync(filepath);
        const encoded = content.toString("base64");
        const resp = await apiRequest("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
          content: encoded,
          encoding: "base64",
        });
        const mode = filepath.endsWith(".sh") ? "100755" : "100644";
        treeItems.push({ path: relpath, mode, type: "blob", sha: resp.sha });
        console.log(`  [${treeItems.length}/${files.length}] ${relpath}`);
      } catch (err) {
        console.warn(`  SKIP ${relpath}: ${err.message.slice(0, 100)}`);
      }
    }));
  }

  console.log(`\n==> Created ${treeItems.length} blobs`);

  // Get parent commit
  let parentSha = null;
  let baseTree = null;
  try {
    const refResp = await apiRequest("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
    parentSha = refResp.object?.sha || null;
    if (parentSha) {
      const commitResp = await apiRequest("GET", `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
      baseTree = commitResp.tree?.sha || null;
    }
  } catch {
    // Empty repo or branch doesn't exist yet
  }
  console.log(`==> Parent: ${parentSha || "(none — empty repo)"}`);

  // Create tree
  console.log("==> Creating tree...");
  const treePayload = { tree: treeItems };
  if (baseTree) treePayload.base_tree = baseTree;
  const treeResp = await apiRequest("POST", `/repos/${OWNER}/${REPO}/git/trees`, treePayload);
  console.log(`==> Tree SHA: ${treeResp.sha}`);

  // Create commit
  console.log("==> Creating commit...");
  const commitPayload = {
    message: msg,
    tree: treeResp.sha,
    parents: parentSha ? [parentSha] : [],
  };
  const commitResp = await apiRequest("POST", `/repos/${OWNER}/${REPO}/git/commits`, commitPayload);
  console.log(`==> Commit SHA: ${commitResp.sha}`);

  // Update or create branch ref
  console.log("==> Updating branch ref...");
  if (parentSha) {
    await apiRequest("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commitResp.sha });
  } else {
    await apiRequest("POST", `/repos/${OWNER}/${REPO}/git/refs`, {
      ref: `refs/heads/${BRANCH}`,
      sha: commitResp.sha,
    });
  }

  console.log();
  console.log("==> SUCCESS!");
  console.log(`==> https://github.com/${OWNER}/${REPO}`);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
