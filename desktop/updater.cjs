"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {
  ID,
  MAX_BYTES,
  hash,
  validVersion,
  compareVersions,
  readSnapshot,
  snapshotFromBuffers,
} = require("./release.cjs");

const REPOSITORY = "Shawn-Bo/remnote-database-board";
const RELEASE_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const ASSET_NAME = "RemNote-Board-Update.json";
const INTERVAL_MS = 60 * 60 * 1000;
const MAX_DOWNLOAD = MAX_BYTES * 2;
const cacheName = (release) =>
  `${release.version}-${release.sourceZipSha256.slice(0, 12)}`;
const validCacheName = (value) =>
  typeof value === "string" && /^\d+\.\d+\.\d+-[a-f0-9]{12}$/.test(value);

function defaultCacheDir() {
  const base =
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library/Application Support")
      : process.platform === "win32"
        ? process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData/Local")
        : process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share");
  return path.join(base, "RemNote-Database-Board", "updates");
}

async function download(url, limit, fetchImpl = fetch) {
  const signal = AbortSignal.timeout(20000);
  for (let redirects = 0; redirects < 6; redirects++) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      ![
        "api.github.com",
        "github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
      ].includes(parsed.hostname)
    )
      throw new Error("Unexpected update host.");
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": "RemNote-Database-Board-Updater",
        Accept:
          parsed.hostname === "api.github.com"
            ? "application/vnd.github+json"
            : "application/octet-stream",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new Error("Missing update redirect.");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Update request failed (HTTP ${response.status}).`);
    }
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body?.cancel();
      throw new Error("Update download is too large.");
    }
    if (!response.body) throw new Error("Empty update download.");
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if ((size += value.length) > limit)
          throw new Error("Update download is too large.");
        parts.push(Buffer.from(value));
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(parts, size);
  }
  throw new Error("Too many update redirects.");
}

function decodeUpdate(bytes, version) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_DOWNLOAD)
    throw new Error("Invalid update size.");
  const data = JSON.parse(bytes.toString("utf8"));
  if (
    data.schemaVersion !== 1 ||
    data.release?.version !== version ||
    !data.files ||
    Array.isArray(data.files)
  )
    throw new Error("Invalid update package.");
  const files = Object.create(null);
  let size = 0;
  for (const [name, value] of Object.entries(data.files)) {
    if (typeof value !== "string" || value.length > MAX_DOWNLOAD)
      throw new Error("Invalid update content.");
    const bytes = Buffer.from(value, "base64");
    if (
      bytes.toString("base64") !== value ||
      (size += bytes.length) > MAX_BYTES
    )
      throw new Error("Invalid update content.");
    files[name] = bytes;
  }
  for (const name of ["manifest.json", "index.js", "index.html", "board.js"])
    if (!Object.hasOwn(files, name))
      throw new Error(`Missing update file: ${name}`);
  return snapshotFromBuffers(data.release, files);
}

class UpdateCache {
  constructor(directory = defaultCacheDir()) {
    this.directory = directory;
  }
  load(bundled) {
    try {
      const selected = JSON.parse(
        fs.readFileSync(path.join(this.directory, "active.json"), "utf8"),
      );
      if (!validCacheName(selected.directory)) return bundled;
      const root = path.join(this.directory, selected.directory);
      if (fs.lstatSync(root).isSymbolicLink()) return bundled;
      const cached = readSnapshot(root);
      if (cacheName(cached.release) !== selected.directory) return bundled;
      return compareVersions(cached.release.version, bundled.release.version) >
        0 ||
        (cached.release.version === bundled.release.version &&
          cached.release.sourceZipSha256 === bundled.release.sourceZipSha256)
        ? cached
        : bundled;
    } catch {
      return bundled;
    }
  }
  commit(snapshot) {
    fs.mkdirSync(this.directory, { recursive: true });
    const temporary = fs.mkdtempSync(path.join(this.directory, ".staging-"));
    const name = cacheName(snapshot.release);
    const target = path.join(this.directory, name);
    const pointer = path.join(this.directory, `.active-${process.pid}.tmp`);
    let created = false;
    try {
      fs.mkdirSync(path.join(temporary, "plugin"));
      for (const [file, bytes] of Object.entries(snapshot.files))
        fs.writeFileSync(path.join(temporary, "plugin", file), bytes);
      fs.writeFileSync(
        path.join(temporary, "release.json"),
        JSON.stringify(snapshot.release),
      );
      readSnapshot(temporary);
      if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isSymbolicLink())
          throw new Error("Invalid update cache directory.");
        const existing = readSnapshot(target);
        if (
          JSON.stringify(existing.release) !== JSON.stringify(snapshot.release)
        )
          throw new Error("Update cache conflict.");
      } else {
        fs.renameSync(temporary, target);
        created = true;
      }
      fs.writeFileSync(pointer, JSON.stringify({ directory: name }) + "\n");
      fs.renameSync(pointer, path.join(this.directory, "active.json"));
      return name;
    } catch (error) {
      if (created) fs.rmSync(target, { recursive: true, force: true });
      throw error;
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
      fs.rmSync(pointer, { force: true });
    }
  }
  prune(keep) {
    for (const entry of fs.readdirSync(this.directory, {
      withFileTypes: true,
    })) {
      if (
        entry.name === keep ||
        !validCacheName(entry.name) ||
        !entry.isDirectory()
      )
        continue;
      const root = path.join(this.directory, entry.name);
      try {
        if (fs.readdirSync(root).sort().join("|") !== "plugin|release.json")
          continue;
        if (
          fs.lstatSync(path.join(root, "release.json")).isSymbolicLink() ||
          fs.lstatSync(path.join(root, "plugin")).isSymbolicLink()
        )
          continue;
        const snapshot = readSnapshot(root);
        if (
          cacheName(snapshot.release) !== entry.name ||
          fs.readdirSync(path.join(root, "plugin")).sort().join("|") !==
            Object.keys(snapshot.files).sort().join("|")
        )
          continue;
        fs.rmSync(root, { recursive: true });
      } catch {} // An unrelated or modified directory is not an update cache.
    }
  }
}

class AutoUpdater {
  constructor({
    getSnapshot,
    setSnapshot,
    cache,
    fetchRelease,
    fetchAsset,
    now = () => new Date().toISOString(),
  }) {
    Object.assign(this, { getSnapshot, setSnapshot, cache, now });
    this.fetchRelease =
      fetchRelease ||
      (async () =>
        JSON.parse(
          (await download(RELEASE_URL, 1024 * 1024)).toString("utf8"),
        ));
    this.fetchAsset =
      fetchAsset ||
      ((asset) => download(asset.browser_download_url, MAX_DOWNLOAD));
    this.status = { enabled: true, intervalMinutes: 60, state: "idle" };
    this.running = undefined;
  }
  check() {
    if (this.running) return this.running;
    this.running = this.performCheck().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  async performCheck() {
    this.status = {
      ...this.status,
      state: "checking",
      lastCheckedAt: this.now(),
      error: undefined,
    };
    try {
      const release = await this.fetchRelease();
      const version =
        typeof release.tag_name === "string"
          ? release.tag_name.replace(/^v/, "")
          : "";
      if (release.draft || release.prerelease || !validVersion(version))
        throw new Error("No stable update is available.");
      if (compareVersions(version, this.getSnapshot().release.version) <= 0) {
        this.status.state = "current";
        return false;
      }
      const asset = release.assets?.find((item) => item.name === ASSET_NAME);
      const expectedUrl = `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${ASSET_NAME}`;
      if (
        !asset ||
        asset.state !== "uploaded" ||
        asset.browser_download_url !== expectedUrl ||
        !Number.isSafeInteger(asset.size) ||
        asset.size <= 0 ||
        asset.size > MAX_DOWNLOAD ||
        !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
      )
        throw new Error("The release update package is not ready.");
      this.status.state = "downloading";
      const bytes = await this.fetchAsset(asset);
      if (
        bytes.length !== asset.size ||
        `sha256:${hash(bytes)}` !== asset.digest
      )
        throw new Error("Update download failed integrity verification.");
      const snapshot = decodeUpdate(bytes, version);
      const directory = this.cache.commit(snapshot);
      this.setSnapshot(snapshot);
      this.status = {
        ...this.status,
        state: "updated",
        lastUpdatedAt: this.now(),
        updatedVersion: version,
      };
      // Active requests hold their snapshot in memory, so old files can be removed.
      try {
        this.cache.prune(directory);
      } catch {}
      return true;
    } catch (error) {
      this.status = { ...this.status, state: "error", error: error.message };
      return false;
    }
  }
  start() {
    void this.check();
    this.timer = setInterval(() => void this.check(), INTERVAL_MS);
    this.timer.unref();
  }
  stop() {
    clearInterval(this.timer);
  }
}

module.exports = {
  REPOSITORY,
  RELEASE_URL,
  ASSET_NAME,
  INTERVAL_MS,
  MAX_DOWNLOAD,
  download,
  decodeUpdate,
  UpdateCache,
  AutoUpdater,
  defaultCacheDir,
};
