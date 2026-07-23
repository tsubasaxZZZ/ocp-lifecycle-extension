#!/usr/bin/env node
/**
 * Chrome Web Store release helper.
 *
 * Commands:
 *   resolve         Decide VERSION/TAG (and optionally bump files locally)
 *   push            Commit bump + create/push tag (release action only)
 *   upload          Upload zip to Chrome Web Store (skip if same version)
 *   github-release  Create GitHub Release for the tag (skip if exists)
 *
 * Pure helpers are exported for unit tests. Git/network stay in commands.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- pure helpers (tested) -------------------------------------------------

export function bumpVersion(current, bump) {
  const parts = String(current).split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) {
    throw new Error(`Invalid version: ${current}`);
  }
  let [maj, min, pat] = parts;
  if (bump === "major") return `${maj + 1}.0.0`;
  if (bump === "minor") return `${maj}.${min + 1}.0`;
  if (bump === "patch") return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Invalid bump type: ${bump}`);
}

export function normalizeTag(tag) {
  const t = String(tag || "").trim();
  if (!t) return "";
  return t.startsWith("v") ? t : `v${t}`;
}

export function versionFromTag(tag) {
  const t = normalizeTag(tag);
  if (!t.startsWith("v")) throw new Error(`Invalid tag: ${tag}`);
  return t.slice(1);
}

export function assertTagMatchesManifest(tag, manifestVersion) {
  const version = versionFromTag(tag);
  if (version !== manifestVersion) {
    throw new Error(`Tag ${normalizeTag(tag)} does not match manifest version ${manifestVersion}`);
  }
  return version;
}

export function shouldSkipStoreUpload(storeVersion, releaseVersion) {
  return Boolean(storeVersion) && storeVersion === releaseVersion;
}

export function pickLatestTag(tags) {
  const normalized = tags.map(normalizeTag).filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  if (normalized.length === 0) return "";
  return normalized.sort((a, b) => {
    const pa = versionFromTag(a).split(".").map(Number);
    const pb = versionFromTag(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
  }).at(-1);
}

export function writeVersionFiles(version, root = ROOT, io = fs) {
  for (const file of ["manifest.json", "package.json"]) {
    const full = path.join(root, file);
    const json = JSON.parse(io.readFileSync(full, "utf8"));
    json.version = version;
    io.writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`);
  }
}

export function readManifestVersion(root = ROOT, io = fs) {
  return JSON.parse(io.readFileSync(path.join(root, "manifest.json"), "utf8")).version;
}

export function appendGithubOutput(outputs, outputFile, io = fs) {
  if (!outputFile) return;
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v ?? ""}`);
  io.appendFileSync(outputFile, `${lines.join("\n")}\n`);
}

// --- process helpers -------------------------------------------------------

function run(cmd, args, opts = {}) {
  const stdio = opts.stdio || ["ignore", "pipe", "pipe"];
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: stdio === "inherit" ? undefined : "utf8",
    stdio,
    env: { ...process.env, ...(opts.env || {}) }
  });
  if (res.status !== 0) {
    const err = ((res.stderr || res.stdout || "") + "").trim();
    throw new Error(`Command failed (${cmd} ${args.join(" ")}): ${err || `exit ${res.status}`}`);
  }
  return ((res.stdout || "") + "").trim();
}

function runAllowFail(cmd, args) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return { status: res.status ?? 1, stdout: (res.stdout || "").trim(), stderr: (res.stderr || "").trim() };
}

function remoteTagExists(tag) {
  const res = runAllowFail("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`]);
  return res.status === 0;
}

function listRemoteVTags() {
  const out = run("git", ["ls-remote", "--tags", "--refs", "origin", "refs/tags/v*"]);
  if (!out) return [];
  return out.split("\n").map((line) => {
    const ref = line.split(/\s+/)[1] || "";
    return ref.split("/").pop();
  }).filter(Boolean);
}

function gitConfigBot() {
  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
}

// --- commands --------------------------------------------------------------

function cmdResolve(env = process.env) {
  const eventName = env.EVENT_NAME || "";
  const action = env.ACTION || "release";
  const bump = env.BUMP || "patch";
  const tagInput = env.TAG_INPUT || "";
  const githubRef = env.GITHUB_REF_NAME || "";

  let version = "";
  let tag = "";
  let needPush = false;
  let baseSha = "";

  if (eventName === "push") {
    tag = normalizeTag(githubRef);
    version = assertTagMatchesManifest(tag, readManifestVersion());
  } else if (action === "publish") {
    run("git", ["fetch", "origin", "--tags", "--force"]);
    tag = normalizeTag(tagInput) || pickLatestTag(listRemoteVTags());
    if (!tag) throw new Error("No tag specified and no v* tags found on origin");
    if (!remoteTagExists(tag)) throw new Error(`Remote tag ${tag} does not exist`);
    run("git", ["checkout", tag]);
    version = assertTagMatchesManifest(tag, readManifestVersion());
  } else if (action === "release") {
    run("git", ["fetch", "origin", "main", "--tags", "--force"]);
    run("git", ["checkout", "main"]);
    run("git", ["reset", "--hard", "origin/main"]);
    baseSha = run("git", ["rev-parse", "HEAD"]);

    const current = readManifestVersion();
    version = bumpVersion(current, bump);
    tag = normalizeTag(version);
    if (remoteTagExists(tag)) {
      throw new Error(`Remote tag ${tag} already exists. Use action=publish to re-publish it.`);
    }
    writeVersionFiles(version);
    needPush = true;
    console.log(`Prepared local bump ${current} → ${version} on ${baseSha}`);
  } else {
    throw new Error(`Unknown action: ${action}`);
  }

  const outputs = {
    version,
    tag,
    need_push: needPush ? "true" : "false",
    base_sha: baseSha
  };
  appendGithubOutput(outputs, env.GITHUB_OUTPUT);
  console.log(`Releasing ${tag} (HEAD=${run("git", ["rev-parse", "--short", "HEAD"])})`);
  return outputs;
}

function cmdPush(env = process.env) {
  const version = env.VERSION || "";
  const tag = normalizeTag(env.TAG || "");
  const baseSha = env.BASE_SHA || "";
  if (!version || !tag || !baseSha) {
    throw new Error("VERSION, TAG, and BASE_SHA are required for push");
  }

  gitConfigBot();
  run("git", ["fetch", "origin", "main", "--tags", "--force"]);
  const remoteSha = run("git", ["rev-parse", "origin/main"]);
  if (remoteSha !== baseSha) {
    throw new Error(
      `origin/main moved during tests (${baseSha} → ${remoteSha}). ` +
      "Refusing to publish an untested tip. Re-run action=release."
    );
  }

  run("git", ["checkout", "main"]);
  run("git", ["reset", "--hard", baseSha]);
  writeVersionFiles(version);

  if (remoteTagExists(tag)) {
    throw new Error(`Remote tag ${tag} appeared during the run; aborting to avoid overwrite`);
  }

  run("git", ["add", "manifest.json", "package.json"]);
  const staged = runAllowFail("git", ["diff", "--cached", "--quiet"]);
  if (staged.status === 0) {
    console.log(`Tree already at ${version} on ${baseSha}`);
  } else {
    run("git", ["commit", "-m", `Bump version to ${version}`]);
    run("git", ["push", "origin", "main"]);
  }

  run("git", ["fetch", "origin", "main"]);
  const head = run("git", ["rev-parse", "HEAD"]);
  const originMain = run("git", ["rev-parse", "origin/main"]);
  if (originMain !== head) {
    throw new Error("origin/main changed during push; aborting before tag");
  }
  if (remoteTagExists(tag)) {
    throw new Error(`Remote tag ${tag} appeared before tag push; aborting`);
  }

  run("git", ["tag", "-a", tag, "-m", tag]);
  run("git", ["push", "origin", tag]);
  console.log(`Pushed ${tag} at ${run("git", ["rev-parse", "--short", "HEAD"])}`);
}

async function fetchStoreVersion(env) {
  const body = new URLSearchParams({
    client_id: env.CLIENT_ID || "",
    client_secret: env.CLIENT_SECRET || "",
    refresh_token: env.REFRESH_TOKEN || "",
    grant_type: "refresh_token"
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) {
    throw new Error(`Failed to obtain access token: ${JSON.stringify({
      error: tokenJson.error,
      error_description: tokenJson.error_description
    })}`);
  }

  const itemRes = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${env.EXTENSION_ID}?projection=DRAFT`,
    { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
  );
  if (!itemRes.ok) {
    throw new Error(`Chrome Web Store item lookup failed: HTTP ${itemRes.status}`);
  }
  const item = await itemRes.json();
  return item.crxVersion || "";
}

async function cmdUpload(env = process.env) {
  const version = env.VERSION || "";
  if (!version) throw new Error("VERSION is required for upload");
  if (!env.EXTENSION_ID || !env.CLIENT_ID || !env.CLIENT_SECRET || !env.REFRESH_TOKEN) {
    throw new Error("Chrome Web Store credentials are required");
  }

  const storeVersion = await fetchStoreVersion(env);
  console.log(`Store version: ${storeVersion || "<none>"} / releasing: ${version}`);

  if (shouldSkipStoreUpload(storeVersion, version)) {
    console.log(`Store already has ${version} — skipping upload.`);
    return { skipped: true, storeVersion };
  }

  const zips = fs.readdirSync(path.join(ROOT, "dist")).filter((f) => f.endsWith(".zip"));
  if (zips.length === 0) throw new Error("No zip found in dist/");
  const source = path.join("dist", zips[0]);

  run("npx", ["--yes", "chrome-webstore-upload-cli@4.0.1", "upload", "--source", source, "--auto-publish"], {
    stdio: "inherit",
    env: {
      EXTENSION_ID: env.EXTENSION_ID,
      PUBLISHER_ID: env.PUBLISHER_ID || "",
      CLIENT_ID: env.CLIENT_ID,
      CLIENT_SECRET: env.CLIENT_SECRET,
      REFRESH_TOKEN: env.REFRESH_TOKEN
    }
  });
  return { skipped: false, storeVersion };
}

function cmdGithubRelease(env = process.env) {
  const tag = normalizeTag(env.TAG || env.RELEASE_TAG || "");
  const repo = env.GITHUB_REPOSITORY || "";
  if (!tag) throw new Error("TAG is required for github-release");
  if (!env.GH_TOKEN && !env.GITHUB_TOKEN) throw new Error("GH_TOKEN is required");

  const envWithToken = {
    ...process.env,
    GH_TOKEN: env.GH_TOKEN || env.GITHUB_TOKEN
  };
  const view = spawnSync("gh", ["release", "view", tag, "--repo", repo], {
    cwd: ROOT,
    encoding: "utf8",
    env: envWithToken
  });
  if (view.status === 0) {
    console.log(`Release ${tag} already exists — skipping.`);
    return { skipped: true };
  }

  const zips = fs.readdirSync(path.join(ROOT, "dist"))
    .filter((f) => f.endsWith(".zip"))
    .map((f) => path.join("dist", f));
  if (zips.length === 0) throw new Error("No zip found in dist/");

  run("gh", ["release", "create", tag, ...zips, "--repo", repo, "--title", tag, "--generate-notes"], {
    env: envWithToken
  });
  console.log(`Created GitHub release ${tag}`);
  return { skipped: false };
}

async function main(argv = process.argv.slice(2)) {
  const cmd = argv[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(`Usage: node scripts/release.mjs <resolve|push|upload|github-release>`);
    process.exit(cmd ? 0 : 1);
  }
  if (cmd === "resolve") return cmdResolve();
  if (cmd === "push") return cmdPush();
  if (cmd === "upload") return cmdUpload();
  if (cmd === "github-release") return cmdGithubRelease();
  throw new Error(`Unknown command: ${cmd}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
