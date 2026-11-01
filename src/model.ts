import type { RichTextInterface } from "@remnote/plugin-sdk";
import type { DatabaseViews } from "./views";

export interface Cell {
  text: string;
  refs: string[];
  richText?: RichTextInterface;
}
export interface Choice {
  id: string;
  name: string;
}
export interface Field {
  id: string;
  name: string;
  type: string;
  choices: Choice[];
}
export interface Row {
  id: string;
  name: string;
  title?: Cell;
  parentId: string | null;
  cells: Record<string, Cell>;
}
export interface Snapshot {
  tagId: string;
  name: string;
  fields: Field[];
  rows: Row[];
  loadedAt: number;
}
export interface Config {
  tagId: string;
  groupFieldId: string;
  filterFieldId: string;
  recordFieldId: string;
  viewState?: DatabaseViews;
}
export interface WriteRequest {
  config: Config;
  rowId: string;
  fieldId: string;
  expected: Cell;
  value: Cell;
}
export interface BoardPort {
  load(tagId: string, rowIds?: string[]): Promise<Snapshot>;
  write(request: WriteRequest): Promise<Row>;
  open(id: string): Promise<void>;
  create?(
    tagId: string,
    name: string,
    cells?: Record<string, Cell>,
  ): Promise<Row>;
  rename?(
    tagId: string,
    rowId: string,
    expectedName: string,
    name: string,
  ): Promise<Row>;
}
export const EMPTY = "__empty__";
export const UNKNOWN = "__unknown__";
export const emptyCell = (): Cell => ({ text: "", refs: [] });
export const normalize = (s: string): string =>
  s.trim().normalize("NFKC").toLocaleLowerCase();
export function sameCell(a: Cell, b: Cell): boolean {
  if (a.richText || b.richText)
    return (
      JSON.stringify(a.richText) === JSON.stringify(b.richText) &&
      a.text === b.text
    );
  if (a.refs.length || b.refs.length)
    return JSON.stringify(a.refs) === JSON.stringify(b.refs);
  return a.text === b.text;
}
export function groupKey(cell: Cell, field: Field): string {
  if (!cell.text.trim() && !cell.refs.length) return EMPTY;
  if (
    cell.refs.length === 1 &&
    field.choices.some((c) => c.id === cell.refs[0])
  )
    return cell.refs[0];
  if (cell.refs.length) return UNKNOWN;
  const matches = field.choices.filter((c) => c.name === cell.text);
  return matches.length === 1 ? matches[0].id : UNKNOWN;
}
export function cellForChoice(key: string, field: Field): Cell {
  if (key === EMPTY) return emptyCell();
  const choice = field.choices.find((c) => c.id === key);
  if (!choice)
    throw new Error("这个栏目已被删除或不属于当前属性，请刷新后重试。");
  return { text: choice.name, refs: [choice.id] };
}
export function inferConfig(
  snapshot: Snapshot,
  prior?: Partial<Config>,
): Config {
  const choose = (id: string | undefined, predicate: (f: Field) => boolean) =>
    snapshot.fields.find((f) => f.id === id && predicate(f));
  const groups = snapshot.fields.filter((f) => f.type === "single_select");
  const group =
    choose(prior?.groupFieldId, (f) => f.type === "single_select") ??
    groups.find((f) => /熟练|状态|进度/.test(f.name)) ??
    groups[0];
  const filter =
    choose(prior?.filterFieldId, (f) => f.id !== group?.id) ??
    snapshot.fields.find(
      (f) => /歌曲|所属|项目/.test(f.name) && f.id !== group?.id,
    );
  const record =
    choose(prior?.recordFieldId, (f) => ["text", "0"].includes(f.type)) ??
    snapshot.fields.find(
      (f) =>
        /进展记录|训练记录|备注/.test(f.name) && ["text", "0"].includes(f.type),
    );
  return {
    tagId: snapshot.tagId,
    groupFieldId: group?.id ?? "",
    filterFieldId: filter?.id ?? "",
    recordFieldId: record?.id ?? "",
    ...(prior?.viewState ? { viewState: prior.viewState } : {}),
  };
}
export function visibleRows(
  snapshot: Snapshot,
  config: Config,
  filter: string,
  search: string,
): Row[] {
  const needle = normalize(search);
  return snapshot.rows
    .filter((row) => {
      const value = row.cells[config.filterFieldId]?.text ?? "";
      if (filter !== "*" && value !== filter) return false;
      return (
        !needle ||
        normalize(
          [row.name, ...Object.values(row.cells).map((c) => c.text)].join(" "),
        ).includes(needle)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
}
export function groupedRows(rows: Row[], field: Field): Map<string, Row[]> {
  const groups = new Map<string, Row[]>([
    [EMPTY, []],
    ...field.choices.map((c) => [c.id, []] as [string, Row[]]),
    [UNKNOWN, []],
  ]);
  for (const row of rows)
    groups.get(groupKey(row.cells[field.id] ?? emptyCell(), field))!.push(row);
  return groups;
}
export function parseRemId(input: string): string {
  const clean = input.trim();
  if (/^[\w-]{1,80}$/.test(clean)) return clean;
  try {
    const url = new URL(clean);
    if (!["www.remnote.com", "remnote.com"].includes(url.hostname))
      throw new Error();
    const id = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (/^[\w-]{1,80}$/.test(id)) return id;
  } catch {
    /* A user-facing validation error follows. */
  }
  throw new Error("请粘贴 RemNote 表格标签的链接或节点 ID。");
}
