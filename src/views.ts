import { t, translate } from "./i18n";
import { emptyCell, groupKey, normalize, EMPTY, UNKNOWN } from "./model";
import type { Cell, Config, Field, Row, Snapshot } from "./model";

export const NAME = "__name__";
export type Layout = "table" | "board";
export const LAYOUTS: { id: Layout; name: string }[] = [
  { id: "table", name: "Table" },
  { id: "board", name: "Board" },
];
export type Operator =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "empty"
  | "not_empty"
  | "gt"
  | "lt"
  | "gte"
  | "lte";
export interface FilterRule {
  id: string;
  fieldId: string;
  operator: Operator;
  value: string;
}
export interface SortRule {
  id: string;
  fieldId: string;
  direction: "asc" | "desc";
}
export interface DatabaseView {
  id: string;
  name: string;
  autoName?: boolean;
  layout: Layout;
  groupFieldId: string;
  visibleFieldIds: string[];
  filters: FilterRule[];
  filterMode: "all" | "any";
  sorts: SortRule[];
  hideEmptyGroups: boolean;
  hiddenGroups: string[];
  collapsedGroups: string[];
  cardSize: "small" | "medium" | "large";
  coverFieldId: string;
  colorColumns: boolean;
  columnWidths: Record<string, number>;
  wrapCells: boolean;
  rowOrder?: string[];
}
export const viewName = (view: DatabaseView) =>
  view.autoName ? t(view.layout === "table" ? "Table" : "Board") : view.name;

// Earlier versions collapsed groups into vertical strips. Keep those saved
// choices, but present them with hidden groups using readable horizontal names.
export const isGroupHidden = (view: DatabaseView, id: string) =>
  view.hiddenGroups.includes(id) || view.collapsedGroups.includes(id);

export function groupVisibility(
  view: DatabaseView,
  id: string,
  hidden: boolean,
) {
  const ids = new Set([...view.hiddenGroups, ...view.collapsedGroups]);
  if (hidden) ids.add(id);
  else ids.delete(id);
  return { hiddenGroups: [...ids], collapsedGroups: [] };
}

export interface DatabaseViews {
  version: 1;
  activeViewId: string;
  views: DatabaseView[];
}
export interface BoardOpening {
  groupFieldId?: string;
}
export const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function newView(
  layout: Layout,
  snapshot: Snapshot,
  config: Config,
  name?: string,
): DatabaseView {
  return {
    id: newId(),
    name: name || LAYOUTS.find((v) => v.id === layout)!.name,
    autoName: !name,
    layout,
    groupFieldId: layout === "board" ? config.groupFieldId : "",
    visibleFieldIds:
      layout === "table"
        ? snapshot.fields.map((f) => f.id)
        : [config.filterFieldId, config.recordFieldId].filter(Boolean),
    filters: [],
    filterMode: "all",
    sorts: [],
    hideEmptyGroups: false,
    hiddenGroups: [],
    collapsedGroups: [],
    cardSize: "medium",
    coverFieldId:
      snapshot.fields.find(
        (f) =>
          f.type === "image" ||
          snapshot.rows.some((r) =>
            r.cells[f.id]?.richText?.some(
              (p) => typeof p === "object" && p.i === "i",
            ),
          ),
      )?.id ?? "",
    colorColumns: true,
    columnWidths: {},
    wrapCells: false,
  };
}
export function defaultViews(
  snapshot: Snapshot,
  config: Config,
  legacy = false,
): DatabaseViews {
  const views = [
    newView("table", snapshot, config),
    newView("board", snapshot, config),
  ];
  return {
    version: 1,
    activeViewId: views[legacy && config.groupFieldId ? 1 : 0].id,
    views,
  };
}

