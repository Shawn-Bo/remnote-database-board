import React, { useRef, useState } from "react";
import type { Cell, Field } from "./model";
import { EMPTY, UNKNOWN, cellForChoice, groupKey } from "./model";

export function PropertyCell({
  cell,
  field,
  disabled,
  onSave,
  onOpen,
  renderRichCell,
  mode = "table",
}: {
  cell: Cell;
  field: Field;
  disabled: boolean;
  onSave: (expected: Cell, value: Cell) => Promise<boolean>;
  onOpen: () => void;
  renderRichCell?: (
    cell: Cell,
    mode: "card" | "table" | "detail",
  ) => React.ReactNode;
  mode?: "card" | "table" | "detail";
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const base = useRef(cell),
    saving = useRef(false);
  const composing = useRef(false);
  if (cell.richText)
    return (
      <div className="rich-cell" onDoubleClick={onOpen}>
        {renderRichCell ? renderRichCell(cell, mode) : cell.text}
      </div>
    );
  if (field.type === "single_select") {
    const key = groupKey(cell, field),
      index = field.choices.findIndex((c) => c.id === key);
    return (
      <span className={`select-cell tone-${index < 0 ? 0 : (index % 8) + 1}${key === EMPTY ? " is-empty" : ""}`}>
        <select
          aria-label={field.name}
          disabled={disabled}
          value={key}
          onChange={(e) =>
            void onSave(cell, cellForChoice(e.target.value, field))
          }
        >
          <option value={EMPTY} aria-label="清除选择">{key === EMPTY ? "" : "清除选择"}</option>
          {field.choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {key === UNKNOWN && (
            <option value={UNKNOWN} disabled>
              {cell.text || "未识别的原值"}
            </option>
          )}
        </select>
      </span>
    );
  }
  if (!["text", "0", "number", "url"].includes(field.type) || cell.refs.length)
    return (
      <button className="cell-readonly" onClick={onOpen} title="在原笔记中编辑"
        aria-label={`在原笔记中编辑${field.name}`}>
        {cell.text}
      </button>
    );
  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      if (
        value === base.current.text ||
        (await onSave(base.current, { text: value, refs: [] }))
      )
        setEditing(false);
    } finally {
      saving.current = false;
    }
  };
  if (editing)
    return (
      <input
        className="cell-input"
        autoFocus
        aria-label={`编辑${field.name}`}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          // Enter/Escape can belong to the input method's candidate picker.
          // WebKit may report the final confirmation as keyCode 229.
          if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
      />
    );
  return (
    <button
      className="cell-text"
      disabled={disabled}
      aria-label={`编辑${field.name}`}
      onClick={() => {
        base.current = cell;
        setValue(cell.text);
        setEditing(true);
      }}
    >
      {cell.text}
    </button>
  );
}
