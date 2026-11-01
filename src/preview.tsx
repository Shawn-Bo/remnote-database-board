import { t } from "./i18n";
import React from "react";
import ReactDOM from "react-dom";
import { Board } from "./Board";
import type { BoardPort, Config, Snapshot, WriteRequest } from "./model";
import { sameCell } from "./model";
import initial from "./demo-config.json";
import fixture from "./demo-snapshot.json";
import "./board.css";
// Standalone demo backed by session storage.
const storageKey = "remnote-board-preview:v2";
const viewKey = "remnote-board-preview-views:v2";
let data: Snapshot = structuredClone(fixture);
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
  if (saved?.tagId === fixture.tagId && Array.isArray(saved.rows)) data = saved;
} catch {}
const port: BoardPort = {
  async load(tagId) {
    if (tagId !== fixture.tagId) throw new Error(t("Demo database not found."));
    return structuredClone({ ...data, loadedAt: Date.now() });
  },
  async write(req: WriteRequest) {
    await new Promise((r) => setTimeout(r, 180));
    const row = data.rows.find((r) => r.id === req.rowId);
    if (!row || !sameCell(row.cells[req.fieldId], req.expected))
      throw new Error(t("Demo data changed. Refresh the view."));
    row.cells[req.fieldId] = structuredClone(req.value);
    sessionStorage.setItem(storageKey, JSON.stringify(data));
    return structuredClone(row);
  },
  async create(tagId, name, cells = {}) {
    if (tagId !== data.tagId) throw new Error(t("Demo database not found."));
    const row = {
      id: `preview-${crypto.randomUUID()}`,
      name: name || t("Untitled"),
      parentId: tagId,
      cells: Object.fromEntries(
        data.fields.map((f) => [f.id, cells[f.id] ?? { text: "", refs: [] }]),
      ),
    };
    data.rows.push(row);
    sessionStorage.setItem(storageKey, JSON.stringify(data));
    return structuredClone(row);
  },
  async open() {
    throw new Error(t("Open this record from RemNote to edit the full note."));
  },
};
let savedConfig: Config | undefined;
try {
  savedConfig =
    JSON.parse(sessionStorage.getItem(viewKey) ?? "null") ?? undefined;
} catch {}
const start = new URLSearchParams(location.search).has("setup")
  ? { tagId: "" }
  : (savedConfig ?? initial);

ReactDOM.render(
  <Board
    port={port}
    initial={start}
    onConfig={async (config) => {
      sessionStorage.setItem(viewKey, JSON.stringify(config));
    }}
    preview
  />,
  document.getElementById("root"),
);
