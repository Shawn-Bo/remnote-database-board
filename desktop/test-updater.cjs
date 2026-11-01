"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { hash, snapshotFromBuffers, compareVersions } = require("./release.cjs");
const {
  ASSET_NAME,
  REPOSITORY,
  AutoUpdater,
  UpdateCache,
  decodeUpdate,
  download,
} = require("./updater.cjs");
const { createBoardServer } = require("./server.cjs");

function snapshot(version) {
  const files = Object.fromEntries(
    Object.entries({
      "manifest.json": JSON.stringify({
        id: "fanvane-database-board",
        version: Object.fromEntries(
          ["major", "minor", "patch"].map((key, i) => [
            key,
            Number(version.split(".")[i]),
          ]),
        ),
      }),
      "index.html": `<p>${version}</p>`,
      "index.js": `console.log('${version}')`,
      "board.js": `console.log('${version}')`,
    }).map(([name, value]) => [name, Buffer.from(value)]),
  );
  return snapshotFromBuffers(
    {
      id: "fanvane-database-board",
      version,
      sourceZipSha256: hash(version),
      files: Object.fromEntries(
        Object.entries(files).map(([k, v]) => [k, hash(v)]),
      ),
    },
    files,
  );
}
function update(version) {
  const next = snapshot(version);
  const body = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      release: next.release,
      files: Object.fromEntries(
        Object.entries(next.files).map(([k, v]) => [k, v.toString("base64")]),
      ),
    }),
  );
  const asset = {
    name: ASSET_NAME,
    state: "uploaded",
    size: body.length,
    digest: `sha256:${hash(body)}`,
    browser_download_url: `https://github.com/${REPOSITORY}/releases/download/v${version}/${ASSET_NAME}`,
  };
  return {
    next,
    body,
    release: {
      tag_name: `v${version}`,
      draft: false,
      prerelease: false,
      assets: [asset],
    },
  };
}
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "board-updates-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bundled = snapshot("0.3.6");
  let active = bundled;
  let incoming = update("0.3.7");
  let requests = 0;
  const cache = new UpdateCache(path.join(directory, "cache"));
  const updater = new AutoUpdater({
    cache,
    getSnapshot: () => active,
    setSnapshot: (value) => {
      active = value;
    },
    fetchRelease: async () => {
      requests++;
      return incoming.release;
    },
    fetchAsset: async () => incoming.body,
  });
  return {
    directory,
    bundled,
    cache,
    updater,
    get active() {
      return active;
    },
    get incoming() {
      return incoming;
    },
    set incoming(v) {
      incoming = v;
    },
    get requests() {
      return requests;
    },
  };
}
test("applies a verified update, survives restart, and prunes older cached releases", async (t) => {
  const f = fixture(t);
  const old = f.active;
  assert.equal(await f.updater.check(), true);
  assert.equal(f.active.release.version, "0.3.7");
  assert.equal(old.files["index.html"].toString(), "<p>0.3.6</p>");
  assert.equal(f.cache.load(f.bundled).release.version, "0.3.7");
  const unrelated = path.join(f.cache.directory, "my-notes");
  fs.mkdirSync(unrelated);
  fs.writeFileSync(path.join(unrelated, "keep.txt"), "keep");
  f.incoming = update("0.3.8");
  assert.equal(await f.updater.check(), true);
  assert.equal(f.cache.load(f.bundled).release.version, "0.3.8");
  assert.equal(
    fs.readdirSync(f.cache.directory).filter((n) => /^\d/.test(n)).length,
    1,
  );
  assert.equal(
    fs.readFileSync(path.join(unrelated, "keep.txt"), "utf8"),
    "keep",
  );
  assert.equal(f.updater.status.state, "updated");
});
test("network failure keeps the currently running and persisted update", async (t) => {
  const f = fixture(t);
  await f.updater.check();
  f.updater.fetchRelease = async () => {
    throw new Error("offline");
  };
  assert.equal(await f.updater.check(), false);
  assert.equal(f.active.release.version, "0.3.7");
  assert.equal(f.cache.load(f.bundled).release.version, "0.3.7");
  assert.equal(f.updater.status.error, "offline");
});
test("corrupt download is rejected before touching the cache", async (t) => {
  const f = fixture(t);
  f.updater.fetchAsset = async () => Buffer.alloc(f.incoming.body.length);
  assert.equal(await f.updater.check(), false);
  assert.equal(f.active.release.version, "0.3.6");
  assert.equal(fs.existsSync(f.cache.directory), false);
  assert.match(f.updater.status.error, /integrity/);
});
test("rejects file digest mismatch, traversal, unsupported protocol, and manifest mismatch", () => {
  for (const mutate of [
    (p) => {
      p.files["board.js"] = Buffer.from("changed").toString("base64");
    },
    (p) => {
      p.files["../outside"] = p.files["board.js"];
      p.release.files["../outside"] = p.release.files["board.js"];
    },
    (p) => {
      p.schemaVersion = 2;
    },
    (p) => {
      const value = Buffer.from(
        JSON.stringify({
          id: "wrong",
          version: { major: 0, minor: 3, patch: 7 },
        }),
      );
      p.files["manifest.json"] = value.toString("base64");
      p.release.files["manifest.json"] = hash(value);
    },
  ]) {
    const p = JSON.parse(update("0.3.7").body);
    mutate(p);
    assert.throws(() => decodeUpdate(Buffer.from(JSON.stringify(p)), "0.3.7"));
  }
  assert.throws(() => decodeUpdate(update("0.3.7").body, "0.3.8"));
});
test("compares semantic versions and ignores old, draft, or prerelease versions", async (t) => {
  assert.equal(compareVersions("0.3.10", "0.3.9"), 1);
  const f = fixture(t);
  let downloads = 0;
  f.updater.fetchAsset = async () => {
    downloads++;
    throw new Error("unexpected");
  };
  for (const incoming of [
    update("0.3.5"),
    update("0.3.6"),
    update("0.3.7"),
    update("0.3.7"),
  ]) {
    if (incoming.release.tag_name === "v0.3.7") {
      if (!f.incoming.release.draft) incoming.release.draft = true;
      else incoming.release.prerelease = true;
    }
    f.incoming = incoming;
    assert.equal(await f.updater.check(), false);
  }
  assert.equal(downloads, 0);
});
test("rejects update assets outside this repository and packages without a GitHub digest", async (t) => {
  const f = fixture(t);
  let downloads = 0;
  f.updater.fetchAsset = async () => {
    downloads++;
  };
  f.incoming.release.assets[0].browser_download_url =
    "https://example.org/update.json";
  assert.equal(await f.updater.check(), false);
  f.incoming = update("0.3.7");
  delete f.incoming.release.assets[0].digest;
  assert.equal(await f.updater.check(), false);
  assert.equal(downloads, 0);
});
test("concurrent checks share one request and one commit", async (t) => {
  const f = fixture(t);
  let finish;
  let requests = 0;
  f.updater.fetchRelease = () => {
    requests++;
    return new Promise((r) => {
      finish = r;
    });
  };
  const a = f.updater.check(),
    b = f.updater.check();
  assert.equal(a, b);
  finish(f.incoming.release);
  await a;
  assert.equal(requests, 1);
  assert.equal(f.active.release.version, "0.3.7");
});
test("failed cache commit leaves the active version unchanged", async (t) => {
  const f = fixture(t);
  f.cache.commit = () => {
    throw new Error("disk full");
  };
  assert.equal(await f.updater.check(), false);
  assert.equal(f.active.release.version, "0.3.6");
  assert.equal(f.updater.status.error, "disk full");
});
test("invalid cached data falls back to the bundled version and never downgrades it", async (t) => {
  const f = fixture(t);
  await f.updater.check();
  assert.equal(f.cache.load(snapshot("0.3.8")).release.version, "0.3.8");
  const directory = JSON.parse(
    fs.readFileSync(path.join(f.cache.directory, "active.json")),
  ).directory;
  fs.writeFileSync(
    path.join(f.cache.directory, directory, "plugin/board.js"),
    "corrupt",
  );
  assert.equal(f.cache.load(f.bundled).release.version, "0.3.6");
  fs.writeFileSync(
    path.join(f.cache.directory, "active.json"),
    JSON.stringify({ directory: "../outside" }),
  );
  assert.equal(f.cache.load(f.bundled).release.version, "0.3.6");
});
test("download follows trusted GitHub redirects and enforces streamed size limits", async () => {
  let calls = 0;
  const body = await download("https://github.com/a", 20, async () =>
    ++calls === 1
      ? new Response(null, {
          status: 302,
          headers: {
            location: "https://release-assets.githubusercontent.com/a",
          },
        })
      : new Response("valid"),
  );
  assert.equal(body.toString(), "valid");
  assert.equal(calls, 2);
  await assert.rejects(
    download("https://github.com/a", 2, async () => new Response("large")),
    /too large/,
  );
  await assert.rejects(
    download(
      "https://github.com/a",
      20,
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://localhost:1234" },
        }),
    ),
    /Unexpected update host/,
  );
  await assert.rejects(
    download(
      "https://api.github.com/a",
      20,
      async () => new Response("limit", { status: 403 }),
    ),
    /403/,
  );
});
test("serves the new snapshot without restarting or exposing runtime files", async (t) => {
  const f = fixture(t);
  const service = createBoardServer({
    bundled: f.bundled,
    cache: f.cache,
    updateEnabled: false,
    fetchRelease: async () => f.incoming.release,
    fetchAsset: async () => f.incoming.body,
  });
  await new Promise((r) => service.server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => service.server.close(r)));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const health = async () => (await fetch(base + "/__board_health")).json();
  const before = await health();
  assert.equal(await (await fetch(base + "/")).text(), "<p>0.3.6</p>");
  assert.equal((await fetch(base + "/server.cjs")).status, 404);
  assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
  assert.equal(await (await fetch(base + "/", { method: "HEAD" })).text(), "");
  await service.updater.check();
  const after = await health();
  assert.equal(after.version, "0.3.7");
  assert.equal(after.runtimeVersion, "0.3.6");
  assert.equal(after.pid, before.pid);
  assert.equal(await (await fetch(base + "/")).text(), "<p>0.3.7</p>");
});
module.exports = { snapshot, update };
