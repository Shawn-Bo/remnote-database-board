// @vitest-environment happy-dom
import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { Board } from "../src/Board";
import { legacyDraftReader } from "../src/drafts";
import type { BoardPort } from "../src/model";
import fixture from "../src/demo-snapshot.json";
import config from "../src/demo-config.json";

let root: HTMLDivElement;
afterEach(() => {
  if (root) {
    act(() => { ReactDOM.unmountComponentAtNode(root); });
    root.remove();
  }
});
async function mount(
  options: Partial<React.ComponentProps<typeof Board>> = {},
) {
  const data = structuredClone(fixture);
  const port: BoardPort = {
    load: vi.fn(async () => structuredClone(data)),
    write: vi.fn(),
    open: vi.fn(async () => {}),
  };
  const renderNote = vi.fn((id) => (
    <div data-native-rem={id}>Native editor</div>
  ));
  root = document.createElement("div");
  document.body.append(root);
  await act(async () => {
    ReactDOM.render(
      <Board
        port={port}
        initial={config}
        renderNote={renderNote}
        {...options}
      />,
      root,
    );
  });
  return { port, data, renderNote };
}
async function click(selector: string) {
  await act(async () => {
    Simulate.click(root.querySelector(selector)!);
  });
}
it("opens the original Rem in the native editor without a second body or save-back action", async () => {
  const { port, renderNote } = await mount();
  const id = root.querySelector("[data-row-id]")!.getAttribute("data-row-id");
  await click(".card-title");
  expect(renderNote).toHaveBeenCalledWith(id);
  expect(root.querySelector("textarea")).toBeNull();
  expect(root.textContent).not.toContain("保存记录");
  await click('[aria-label="关闭笔记"]');
  expect(port.load).toHaveBeenCalledTimes(2);
  expect(port.write).not.toHaveBeenCalled();
});
it("offers an old unsaved draft for manual recovery without applying or deleting it", async () => {
  const get = vi.fn(async () => ({
    base: { text: "原记录", refs: [] },
    text: "旧版未提交内容",
  }));
  const { port } = await mount({ legacyDrafts: legacyDraftReader(get) });
  await click(".card-title");
  expect(root.querySelector(".legacy-draft pre")?.textContent).toBe(
    "旧版未提交内容",
  );
  expect(root.querySelector("[data-native-rem]")).not.toBeNull();
  await click('[aria-label="关闭笔记"]');
  expect(port.write).not.toHaveBeenCalled();
});
it("keeps the native editor usable if a legacy draft cannot be read", async () => {
  await mount({
    legacyDrafts: {
      get: async () => {
        throw new Error("unavailable");
      },
    },
  });
  await click(".card-title");
  expect(
    root.querySelector('[role="dialog"] [role="alert"]')?.textContent,
  ).toContain("旧版草稿暂时无法读取");
  expect(root.querySelector("[data-native-rem]")).not.toBeNull();
});
it("opens the complete native note and closes the board without writing a copied body", async () => {
  const close = vi.fn(async () => {});
  const { port } = await mount({ onClose: close });
  const id = root.querySelector("[data-row-id]")!.getAttribute("data-row-id");
  await click(".card-title");
  await click('[aria-label="在 RemNote 打开完整笔记"]');
  expect(port.open).toHaveBeenCalledWith(id);
  expect(close).toHaveBeenCalledOnce();
  expect(port.write).not.toHaveBeenCalled();
});
