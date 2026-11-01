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
  if (root) {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  }
});
async function mount(stored?: Config) {
  const data = structuredClone(fixture);
  const initial = stored ?? inferConfig(data);
  if (!initial.viewState) {
    initial.viewState = defaultViews(data, initial);
    initial.viewState.views.push(
      newView("table", data, initial, "Another table"),
    );
  }
  const save = vi.fn(async (_: Config) => {});
  const port: BoardPort = {
    load: async () => data,
    write: vi.fn(),
    open: vi.fn(),
  };
  root = document.createElement("div");
  document.body.append(root);
  await act(async () => {
    ReactDOM.render(
      <Board port={port} initial={initial} onConfig={save} />,
      root,
    );
  });
  return { save, port };
}
async function click(label: string) {
  await act(async () => {
    Simulate.click(
      [...root.querySelectorAll("button")].find(
        (b) =>
          b.getAttribute("aria-label") === label || b.textContent === label,
      )!,
    );
  });
}
const width = () => root.querySelector<HTMLTableColElement>("col")!.style.width;
const pointer = (clientX: number) => ({ button: 0, pointerId: 1, clientX });
function divider() {
  const el = root.querySelector<HTMLElement>(
    '[aria-label="Resize Name column"]',
  )!;
  el.setPointerCapture = vi.fn();
  el.hasPointerCapture = () => true;
  el.releasePointerCapture = vi.fn();
  return el;
}
it("previews a resize without saving each movement, then persists it only in the selected view", async () => {
  const { save, port } = await mount();
  const before = save.mock.calls.length;
  const el = divider();
  await act(async () => {
    Simulate.pointerDown(el, pointer(200));
  });
  await act(async () => {
    Simulate.pointerMove(el, pointer(320));
  });
  expect(width()).toBe("320px");
  expect(save).toHaveBeenCalledTimes(before);
  await click("Another table");
  expect(
    root.querySelector("[role=tab][aria-selected=true]")?.textContent,
  ).toBe("Table");
  await act(async () => {
    Simulate.pointerUp(el, pointer(320));
  });
  expect(save).toHaveBeenCalledTimes(before + 1);
  const saved = save.mock.calls.at(-1)![0];
  expect(saved.viewState!.views[0].columnWidths[NAME]).toBe(320);
  await click("Another table");
  expect(width()).toBe("200px");
  await click("Table");
  expect(width()).toBe("320px");
  act(() => {
    ReactDOM.unmountComponentAtNode(root);
  });
  root.remove();
  await mount(saved);
  expect(width()).toBe("320px");
  expect(port.write).not.toHaveBeenCalled();
});
it.each(["Escape", "pointerCancel", "blur"])(
  "cancels a column resize on %s without persisting its temporary width",
  async (cancel) => {
    const { save } = await mount();
    const before = save.mock.calls.length;
    const el = divider();
    await act(async () => {
      Simulate.pointerDown(el, pointer(200));
      Simulate.pointerMove(el, pointer(480));
    });
    expect(width()).toBe("480px");
    await act(async () => {
      if (cancel === "Escape")
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      else if (cancel === "blur") window.dispatchEvent(new Event("blur"));
      else Simulate.pointerCancel(el, pointer(480));
      Simulate.pointerUp(el, pointer(480));
    });
    expect(width()).toBe("200px");
    expect(save).toHaveBeenCalledTimes(before);
    await click("Another table");
    expect(
      root.querySelector("[role=tab][aria-selected=true]")?.textContent,
    ).toBe("Another table");
  },
);
it("offers bounded width controls from the keyboard and menu, including reset", async () => {
  await mount();
  const el = divider();
  await act(async () => {
    Simulate.keyDown(el, { key: "End" });
  });
  expect(width()).toBe("1200px");
  await act(async () => {
    Simulate.keyDown(el, { key: "ArrowRight" });
  });
  expect(width()).toBe("1200px");
  await click("Name column menu");
  await click("Narrow column");
  expect(width()).toBe("1160px");
  expect(root.querySelector("[role=menu]")).not.toBeNull();
  await click("Reset column width");
  expect(width()).toBe("200px");
});
it("sorts, targets filters and hides the selected property without changing database values", async () => {
  const { save, port } = await mount();
  await click("Name column menu");
  await click("Sort descending");
  expect(root.querySelector("tbody tr")?.getAttribute("data-row-id")).toBe(
    "example-row-09",
  );
  await click("Song column menu");
  await act(async () => {
    Simulate.click(root.querySelector("[role=menu] button:nth-of-type(3)")!);
  });
  expect(
    root.querySelector<HTMLSelectElement>('[aria-label="Filter property 1"]')
      ?.value,
  ).toBe("example-field-1");
  await click("Close settings");
  await click("Song column menu");
  await act(async () => {
    Simulate.click(root.querySelector("[role=menu] button:nth-of-type(3)")!);
  });
  const saved = save.mock.calls.at(-1)![0];
  expect(saved.viewState!.views[0].filters).toHaveLength(1);
  await click("Close settings");
  await click("Song column menu");
  await click("Hide in view");
  expect(
    root.querySelector('thead [aria-label="Song column menu"]'),
  ).toBeNull();
  await click("Another table");
  expect(
    root.querySelector('thead [aria-label="Song column menu"]'),
  ).not.toBeNull();
  expect(port.write).not.toHaveBeenCalled();
});

it("changes or clears one column's sort without replacing the other ordered sort rules", async () => {
  const data = structuredClone(fixture),
    initial = inferConfig(data);
  initial.viewState = defaultViews(data, initial);
  const first = {
    id: "song-sort",
    fieldId: "example-field-1",
    direction: "asc" as const,
  };
  initial.viewState.views[0].sorts = [
    first,
    { id: "name-sort", fieldId: NAME, direction: "asc" },
  ];
  const { save, port } = await mount(initial);
  await click("Name column menu");
  await click("Sort descending");
  expect(save.mock.calls.at(-1)![0].viewState!.views[0].sorts).toEqual([
    first,
    { id: "name-sort", fieldId: NAME, direction: "desc" },
  ]);
  await click("Name column menu");
  await click("Clear column sort");
  expect(save.mock.calls.at(-1)![0].viewState!.views[0].sorts).toEqual([first]);
  expect(port.write).not.toHaveBeenCalled();
});

it("keeps the column menu inside the database workspace beside an open native note", async () => {
  await mount();
  const workspace = root.querySelector<HTMLElement>(".database-workspace")!;
  vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 260,
    width: 260,
  } as DOMRect);
  const title = root.querySelector<HTMLButtonElement>(
    '[aria-label="Song column menu"]',
  )!;
  vi.spyOn(title, "getBoundingClientRect").mockReturnValue({
    left: 200,
    bottom: 200,
  } as DOMRect);
  await click("Song column menu");
  const menu = root.querySelector<HTMLElement>(".column-menu")!;
  expect(
    Number.parseFloat(menu.style.left) + Number.parseFloat(menu.style.width),
  ).toBeLessThanOrEqual(252);
});
