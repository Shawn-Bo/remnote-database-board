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
  type BoardOpening,
  type DatabaseViews,
} from "./views";
import { ViewToolbar, ViewPanel, type Panel } from "./ViewControls";
import { Icon, fieldIcon } from "./Icons";
import { PropertyCell } from "./PropertyCell";

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
            setViewError(`视图设置尚未保存：${message(e)}`);
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
    async (input: string, prior?: Partial<Config>, allRows = false, entry?: BoardOpening) => {
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
    if (initial.tagId) void connect(initial.tagId, initial, false, openingBoard);
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
        snapshot?.fields.find((f) => f.id === fieldId)?.name ?? "属性";
      const text = preview
        ? `演示${subject}已更新（不写入 RemNote）`
        : `${subject}已保存`;
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
      !activeView?.hiddenGroups.includes(g.id) &&
      (!activeView?.hideEmptyGroups || g.rows.length > 0),
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
    if (pendingRef.current.size || dragRef.current || creating) return;
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
  const create = async () => {
    if (!newRecord || !port.create || creating) return;
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
      selectRow(row);
      setNotice(preview ? "已创建演示记录" : "已创建记录");
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
        {scope ? "打开时的表格行范围" : "数据库全部记录"}
      </p>
      {scope && (
        <button
          className="settings-row"
          disabled={loading || pending.size > 0}
          onClick={() => void connect(config.tagId, config, true)}
        >
          显示数据库全部记录
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void connect(sourceInput, config);
        }}
      >
        <label>
          表格标签链接或 ID
          <input
            className="panel-input"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            disabled={pending.size > 0}
          />
        </label>
        <button className="new-button" disabled={loading || pending.size > 0}>
          连接
        </button>
      </form>
      {snapshot && (
        <>
          <button
            className="settings-row"
            onClick={() => void open(config.tagId)}
          >
            <Icon name="arrow" />
            打开原表格标签
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
            aria-label={`${row.name}的${snapshot?.fields.find((f) => f.id === activeView.coverFieldId)?.name}`}
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
              : row.name || "未命名"}
          </button>
          <button
            className="open-note icon-button"
            aria-label={`打开${row.name}原笔记`}
            title="打开原笔记"
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
    <main className="db-board">
      <header className="board-header">
        <div className="database-breadcrumb">
          <Icon name="table" />
          <span>数据库</span>
          {preview && <span className="preview-tag">演示</span>}
          <div className="header-spacer" />
          {onClose && (
            <button
              className="icon-button"
              aria-label="关闭看板"
              disabled={pending.size > 0 || creating}
              onClick={() => void closeBoard()}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="title-row">
          <h1>{snapshot?.name || "连接数据库"}</h1>
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
            disabled={pending.size > 0 || loading || creating}
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
            <button onClick={() => void refresh()}>重新读取</button>
          </div>
        )}
        {viewError && (
          <div className="error-banner" role="alert">
            {viewError}
            <button onClick={() => void persistConfig(configRef.current)}>
              重试保存视图
            </button>
          </div>
        )}
      </header>
      {!snapshot ? (
        <div className="setup-state">
          {loading ? <p>正在读取数据库…</p> : connection}
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
                        className={`column tone-${column.choiceIndex < 0 ? 0 : (column.choiceIndex % 8) + 1} ${over === column.id ? "drag-over" : ""} ${activeView.collapsedGroups.includes(column.id) ? "collapsed" : ""}`}
                      >
                        <div className="column-heading">
                          <button
                            className="group-label"
                            onClick={() =>
                              patchView({
                                collapsedGroups:
                                  activeView.collapsedGroups.includes(column.id)
                                    ? activeView.collapsedGroups.filter(
                                        (id) => id !== column.id,
                                      )
                                    : [
                                        ...activeView.collapsedGroups,
                                        column.id,
                                      ],
                              })
                            }
                            aria-expanded={
                              !activeView.collapsedGroups.includes(column.id)
                            }
                          >
                            <span>{column.name}</span>
                            <span className="count">{column.rows.length}</span>
                          </button>
                          <button
                            className="icon-button group-menu"
                            aria-label={`设置分组 ${column.name}`}
                            onClick={() => setPanel("group")}
                          >
                            <Icon name="more" />
                          </button>
                        </div>
                        {!activeView.collapsedGroups.includes(column.id) && (
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
                                新页面
                              </button>
                            )}
                          </div>
                        )}
                      </section>
                    ))}
                    {!columns.length && (
                      <div className="empty-state">
                        没有符合条件的记录。
                        <button
                          className="subtle-button"
                          onClick={() => setPanel("filters")}
                        >
                          调整筛选
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={`table-scroll ${activeView.wrapCells ? "wrap-cells" : ""}`}
                >
                  <table>
                    <thead>
                      <tr>
                        <th className="name-column">
                          <span className="type-icon">Aa</span>名称
                        </th>
                        {shownFields.map((f) => (
                          <th key={f.id}>
                            <button onClick={() => setPanel("properties")}>
                              <Icon name={fieldIcon(f.type)} />
                              {f.name}
                            </button>
                          </th>
                        ))}
                        <th className="add-column">
                          <button
                            className="icon-button"
                            aria-label="显示属性"
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
                              {row.name || "未命名"}
                            </button>
                            <button
                              className="open-note icon-button"
                              aria-label={`打开${row.name}原笔记`}
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
                      新页面
                    </button>
                  )}
                  {!rows.length && (
                    <div className="empty-state">没有符合条件的记录。</div>
                  )}
                </div>
              )}
              <footer className="database-footer">
                <span>
                  {rows.length} 条记录
                  {snapshot.rows.length !== rows.length
                    ? ` / 共 ${snapshot.rows.length} 条`
                    : ""}
                  {scope ? " · 当前表格范围" : ""}
                </span>
                <span aria-live="polite">
                  {loading
                    ? "正在读取…"
                    : pending.size || creating
                      ? "正在保存…"
                      : viewSaving
                        ? "正在保存视图…"
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
              disabled={pending.size > 0 || creating}
              groups={allGroups}
              connection={connection}
            />
          </div>
        )
      )}
      {newRecord && (
        <div className="create-backdrop">
          <form
            className="create-record"
            role="dialog"
            aria-label="新建记录"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="panel-heading">
              <strong>新建记录</strong>
              <button
                type="button"
                className="icon-button"
                aria-label="取消新建"
                disabled={creating}
                onClick={() => setNewRecord(undefined)}
              >
                <Icon name="close" />
              </button>
            </div>
            <input
              autoFocus
              className="panel-input"
              aria-label="记录名称"
              placeholder="未命名"
              value={newRecord.name}
              onChange={(e) =>
                setNewRecord({ ...newRecord, name: e.target.value })
              }
            />
            {error && <p role="alert">{error}</p>}
            <button className="new-button" disabled={creating}>
              {creating ? "正在创建…" : "创建记录"}
            </button>
          </form>
        </div>
      )}
      {selected && (
        <div className="drawer-backdrop" onClick={closeDetail}>
          <aside
            className="detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name}笔记`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-heading">
              <span className="drawer-heading-title">{selected.name}</span>
              <div className="drawer-heading-actions">
                <button
                  aria-label="在 RemNote 打开完整笔记"
                  onClick={() => void open(selected.id)}
                >
                  <Icon name="arrow" />
                </button>
                <button aria-label="关闭笔记" onClick={closeDetail}>
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
                  在 RemNote 打开完整笔记
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
