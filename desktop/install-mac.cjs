#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { verify, readHealth } = require("./server.cjs");
const label = "com.fanvane.remnote-database-board";
const runtimeFiles = ["server.cjs", "release.cjs", "updater.cjs"];
const escapeXml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const run = (args) => spawnSync("/bin/launchctl", args, { encoding: "utf8" });
const success = (result) => {
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || "launchctl failed.");
};

// Only generated runtimes with intact, known contents may be removed. Notes,
// downloads, source checkouts, symlinks and unexpected files are never pruned.
function removeOldRuntimes(base, installed) {
  const removed = [];
  const skipped = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const dir = path.join(base, entry.name);
    if (
      dir === installed ||
      !/^\d+\.\d+\.\d+-[a-f0-9]{12}$/.test(entry.name) ||
      !entry.isDirectory()
    )
      continue;
    try {
      const knownFiles = fs.existsSync(path.join(dir, "release.cjs"))
        ? runtimeFiles
        : ["server.cjs"];
      for (const name of [...knownFiles, "release.json", "plugin"]) {
        if (fs.lstatSync(path.join(dir, name)).isSymbolicLink())
          throw new Error("symlink");
      }
      const release = verify(dir);
      if (!entry.name.startsWith(`${release.version}-`))
        throw new Error("version mismatch");
      if (
        fs.readdirSync(dir).sort().join("|") !==
        [...knownFiles, "plugin", "release.json"].sort().join("|")
      )
        throw new Error("unexpected files");
      const expected = Object.keys(release.files).sort();
      if (
        fs.readdirSync(path.join(dir, "plugin")).sort().join("|") !==
        expected.join("|")
      )
        throw new Error("unexpected plugin files");
      for (const name of expected) {
        const stat = fs.lstatSync(path.join(dir, "plugin", name));
        if (!stat.isFile() || stat.isSymbolicLink())
          throw new Error("not a regular file");
      }
      fs.rmSync(dir, { recursive: true });
      removed.push(entry.name);
    } catch (err) {
      skipped.push({ directory: entry.name, reason: err.message });
    }
  }
  return { removed, skipped };
}

const servicePid = (result) =>
  result.status === 0
    ? Number(result.stdout?.match(/^\s*pid = (\d+)\s*$/m)?.[1]) || undefined
    : undefined;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") return false;
    throw err;
  }
};

