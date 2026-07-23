"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function load() {
  return import("../scripts/release.mjs");
}

test("bumpVersion: patch/minor/major", async () => {
  const { bumpVersion } = await load();
  assert.equal(bumpVersion("0.2.3", "patch"), "0.2.4");
  assert.equal(bumpVersion("0.2.3", "minor"), "0.3.0");
  assert.equal(bumpVersion("0.2.3", "major"), "1.0.0");
  assert.equal(bumpVersion("1.0.0", "patch"), "1.0.1");
});

test("bumpVersion: rejects bad input", async () => {
  const { bumpVersion } = await load();
  assert.throws(() => bumpVersion("1.2", "patch"));
  assert.throws(() => bumpVersion("0.2.3", "hotfix"));
});

test("normalizeTag / versionFromTag / assertTagMatchesManifest", async () => {
  const { normalizeTag, versionFromTag, assertTagMatchesManifest } = await load();
  assert.equal(normalizeTag("0.2.4"), "v0.2.4");
  assert.equal(normalizeTag("v0.2.4"), "v0.2.4");
  assert.equal(versionFromTag("v0.2.4"), "0.2.4");
  assert.equal(assertTagMatchesManifest("v0.2.4", "0.2.4"), "0.2.4");
  assert.throws(() => assertTagMatchesManifest("v0.2.4", "0.2.3"));
});

test("pickLatestTag: semver order", async () => {
  const { pickLatestTag } = await load();
  assert.equal(pickLatestTag(["v0.2.1", "v0.2.10", "v0.2.3"]), "v0.2.10");
  assert.equal(pickLatestTag(["0.1.0", "v0.2.0"]), "v0.2.0");
  assert.equal(pickLatestTag([]), "");
  assert.equal(pickLatestTag(["vnext", "oops"]), "");
});

test("shouldSkipStoreUpload", async () => {
  const { shouldSkipStoreUpload } = await load();
  assert.equal(shouldSkipStoreUpload("0.2.3", "0.2.3"), true);
  assert.equal(shouldSkipStoreUpload("0.2.2", "0.2.3"), false);
  assert.equal(shouldSkipStoreUpload("", "0.2.3"), false);
  assert.equal(shouldSkipStoreUpload(null, "0.2.3"), false);
});

test("writeVersionFiles updates manifest and package.json", async () => {
  const { writeVersionFiles, readManifestVersion } = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocp-release-"));
  try {
    fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify({ version: "0.1.0" }, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, "package.json"), `${JSON.stringify({ name: "x", version: "0.1.0" }, null, 2)}\n`);
    writeVersionFiles("0.2.4", dir);
    assert.equal(readManifestVersion(dir), "0.2.4");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version, "0.2.4");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("appendGithubOutput writes key=value lines", async () => {
  const { appendGithubOutput } = await load();
  const file = path.join(os.tmpdir(), `ocp-gh-out-${process.pid}.txt`);
  try {
    fs.writeFileSync(file, "");
    appendGithubOutput({ version: "0.2.4", tag: "v0.2.4", need_push: "true" }, file);
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /^version=0\.2\.4$/m);
    assert.match(text, /^tag=v0\.2\.4$/m);
    assert.match(text, /^need_push=true$/m);
  } finally {
    fs.rmSync(file, { force: true });
  }
});
