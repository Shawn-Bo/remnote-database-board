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
  if (root) {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  }
});
async function mount(
  data: Snapshot = structuredClone(fixture),
  stored?: Config,
  options: Partial<React.ComponentProps<typeof Board>> = {},
) {
  const config = stored ?? inferConfig(data);
  if (!config.viewState) config.viewState = defaultViews(data, config);
  const save = vi.fn(async () => {});
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
      <Board
        initial={config}
        port={port}
        {...options}
        onConfig={save}
      />,
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
  await click("筛选");
  await click("添加筛选条件");
  await change("筛选值 1", "example-option-1-2");
  expect(root.querySelectorAll("tbody tr")).toHaveLength(3);
  await click("排序");
  await click("添加排序");
  await change("排序方向 1", "desc");
  expect(
    [...root.querySelectorAll("tbody tr")].map((r) =>
      r.getAttribute("data-row-id"),
    ),
  ).toEqual(["example-row-08", "example-row-05", "example-row-02"]);
  await click("看板");
  expect(root.querySelectorAll(".card")).toHaveLength(9);
  await click("表格");
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
  const data = structuredClone(fixture);
  const config = inferConfig(data);
  config.viewState = defaultViews(data, config);
  const board = config.viewState.views[1];
  board.filters = [{id:'f',fieldId:NAME,operator:'contains',value:'示例'}];
  board.sorts = [{id:'s',fieldId:NAME,direction:'desc'}];
  board.hiddenGroups = [data.fields[1].choices[0].id];
  board.collapsedGroups = [data.fields[1].choices[1].id];
  const { save, port } = await mount(data, config, {
    openingBoard: {groupFieldId:config.filterFieldId},
  });
  expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('看板');
  expect(root.querySelectorAll('.card')).toHaveLength(9);
  const saved = (save.mock.calls.at(-1) as unknown as [Config])[0];
  const opened = saved.viewState!.views.find(v=>v.id===saved.viewState!.activeViewId)!;
  expect(opened).toMatchObject({id:board.id,groupFieldId:config.filterFieldId,filters:board.filters,sorts:board.sorts,hiddenGroups:[],collapsedGroups:[]});
  expect(saved.viewState!.views).toHaveLength(2);
  expect(board.groupFieldId).toBe(config.groupFieldId);
  await click('表格');
  await click('刷新');
  expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('表格');
  expect(port.write).not.toHaveBeenCalled();
});
it("adds a board when only a saved table remains without replacing that table", async () => {
  const data = structuredClone(fixture);
  const config = inferConfig(data);
  config.viewState = defaultViews(data, config);
  config.viewState.views = [config.viewState.views[0]];
  const table = structuredClone(config.viewState.views[0]);
  const {save} = await mount(data, config, {openingBoard:{}});
  const saved = (save.mock.calls.at(-1) as unknown as [Config])[0];
  expect(saved.viewState!.views[0]).toEqual(table);
  expect(saved.viewState!.views).toHaveLength(2);
  expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('看板');
});
it("exposes plain tables without a group property and applies text filters", async () => {
  const data: Snapshot = {
    ...structuredClone(fixture),
    fields: [{ id: "plain", name: "作者", type: "text", choices: [] }],
    rows: [
      {
        id: "a",
        name: "书籍 A",
        parentId: "x",
        cells: { plain: { text: "作者 A", refs: [] } },
      },
    ],
  };
  await mount(data);
  expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(root.querySelector("[role=alert]")).toBeNull();
  await click("筛选");
  await click("添加筛选条件");
  await change("筛选属性 1", NAME);
  await change("筛选条件 1", "contains");
  await change("筛选值 1", "书籍");
  expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
  await change("筛选值 1", "不存在");
  expect(root.querySelectorAll("tbody tr")).toHaveLength(0);
});
it("changes grouping without altering original values and writes only an edited property", async () => {
  const { port } = await mount();
  await click("看板");
  await click("视图设置");
  await act(async () =>
    Simulate.click(
      [...root.querySelectorAll(".settings-row")].find((b) =>
        b.textContent?.startsWith("分组"),
      )!,
    ),
  );
  await change("分组依据", "example-field-1");
  expect(root.querySelectorAll(".column .card")).toHaveLength(9);
  expect(port.write).not.toHaveBeenCalled();
  await click("关闭设置");
  await click("表格");
  const row = root.querySelector('[data-row-id="example-row-01"]')!;
  await act(async () =>
    Simulate.change(row.querySelector('[aria-label="难点"]')!, {
      target: { value: "example-option-4-2" },
    } as any),
  );
  expect(port.write).toHaveBeenCalledWith(
    expect.objectContaining({
      rowId: "example-row-01",
      fieldId: "example-field-4",
      value: { text: "难点 B", refs: ["example-option-4-2"] },
    }),
  );
});
it("hides a property in one view without deleting source fields", async () => {
  const { data, port } = await mount();
  await click("视图设置");
  await act(async () =>
    Simulate.click(
      [...root.querySelectorAll(".settings-row")].find((b) =>
        b.textContent?.includes("属性是否可见"),
      )!,
    ),
  );
  await click("隐藏歌曲");
  expect(root.querySelector("thead")?.textContent).not.toContain("歌曲");
  expect(data.fields.some((f) => f.name === "歌曲")).toBe(true);
  expect(port.write).not.toHaveBeenCalled();
});