// A table's explicit board action is an opening request, not a saved setting.
// Reuse a matching board when possible, retaining its filters and sorts.
export function openBoardView(
  state: DatabaseViews,
  snapshot: Snapshot,
  config: Config,
  request: BoardOpening,
): DatabaseViews {
  const group = snapshot.fields.find(
    (field) =>
      field.id === request.groupFieldId && field.type === "single_select",
  );
  const boards = state.views.filter((view) => view.layout === "board");
  const active = boards.find((view) => view.id === state.activeViewId);
  const existing = group
    ? ((active?.groupFieldId === group.id ? active : undefined) ??
      boards.find((view) => view.groupFieldId === group.id) ??
      active ??
      boards[0])
    : (active ?? boards[0]);
  const board = existing ?? newView("board", snapshot, config);
  const opened =
    group && board.groupFieldId !== group.id
      ? {
          ...board,
          groupFieldId: group.id,
          hiddenGroups: [],
          collapsedGroups: [],
        }
      : board;
  return {
    ...state,
    activeViewId: opened.id,
    views: existing
      ? state.views.map((view) => (view.id === opened.id ? opened : view))
      : [...state.views, opened],
  };
}
// Persisted configurations can come from another device or an older plugin.
// Ignore malformed configuration, but retain removed-field references so a
// missing property never silently broadens a filtered view.
export function readViews(value: unknown): DatabaseViews | undefined {
  if (!value || typeof value !== "object") return;
  const state = value as DatabaseViews;
  if (state.version !== 1 || !Array.isArray(state.views) || !state.views.length)
    return;
  const stringList = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  const ids = new Set<string>();
  for (const view of state.views) {
    if (
      !view ||
      typeof view.id !== "string" ||
      ids.has(view.id) ||
      !view.id ||
      typeof view.name !== "string" ||
      (view.autoName !== undefined && typeof view.autoName !== "boolean") ||
      !LAYOUTS.some((l) => l.id === view.layout) ||
      typeof view.groupFieldId !== "string" ||
      !stringList(view.visibleFieldIds) ||
      !stringList(view.hiddenGroups) ||
      !stringList(view.collapsedGroups) ||
      !["all", "any"].includes(view.filterMode) ||
      !["small", "medium", "large"].includes(view.cardSize) ||
      typeof view.coverFieldId !== "string" ||
      typeof view.hideEmptyGroups !== "boolean" ||
      typeof view.colorColumns !== "boolean" ||
      typeof view.wrapCells !== "boolean" ||
      !view.columnWidths ||
      typeof view.columnWidths !== "object"
    )
      return;
    if (
      Object.values(view.columnWidths).some(
        (n) => !Number.isFinite(n) || n < 80 || n > 1200,
      )
    )
      return;
    if (view.rowOrder !== undefined && !stringList(view.rowOrder)) return;
    if (
      !Array.isArray(view.filters) ||
      view.filters.some(
        (f) =>
          !f ||
          typeof f.id !== "string" ||
          typeof f.fieldId !== "string" ||
          typeof f.value !== "string" ||
          ![
            "is",
            "is_not",
            "contains",
            "not_contains",
            "empty",
            "not_empty",
            "gt",
            "lt",
            "gte",
            "lte",
          ].includes(f.operator),
      )
    )
      return;
    if (
      !Array.isArray(view.sorts) ||
      view.sorts.some(
        (s) =>
          !s ||
          typeof s.id !== "string" ||
          typeof s.fieldId !== "string" ||
          !["asc", "desc"].includes(s.direction),
      )
    )
      return;
    ids.add(view.id);
  }
  return {
    ...state,
    views: state.views.map((view) => {
      const label = view.layout === "table" ? "Table" : "Board";
      return {
        ...view,
        autoName:
          view.autoName ??
          (view.name === label || view.name === translate("zh-CN", label)),
      };
    }),
    activeViewId: ids.has(state.activeViewId)
      ? state.activeViewId
      : state.views[0].id,
  };
}
export const rowCell = (row: Row, fieldId: string): Cell =>
  fieldId === NAME
    ? { text: row.name, refs: [] }
    : (row.cells[fieldId] ?? emptyCell());
