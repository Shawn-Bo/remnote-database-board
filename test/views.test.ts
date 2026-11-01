import { describe, expect, it } from "vitest";
import {
  defaultViews,
  matches,
  NAME,
  newView,
  queryRows,
  readViews,
  viewGroups,
  moveValue,
  placeRow,
} from "../src/views";
import { inferConfig, EMPTY, UNKNOWN } from "../src/model";
import type { Snapshot, Row } from "../src/model";
import fixture from "../src/demo-snapshot.json";

describe("generic database views", () => {
  const data: Snapshot = structuredClone(fixture),
    config = inferConfig(data);
  it("opens a table with no select property or training-specific fields", () => {
    const basic: Snapshot = {
      tagId: "books",
      name: "Book",
      fields: [{ id: "author", name: "Author", type: "text", choices: [] }],
      rows: [],
      loadedAt: 0,
    };
    const cfg = inferConfig(basic);
    expect(cfg.groupFieldId).toBe("");
    const views = defaultViews(basic, cfg);
    expect(views.views.find((v) => v.id === views.activeViewId)?.layout).toBe(
      "table",
    );
    expect(viewGroups([], undefined)).toEqual([
      { id: EMPTY, name: "All", rows: [], choiceIndex: -1 },
    ]);
  });
  it("filters native option identities, including legacy text values and identical names", () => {
    const field = {
      id: "choice",
      name: "Category",
      type: "single_select",
      choices: [
        { id: "a", name: "Same" },
        { id: "b", name: "Same" },
      ],
    };
    const row: Row = {
      id: "r",
      name: "r",
      parentId: null,
      cells: { choice: { text: "Same", refs: ["b"] } },
    };
    const rule = {
      id: "f",
      fieldId: "choice",
      operator: "is" as const,
      value: "a",
    };
    expect(matches(row, rule, [field])).toBe(false);
    expect(matches(row, { ...rule, value: "b" }, [field])).toBe(true);
    const legacy: Row = {
      ...row,
      cells: { choice: { text: "Same", refs: [] } },
    };
    expect(matches(legacy, rule, [field])).toBe(true);
  });
  it("combines filters with AND/OR and full text search without mutating source", () => {
    const view = newView("table", data, config);
    view.filters = [
      {
        id: "song",
        fieldId: config.filterFieldId,
        operator: "is",
        value: "example-option-1-2",
      },
      { id: "name", fieldId: NAME, operator: "contains", value: "05" },
    ];
    expect(queryRows(data, view, "").map((r) => r.id)).toEqual([
      "example-row-05",
    ]);
    view.filterMode = "any";
    expect(queryRows(data, view, "").length).toBe(3);
    expect(queryRows(data, view, "08").map((r) => r.id)).toEqual([
      "example-row-08",
    ]);
    expect(data.rows).toEqual(fixture.rows);
  });
  it("does not remove a filter silently when its property is deleted", () => {
    const view = newView("table", data, config);
    view.filters = [
      { id: "f", fieldId: "deleted", operator: "empty", value: "" },
    ];
    expect(queryRows(data, view, "")).toEqual([]);
    expect(
      readViews({ version: 1, activeViewId: view.id, views: [view] })?.views[0]
        .filters,
    ).toEqual(view.filters);
  });
  it("uses numeric order and keeps missing values last in either direction", () => {
    const table: Snapshot = {
      ...data,
      fields: [{ id: "num", name: "Amount", type: "number", choices: [] }],
      rows: ["10", "2", "", "-3", "2"].map((text, i) => ({
        id: `r${i}`,
        name: `Record ${5 - i}`,
        parentId: null,
        cells: { num: { text, refs: [] } },
      })),
    };
    const view = newView("table", table, config);
    view.sorts = [
      { id: "1", fieldId: "num", direction: "asc" },
      { id: "2", fieldId: NAME, direction: "asc" },
    ];
    expect(queryRows(table, view, "").map((r) => r.id)).toEqual([
      "r3",
      "r4",
      "r1",
      "r0",
      "r2",
    ]);
    view.sorts[0].direction = "desc";
    expect(queryRows(table, view, "").map((r) => r.id)).toEqual([
      "r0",
      "r4",
      "r1",
      "r3",
      "r2",
    ]);
  });
  it("compares zero correctly and never interprets an empty numeric cell as zero", () => {
    const row = {
      id: "r",
      name: "r",
      parentId: null,
      cells: { n: { text: "", refs: [] } },
    };
    const field = { id: "n", name: "n", type: "number", choices: [] };
    expect(
      matches(row, { id: "f", fieldId: "n", operator: "gte", value: "0" }, [
        field,
      ]),
    ).toBe(false);
    row.cells.n.text = "0";
    expect(
      matches(row, { id: "f", fieldId: "n", operator: "gte", value: "0" }, [
        field,
      ]),
    ).toBe(true);
  });
  it("sorts selects by native option order and respects sort priority", () => {
    const view = newView("table", data, config);
    view.sorts = [
      { id: "s", fieldId: config.filterFieldId, direction: "asc" },
      { id: "n", fieldId: NAME, direction: "desc" },
    ];
    expect(queryRows(data, view, "").map((r) => r.id)).toEqual([
      "example-row-07",
      "example-row-04",
      "example-row-01",
      "example-row-08",
      "example-row-05",
      "example-row-02",
      "example-row-09",
      "example-row-06",
      "example-row-03",
    ]);
  });
  it("uses numeric equality while keeping an empty value distinct from zero", () => {
    const field = { id: "n", name: "Amount", type: "number", choices: [] };
    const row = {
      id: "r",
      name: "r",
      parentId: null,
      cells: { n: { text: "1.00", refs: [] } },
    };
    expect(
      matches(row, { id: "f", fieldId: "n", operator: "is", value: "1" }, [
        field,
      ]),
    ).toBe(true);
    row.cells.n.text = "";
    expect(
      matches(row, { id: "f", fieldId: "n", operator: "is", value: "0" }, [
        field,
      ]),
    ).toBe(false);
  });
  it("keeps every row, including stale option references, in a visible group", () => {
    const rows = structuredClone(data.rows);
    rows[0].cells[config.groupFieldId] = { text: "", refs: [] };
    rows[1].cells[config.groupFieldId] = { text: "Deleted", refs: ["stale"] };
    const groups = viewGroups(rows, data.fields[1]);
    expect(groups.find((g) => g.id === UNKNOWN)?.rows.map((r) => r.id)).toEqual(
      [rows[1].id],
    );
    expect(
      groups
        .flatMap((g) => g.rows)
        .map((r) => r.id)
        .sort(),
    ).toEqual(rows.map((r) => r.id).sort());
    expect(moveValue(EMPTY, data.fields[1])).toEqual({ text: "", refs: [] });
    expect(() => moveValue("stale", data.fields[1])).toThrow();
  });
  it("rejects corrupt synced view configuration and restores a valid active view", () => {
    const state = defaultViews(data, config);
    expect(readViews({ ...state, activeViewId: "gone" })?.activeViewId).toBe(
      state.views[0].id,
    );
    expect(
      readViews({ ...state, views: [state.views[0], state.views[0]] }),
    ).toBeUndefined();
    expect(
      readViews({ ...state, views: [{ ...state.views[0], filters: [{}] }] }),
    ).toBeUndefined();
    expect(
      readViews({
        ...state,
        views: [{ ...state.views[0], columnWidths: { x: Infinity } }],
      }),
    ).toBeUndefined();
    expect(
      readViews({ ...state, views: [{ ...state.views[0], rowOrder: 0 }] }),
    ).toBeUndefined();
  });
  it("preserves manual card order without overriding an explicit sort", () => {
    const view = newView("board", data, config);
    view.rowOrder = placeRow(data, view, "example-row-09", "example-row-01");
    expect(queryRows(data, view, "")[0].id).toBe("example-row-09");
    expect(new Set(view.rowOrder).size).toBe(9);
    view.sorts = [{ id: "s", fieldId: NAME, direction: "asc" }];
    expect(queryRows(data, view, "")[0].id).toBe("example-row-01");
  });
});
