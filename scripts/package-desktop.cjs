"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { hash, readSnapshot } = require("../desktop/release.cjs");
const { ASSET_NAME, decodeUpdate } = require("../desktop/updater.cjs");
const HOST_FILES = [
  "server.cjs",
  "release.cjs",
  "updater.cjs",
  "install-mac.cjs",
  "Install-Mac.command",
  "Start-Mac.command",
  "Start-Windows.cmd",
  "README.md",
];
function packageDesktop({
  root = path.resolve(__dirname, ".."),
  output = path.resolve(root, "../releases"),
} = {}) {
  const version = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ).version;
  const name = `RemNote-Board-${version}`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "remnote-board-package-"));
  const bundle = path.join(work, name);
  fs.mkdirSync(path.join(bundle, "plugin"), { recursive: true });
  try {
    const source = path.join(root, "PluginZip.zip");
    execFileSync("/usr/bin/unzip", [
      "-q",
      source,
      "-d",
      path.join(bundle, "plugin"),
    ]);
    const files = {};
    for (const file of fs.readdirSync(path.join(bundle, "plugin")).sort()) {
      const p = path.join(bundle, "plugin", file);
      if (!fs.lstatSync(p).isFile())
        throw new Error("Plugin archive must contain flat regular files.");
      files[file] = hash(fs.readFileSync(p));
      fs.chmodSync(p, 0o644);
    }
    const release = {
      id: "fanvane-database-board",
      version,
      sourceZipSha256: hash(fs.readFileSync(source)),
      files,
    };
    fs.writeFileSync(
      path.join(bundle, "release.json"),
      JSON.stringify(release, null, 2) + "\n",
      { mode: 0o644 },
    );
    const snapshot = readSnapshot(bundle);
    for (const file of HOST_FILES) {
      const target = path.join(bundle, file);
      fs.copyFileSync(path.join(root, "desktop", file), target);
      fs.chmodSync(target, file.endsWith(".command") ? 0o755 : 0o644);
    }
    for (const dir of [bundle, path.join(bundle, "plugin")])
      fs.chmodSync(dir, 0o755);
    const payload = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        release,
        files: Object.fromEntries(
          Object.entries(snapshot.files).map(([file, bytes]) => [
            file,
            bytes.toString("base64"),
          ]),
        ),
      }) + "\n",
    );
    decodeUpdate(payload, version);
    fs.mkdirSync(output, { recursive: true });
    const zip = path.join(output, "RemNote-Board-DesktopBundle.zip");
    fs.rmSync(zip, { force: true });
    execFileSync("/usr/bin/zip", ["-qrX", zip, name], { cwd: work });
    // Check the actual archive after extraction, not just source file permissions.
    const extracted = path.join(work, "extracted");
    fs.mkdirSync(extracted);
    execFileSync("/usr/bin/unzip", ["-q", zip, "-d", extracted]);
    for (const file of ["Install-Mac.command", "Start-Mac.command"]) {
      if (
        (fs.statSync(path.join(extracted, name, file)).mode & 0o111) !==
        0o111
      )
        throw new Error(`Executable permission missing in ZIP: ${file}`);
    }
    readSnapshot(path.join(extracted, name));
    const published = path.join(output, name);
    fs.rmSync(published, { force: true, recursive: true });
    fs.cpSync(bundle, published, { recursive: true });
    fs.writeFileSync(path.join(output, ASSET_NAME), payload);
    fs.copyFileSync(zip, path.join(output, `${name}-DesktopBundle.zip`));
    fs.copyFileSync(source, path.join(output, `${name}-PluginZip.zip`));
    return {
      version,
      bundle: published,
      zip,
      update: path.join(output, ASSET_NAME),
      sha256: hash(fs.readFileSync(zip)),
      executableScriptsVerified: true,
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
module.exports = { packageDesktop, HOST_FILES };
if (require.main === module)
  console.log(JSON.stringify(packageDesktop(), null, 2));