export function matches(row: Row, rule: FilterRule, fields: Field[]): boolean {
  const field = fields.find((f) => f.id === rule.fieldId);
  if (rule.fieldId !== NAME && !field) return false;
  const cell = rowCell(row, rule.fieldId),
    text = normalize(cell.text),
    value = normalize(rule.value);
  const empty = !text && !cell.refs.length && !cell.richText?.length;
  if (rule.operator === "empty") return empty;
  if (rule.operator === "not_empty") return !empty;
  if (rule.operator === "contains") return text.includes(value);
  if (rule.operator === "not_contains") return !text.includes(value);
  const comparable = (raw: string) =>
    field?.type === "date" ? Date.parse(raw) : Number(raw);
  const typed =
    ["number", "date"].includes(field?.type ?? "") && !!text && !!value;
  const equal = field?.type.endsWith("_select")
    ? cell.refs.length
      ? cell.refs.includes(rule.value)
      : text ===
        normalize(
          field.choices.find((c) => c.id === rule.value)?.name ?? rule.value,
        )
    : typed
      ? Number.isFinite(comparable(text)) &&
        comparable(text) === comparable(value)
      : text === value;
  if (rule.operator === "is") return equal;
  if (rule.operator === "is_not") return !equal;
  if (empty || !value) return false;
  const a = field?.type === "date" ? Date.parse(cell.text) : Number(cell.text);
  const b =
    field?.type === "date" ? Date.parse(rule.value) : Number(rule.value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return rule.operator === "gt"
    ? a > b
    : rule.operator === "lt"
      ? a < b
      : rule.operator === "gte"
        ? a >= b
        : a <= b;
}
const collator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});
export function queryRows(
  snapshot: Snapshot,
  view: DatabaseView,
  search: string,
): Row[] {
  const needle = normalize(search);
  const rows = snapshot.rows.filter(
    (row) =>
      (!needle ||
        normalize(
          [row.name, ...Object.values(row.cells).map((c) => c.text)].join(" "),
        ).includes(needle)) &&
      (!view.filters.length ||
        (view.filterMode === "all"
          ? view.filters.every((f) => matches(row, f, snapshot.fields))
          : view.filters.some((f) => matches(row, f, snapshot.fields)))),
  );
  const order = new Map((view.rowOrder ?? []).map((id, i) => [id, i]));
  return rows.sort((a, b) => {
    for (const sort of view.sorts) {
      const field = snapshot.fields.find((f) => f.id === sort.fieldId),
        x = rowCell(a, sort.fieldId),
        y = rowCell(b, sort.fieldId);
      if (!field && sort.fieldId !== NAME) continue;
      if (!x.text && !x.refs.length) {
        if (y.text || y.refs.length) return 1;
        continue;
      }
      if (!y.text && !y.refs.length) return -1;
      let diff = 0;
      if (field?.type === "number") diff = Number(x.text) - Number(y.text);
      else if (field?.type === "date")
        diff = Date.parse(x.text) - Date.parse(y.text);
      else if (field?.type === "single_select") {
        const rank = (cell: Cell) => {
          const i = field.choices.findIndex(
            (c) =>
              c.id === cell.refs[0] ||
              (!cell.refs.length && c.name === cell.text),
          );
          return i < 0 ? field.choices.length : i;
        };
        diff = rank(x) - rank(y);
      } else diff = collator.compare(x.text, y.text);
      if (Number.isFinite(diff) && diff)
        return sort.direction === "asc" ? diff : -diff;
    }
    return (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size);
  });
}
export function placeRow(
  snapshot: Snapshot,
  view: DatabaseView,
  rowId: string,
  beforeId?: string,
): string[] {
  const ids = new Set(snapshot.rows.map((r) => r.id));
  const order = [...new Set([...(view.rowOrder ?? []), ...ids])].filter((id) =>
    ids.has(id),
  );
  if (rowId === beforeId || !ids.has(rowId)) return order;
  const next = order.filter((id) => id !== rowId),
    index = beforeId ? next.indexOf(beforeId) : -1;
  next.splice(index < 0 ? next.length : index, 0, rowId);
  return next;
}
export interface RowGroup {
  id: string;
  name: string;
  rows: Row[];
  choiceIndex: number;
}
export function viewGroups(rows: Row[], field?: Field): RowGroup[] {
  if (!field) return [{ id: EMPTY, name: t("All"), rows, choiceIndex: -1 }];
  if (field.type === "single_select") {
    const groups: RowGroup[] = [
      {
        id: EMPTY,
        name: t("No {p0}", { p0: field.name }),
        rows: [],
        choiceIndex: -1,
      },
      ...field.choices.map((c, i) => ({
        ...c,
        rows: [] as Row[],
        choiceIndex: i,
      })),
      { id: UNKNOWN, name: t("Unrecognized value"), rows: [], choiceIndex: -1 },
    ];
    const byId = new Map(groups.map((g) => [g.id, g]));
    rows.forEach((r) =>
      byId.get(groupKey(rowCell(r, field.id), field))!.rows.push(r),
    );
    return groups.filter((g) => g.id !== UNKNOWN || g.rows.length > 0);
  }
  const groups = new Map<string, RowGroup>();
  rows.forEach((row) => {
    const text = rowCell(row, field.id).text,
      id = text ? `text:${text}` : EMPTY;
    if (!groups.has(id))
      groups.set(id, {
        id,
        name: text || t("No {p0}", { p0: field.name }),
        rows: [],
        choiceIndex: groups.size,
      });
    groups.get(id)!.rows.push(row);
  });
  return [...groups.values()];
}
export function moveValue(target: string, field: Field): Cell {
  if (target === EMPTY) return emptyCell();
  if (field.type === "single_select") {
    const choice = field.choices.find((c) => c.id === target);
    if (!choice)
      throw new Error(t("Target option was deleted. Refresh the view."));
    return { text: choice.name, refs: [choice.id] };
  }
  if (
    ["text", "0", "number", "url"].includes(field.type) &&
    target.startsWith("text:")
  )
    return { text: target.slice(5), refs: [] };
  throw new Error(
    t("This property can't be changed by dragging. Open the record to edit."),
  );
}
