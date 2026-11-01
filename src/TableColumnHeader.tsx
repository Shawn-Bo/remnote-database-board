import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Icon } from "./Icons";

export const MIN_COLUMN_WIDTH = 80;
export const MAX_COLUMN_WIDTH = 1200;
export const columnWidth = (value: number) => Math.round(Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, value)));

interface Props {
  name: string;
  icon: string;
  width: number;
  disabled: boolean;
  sortDirection?: "asc" | "desc";
  onSort: (direction?: "asc" | "desc") => void;
  onFilter: () => void;
  onHide?: () => void;
  onPreviewWidth: (width?: number) => void;
  onCommitWidth: (width: number) => void;
  onResetWidth: () => void;
}

export function TableColumnHeader({ name, icon, width, disabled, sortDirection,
  onSort, onFilter, onHide, onPreviewWidth, onCommitWidth, onResetWidth }: Props) {
  const title = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; start: number; width: number; target: HTMLElement }>();
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>();
  const [resizing, setResizing] = useState(false);
  const callbacks = useRef({ onPreviewWidth, onCommitWidth });
  callbacks.current = { onPreviewWidth, onCommitWidth };
  const stopResize = (commit: boolean) => {
    const current = drag.current;
    if (!current) return;
    drag.current = undefined;
    if (current.target.hasPointerCapture?.(current.pointerId))
      current.target.releasePointerCapture(current.pointerId);
    setResizing(false);
    if (commit) callbacks.current.onCommitWidth(current.width);
    else callbacks.current.onPreviewWidth();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) { event.preventDefault(); stopResize(false); }
    };
    const blur = () => { stopResize(false); setPosition(undefined); };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      const current = drag.current;
      drag.current = undefined;
      if (current?.target.hasPointerCapture?.(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
    };
  }, []);
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const close = (event: Event) => {
      if (!menu.current?.contains(event.target as Node) && !title.current?.contains(event.target as Node)) setPosition(undefined);
    };
    const reposition = () => setPosition(undefined);
    document.addEventListener("pointerdown", close);
    // A scroll within the menu must remain usable on short phone screens.
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) reposition(); };
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", reposition);
    };
  }, [!!position]);
  useEffect(() => { if (disabled) setPosition(undefined); }, [disabled]);
  useLayoutEffect(() => {
    if (!position || !menu.current) return;
    const top = Math.max(8, Math.min(position.top, innerHeight - menu.current.getBoundingClientRect().height - 8));
    if (top !== position.top) setPosition({ ...position, top });
  }, [position]);
  const act = (action: () => void) => { setPosition(undefined); title.current?.focus(); action(); };
  const item = (label: string, iconName: string, action: () => void, checked = false) => (
    <button role="menuitem" onClick={() => act(action)}>
      <Icon name={iconName} /><span>{label}</span>{checked && <Icon name="check" />}
    </button>
  );
  const host = title.current?.closest(".db-board");
  return <>
    <button className="column-title" ref={title} disabled={disabled}
      aria-label={`${name}列菜单`} aria-haspopup="menu" aria-expanded={!!position}
      onClick={() => {
        if (position) { setPosition(undefined); return; }
        const rect = title.current!.getBoundingClientRect();
        const workspace = title.current!.closest(".database-workspace")?.getBoundingClientRect();
        const left = workspace?.width ? Math.max(0, workspace.left) : 0;
        const right = workspace?.width ? Math.min(innerWidth, workspace.right) : innerWidth;
        const menuWidth = Math.min(240, Math.max(80, right - left - 16));
        const height = onHide ? 304 : 270;
        setPosition({ width: menuWidth, left: Math.max(left + 8, Math.min(rect.left, right - menuWidth - 8)),
          top: Math.max(8, Math.min(rect.bottom + 4, innerHeight - height - 8)) });
      }}>
      {icon === "name" ? <span className="type-icon">Aa</span> : <Icon name={icon} />}
      <span className="column-title-text">{name}</span>
      {sortDirection && <span className="column-sort-indicator" aria-label={sortDirection === "asc" ? "升序" : "降序"}>{sortDirection === "asc" ? "↑" : "↓"}</span>}
    </button>
    <div className={`column-resizer ${resizing ? "resizing" : ""}`} role="separator"
      aria-label={`调整${name}列宽`} aria-orientation="vertical" aria-valuemin={MIN_COLUMN_WIDTH}
      aria-valuemax={MAX_COLUMN_WIDTH} aria-valuenow={width} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      onPointerDown={event => {
        if (disabled || event.button !== 0 || drag.current) return;
        event.preventDefault(); event.stopPropagation(); setPosition(undefined);
        drag.current = { pointerId: event.pointerId, x: event.clientX, start: width, width, target: event.currentTarget };
        event.currentTarget.setPointerCapture(event.pointerId);
        setResizing(true); onPreviewWidth(width);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.width = columnWidth(current.start + event.clientX - current.x);
        onPreviewWidth(current.width);
      }}
      onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) stopResize(true); }}
      onPointerCancel={() => stopResize(false)} onLostPointerCapture={() => stopResize(false)}
      onKeyDown={event => {
        if (disabled || drag.current) return;
        const step = event.shiftKey ? 50 : 10;
        const next = event.key === "ArrowLeft" ? width - step : event.key === "ArrowRight" ? width + step
          : event.key === "Home" ? MIN_COLUMN_WIDTH : event.key === "End" ? MAX_COLUMN_WIDTH : undefined;
        if (next !== undefined) { event.preventDefault(); onCommitWidth(columnWidth(next)); }
      }}
    />
    {position && host && ReactDOM.createPortal(<div className="column-menu" ref={menu} role="menu"
      aria-label={`${name}列设置`} style={position}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); act(() => {}); }
        if (event.key === "Tab") setPosition(undefined);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const items = [...menu.current!.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)")];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}>
      <div className="column-menu-heading">{name}</div>
      {item("升序排序", "sort", () => onSort("asc"), sortDirection === "asc")}
      {item("降序排序", "sort", () => onSort("desc"), sortDirection === "desc")}
      {sortDirection && item("清除此列排序", "close", () => onSort())}
      {item("筛选", "filter", onFilter)}
      <hr />
      {onHide && item("在此视图中隐藏", "eye", onHide)}
      {item("恢复默认列宽", "refresh", onResetWidth)}
      <div className="column-width-controls"><span>列宽</span>
        <button role="menuitem" aria-label="缩窄此列" disabled={width <= MIN_COLUMN_WIDTH}
          onClick={() => onCommitWidth(columnWidth(width - 40))}>−</button>
        <output aria-label="当前列宽">{width}</output>
        <button role="menuitem" aria-label="加宽此列" disabled={width >= MAX_COLUMN_WIDTH}
          onClick={() => onCommitWidth(columnWidth(width + 40))}>+</button>
      </div>
    </div>, host)}
  </>;
}
