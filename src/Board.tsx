import { t } from "./i18n";
import { useLanguage } from "./use-language";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { BoardPort, Cell, Config, Row, Snapshot } from "./model";
import { UNKNOWN, emptyCell, inferConfig, parseRemId, sameCell } from "./model";
import {
  defaultViews,
  readViews,
  queryRows,
  viewGroups,
  moveValue,
  placeRow,
  openBoardView,
  isGroupHidden,
  groupVisibility,
  NAME,
  newId,
  type BoardOpening,
  type DatabaseViews,
} from "./views";
import { ViewToolbar, ViewPanel, type Panel } from "./ViewControls";
import { Icon, fieldIcon } from "./Icons";
import { PropertyCell } from "./PropertyCell";
import { TableColumnHeader } from "./TableColumnHeader";
import { BoardGroupHeader } from "./BoardGroupHeader";

type ColumnResize = { viewId: string; fieldId: string; width: number };

interface Props {
  port: BoardPort;
  initial: Partial<Config> & { tagId: string };
  openingBoard?: BoardOpening;
  renderNote?: (remId: string) => React.ReactNode;
  rowScope?: string[];
  onConfig?: (config: Config) => Promise<void>;
  onClose?: () => Promise<void>;
  loadConfig?: (tagId: string) => Promise<Config | undefined>;
  preview?: boolean;
  renderRichCell?: (
    cell: Cell,
    mode: "card" | "table" | "detail",
  ) => React.ReactNode;
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Board({
  port,
  initial,
  openingBoard,
  renderNote,
  rowScope,
  onConfig,
  onClose,
  loadConfig,
  preview,
  renderRichCell,
}: Props) {
  const language = useLanguage();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [config, setConfig] = useState<Config>({
    tagId: initial.tagId,
    groupFieldId: initial.groupFieldId ?? "",
    filterFieldId: initial.filterFieldId ?? "",
    recordFieldId: initial.recordFieldId ?? "",
  });
  const [sourceInput, setSourceInput] = useState(initial.tagId);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [newRecord, setNewRecord] = useState<{
    name: string;
    group?: string;
  }>();
  const [creating, setCreating] = useState(false);
  const viewState = config.viewState;
  const activeView =
    viewState?.views.find((v) => v.id === viewState.activeViewId) ??
    viewState?.views[0];
  const view = activeView?.layout ?? "table";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewError, setViewError] = useState("");
  const [viewSaving, setViewSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState("");
  const [over, setOver] = useState("");
  const [dropBefore, setDropBefore] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [columnResize, setColumnResize] = useState<ColumnResize>();
  const columnResizeRef = useRef<ColumnResize>();
  const [scope, setScope] = useState(
    rowScope ? { tagId: initial.tagId, rowIds: rowScope } : undefined,
  );
  const scopeRef = useRef(scope);
  const configRef = useRef(config);
  const pendingRef = useRef(new Set<string>());
  const loadingRef = useRef(false);
  const sequence = useRef(0);
  const dragRef = useRef<{
    row: Row;
    tagId: string;
    fieldId: string;
    pointerId: number;
    x: number;
    y: number;
    currentX: number;
    currentY: number;
    scroller: HTMLElement | null;
    active: boolean;
  }>();
  const scrollFrameRef = useRef<number>();
  const configSaveSequence = useRef(0);
  const configWrite = useRef<Promise<boolean>>(Promise.resolve(true));
  const persistConfig = useCallback(
    (next: Config) => {
      const seq = ++configSaveSequence.current;
      setViewSaving(true);
      setViewError("");
      const work = (async () => {
        try {
          await onConfig?.(next);
          return true;
        } catch (e) {
          if (seq === configSaveSequence.current)
            setViewError(
              t("View settings not saved: {p0}", { p0: message(e) }),
            );
          return false;
        } finally {
          if (seq === configSaveSequence.current) setViewSaving(false);
        }
      })();
      configWrite.current = work;
      return work;
    },
    [onConfig],
  );
  const connect = useCallback(
    async (
      input: string,
      prior?: Partial<Config>,
      allRows = false,
      entry?: BoardOpening,
    ) => {
      if (pendingRef.current.size || loadingRef.current || dragRef.current)
        return;
      const seq = ++sequence.current;
      loadingRef.current = true;
      setLoading(true);
      setError("");
      setNotice("");
      try {
        const tagId = parseRemId(input);
        const nextScope =
          !allRows && scopeRef.current?.tagId === tagId
            ? scopeRef.current
            : undefined;
        const data = await port.load(tagId, nextScope?.rowIds);
        if (sequence.current !== seq) return;
        const savedConfig =
          tagId !== configRef.current.tagId
            ? await loadConfig?.(tagId)
            : undefined;
        const source =
          savedConfig ?? (prior?.tagId === tagId ? prior : undefined);
        const next = inferConfig(data, source);
        next.viewState =
          readViews(source?.viewState) ??
          defaultViews(data, next, !!source?.groupFieldId);
        if (entry)
          next.viewState = openBoardView(next.viewState, data, next, entry);
        configRef.current = next;
        scopeRef.current = nextScope;
        setScope(nextScope);
        setConfig(next);
        setSnapshot(data);
        setSelectedId("");
        await persistConfig(next);
      } catch (e) {
        if (sequence.current === seq) setError(message(e));
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [port, persistConfig, loadConfig],
  );

  const refresh = useCallback(async () => {
    if (pendingRef.current.size || loadingRef.current || dragRef.current)
      return;
    const id = configRef.current.tagId;
    if (!id) return;
    const seq = ++sequence.current;
    loadingRef.current = true;
    try {
      const data = await port.load(
        id,
        scopeRef.current?.tagId === id ? scopeRef.current.rowIds : undefined,
      );
      if (
        sequence.current === seq &&
        !pendingRef.current.size &&
        !dragRef.current
      ) {
        setSnapshot(data);
        setError("");
      }
    } catch (e) {
      if (sequence.current === seq) setError(message(e));
    } finally {
      loadingRef.current = false;
    }
  }, [port]);

  useEffect(() => {
    if (initial.tagId)
      void connect(initial.tagId, initial, false, openingBoard);
  }, [connect, initial, openingBoard]);
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void refresh();
    };
    const timer = window.setInterval(tick, 6000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const chooseConfig = async (patch: Partial<Config>) => {
    const next = { ...configRef.current, ...patch };
    configRef.current = next;
    setConfig(next);
    await persistConfig(next);
  };
  const write = async (
    row: Row,
    fieldId: string,
    expected: Cell,
    value: Cell,
  ) => {
    if (pendingRef.current.has(row.id)) return false;
    ++sequence.current;
    pendingRef.current.add(row.id);
    setPending(new Set(pendingRef.current));
    setError("");
    setNotice("");
    // Keep the last confirmed state until the SDK has written and read the value back.
    try {
      const saved = await port.write({
        config: configRef.current,
        rowId: row.id,
        fieldId,
        expected,
        value,
      });
      setSnapshot((s) =>
        s
          ? { ...s, rows: s.rows.map((r) => (r.id === saved.id ? saved : r)) }
          : s,
      );
      const subject =
        snapshot?.fields.find((f) => f.id === fieldId)?.name ?? t("Property");
      const text = preview
        ? t("{p0} updated", { p0: subject })
        : t("{p0} saved", { p0: subject });
      setNotice(text);
      return true;
    } catch (e) {
      const text = message(e);
      setError(text);
      return false;
    } finally {
      pendingRef.current.delete(row.id);
      setPending(new Set(pendingRef.current));
    }
  };
  const groupField = snapshot?.fields.find(
    (f) => f.id === activeView?.groupFieldId,
  );
  const rows =
    snapshot && activeView ? queryRows(snapshot, activeView, search) : [];
  const allGroups = viewGroups(rows, groupField);
  const shownFields =
    activeView?.visibleFieldIds
      .map((id) => snapshot?.fields.find((f) => f.id === id))
      .filter((f): f is NonNullable<typeof f> => !!f) ?? [];
  const columns = allGroups.filter(
    (g) =>
      !!activeView &&
      !isGroupHidden(activeView, g.id) &&
      (!activeView?.hideEmptyGroups || g.rows.length > 0),
  );
  const hiddenColumns = allGroups.filter(
    (g) => !!activeView && isGroupHidden(activeView, g.id),
  );
  const selected = snapshot?.rows.find((r) => r.id === selectedId);
  const cellContent = (
    cell: Cell | undefined,
    mode: "card" | "table" | "detail",
  ) =>
    cell?.richText && renderRichCell
      ? renderRichCell(cell, mode)
      : cell?.text || "—";
  const imageFields =
    snapshot?.fields.filter((field) =>
      snapshot.rows.some((row) => row.cells[field.id]?.richText),
    ) ?? [];
  const move = async (row: Row, target: string) => {
    if (!groupField) return true;
    try {
      const next = moveValue(target, groupField);
      const expected = row.cells[groupField.id] ?? emptyCell();
      if (!sameCell(expected, next))
        return await write(row, groupField.id, expected, next);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    }
  };
  const stopAutoScroll = () => {
    if (scrollFrameRef.current !== undefined)
      window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = undefined;
  };
  const cancelDrag = () => {
    stopAutoScroll();
    dragRef.current = undefined;
    setDragging("");
    setOver("");
    setDropBefore("");
  };
  const columnAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-column-id]")
      ?.dataset.columnId;
  const beforeAt = (x: number, y: number) => {
    const card = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-row-id]");
    if (!card) return undefined;
    const box = card.getBoundingClientRect();
    return y < box.top + box.height / 2
      ? card.dataset.rowId
      : (card.nextElementSibling as HTMLElement | null)?.dataset.rowId;
  };
  const startAutoScroll = () => {
    if (scrollFrameRef.current !== undefined) return;
    let last = 0;
    const step = (now: number) => {
      scrollFrameRef.current = undefined;
      const drag = dragRef.current;
      const scroller = drag?.scroller;
      if (!drag?.active || !scroller?.isConnected) return;
      const rect = scroller.getBoundingClientRect();
      if (drag.currentY < rect.top || drag.currentY > rect.bottom) return;
      const edge = Math.min(56, rect.width / 4);
      const speed =
        drag.currentX < rect.left + edge
          ? -Math.min(1, (rect.left + edge - drag.currentX) / edge)
          : drag.currentX > rect.right - edge
            ? Math.min(1, (drag.currentX - (rect.right - edge)) / edge)
            : 0;
      if (!speed) return;
      const elapsed = last
        ? Math.min(0.05, Math.max(0, (now - last) / 1000))
        : 1 / 60;
      scroller.scrollLeft += speed * 900 * elapsed;
      last = now;
      const target = columnAt(drag.currentX, drag.currentY);
      setOver(target && target !== UNKNOWN ? target : "");
      const canScroll =
        speed > 0
          ? scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth
          : scroller.scrollLeft > 0;
      if (canScroll)
        scrollFrameRef.current = window.requestAnimationFrame(step);
    };
    scrollFrameRef.current = window.requestAnimationFrame(step);
  };
  const startDrag = (e: React.PointerEvent<HTMLElement>, row: Row) => {
    const target = e.target as HTMLElement;
    if (
      e.button !== 0 ||
      pendingRef.current.has(row.id) ||
      target.closest("button,select,input,textarea,a") ||
      (e.pointerType === "touch" && !target.closest(".grip"))
    )
      return;
    dragRef.current = {
      row,
      tagId: config.tagId,
      fieldId: groupField?.id ?? "",
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      scroller: e.currentTarget.closest(".board-scroll"),
      active: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const updateDrag = (e: React.PointerEvent<HTMLElement>) => {
    const payload = dragRef.current;
    if (!payload || payload.pointerId !== e.pointerId) return;
    if (
      !payload.active &&
      Math.hypot(e.clientX - payload.x, e.clientY - payload.y) < 8
    )
      return;
    payload.active = true;
    payload.currentX = e.clientX;
    payload.currentY = e.clientY;
    e.preventDefault();
    setDragging(payload.row.id);
    startAutoScroll();
    const target = columnAt(e.clientX, e.clientY);
    if (!activeView?.sorts.length)
      setDropBefore(beforeAt(e.clientX, e.clientY) ?? "");
    setOver(target && target !== UNKNOWN ? target : "");
  };
  const finishDrag = (e: React.PointerEvent<HTMLElement>) => {
    const payload = dragRef.current;
    const target = columnAt(e.clientX, e.clientY);
    const before = beforeAt(e.clientX, e.clientY);
    cancelDrag();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (
      !payload?.active ||
      payload.pointerId !== e.pointerId ||
      !target ||
      target === UNKNOWN ||
      payload.tagId !== configRef.current.tagId ||
      payload.fieldId !==
        (configRef.current.viewState?.views.find(
          (v) => v.id === configRef.current.viewState?.activeViewId,
        )?.groupFieldId ?? "")
    )
      return;
    // Use the value captured at pointer-down, so a concurrent edit is rejected by the write guard.
    void (async () => {
      if (
        (await move(payload.row, target)) &&
        snapshot &&
        activeView &&
        !activeView.sorts.length
      )
        patchView({
          rowOrder: placeRow(snapshot, activeView, payload.row.id, before),
        });
    })();
  };
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDrag();
    };
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("keydown", cancel);
      stopAutoScroll();
      dragRef.current = undefined;
    };
  }, []);
  const selectRow = (row: Row) => {
    if (!pendingRef.current.size) setSelectedId(row.id);
  };
  const closeDetail = () => {
    setSelectedId("");
    void refresh();
  };
  const closeBoard = async () => {
    if (!pendingRef.current.size && (await configWrite.current))
      await onClose?.();
  };
  const open = async (id: string) => {
    if (pendingRef.current.size || !(await configWrite.current)) return;
    try {
      await port.open(id);
      await onClose?.();
    } catch (e) {
      setError(message(e));
    }
  };
  const changeViews = (state: DatabaseViews) => {
    if (
      pendingRef.current.size ||
      dragRef.current ||
      columnResizeRef.current ||
      creating
    )
      return;
    void chooseConfig({ viewState: state });
  };
  const patchView = (patch: Partial<NonNullable<typeof activeView>>) => {
    if (viewState && activeView)
      changeViews({
        ...viewState,
        views: viewState.views.map((v) =>
          v.id === activeView.id ? { ...v, ...patch } : v,
        ),
      });
  };
  const tableWidth = (fieldId: string) =>
    columnResize?.viewId === activeView?.id && columnResize?.fieldId === fieldId
      ? columnResize.width
      : (activeView?.columnWidths[fieldId] ?? (fieldId === NAME ? 200 : 160));
  const tableHeader = (fieldId: string, name: string, icon: string) => (
    <TableColumnHeader
      key={`${activeView!.id}:${fieldId}`}
      name={name}
      icon={icon}
      width={tableWidth(fieldId)}
      disabled={
        loading ||
        pending.size > 0 ||
        creating ||
        (!!columnResize && columnResize.fieldId !== fieldId)
      }
      sortDirection={
        activeView!.sorts.find((sort) => sort.fieldId === fieldId)?.direction
      }
      onSort={(direction) => {
        const sorts = activeView!.sorts;
        patchView({
          sorts: !direction
            ? sorts.filter((sort) => sort.fieldId !== fieldId)
            : sorts.some((sort) => sort.fieldId === fieldId)
              ? sorts.map((sort) =>
                  sort.fieldId === fieldId ? { ...sort, direction } : sort,
                )
              : [...sorts, { id: newId(), fieldId, direction }],
        });
      }}
      onFilter={() => {
        if (!activeView!.filters.some((filter) => filter.fieldId === fieldId))
          patchView({
            filters: [
              ...activeView!.filters,
              { id: newId(), fieldId, operator: "is", value: "" },
            ],
          });
        setPanel("filters");
      }}
      onHide={
        fieldId === NAME
          ? undefined
          : () =>
              patchView({
                visibleFieldIds: activeView!.visibleFieldIds.filter(
                  (id) => id !== fieldId,
                ),
              })
      }
      onPreviewWidth={(width) => {
        const next =
          width === undefined
            ? undefined
            : { viewId: activeView!.id, fieldId, width };
        columnResizeRef.current = next;
        setColumnResize(next);
      }}
      onCommitWidth={(width) => {
        columnResizeRef.current = undefined;
        setColumnResize(undefined);
        patchView({
          columnWidths: { ...activeView!.columnWidths, [fieldId]: width },
        });
      }}
      onResetWidth={() => {
        const next = { ...activeView!.columnWidths };
        delete next[fieldId];
        patchView({ columnWidths: next });
      }}
    />
  );
  const create = async () => {
    if (!newRecord || !port.create || creating || pendingRef.current.size)
      return;
    ++sequence.current;
    pendingRef.current.add("__create__");
    setPending(new Set(pendingRef.current));
    setCreating(true);
    setError("");
    try {
      const cells: Record<string, Cell> = {};
      if (activeView?.filterMode === "all")
        for (const rule of activeView.filters) {
          const field = snapshot?.fields.find((f) => f.id === rule.fieldId);
          if (rule.operator !== "is" || !field || !rule.value) continue;
          if (field.type === "single_select") {
            const c = field.choices.find((c) => c.id === rule.value);
            if (c) cells[field.id] = { text: c.name, refs: [c.id] };
          } else if (["text", "0", "number", "url"].includes(field.type))
            cells[field.id] = { text: rule.value, refs: [] };
        }
      if (groupField && newRecord.group)
        cells[groupField.id] = moveValue(newRecord.group, groupField);
      const row = await port.create(config.tagId, newRecord.name, cells);
      if (scopeRef.current) {
        const next = {
          ...scopeRef.current,
          rowIds: [...scopeRef.current.rowIds, row.id],
        };
        scopeRef.current = next;
        setScope(next);
      }
      setSnapshot((s) =>
        s ? { ...s, rows: [...s.rows.filter((r) => r.id !== row.id), row] } : s,
      );
      setNewRecord(undefined);
      // The create request still owns the pending guard. Its confirmed result
      // can be opened directly; user-driven selection remains guarded.
      setSelectedId(row.id);
      setNotice(preview ? t("Demo record created") : t("Record created"));
    } catch (e) {
      setError(message(e));
    } finally {
      pendingRef.current.delete("__create__");
      setPending(new Set(pendingRef.current));
      setCreating(false);
    }
  };
  const connection = (
    <div className="connection">
      <p className="panel-caption">
        {scope ? t("Rows visible when opened") : t("All database records")}
      </p>
      {scope && (
        <button
          className="settings-row"
          disabled={loading || pending.size > 0}
          onClick={() => void connect(config.tagId, config, true)}
        >
          {t("Show all database records")}
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void connect(sourceInput, config);
        }}
      >
        <label>
          {t("Table tag link or ID")}
          <input
            className="panel-input"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            disabled={pending.size > 0}
          />
        </label>
        <button className="new-button" disabled={loading || pending.size > 0}>
          {t("Connect")}
        </button>
      </form>
      {snapshot && (
        <>
          <button
            className="settings-row"
            onClick={() => void open(config.tagId)}
          >
            <Icon name="arrow" />
            {t("Open source table tag")}
          </button>
        </>
      )}
    </div>
  );
  const canMove =
    !groupField ||
    ["single_select", "text", "0", "number", "url"].includes(groupField.type);
  const card = (row: Row) => (
    <article
      key={row.id}
      data-row-id={row.id}
      className={`card ${dragging === row.id ? "dragging" : ""} ${pending.has(row.id) ? "saving" : ""} ${dropBefore === row.id ? "drop-before" : ""}`}
      draggable={false}
      onPointerDown={(e) => {
        if (canMove) startDrag(e, row);
      }}
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
      onLostPointerCapture={cancelDrag}
    >
      {activeView?.coverFieldId &&
        row.cells[activeView.coverFieldId]?.richText && (
          <div
            className="card-media"
            aria-label={t("{p0}'s {p1}", {
              p0: row.name,
              p1: snapshot?.fields.find((f) => f.id === activeView.coverFieldId)
                ?.name,
            })}
            onClick={() => selectRow(row)}
          >
            {cellContent(row.cells[activeView.coverFieldId], "card")}
          </div>
        )}
      <div className="card-content">
        <div className="card-top">
          <span className="grip" aria-hidden="true">
            ⠿
          </span>
          <button className="card-title" onClick={() => selectRow(row)}>
            {row.title?.richText && renderRichCell
              ? renderRichCell(row.title, "card")
              : row.name || t("Untitled")}
          </button>
          <button
            className="open-note icon-button"
            aria-label={t("Open {p0} in RemNote", { p0: row.name })}
            title={t("Open in RemNote")}
            onClick={() => void open(row.id)}
          >
            <Icon name="arrow" />
          </button>
        </div>
        {shownFields
          .filter(
            (f) => f.id !== activeView?.coverFieldId && f.id !== groupField?.id,
          )
          .map((f) => {
            const cell = row.cells[f.id];
            if (!cell?.text && !cell?.richText && !cell?.refs.length)
              return null;
            return (
              <div className="card-property" key={f.id} title={f.name}>
                {cell.richText ? (
                  <div className="card-media">{cellContent(cell, "card")}</div>
                ) : f.type.endsWith("_select") ? (
                  <span
                    className={`property-tag tone-${
                      (Math.max(
                        0,
                        f.choices.findIndex((c) => cell.refs.includes(c.id)),
                      ) %
                        8) +
                      1
                    }`}
                  >
                    {cell.text}
                  </span>
                ) : (
                  <p className="card-preview">{cell.text}</p>
                )}
              </div>
            );
          })}
      </div>
    </article>
  );
  return (
    <main
      lang={language}
      className={`db-board ${selected && !newRecord ? "has-open-record" : ""}`}
    >
      <div className="database-workspace">
        <header className="board-header">
          <div className="database-breadcrumb">
            <Icon name="table" />
            <span>{t("Database")}</span>
            {preview && <span className="preview-tag">{t("Demo")}</span>}
            <div className="header-spacer" />
            {onClose && (
              <button
                className="icon-button"
                aria-label={t("Close board")}
                disabled={pending.size > 0 || creating}
                onClick={() => void closeBoard()}
              >
                <Icon name="close" />
              </button>
            )}
          </div>
          <div className="title-row">
            <h1>{snapshot?.name || t("Connect database")}</h1>
          </div>
          {snapshot && activeView && viewState && (
            <ViewToolbar
              snapshot={snapshot}
              config={config}
              state={viewState}
              view={activeView}
              onChange={changeViews}
              panel={panel}
              setPanel={setPanel}
              disabled={
                pending.size > 0 || loading || creating || !!columnResize
              }
              search={search}
              setSearch={setSearch}
              onCreate={
                port.create ? () => setNewRecord({ name: "" }) : undefined
              }
              onRefresh={() => void refresh()}
            />
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => void refresh()}>{t("Reload")}</button>
            </div>
          )}
          {viewError && (
            <div className="error-banner" role="alert">
              {viewError}
              <button onClick={() => void persistConfig(configRef.current)}>
                {t("Retry saving view")}
              </button>
            </div>
          )}
        </header>
        {!snapshot ? (
          <div className="setup-state">
            {loading ? <p>{t("Loading database…")}</p> : connection}
          </div>
        ) : (
          activeView &&
          viewState && (
            <div className={`database-body ${panel ? "panel-open" : ""}`}>
              <div className="view-canvas">
                {view === "board" ? (
                  <div
                    className={`board-scroll size-${activeView.cardSize} ${activeView.colorColumns ? "color-columns" : ""}`}
                  >
                    <div className="columns">
                      {columns.map((column) => (
                        <section
                          key={column.id}
                          data-column-id={column.id}
                          className={`column tone-${column.choiceIndex < 0 ? 0 : (column.choiceIndex % 8) + 1} ${over === column.id ? "drag-over" : ""}`}
                        >
                          <BoardGroupHeader
                            name={column.name}
                            count={column.rows.length}
                            disabled={
                              pending.size > 0 ||
                              loading ||
                              creating ||
                              !!dragging
                            }
                            onHide={() =>
                              patchView(
                                groupVisibility(activeView, column.id, true),
                              )
                            }
                            onSettings={() => setPanel("group")}
                            onCreate={
                              port.create && column.id !== UNKNOWN
                                ? () =>
                                    setNewRecord({
                                      name: "",
                                      group: canMove ? column.id : undefined,
                                    })
                                : undefined
                            }
                          />
                          <div className="card-list">
                            {column.rows.map(card)}
                            {port.create && column.id !== UNKNOWN && (
                              <button
                                className="new-card"
                                onClick={() =>
                                  setNewRecord({
                                    name: "",
                                    group: canMove ? column.id : undefined,
                                  })
                                }
                              >
                                <Icon name="plus" />
                                {t("New page")}
                              </button>
                            )}
                          </div>
                        </section>
                      ))}
                      {hiddenColumns.length > 0 && (
                        <section
                          className="hidden-groups"
                          aria-label={t("Hidden groups")}
                        >
                          <header className="hidden-groups-heading">
                            <span>{t("Hidden groups")}</span>
                            <button
                              className="subtle-button"
                              disabled={pending.size > 0 || !!dragging}
                              onClick={() =>
                                patchView({
                                  hiddenGroups: [],
                                  collapsedGroups: [],
                                  hideEmptyGroups: false,
                                })
                              }
                            >
                              {t("Show all")}
                            </button>
                          </header>
                          {hiddenColumns.map((column) => (
                            <div
                              key={column.id}
                              data-column-id={column.id}
                              className={`hidden-group tone-${column.choiceIndex < 0 ? 0 : (column.choiceIndex % 8) + 1} ${over === column.id ? "drag-over" : ""}`}
                            >
                              <button
                                className="hidden-group-label"
                                title={column.name}
                                aria-label={t("Show group {p0}", {
                                  p0: column.name,
                                })}
                                disabled={pending.size > 0 || !!dragging}
                                onClick={() =>
                                  patchView({
                                    ...groupVisibility(
                                      activeView,
                                      column.id,
                                      false,
                                    ),
                                    ...(column.rows.length
                                      ? {}
                                      : { hideEmptyGroups: false }),
                                  })
                                }
                              >
                                <span className="hidden-group-name">
                                  {column.name}
                                </span>
                                <span className="count">
                                  {column.rows.length}
                                </span>
                                <Icon name="eye" />
                              </button>
                            </div>
                          ))}
                        </section>
                      )}
                      {!columns.length && !hiddenColumns.length && (
                        <div className="empty-state">
                          {t("No matching records.")}
                          <button
                            className="subtle-button"
                            onClick={() => setPanel("filters")}
                          >
                            {t("Adjust filters")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`table-scroll ${activeView.wrapCells ? "wrap-cells" : ""}`}
                  >
                    <table
                      style={{
                        width:
                          tableWidth(NAME) +
                          shownFields.reduce(
                            (sum, field) => sum + tableWidth(field.id),
                            0,
                          ) +
                          38,
                      }}
                    >
                      <colgroup>
                        <col style={{ width: tableWidth(NAME) }} />
                        {shownFields.map((field) => (
                          <col
                            key={field.id}
                            style={{ width: tableWidth(field.id) }}
                          />
                        ))}
                        <col style={{ width: 38 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="name-column" data-field-id={NAME}>
                            {tableHeader(NAME, t("Name"), "name")}
                          </th>
                          {shownFields.map((f) => (
                            <th key={f.id} data-field-id={f.id}>
                              {tableHeader(f.id, f.name, fieldIcon(f.type))}
                            </th>
                          ))}
                          <th className="add-column">
                            <button
                              className="icon-button"
                              aria-label={t("Visible properties")}
                              onClick={() => setPanel("properties")}
                            >
                              <Icon name="plus" />
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} data-row-id={row.id}>
                            <td className="name-column">
                              <button
                                className="table-name"
                                onClick={() => selectRow(row)}
                              >
                                <Icon name="page" />
                                {row.name || t("Untitled")}
                              </button>
                              <button
                                className="open-note icon-button"
                                aria-label={t("Open {p0} in RemNote", {
                                  p0: row.name,
                                })}
                                onClick={() => void open(row.id)}
                              >
                                <Icon name="arrow" />
                              </button>
                            </td>
                            {shownFields.map((f) => (
                              <td key={f.id}>
                                <PropertyCell
                                  cell={row.cells[f.id] ?? emptyCell()}
                                  field={f}
                                  disabled={pending.has(row.id)}
                                  onSave={(expected, value) =>
                                    write(row, f.id, expected, value)
                                  }
                                  onOpen={() => void open(row.id)}
                                  renderRichCell={renderRichCell}
                                />
                              </td>
                            ))}
                            <td />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {port.create && (
                      <button
                        className="new-table-row"
                        onClick={() => setNewRecord({ name: "" })}
                      >
                        <Icon name="plus" />
                        {t("New page")}
                      </button>
                    )}
                    {!rows.length && (
                      <div className="empty-state">
                        {t("No matching records.")}
                      </div>
                    )}
                  </div>
                )}
                <footer className="database-footer">
                  <span>
                    {rows.length} {t(" records")}
                    {snapshot.rows.length !== rows.length
                      ? t(" of {p0}", { p0: snapshot.rows.length })
                      : ""}
                    {scope ? t(" · Current table scope") : ""}
                  </span>
                  <span aria-live="polite">
                    {loading
                      ? t("Loading…")
                      : pending.size || creating
                        ? t("Saving…")
                        : viewSaving
                          ? t("Saving view…")
                          : notice}
                  </span>
                </footer>
              </div>
              <ViewPanel
                snapshot={snapshot}
                config={config}
                state={viewState}
                view={activeView}
                onChange={changeViews}
                panel={panel}
                setPanel={setPanel}
                disabled={pending.size > 0 || creating || !!columnResize}
                groups={allGroups}
                connection={connection}
              />
            </div>
          )
        )}
      </div>
      {newRecord && (
        <div className="create-backdrop">
          <form
            className="create-record"
            role="dialog"
            aria-label={t("New record")}
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="panel-heading">
              <strong>{t("New record")}</strong>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Cancel")}
                disabled={creating}
                onClick={() => setNewRecord(undefined)}
              >
                <Icon name="close" />
              </button>
            </div>
            <input
              autoFocus
              className="panel-input"
              aria-label={t("Record name")}
              placeholder={t("Untitled")}
              value={newRecord.name}
              onChange={(e) =>
                setNewRecord({ ...newRecord, name: e.target.value })
              }
            />
            {error && <p role="alert">{error}</p>}
            <button className="new-button" disabled={creating}>
              {creating ? t("Creating…") : t("Create record")}
            </button>
          </form>
        </div>
      )}
      {selected && !newRecord && (
        <aside
          className="detail-drawer"
          role="dialog"
          aria-label={t("{p0} note", { p0: selected.name })}
        >
          <div className="drawer-heading">
            <span className="drawer-heading-title">{selected.name}</span>
            <div className="drawer-heading-actions">
              <button
                aria-label={t("Open full note in RemNote")}
                onClick={() => void open(selected.id)}
              >
                <Icon name="arrow" />
              </button>
              <button aria-label={t("Close note")} onClick={closeDetail}>
                <Icon name="close" />
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="native-note-error">
              {error}
            </p>
          )}
          <div className="native-note-slot">
            {renderNote ? (
              renderNote(selected.id)
            ) : (
              <button
                className="original-note"
                onClick={() => void open(selected.id)}
              >
                {t("Open full note in RemNote")}
              </button>
            )}
          </div>
        </aside>
      )}
    </main>
  );
}
