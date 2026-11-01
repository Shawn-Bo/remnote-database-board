// @vitest-environment happy-dom
import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { Board } from "../src/Board";
import type { BoardPort, Config, Snapshot } from "../src/model";
import { defaultViews, NAME } from "../src/views";
import { inferConfig } from "../src/model";
import fixture from "../src/demo-snapshot.json";
let root: HTMLDivElement;
afterEach(() => {
  vi.restoreAllMocks();
  if (root) {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  }
});

it("keeps legacy collapsed groups readable, restores them, and saves visibility only", async () => {
  const data: Snapshot = structuredClone(fixture);
  const config = inferConfig(data);
  config.viewState = defaultViews(data, config);
  const view = config.viewState.views[1];
  config.viewState.activeViewId = view.id;
  const field = data.fields.find((f) => f.id === view.groupFieldId)!;
  const first = field.choices[0];
  first.name = "需要连贯弹奏八次之后才能继续提升熟练程度的分组";
  view.collapsedGroups = [first.id];
  view.hiddenGroups = [field.choices[1].id];
  const { port, save } = await mount(data, config);
  expect(root.querySelectorAll(".column.collapsed")).toHaveLength(0);
  expect(root.querySelectorAll(".hidden-group")).toHaveLength(2);
  expect(root.querySelector(".hidden-group-name")?.textContent).toBe(
    first.name,
  );
  await click(`Show group ${first.name}`);
  expect(
    root.querySelector(`.column[data-column-id="${first.id}"]`),
  ).not.toBeNull();
  expect(root.querySelectorAll(".hidden-group")).toHaveLength(1);
  const saved = save.mock.calls.at(-1)![0] as Config;
  const storedView = saved.viewState!.views[1];
  expect(storedView.collapsedGroups).toEqual([]);
  expect(storedView.hiddenGroups).toEqual([field.choices[1].id]);
  expect(port.write).not.toHaveBeenCalled();
});

it("hides a group from its own menu and restores an explicitly hidden empty group", async () => {
  const { save, port } = await mount();
  await click("Board");
  await click("Group options: New");
  expect(root.querySelector('[role="menu"]')).not.toBeNull();
  await click("Hide group");
  expect(root.querySelector('[role="menu"]')).toBeNull();
  expect(
    root.querySelector('.hidden-group button[aria-label="Show group New"]'),
  ).not.toBeNull();
  await click("Show group New");
  expect(root.querySelectorAll(".hidden-group")).toHaveLength(0);
  expect(port.write).not.toHaveBeenCalled();
  const config = save.mock.calls.at(-1)![0] as Config;
  const view = config.viewState!.views[1];
  const empty = { id: "empty-option", name: "New empty stage" };
  const data: Snapshot = structuredClone(fixture);
  data.fields.find((f) => f.id === view.groupFieldId)!.choices.push(empty);
  view.hiddenGroups = [empty.id];
  view.hideEmptyGroups = true;
  act(() => {
    ReactDOM.unmountComponentAtNode(root);
  });
  root.remove();
  await mount(data, config);
  await click(`Show group ${empty.name}`);
  expect(
    root.querySelector(`.column[data-column-id="${empty.id}"]`),
  ).not.toBeNull();
});

