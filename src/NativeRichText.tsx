import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  RichText,
  RemHierarchyEditorTree,
  type RNPlugin,
  type RichTextInterface,
} from "@remnote/plugin-sdk";
import { newId } from "./views";
import { registerNativeClip } from "./native-clip-bridge";

type Bounds = Pick<DOMRect, "top" | "right" | "bottom" | "left">;

/** Native RichText is drawn in RemNote's parent page, outside our iframe.
 * Its position follows scrolling, but iframe overflow cannot clip it. Mirror
 * only the visible rectangle through the public CSS API; retain the original
 * RichText and RemNote's file loading, image zoom, and reference handling.
 */
export function clipInsets(box: Bounds, clips: Bounds[]): string {
  const visible = clips.reduce(
    (a, b) => ({
      top: Math.max(a.top, b.top),
      right: Math.min(a.right, b.right),
      bottom: Math.min(a.bottom, b.bottom),
      left: Math.max(a.left, b.left),
    }),
    box,
  );
  if (visible.right <= visible.left || visible.bottom <= visible.top)
    return "inset(100%)";
  return `inset(${[
    visible.top - box.top,
    box.right - visible.right,
    box.bottom - visible.bottom,
    visible.left - box.left,
  ]
    .map((n) => `${Math.max(0, Math.ceil(n))}px`)
    .join(" ")})`;
}

export function visibleClip(element: HTMLElement): string {
  const box = element.getBoundingClientRect();
  const clips: Bounds[] = [
    { top: 0, left: 0, right: innerWidth, bottom: innerHeight },
  ];
  const board = element.closest<HTMLElement>(".db-board");
  const drawer = element.closest<HTMLElement>(".detail-drawer");
  // Native embeds otherwise float above our modal and its dimmed background.
  if (
    board?.querySelector(".create-backdrop") ||
    (board?.querySelector(".drawer-backdrop") && !drawer)
  )
    return "inset(100%)";
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent),
      rect = parent.getBoundingClientRect();
    const clipX = /^(auto|scroll|hidden|clip)$/.test(
      style.overflowX || style.overflow,
    );
    const clipY = /^(auto|scroll|hidden|clip)$/.test(
      style.overflowY || style.overflow,
    );
    if (clipX || clipY)
      clips.push({
        top: clipY ? rect.top + parent.clientTop : -Infinity,
        bottom: clipY
          ? rect.top + parent.clientTop + parent.clientHeight
          : Infinity,
        left: clipX ? rect.left + parent.clientLeft : -Infinity,
        right: clipX
          ? rect.left + parent.clientLeft + parent.clientWidth
          : Infinity,
      });
  }
  const heading = drawer?.querySelector<HTMLElement>(".drawer-heading");
  if (heading)
    clips.push({
      top: heading.getBoundingClientRect().bottom,
      bottom: Infinity,
      left: -Infinity,
      right: Infinity,
    });
  const panel = board?.querySelector<HTMLElement>(".database-panel");
  if (!drawer && panel && getComputedStyle(panel).position === "absolute") {
    clips.push({
      top: -Infinity,
      bottom: Infinity,
      left: -Infinity,
      right: panel.getBoundingClientRect().left,
    });
  }
  return clipInsets(box, clips);
}

/** Coalesce all image clips into one stylesheet and serialize writes, so a
 * slower earlier update cannot restore stale scroll positions or old rules.
 */
export class NativeClipSheet {
  readonly prefix = `fanvane-db-rich-${newId()}`;
  private entries = new Map<string, HTMLElement>();
  private frame = 0;
  private previous = "";
  private tail: Promise<void> = Promise.resolve();
  private resize?: ResizeObserver;
  private tree?: MutationObserver;
  private started = false;
  constructor(private register: (id: string, css: string) => Promise<void>) {}
  private write(css: string) {
    if (css === this.previous) return this.tail;
    this.previous = css;
    const pending = this.tail
      .catch(() => {})
      .then(() => this.register(this.prefix, css));
    this.tail = pending;
    return pending;
  }
  start() {
    this.started = true;
    this.resize = new ResizeObserver(this.schedule);
    for (const element of this.entries.values()) this.resize.observe(element);
    this.tree = new MutationObserver(this.schedule);
    this.tree.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("scroll", this.schedule, true);
    window.addEventListener("resize", this.schedule);
    this.schedule();
    return this.write(`.${this.prefix}{clip-path:inset(100%)!important;}`);
  }
  add(id: string, element: HTMLElement) {
    this.entries.set(id, element);
    this.resize?.observe(element);
    this.schedule();
    return () => {
      this.resize?.unobserve(element);
      this.entries.delete(id);
      this.schedule();
    };
  }
  schedule = () => {
    if (!this.started || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const css =
        `.${this.prefix}{clip-path:inset(100%)!important;}\n` +
        [...this.entries]
          .map(
            ([id, element]) =>
              `.${this.prefix}.${id}{clip-path:${visibleClip(element)}!important;}`,
          )
          .join("\n");
      void this.write(css).catch(() => {
        this.previous = "";
      });
    });
  };
  stop() {
    this.started = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resize?.disconnect();
    this.tree?.disconnect();
    document.removeEventListener("scroll", this.schedule, true);
    window.removeEventListener("resize", this.schedule);
    return this.write("");
  }
}

const ClipContext = React.createContext<NativeClipSheet | undefined>(undefined);
export function NativeRichTextProvider({
  plugin,
  children,
}: {
  plugin: RNPlugin;
  children: React.ReactNode;
}) {
  const sheet = useMemo(
    () => new NativeClipSheet((id, css) => registerNativeClip(plugin, id, css)),
    [plugin],
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void sheet
      .start()
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setError("图片显示区域初始化失败，请关闭后重新打开视图。");
      });
    return () => {
      active = false;
      void sheet.stop().catch(() => {});
    };
  }, [sheet]);
  if (error) return <div role="alert">{error}</div>;
  return ready ? (
    <ClipContext.Provider value={sheet}>{children}</ClipContext.Provider>
  ) : null;
}

export function NativeRichText({
  text,
  maxHeight,
}: {
  text: RichTextInterface;
  maxHeight: number;
}) {
  const sheet = React.useContext(ClipContext);
  const host = useRef<HTMLDivElement>(null);
  const [id] = useState(() => `media-${newId()}`);
  useEffect(() => {
    if (host.current && sheet) return sheet.add(id, host.current);
  }, [id, sheet]);
  return (
    <div ref={host} style={{ width: "100%", maxHeight, overflow: "hidden" }}>
      <RichText
        text={text}
        width="100%"
        height="auto"
        maxHeight={maxHeight}
        className={sheet ? `${sheet.prefix} ${id}` : undefined}
      />
    </div>
  );
}

// The editor operates on the original Rem and its descendants. No plugin
// copy, textarea serializer, or manual note write-back is involved.
export function NativeNote({ remId }: { remId: string }) {
  const sheet = React.useContext(ClipContext);
  const host = useRef<HTMLDivElement>(null);
  const [id] = useState(() => `note-${newId()}`);
  useEffect(() => {
    if (host.current && sheet) return sheet.add(id, host.current);
  }, [id, sheet]);
  return (
    <div ref={host} className="native-note-editor">
      <RemHierarchyEditorTree
        remId={remId}
        width="100%"
        height="100%"
        className={sheet ? `${sheet.prefix} ${id}` : undefined}
      />
    </div>
  );
}
