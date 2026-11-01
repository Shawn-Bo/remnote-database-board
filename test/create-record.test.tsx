// @vitest-environment happy-dom
import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { Board } from "../src/Board";
import type { BoardPort, Config, Snapshot } from "../src/model";
import { inferConfig } from "../src/model";
import { defaultViews } from "../src/views";
import fixture from "../src/demo-snapshot.json";

let root: HTMLDivElement;
afterEach(() => {
  if (root) { act(() => { ReactDOM.unmountComponentAtNode(root); }); root.remove(); }
});
async function setup() {
  const data: Snapshot = structuredClone(fixture);
  const initial: Config = inferConfig(data);
  initial.viewState = defaultViews(data, initial, true);
  const board = initial.viewState.views[1];
  board.filters = [{ id: "song", fieldId: initial.filterFieldId, operator: "is", value: data.fields[0].choices[0].id }];
  const port: BoardPort = {
    load: vi.fn(async (_, rowIds) => ({ ...structuredClone(data), rows: structuredClone(data.rows.filter(row => !rowIds || rowIds.includes(row.id))) })),
    write: vi.fn(), open: vi.fn(),
    create: vi.fn(async (tagId, name, cells = {}) => {
      const row = { id: "created-record", name, parentId: tagId, cells };
      data.rows.push(row);
      return structuredClone(row);
    }),
  };
  root = document.createElement("div"); document.body.append(root);
  await act(async () => {
    ReactDOM.render(<Board port={port} initial={initial} rowScope={[data.rows[0].id]}
      renderNote={id => <div data-native-rem={id}>原生笔记</div>} />, root);
  });
  return { port, data, initial };
}
async function click(selector: string) {
  await act(async () => { Simulate.click(root.querySelector(selector)!); });
}
async function nameRecord(value: string) {
  await act(async () => { Simulate.change(root.querySelector('[aria-label="记录名称"]')!, { target: { value } } as any); });
}
async function submit() {
  await act(async () => { Simulate.submit(root.querySelector(".create-record")!); });
}

it("opens the newly created original note with filter and group values, and retains it in the table scope on refresh", async () => {
  const { port, data, initial } = await setup();
  const group = data.fields[1].choices[1];
  await click(`[data-column-id="${group.id}"] .new-card`);
  await nameRecord("新练习分段");
  await submit();
  expect(port.create).toHaveBeenCalledWith(data.tagId, "新练习分段", {
    [initial.filterFieldId]: { text: data.fields[0].choices[0].name, refs: [data.fields[0].choices[0].id] },
    [initial.groupFieldId]: { text: group.name, refs: [group.id] },
  });
  expect(root.querySelector(".create-record")).toBeNull();
  expect(root.querySelector(".native-note-slot [data-native-rem]")?.getAttribute("data-native-rem")).toBe("created-record");
  await click('[aria-label="关闭笔记"]');
  expect(port.load).toHaveBeenLastCalledWith(data.tagId, [data.rows[0].id, "created-record"]);
  expect(root.querySelector('[data-row-id="created-record"]')).not.toBeNull();
  expect(port.write).not.toHaveBeenCalled();
});

it("does not create duplicates when the same form submits twice before React updates", async () => {
  const { port } = await setup();
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const original = port.create!;
  port.create = vi.fn(async (...args: Parameters<NonNullable<BoardPort["create"]>>) => { await barrier; return original(...args); });
  await click(".database-actions .new-button");
  await nameRecord("只创建一次");
  try {
    await act(async () => {
      const form = root.querySelector(".create-record")!;
      Simulate.submit(form); Simulate.submit(form);
    });
    expect(port.create).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => { release(); });
  }
});

it("keeps a failed creation available for retry and restores the previously opened note on cancel", async () => {
  const { port, data } = await setup();
  port.create = vi.fn(async () => { throw new Error("暂时无法保存"); });
  await click(".card-title");
  await click(".database-actions .new-button");
  await nameRecord("保留这个名称");
  await submit();
  expect(root.querySelector<HTMLInputElement>('[aria-label="记录名称"]')?.value).toBe("保留这个名称");
  expect(root.querySelector(".create-record [role=alert]")?.textContent).toBe("暂时无法保存");
  await click('[aria-label="取消新建"]');
  expect(root.querySelector(".native-note-slot [data-native-rem]")?.getAttribute("data-native-rem")).toBe(data.rows[0].id);
});
