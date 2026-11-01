// @vitest-environment happy-dom
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  documentId: "outer",
  listeners: new Map<string, () => void>(),
  plugin: {} as any,
}));
vi.mock("@remnote/plugin-sdk", async () => {
  const React = await import("react");
  return {
    renderWidget: vi.fn(),
    usePlugin: () => state.plugin,
    WidgetLocation: { DocumentBelowTitle: "DocumentBelowTitle" },
    AppEvents: {
      SettingChanged: "setting.changed",
      GlobalOpenRem: "open",
      URLChange: "url",
      CurrentWindowTreeChange: "tree",
      FocusedPortalChange: "portal",
    },
    useAPIEventListener: (event: string, _: unknown, callback: () => void) =>
      React.useEffect(() => {
        state.listeners.set(event, callback);
        return () => {
          state.listeners.delete(event);
        };
      }, [event, callback]),
  };
});
vi.mock("../src/table-entry", () => ({
  tableEntriesAtRem: vi.fn(async (_: unknown, id: string) =>
    id === "table" ? [{ tableId: id, tagId: "source", name: "Practice" }] : [],
  ),
  nativeTableOpening: vi.fn(),
}));
import { TableLauncher } from "../src/widgets/table-launcher";

let root: HTMLDivElement;
afterEach(() => {
  if (root) {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  }
  vi.useRealTimers();
});
it("updates the launcher when the same widget is reused while zooming between a document and its table", async () => {
  vi.useFakeTimers();
  state.documentId = "outer";
  state.plugin = {
    settings: { getSetting: async () => "en" },
    widget: {
      getWidgetContext: async () => ({ documentId: state.documentId }),
    },
  };
  root = document.createElement("div");
  document.body.append(root);
  await act(async () => {
    ReactDOM.render(<TableLauncher />, root);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(root.querySelector("button")).toBeNull();
  await act(async () => {
    state.documentId = "table";
    state.listeners.get("open")!();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(root.querySelector("button")?.textContent).toContain("Open board");
  await act(async () => {
    state.documentId = "outer";
    state.listeners.get("tree")!();
  });
  expect(root.querySelector("button")).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(root.querySelector("button")).toBeNull();
});
