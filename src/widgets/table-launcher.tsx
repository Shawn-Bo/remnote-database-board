import React, { useCallback, useEffect, useState } from "react";
import { AppEvents, renderWidget, useAPIEventListener, usePlugin, WidgetLocation } from "@remnote/plugin-sdk";
import { tableEntriesAtRem, nativeTableOpening, type TableEntry } from "../table-entry";
import { Icon } from "../Icons";
import "../table-launcher.css";

export function TableLauncher() {
  const plugin = usePlugin();
  const [opening, setOpening] = useState<string>();
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ tables: TableEntry[]; error: string }>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setResult(undefined);
    setError("");
    setRevision(value => value + 1);
  }, []);
  // RemNote reuses document widgets when zooming between nodes. Widget context
  // itself is not a reactive API dependency, so listen for navigation explicitly.
  useAPIEventListener(AppEvents.GlobalOpenRem, undefined, refresh);
  useAPIEventListener(AppEvents.URLChange, undefined, refresh);
  useAPIEventListener(AppEvents.CurrentWindowTreeChange, undefined, refresh);
  useAPIEventListener(AppEvents.FocusedPortalChange, undefined, refresh);
  useEffect(() => {
    let active = true;
    // Let the host finish replacing the widget context before reading it.
    const timer = setTimeout(() => {
      void (async () => {
        const { documentId } = await plugin.widget.getWidgetContext<WidgetLocation.DocumentBelowTitle>();
        const tables = documentId ? await tableEntriesAtRem(plugin, documentId) : [];
        if (active) setResult({ tables, error: "" });
      })().catch(e => {
        if (active) setResult({ tables: [], error: `表格入口暂时无法加载：${e instanceof Error ? e.message : String(e)}` });
      });
    }, 100);
    return () => { active = false; clearTimeout(timer); };
  }, [plugin, revision]);
  if (!result || (!result.tables.length && !result.error)) return null;
  return <nav className="table-launcher" aria-label="此表格的数据库视图">
    {result.tables.map(table => <button
      key={table.tableId}
      type="button"
      disabled={!!opening}
      title={`打开 ${table.name} 的看板视图`}
      onClick={async () => {
        if (opening) return;
        setOpening(table.tableId);
        setError("");
        try {
          const context = await nativeTableOpening(plugin, table.tableId);
          await plugin.widget.openPopup("board", context, false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "打开失败，请重试。");
        } finally {
          setOpening(undefined);
        }
      }}
    >
      <Icon name="board" />
      <span>{opening === table.tableId ? "正在打开…" : "打开看板"}</span>
    </button>)}
    {(error || result.error) && <span role="alert">{error || result.error}</span>}
  </nav>;
}

renderWidget(TableLauncher);
