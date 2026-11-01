// @vitest-environment happy-dom
import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { Board } from "../src/Board";
import type { BoardPort, Config } from "../src/model";
import { inferConfig } from "../src/model";
import { defaultViews, NAME, newView } from "../src/views";
import fixture from "../src/demo-snapshot.json";

let root: HTMLDivElement;
afterEach(() => {
  if (root) { act(() => { ReactDOM.unmountComponentAtNode(root); }); root.remove(); }
});
async function mount(stored?: Config) {
  const data = structuredClone(fixture);
  const initial = stored ?? inferConfig(data);
  if (!initial.viewState) {
    initial.viewState = defaultViews(data, initial);
    initial.viewState.views.push(newView("table", data, initial, "另一表格"));
  }
  const save = vi.fn(async (_: Config) => {});
  const port: BoardPort = { load: async () => data, write: vi.fn(), open: vi.fn() };
  root = document.createElement("div"); document.body.append(root);
  await act(async () => { ReactDOM.render(<Board port={port} initial={initial} onConfig={save} />, root); });
  return { save, port };
}
async function click(label: string) {
  await act(async () => { Simulate.click([...root.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === label || b.textContent === label)!); });
}
const width = () => root.querySelector<HTMLTableColElement>("col")!.style.width;
const pointer = (clientX: number) => ({button:0,pointerId:1,clientX});
function divider() {
  const el = root.querySelector<HTMLElement>('[aria-label="调整名称列宽"]')!;
  el.setPointerCapture = vi.fn(); el.hasPointerCapture = () => true; el.releasePointerCapture = vi.fn();
  return el;
}
it("previews a resize without saving each movement, then persists it only in the selected view", async () => {
  const { save, port } = await mount();
  const before = save.mock.calls.length;
  const el = divider();
  await act(async () => { Simulate.pointerDown(el, pointer(200)); });
  await act(async () => { Simulate.pointerMove(el, pointer(320)); });
  expect(width()).toBe("320px");
  expect(save).toHaveBeenCalledTimes(before);
  await click("另一表格");
  expect(root.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe("表格");
  await act(async () => { Simulate.pointerUp(el, pointer(320)); });
  expect(save).toHaveBeenCalledTimes(before + 1);
  const saved = save.mock.calls.at(-1)![0];
  expect(saved.viewState!.views[0].columnWidths[NAME]).toBe(320);
  await click("另一表格"); expect(width()).toBe("200px");
  await click("表格"); expect(width()).toBe("320px");
  act(() => { ReactDOM.unmountComponentAtNode(root); }); root.remove();
  await mount(saved); expect(width()).toBe("320px");
  expect(port.write).not.toHaveBeenCalled();
});
it.each(["Escape", "pointerCancel", "blur"])("cancels a column resize on %s without persisting its temporary width", async cancel => {
  const { save } = await mount(); const before = save.mock.calls.length; const el = divider();
  await act(async () => {
    Simulate.pointerDown(el, pointer(200));
    Simulate.pointerMove(el, pointer(480));
  });
  expect(width()).toBe("480px");
  await act(async () => {
    if (cancel === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape"}));
    else if (cancel === "blur") window.dispatchEvent(new Event("blur"));
    else Simulate.pointerCancel(el, pointer(480));
    Simulate.pointerUp(el, pointer(480));
  });
  expect(width()).toBe("200px"); expect(save).toHaveBeenCalledTimes(before);
  await click("另一表格"); expect(root.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe("另一表格");
});
it("offers bounded width controls from the keyboard and menu, including reset", async () => {
  await mount();
  const el = divider();
  await act(async () => { Simulate.keyDown(el, {key:"End"}); }); expect(width()).toBe("1200px");
  await act(async () => { Simulate.keyDown(el, {key:"ArrowRight"}); }); expect(width()).toBe("1200px");
  await click("名称列菜单"); await click("缩窄此列"); expect(width()).toBe("1160px");
  expect(root.querySelector('[role=menu]')).not.toBeNull();
  await click("恢复默认列宽"); expect(width()).toBe("200px");
});
it("sorts, targets filters and hides the selected property without changing database values", async () => {
  const { save, port } = await mount();
  await click("名称列菜单"); await click("降序排序");
  expect(root.querySelector("tbody tr")?.getAttribute("data-row-id")).toBe("example-row-09");
  await click("歌曲列菜单");
  await act(async () => { Simulate.click(root.querySelector('[role=menu] button:nth-of-type(3)')!); });
  expect(root.querySelector<HTMLSelectElement>('[aria-label="筛选属性 1"]')?.value).toBe("example-field-1");
  await click("关闭设置"); await click("歌曲列菜单");
  await act(async () => { Simulate.click(root.querySelector('[role=menu] button:nth-of-type(3)')!); });
  const saved = save.mock.calls.at(-1)![0];
  expect(saved.viewState!.views[0].filters).toHaveLength(1);
  await click("关闭设置"); await click("歌曲列菜单"); await click("在此视图中隐藏");
  expect(root.querySelector('thead [aria-label="歌曲列菜单"]')).toBeNull();
  await click("另一表格"); expect(root.querySelector('thead [aria-label="歌曲列菜单"]')).not.toBeNull();
  expect(port.write).not.toHaveBeenCalled();
});

it("changes or clears one column's sort without replacing the other ordered sort rules", async () => {
  const data = structuredClone(fixture), initial = inferConfig(data);
  initial.viewState = defaultViews(data, initial);
  const first = { id:"song-sort", fieldId:"example-field-1", direction:"asc" as const };
  initial.viewState.views[0].sorts = [first, {id:"name-sort",fieldId:NAME,direction:"asc"}];
  const { save, port } = await mount(initial);
  await click("名称列菜单"); await click("降序排序");
  expect(save.mock.calls.at(-1)![0].viewState!.views[0].sorts).toEqual([
    first, {id:"name-sort",fieldId:NAME,direction:"desc"},
  ]);
  await click("名称列菜单"); await click("清除此列排序");
  expect(save.mock.calls.at(-1)![0].viewState!.views[0].sorts).toEqual([first]);
  expect(port.write).not.toHaveBeenCalled();
});

it("keeps the column menu inside the database workspace beside an open native note", async () => {
  await mount();
  const workspace = root.querySelector<HTMLElement>(".database-workspace")!;
  vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({left:0,right:260,width:260} as DOMRect);
  const title = root.querySelector<HTMLButtonElement>('[aria-label="歌曲列菜单"]')!;
  vi.spyOn(title, "getBoundingClientRect").mockReturnValue({left:200,bottom:200} as DOMRect);
  await click("歌曲列菜单");
  const menu = root.querySelector<HTMLElement>(".column-menu")!;
  expect(Number.parseFloat(menu.style.left) + Number.parseFloat(menu.style.width)).toBeLessThanOrEqual(252);
});
