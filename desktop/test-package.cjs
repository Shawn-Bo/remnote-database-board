"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const {
  packageDesktop,
  HOST_FILES,
} = require("../scripts/package-desktop.cjs");
const { decodeUpdate } = require("./updater.cjs");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "board-package-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "desktop"));
  for (const file of HOST_FILES)
    fs.writeFileSync(
      path.join(root, "desktop", file),
      file.endsWith(".command") ? "#!/bin/sh\nexit 0\n" : "fixture\n",
      { mode: 0o600 },
    );
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ version: "0.3.7" }),
  );
  const plugin = path.join(root, "built");
  fs.mkdirSync(plugin);
  fs.writeFileSync(
    path.join(plugin, "manifest.json"),
    JSON.stringify({
      id: "fanvane-database-board",
      version: { major: 0, minor: 3, patch: 7 },
    }),
  );
  for (const file of ["index.js", "board.js", "index.html"])
    fs.writeFileSync(path.join(plugin, file), "example");
  execFileSync("/usr/bin/zip", ["-qr", path.join(root, "PluginZip.zip"), "."], {
    cwd: plugin,
  });
  return root;
}
test("built ZIP restores executable Mac scripts even when source permissions were missing", (t) => {
  const root = fixture(t);
  const result = packageDesktop({ root, output: path.join(root, "output") });
  const extracted = path.join(root, "expanded");
  fs.mkdirSync(extracted);
  const args =
    process.platform === "darwin"
      ? ["-xk", result.zip, extracted]
      : ["-q", result.zip, "-d", extracted];
  execFileSync(
    process.platform === "darwin" ? "/usr/bin/ditto" : "/usr/bin/unzip",
    args,
  );
  for (const name of ["Install-Mac.command", "Start-Mac.command"]) {
    const file = path.join(extracted, "RemNote-Board-0.3.7", name);
    assert.equal(fs.statSync(file).mode & 0o777, 0o755);
    execFileSync(file);
  }
  const update = decodeUpdate(fs.readFileSync(result.update), "0.3.7");
  assert.equal(update.files["board.js"].toString(), "example");
  assert.equal(result.executableScriptsVerified, true);
});
test("packaging rejects a stale plugin build before publication", (t) => {
  const root = fixture(t);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ version: "0.3.8" }),
  );
  assert.throws(
    () => packageDesktop({ root, output: path.join(root, "output") }),
    /version does not match/,
  );
  assert.equal(
    fs.existsSync(path.join(root, "output", "RemNote-Board-DesktopBundle.zip")),
    false,
  );
});
