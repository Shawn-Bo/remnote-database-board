"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ID = "fanvane-database-board";
const MAX_BYTES = 16 * 1024 * 1024;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const validVersion = (value) =>
  typeof value === "string" &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
  value.split(".").every((n) => Number.isSafeInteger(Number(n)));
function compareVersions(a, b) {
  if (!validVersion(a) || !validVersion(b)) throw new Error("Invalid version.");
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
function validateRelease(release) {
  if (
    !release ||
    release.id !== ID ||
    !validVersion(release.version) ||
    !/^[a-f0-9]{64}$/.test(release.sourceZipSha256)
  )
    throw new Error("Invalid release metadata.");
  if (
    !release.files ||
    Array.isArray(release.files) ||
    typeof release.files !== "object"
  )
    throw new Error("Invalid release files.");
  const entries = Object.entries(release.files);
  if (
    !entries.length ||
    entries.length > 100 ||
    !Object.hasOwn(release.files, "manifest.json")
  )
    throw new Error("Invalid release files.");
  for (const [name, digest] of entries) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) ||
      ["__proto__", "constructor", "prototype"].includes(name) ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      throw new Error("Invalid file entry.");
  }
  return release;
}
function snapshotFromBuffers(release, files) {
  validateRelease(release);
  if (
    Object.keys(files).sort().join("|") !==
    Object.keys(release.files).sort().join("|")
  )
    throw new Error("Release file list does not match.");
  let total = 0;
  for (const [name, digest] of Object.entries(release.files)) {
    if (
      !Buffer.isBuffer(files[name]) ||
      (total += files[name].length) > MAX_BYTES ||
      hash(files[name]) !== digest
    )
      throw new Error(`File integrity check failed: ${name}`);
  }
  const manifest = JSON.parse(files["manifest.json"].toString("utf8"));
  if (
    manifest.id !== release.id ||
    ["major", "minor", "patch"]
      .map((key) => manifest.version?.[key])
      .join(".") !== release.version
  )
    throw new Error("Plugin version does not match release.");
  return { release, files };
}
function readSnapshot(root) {
  for (const name of ["release.json", "plugin"]) {
    const stat = fs.lstatSync(path.join(root, name));
    if (
      stat.isSymbolicLink() ||
      (name === "plugin"
        ? !stat.isDirectory()
        : !stat.isFile() || stat.size > 65536)
    )
      throw new Error("Invalid release directory.");
  }
  const release = validateRelease(
    JSON.parse(fs.readFileSync(path.join(root, "release.json"), "utf8")),
  );
  const files = Object.create(null);
  let total = 0;
  for (const name of Object.keys(release.files)) {
    const file = path.join(root, "plugin", name);
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (total += stat.size) > MAX_BYTES
    )
      throw new Error(`Invalid release file: ${name}`);
    files[name] = fs.readFileSync(file);
  }
  return snapshotFromBuffers(release, files);
}
const verify = (root) => readSnapshot(root).release;
module.exports = {
  ID,
  MAX_BYTES,
  hash,
  validVersion,
  compareVersions,
  validateRelease,
  snapshotFromBuffers,
  readSnapshot,
  verify,
};
