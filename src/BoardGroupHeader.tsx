import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Icon } from "./Icons";
import { t } from "./i18n";

interface Props {
  name: string;
  count: number;
  disabled: boolean;
  onHide: () => void;
  onCreate?: () => void;
  onSettings: () => void;
}

export function BoardGroupHeader({
  name,
  count,
  disabled,
  onHide,
  onCreate,
  onSettings,
}: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>();
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: Event) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setPosition(undefined);
    };
    const resize = () => setPosition(undefined);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", resize);
    };
  }, [!!position]);
  useEffect(() => {
    if (disabled) setPosition(undefined);
  }, [disabled]);
  const run = (action: () => void) => {
    setPosition(undefined);
    trigger.current?.focus();
    action();
  };
  const host = trigger.current?.closest(".db-board");
  return (
    <div className="column-heading">
      <div className="group-label">
        <span className="group-name" title={name}>
          {name}
        </span>
        <span className="count" aria-label={t("{p0} records", { p0: count })}>
          {count}
        </span>
      </div>
      <button
        ref={trigger}
        className="icon-button group-menu"
        aria-label={t("Group options: {p0}", { p0: name })}
        aria-haspopup="menu"
        aria-expanded={!!position}
        disabled={disabled}
        onClick={() => {
          if (position) {
            setPosition(undefined);
            return;
          }
          const rect = trigger.current!.getBoundingClientRect();
          setPosition({
            left: Math.max(
              8,
              Math.min(rect.right - 220, window.innerWidth - 228),
            ),
            top: Math.max(
              8,
              Math.min(
                rect.bottom + 4,
                window.innerHeight - (onCreate ? 158 : 114),
              ),
            ),
          });
        }}
      >
        <Icon name="more" />
      </button>
      {position &&
        host &&
        ReactDOM.createPortal(
          <div
            ref={menu}
            className="board-group-menu"
            role="menu"
            aria-label={t("Group options: {p0}", { p0: name })}
            style={position}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setPosition(undefined);
                trigger.current?.focus();
              }
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const items = Array.from(
                  menu.current!.querySelectorAll<HTMLButtonElement>("button"),
                );
                const index = items.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          items.length) %
                        items.length;
                items[next]?.focus();
              }
            }}
          >
            {onCreate && (
              <button role="menuitem" onClick={() => run(onCreate)}>
                <Icon name="plus" />
                {t("New page")}
              </button>
            )}
            <button role="menuitem" onClick={() => run(onHide)}>
              <Icon name="eye-off" />
              {t("Hide group")}
            </button>
            <button role="menuitem" onClick={() => run(onSettings)}>
              <Icon name="settings" />
              {t("Group settings")}
            </button>
          </div>,
          host,
        )}
    </div>
  );
}