async function main(options = {}) {
  const {
    root = __dirname,
    home = os.homedir(),
    platform = process.platform,
    ctl = run,
    health = readHealth,
    pause = delay,
    alive = isAlive,
    validatePlist = (file) =>
      spawnSync("/usr/bin/plutil", ["-lint", file], { encoding: "utf8" }),
  } = options;
  if (platform !== "darwin")
    throw new Error(
      "This installer is for macOS. Use Start-Windows.cmd on Windows.",
    );
  const release = verify(root);
  const base = path.join(
    home,
    "Library/Application Support/RemNote-Database-Board",
  );
  const runtimeHash = crypto
    .createHash("sha256")
    .update(release.sourceZipSha256)
    .update(
      Buffer.concat(
        runtimeFiles.map((name) => fs.readFileSync(path.join(root, name))),
      ),
    )
    .digest("hex")
    .slice(0, 12);
  const installed = path.join(base, `${release.version}-${runtimeHash}`);
  const createdRuntime = !fs.existsSync(installed);
  if (!createdRuntime && fs.lstatSync(installed).isSymbolicLink())
    throw new Error("Runtime directory must not be a symlink.");
  const agents = path.join(home, "Library/LaunchAgents");
  const plist = path.join(agents, `${label}.plist`);
  const logs = path.join(home, "Library/Logs/RemNote-Database-Board");
  const domain = `gui/${process.getuid()}`;
  const service = `${domain}/${label}`;
  const original = fs.existsSync(plist) ? fs.readFileSync(plist) : undefined;
  const previousService = ctl(["print", service]);
  const wasLoaded = previousService.status === 0;
  const previousPid = servicePid(previousService);
  if (original) {
    const inspected = spawnSync(
      "/usr/bin/plutil",
      ["-extract", "Label", "raw", "-o", "-", plist],
      { encoding: "utf8" },
    );
    if (inspected.status !== 0 || inspected.stdout.trim() !== label)
      throw new Error(
        "Existing launch configuration belongs to a different service.",
      );
  }
  for (const dir of [installed, agents, logs, path.join(base, "backups")])
    fs.mkdirSync(dir, { recursive: true });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${escapeXml(process.execPath)}</string><string>${escapeXml(path.join(installed, "server.cjs"))}</string></array>
<key>WorkingDirectory</key><string>${escapeXml(installed)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${escapeXml(path.join(logs, "service.log"))}</string>
<key>StandardErrorPath</key><string>${escapeXml(path.join(logs, "service-error.log"))}</string>
</dict></plist>\n`;
  const matches = (current) =>
    current?.id === release.id &&
    (current.runtimeVersion ?? current.version) === release.version &&
    (current.runtimeSourceZipSha256 ?? current.sourceZipSha256) ===
      release.sourceZipSha256;
  // Re-running the same package neither restarts the service nor creates more
  // backups. Verify the actual files and serving PID, not just a version label.
  let alreadyRunning = false;
  if (original?.toString() === xml && previousPid) {
    try {
      verify(installed);
      const current = await health(8081);
      alreadyRunning =
        matches(current) &&
        current.pid === previousPid &&
        runtimeFiles.every((name) =>
          fs
            .readFileSync(path.join(installed, name))
            .equals(fs.readFileSync(path.join(root, name))),
        );
    } catch {}
  }
  if (alreadyRunning) {
    const cleanup = removeOldRuntimes(base, installed);
    console.log(
      `RemNote database board ${release.version} is already running (PID ${previousPid}); no restart needed.`,
    );
    for (const name of cleanup.removed)
      console.log(`Removed old runtime: ${name}`);
    for (const item of cleanup.skipped)
      console.warn(`Kept ${item.directory}: ${item.reason}`);
    return { installed, pid: previousPid, alreadyRunning: true, cleanup };
  }
  fs.cpSync(path.join(root, "plugin"), path.join(installed, "plugin"), {
    recursive: true,
  });
  for (const name of [...runtimeFiles, "release.json"])
    fs.copyFileSync(path.join(root, name), path.join(installed, name));
  verify(installed);
  let newPid;
  try {
    if (wasLoaded) {
      success(ctl(["bootout", service]));
      // bootout unloads the KeepAlive job and terminates its process. Wait for
      // exit before binding the same port; never kill unrelated listeners.
      for (
        let attempt = 0;
        previousPid && alive(previousPid) && attempt < 40;
        attempt++
      )
        await pause(100);
      if (previousPid && alive(previousPid))
        throw new Error(
          `Previous board service (PID ${previousPid}) has not exited.`,
        );
    }
    const temporary = `${plist}.new-${process.pid}`;
    fs.writeFileSync(temporary, xml);
    fs.renameSync(temporary, plist);
    success(validatePlist(plist));
    let bootstrapped;
    for (let attempt = 0; attempt < 4; attempt++) {
      bootstrapped = ctl(["bootstrap", domain, plist]);
      if (bootstrapped.status === 0) break;
      // launchd can still be committing a just-completed bootout. Do not
      // kill any process or replace other jobs while waiting for this label.
      await pause(250);
    }
    success(bootstrapped);
    let healthy = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      const current = await health(8081).catch(() => undefined);
      newPid = servicePid(ctl(["print", service]));
      if (newPid && matches(current) && current.pid === newPid) {
        healthy = true;
        break;
      }
      await pause(200);
    }
    if (!healthy) throw new Error("New service did not become ready.");
  } catch (err) {
    if (ctl(["print", service]).status === 0) ctl(["bootout", service]);
    if (original) fs.writeFileSync(plist, original);
    else if (fs.existsSync(plist)) fs.unlinkSync(plist);
    if (wasLoaded && original) success(ctl(["bootstrap", domain, plist]));
    if (createdRuntime) fs.rmSync(installed, { recursive: true });
    throw new Error(`${err.message}\nPrevious launch configuration restored.`);
  }
  // Cleanup is deliberately outside rollback: an inability to remove a stale
  // file must not tear down a healthy new service. Failure above keeps old files.
  const cleanup = removeOldRuntimes(base, installed);
  console.log(
    `Installed and running RemNote database board ${release.version} (PID ${newPid}).`,
  );
  console.log(
    "It starts automatically when you log in. URL: http://localhost:8081",
  );
  console.log(
    "In RemNote: Settings > Plugins > Build > Develop from localhost.",
  );
  console.log(
    "Plugin updates are downloaded automatically on startup and every hour.",
  );
  for (const name of cleanup.removed)
    console.log(`Removed old runtime: ${name}`);
  for (const item of cleanup.skipped)
    console.warn(`Kept ${item.directory}: ${item.reason}`);
  return { installed, pid: newPid, alreadyRunning: false, cleanup };
}
module.exports = { main, removeOldRuntimes, servicePid };
if (require.main === module)
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
