"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { main, removeOldRuntimes } = require("./install-mac.cjs");
const id = "fanvane-database-board";
const label = "com.fanvane.remnote-database-board";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
function release(root, version = "0.2.3") {
  fs.mkdirSync(path.join(root, "plugin"), { recursive: true });
  const manifest = JSON.stringify({
    id,
    version: Object.fromEntries(
      ["major", "minor", "patch"].map((key, i) => [
        key,
        Number(version.split(".")[i]),
      ]),
    ),
  });
  fs.writeFileSync(path.join(root, "plugin", "manifest.json"), manifest);
  const metadata = {
    id,
    version,
    sourceZipSha256: hash(version),
    files: { "manifest.json": hash(manifest) },
  };
  fs.writeFileSync(path.join(root, "release.json"), JSON.stringify(metadata));
  for (const name of ["server.cjs", "release.cjs", "updater.cjs"])
    fs.writeFileSync(path.join(root, name), "// generated runtime module\n");
  return metadata;
}
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "remnote-board-upgrade-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const root = path.join(home, "download");
  const data = release(root);
  const base = path.join(
    home,
    "Library/Application Support/RemNote-Database-Board",
  );
  const old = path.join(base, "0.2.2-aaaaaaaaaaaa");
  release(old, "0.2.2");
  const plist = path.join(home, "Library/LaunchAgents", `${label}.plist`);
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  const original = `<?xml version="1.0"?><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>/node</string><string>${old}/server.cjs</string></array></dict></plist>`;
  fs.writeFileSync(plist, original);
  let loaded = true,
    pid = 101,
    oldAlive = true,
    newFailed = false;
  const events = [];
  const ok = { status: 0, stdout: "" };
  const ctl = (args) => {
    const action = args[0];
    events.push(action);
    if (action === "print")
      return loaded
        ? { status: 0, stdout: `\tpid = ${pid}\n` }
        : { status: 113, stdout: "" };
    if (action === "bootout") {
      loaded = false;
      oldAlive = false;
      return ok;
    }
    if (action === "bootstrap") {
      const restoring = fs.readFileSync(plist, "utf8") === original;
      if (!restoring && newFailed)
        return { status: 1, stderr: "new service failed" };
      loaded = true;
      pid = restoring ? 101 : 202;
      return ok;
    }
    throw new Error(`Unexpected launchctl ${action}`);
  };
  const options = {
    root,
    home,
    platform: "darwin",
    ctl,
    health: async () => {
      events.push("health");
      return { ...data, pid: 202 };
    },
    pause: async () => {},
    alive: () => oldAlive,
    validatePlist: () => ok,
  };
  return {
    home,
    root,
    base,
    old,
    plist,
    original,
    data,
    events,
    options,
    fail: () => {
      newFailed = true;
    },
    status: () => ({ loaded, pid }),
  };
}
test("stops old service before starting new, checks PID, then removes old files", async (t) => {
  const f = fixture(t);
  const result = await main(f.options);
  assert.ok(f.events.indexOf("bootout") < f.events.indexOf("bootstrap"));
  assert.ok(f.events.indexOf("bootstrap") < f.events.indexOf("health"));
  assert.equal(result.pid, 202);
  assert.equal(fs.existsSync(f.old), false);
  assert.equal(fs.existsSync(result.installed), true);
  assert.deepEqual(result.cleanup.removed, ["0.2.2-aaaaaaaaaaaa"]);
});
test("same package is idempotent: keeps PID and only one runtime", async (t) => {
  const f = fixture(t);
  await main(f.options);
  f.events.length = 0;
  const result = await main(f.options);
  assert.equal(result.alreadyRunning, true);
  assert.equal(result.pid, 202);
  assert.equal(f.events.includes("bootout"), false);
  assert.equal(f.events.includes("bootstrap"), false);
  assert.equal(fs.readdirSync(f.base).filter((n) => /^\d/.test(n)).length, 1);
  assert.deepEqual(fs.readdirSync(path.join(f.base, "backups")), []);
});
test("reinstall keeps a running service that has already auto-updated its plugin", async (t) => {
  const f = fixture(t);
  await main(f.options);
  f.events.length = 0;
  f.options.health = async () => ({
    ...f.data,
    version: "0.4.0",
    sourceZipSha256: hash("0.4.0"),
    runtimeVersion: f.data.version,
    runtimeSourceZipSha256: f.data.sourceZipSha256,
    pid: 202,
  });
  const result = await main(f.options);
  assert.equal(result.alreadyRunning, true);
  assert.equal(f.events.includes("bootout"), false);
});
test("cleanup also removes verified runtimes from before automatic updates", (t) => {
  const f = fixture(t);
  for (const name of ["release.cjs", "updater.cjs"])
    fs.unlinkSync(path.join(f.old, name));
  const result = removeOldRuntimes(f.base, path.join(f.base, "new"));
  assert.deepEqual(result.removed, ["0.2.2-aaaaaaaaaaaa"]);
});
test("failed startup restores old service and files, removes failed candidate", async (t) => {
  const f = fixture(t);
  f.fail();
  await assert.rejects(
    main(f.options),
    /Previous launch configuration restored/,
  );
  assert.deepEqual(f.status(), { loaded: true, pid: 101 });
  assert.equal(fs.readFileSync(f.plist, "utf8"), f.original);
  assert.equal(fs.existsSync(f.old), true);
  assert.deepEqual(
    fs.readdirSync(f.base).filter((n) => /^\d/.test(n)),
    ["0.2.2-aaaaaaaaaaaa"],
  );
});
test("same version repairs changed server files instead of claiming it is already current", async (t) => {
  const f = fixture(t);
  const initial = await main(f.options);
  f.events.length = 0;
  fs.writeFileSync(
    path.join(initial.installed, "server.cjs"),
    "changed server",
  );
  const result = await main(f.options);
  assert.equal(result.alreadyRunning, false);
  assert.equal(f.events.includes("bootout"), true);
  assert.equal(
    fs.readFileSync(path.join(result.installed, "server.cjs"), "utf8"),
    fs.readFileSync(path.join(f.root, "server.cjs"), "utf8"),
  );
});
test("health from another PID cannot make a failed new service look successful", async (t) => {
  const f = fixture(t);
  f.options.health = async () => ({ ...f.data, pid: 999 });
  await assert.rejects(main(f.options), /New service did not become ready/);
  assert.equal(fs.existsSync(f.old), true);
  assert.deepEqual(f.status(), { loaded: true, pid: 101 });
});
test("wrong version health fails and keeps the previous runtime", async (t) => {
  const f = fixture(t);
  f.options.health = async () => ({ ...f.data, version: "0.2.2", pid: 202 });
  await assert.rejects(main(f.options), /New service did not become ready/);
  assert.equal(fs.existsSync(f.old), true);
});
test("does not start new service before previous process exits", async (t) => {
  const f = fixture(t);
  f.options.alive = () => true;
  await assert.rejects(main(f.options), /has not exited/);
  assert.equal(fs.existsSync(f.old), true);
  // The only bootstrap is rollback, with the original config already restored.
  assert.equal(f.events.filter((e) => e === "bootstrap").length, 1);
  assert.equal(fs.readFileSync(f.plist, "utf8"), f.original);
});
test("cleanup preserves current, unrelated, modified, and symlinked contents", (t) => {
  const f = fixture(t);
  const active = path.join(f.base, "0.2.3-bbbbbbbbbbbb");
  release(active);
  const modified = path.join(f.base, "0.1.0-cccccccccccc");
  release(modified, "0.1.0");
  fs.writeFileSync(path.join(modified, "my-notes.txt"), "keep");
  const corrupt = path.join(f.base, "0.1.1-dddddddddddd");
  release(corrupt, "0.1.1");
  fs.appendFileSync(path.join(corrupt, "plugin/manifest.json"), "changed");
  const unknown = path.join(f.base, "other-project");
  fs.mkdirSync(unknown);
  const link = path.join(f.base, "0.1.2-eeeeeeeeeeee");
  fs.symlinkSync(active, link);
  const result = removeOldRuntimes(f.base, active);
  assert.deepEqual(result.removed, ["0.2.2-aaaaaaaaaaaa"]);
  for (const item of [active, modified, corrupt, unknown, link])
    assert.ok(fs.existsSync(item));
  assert.equal(result.skipped.length, 2);
});