it("dropping on a hidden group updates its property while preserving the note and its other fields", async () => {
  const data: Snapshot = structuredClone(fixture);
  const config = inferConfig(data);
  config.viewState = defaultViews(data, config);
  const view = config.viewState.views[1];
  config.viewState.activeViewId = view.id;
  const field = data.fields.find((f) => f.id === view.groupFieldId)!;
  const target = field.choices[1];
  view.hiddenGroups = [target.id];
  const before = structuredClone(data.rows[0]);
  const { port } = await mount(data, config);
  const card = root.querySelector<HTMLElement>(`[data-row-id="${before.id}"]`)!;
  card.setPointerCapture = vi.fn();
  card.hasPointerCapture = () => true;
  card.releasePointerCapture = vi.fn();
  const destination = root.querySelector<HTMLElement>(
    `.hidden-group[data-column-id="${target.id}"]`,
  )!;
  vi.spyOn(document, "elementFromPoint").mockReturnValue(destination);
  await act(async () => {
    Simulate.pointerDown(card, {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 20,
      target: card,
    } as any);
    Simulate.pointerMove(card, {
      pointerId: 1,
      clientX: 120,
      clientY: 100,
    } as any);
  });
  expect(destination.classList.contains("drag-over")).toBe(true);
  await act(async () =>
    Simulate.pointerUp(card, {
      pointerId: 1,
      clientX: 120,
      clientY: 100,
    } as any),
  );
  expect(port.write).toHaveBeenCalledTimes(1);
  expect(port.write).toHaveBeenCalledWith(
    expect.objectContaining({
      rowId: before.id,
      fieldId: field.id,
      expected: before.cells[field.id],
      value: { text: target.name, refs: [target.id] },
    }),
  );
  expect(data.rows[0].parentId).toBe(before.parentId);
  for (const id of Object.keys(before.cells).filter((id) => id !== field.id))
    expect(data.rows[0].cells[id]).toEqual(before.cells[id]);
  expect(
    root.querySelector(`.hidden-group[data-column-id="${target.id}"]`),
  ).not.toBeNull();
});
async function mount(
  data: Snapshot = structuredClone(fixture),
  stored?: Config,
  options: Partial<React.ComponentProps<typeof Board>> = {},
) {
  const config = stored ?? inferConfig(data);
  if (!config.viewState) config.viewState = defaultViews(data, config);
  const save = vi.fn(async (_config: Config) => {});
  const port: BoardPort = {
    load: async () => structuredClone(data),
    write: vi.fn(async (req) => {
      const r = data.rows.find((r) => r.id === req.rowId)!;
      r.cells[req.fieldId] = req.value;
      return structuredClone(r);
    }),
    open: vi.fn(),
  };
  root = document.createElement("div");
  document.body.append(root);
  await act(async () => {
    ReactDOM.render(
      <Board initial={config} port={port} {...options} onConfig={save} />,
      root,
    );
  });
  return { data, port, save };
}
function button(name: string) {
  const b = [...root.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === name || b.textContent === name,
  );
  if (!b) throw new Error(`Missing button ${name}`);
  return b;
}
async function click(name: string) {
  await act(async () => Simulate.click(button(name)));
}
async function change(label: string, value: string) {
  await act(async () =>
    Simulate.change(root.querySelector(`[aria-label="${label}"]`)!, {
      target: { value },
    } as any),
  );
}
it("saves independent filters and sorts per view, and restores them after reopening", async () => {
  const { save, port, data } = await mount();
  await click("Filter");
  await click("Add filter");
  await change("Filter value 1", "example-option-1-2");
  expect(root.querySelectorAll("tbody tr")).toHaveLength(3);
  await click("Sort");
  await click("Add sort");
  await change("Sort direction 1", "desc");
  expect(
    [...root.querySelectorAll("tbody tr")].map((r) =>
      r.getAttribute("data-row-id"),
    ),
  ).toEqual(["example-row-08", "example-row-05", "example-row-02"]);
  await click("Board");
  expect(root.querySelectorAll(".card")).toHaveLength(9);
  await click("Table");
  expect(root.querySelectorAll("tbody tr")).toHaveLength(3);
  const saved = (save.mock.calls.at(-1) as unknown as [Config])[0];
  act(() => {
    ReactDOM.unmountComponentAtNode(root);
  });
  root.remove();
  await mount(data, saved);
  expect(root.querySelectorAll("tbody tr")).toHaveLength(3);
  expect(root.querySelector("tbody tr")?.getAttribute("data-row-id")).toBe(
    "example-row-08",
  );
  expect(port.write).not.toHaveBeenCalled();
});
it("opens the requested board grouping while preserving queries and allowing later table navigation", async () => {
  const data: Snapshot = structuredClone(fixture);
  const config = inferConfig(data);
  config.viewState = defaultViews(data, config);
  const board = config.viewState.views[1];
  board.filters = [
    { id: "f", fieldId: NAME, operator: "contains", value: "0" },
  ];
  board.sorts = [{ id: "s", fieldId: NAME, direction: "desc" }];
  board.hiddenGroups = [data.fields[1].choices[0].id];
  board.collapsedGroups = [data.fields[1].choices[1].id];
  const { save, port } = await mount(data, config, {
    openingBoard: { groupFieldId: config.filterFieldId },
  });
  expect(
    root.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Board");
  expect(root.querySelectorAll(".card")).toHaveLength(9);
  const saved = (save.mock.calls.at(-1) as unknown as [Config])[0];
  const opened = saved.viewState!.views.find(
    (v) => v.id === saved.viewState!.activeViewId,
  )!;
  expect(opened).toMatchObject({
    id: board.id,
    groupFieldId: config.filterFieldId,
    filters: board.filters,
    sorts: board.sorts,
    hiddenGroups: [],
    collapsedGroups: [],
  });
  expect(saved.viewState!.views).toHaveLength(2);
  expect(board.groupFieldId).toBe(config.groupFieldId);
  await click("Table");
  await click("Refresh");
  expect(
    root.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Table");
  expect(port.write).not.toHaveBeenCalled();
});
it("adds a board when only a saved table remains without replacing that table", async () => {
  const data: Snapshot = structuredClone(fixture);
  const config = inferConfig(data);
  config.viewState = defaultViews(data, config);
  config.viewState.views = [config.viewState.views[0]];
  const table = structuredClone(config.viewState.views[0]);
  const { save } = await mount(data, config, { openingBoard: {} });
  const saved = (save.mock.calls.at(-1) as unknown as [Config])[0];
  expect(saved.viewState!.views[0]).toEqual(table);
  expect(saved.viewState!.views).toHaveLength(2);
  expect(
    root.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Board");
});
it("exposes plain tables without a group property and applies text filters", async () => {
  const data: Snapshot = {
    ...structuredClone(fixture),
    fields: [{ id: "plain", name: "Author", type: "text", choices: [] }],
    rows: [
      {
        id: "a",
        name: "Book A",
        parentId: "x",
        cells: { plain: { text: "Author A", refs: [] } },
      },
    ],
  };
  await mount(data);
  expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(root.querySelector("[role=alert]")).toBeNull();
  await click("Filter");
  await click("Add filter");
  await change("Filter property 1", NAME);
  await change("Filter condition 1", "contains");
  await change("Filter value 1", "Book");
  expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
  await change("Filter value 1", "Not present");
  expect(root.querySelectorAll("tbody tr")).toHaveLength(0);
});
it("changes grouping without altering original values and writes only an edited property", async () => {
  const { port } = await mount();
  await click("Board");
  await click("View settings");
  await act(async () =>
    Simulate.click(
      [...root.querySelectorAll(".settings-row")].find((b) =>
        b.textContent?.startsWith("Group"),
      )!,
    ),
  );
  await change("Group by", "example-field-1");
  expect(root.querySelectorAll(".column .card")).toHaveLength(9);
  expect(port.write).not.toHaveBeenCalled();
  await click("Close settings");
  await click("Table");
  const row = root.querySelector('[data-row-id="example-row-01"]')!;
  await act(async () =>
    Simulate.change(row.querySelector('[aria-label="Focus"]')!, {
      target: { value: "example-option-4-2" },
    } as any),
  );
  expect(port.write).toHaveBeenCalledWith(
    expect.objectContaining({
      rowId: "example-row-01",
      fieldId: "example-field-4",
      value: { text: "Transitions", refs: ["example-option-4-2"] },
    }),
  );
});
it("hides a property in one view without deleting source fields", async () => {
  const { data, port } = await mount();
  await click("View settings");
  await act(async () =>
    Simulate.click(
      [...root.querySelectorAll(".settings-row")].find((b) =>
        b.textContent?.includes("Property visibility"),
      )!,
    ),
  );
  await click("Hide Song");
  expect(root.querySelector("thead")?.textContent).not.toContain("Song");
  expect(data.fields.some((f) => f.name === "Song")).toBe(true);
  expect(port.write).not.toHaveBeenCalled();
});
