#!/usr/bin/env node
"use strict";
const http = require("node:http");
const path = require("node:path");
const {
  verify,
  readSnapshot,
  compareVersions,
  validVersion,
} = require("./release.cjs");
const { UpdateCache, AutoUpdater } = require("./updater.cjs");

function readHealth(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: "/__board_health", timeout: 1500 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (part) => {
          body += part;
          if (body.length > 8192)
            req.destroy(new Error("Unexpected health response."));
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error("Health request timed out.")),
    );
    req.on("error", reject);
  });
}

function createBoardServer({
  bundled,
  cache = new UpdateCache(),
  updateEnabled = true,
  fetchRelease,
  fetchAsset,
}) {
  let active = cache.load(bundled);
  const updater = new AutoUpdater({
    getSnapshot: () => active,
    setSnapshot: (value) => {
      active = value;
    },
    cache,
    fetchRelease,
    fetchAsset,
  });
  if (!updateEnabled) updater.status.enabled = false;
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".md": "text/plain; charset=utf-8",
  };
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "baggage, sentry-trace");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      return res.end("Method not allowed");
    }
    let route;
    try {
      route = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400);
      return res.end("Bad request");
    }
    const snapshot = active;
    if (route === "/__board_health") {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      return res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify({
              id: snapshot.release.id,
              version: snapshot.release.version,
              sourceZipSha256: snapshot.release.sourceZipSha256,
              pid: process.pid,
              runtimeVersion: bundled.release.version,
              runtimeSourceZipSha256: bundled.release.sourceZipSha256,
              autoUpdate: updater.status,
            }),
      );
    }
    const name = route === "/" ? "index.html" : route.slice(1);
    if (!Object.hasOwn(snapshot.files, name)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const data = snapshot.files[name];
    res.setHeader(
      "Content-Type",
      mime[path.extname(name)] || "application/octet-stream",
    );
    res.setHeader("Content-Length", data.length);
    res.writeHead(200);
    res.end(req.method === "HEAD" ? undefined : data);
  });
  server.once("listening", () => {
    if (updateEnabled) updater.start();
  });
  server.once("close", () => updater.stop());
  return { server, updater, getSnapshot: () => active };
}

async function main() {
  const bundled = readSnapshot(__dirname);
  if (process.argv.includes("--check")) {
    console.log(
      `Verified ${bundled.release.id} ${bundled.release.version}: ${Object.keys(bundled.files).length} files`,
    );
    return;
  }
  const port = Number(process.env.BOARD_PORT || 8081);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("BOARD_PORT must be between 1024 and 65535.");
  const { server, getSnapshot } = createBoardServer({
    bundled,
    cache: new UpdateCache(process.env.BOARD_UPDATE_DIR),
    updateEnabled: process.env.BOARD_AUTO_UPDATE !== "0",
  });
  server.on("error", async (err) => {
    if (err.code === "EADDRINUSE") {
      const current = await readHealth(port).catch(() => undefined);
      if (
        current?.id === bundled.release.id &&
        validVersion(current.version) &&
        compareVersions(current.version, bundled.release.version) >= 0
      ) {
        console.log(
          `RemNote board ${current.version} is already running at http://localhost:${port}.`,
        );
        return;
      }
      console.error(
        `Port ${port} is in use by another service/version. Close the old board service or choose BOARD_PORT.`,
      );
    } else console.error(err.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(
      `RemNote database board ${getSnapshot().release.version}: http://localhost:${port}`,
    );
    console.log(
      "RemNote > Settings > Plugins > Build > Develop from localhost",
    );
    console.log(
      "Updates are checked on startup and hourly. Reopen the board or refresh RemNote to use a downloaded update.",
    );
    console.log("Keep this window open. Ctrl+C stops the service.");
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close(() => process.exit(0)));
}
module.exports = { verify, readHealth, createBoardServer };
if (require.main === module)
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
