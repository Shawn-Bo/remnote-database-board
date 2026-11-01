// @vitest-environment happy-dom
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { Board } from "../src/Board";
import { inferConfig, type BoardPort } from "../src/model";
import { defaultViews, readViews, viewName } from "../src/views";
import { getLanguage, setLanguage, t, translate } from "../src/i18n";
import { usePluginLanguage } from "../src/use-plugin-language";
import fixture from "../src/demo-snapshot.json";
import catalog from "../src/locales/zh-CN.json";

const events = vi.hoisted(() => new Map<string, () => void>());
vi.mock("@remnote/plugin-sdk", async () => {
  const React = await import("react");
  return {
    AppEvents: { SettingChanged: "setting.changed" },
    useAPIEventListener: (event: string, _: unknown, callback: () => void) =>
      React.useEffect(() => {
        events.set(event, callback);
        return () => {
          events.delete(event);
        };
      }, [event, callback]),
  };
});

let root: HTMLDivElement | undefined;
afterEach(() => {
  if (root) {
    act(() => {
      ReactDOM.unmountComponentAtNode(root!);
    });
    root.remove();
    root = undefined;
  }
  setLanguage("en");
});

it("defaults to English and preserves interpolation values verbatim", () => {
  setLanguage(undefined);
  expect(t("Open board")).toBe("Open board");
  expect(translate("zh-CN", "Edit {p0}", { p0: "Song {p1}" })).toBe(
    "\u7f16\u8f91Song {p1}",
  );
  setLanguage("unsupported");
  expect(getLanguage()).toBe("en");
  for (const [english, chinese] of Object.entries(catalog)) {
    expect(english).not.toMatch(/[\u3400-\u9fff]/);
    expect([...chinese.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort()).toEqual(
      [...english.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
    );
  }
});

it("updates open views from the saved plugin language without changing records or view configuration", async () => {
  const data = structuredClone(fixture);
  const original = structuredClone(data);
  const config = inferConfig(data);
  config.viewState = defaultViews(data, config);
  config.viewState.views[1].name = "My practice";
  config.viewState.views[1].autoName = false;
  let savedLanguage = "en";
  const plugin: any = {
    settings: { getSetting: vi.fn(async () => savedLanguage) },
  };
  const port: BoardPort = {
    load: vi.fn(async () => data),
    write: vi.fn(),
    open: vi.fn(),
  };
  const onConfig = vi.fn(async () => {});
  function Harness() {
    usePluginLanguage(plugin);
    return <Board port={port} initial={config} onConfig={onConfig} />;
  }
  root = document.createElement("div");
  document.body.append(root);
  await act(async () => {
    ReactDOM.render(<Harness />, root!);
  });
  expect(root.querySelector("main")?.lang).toBe("en");
  expect(root.querySelector("[role=tab]")?.textContent).toBe("Table");
  expect(root.querySelector('[aria-label="View settings"]')).not.toBeNull();
  onConfig.mockClear();
  await act(async () => {
    savedLanguage = "zh-CN";
    events.get("setting.changed")!();
  });
  expect(root.querySelector("main")?.lang).toBe("zh-CN");
  expect(root.querySelector("[role=tab]")?.textContent).toBe("\u8868\u683c");
  expect(
    root.querySelector('[aria-label="\u89c6\u56fe\u8bbe\u7f6e"]'),
  ).not.toBeNull();
  expect(root.querySelectorAll("[role=tab]")[1].textContent).toBe(
    "My practice",
  );
  expect(root.textContent).toContain("Guitar Practice");
  expect(root.textContent).toContain("Song");
  expect(data).toEqual(original);
  expect(port.write).not.toHaveBeenCalled();
  expect(onConfig).not.toHaveBeenCalled();
  expect(config.viewState.views[0].name).toBe("Table");
  expect(viewName(config.viewState.views[0])).toBe("\u8868\u683c");
  await act(async () => {
    savedLanguage = "en";
    events.get("setting.changed")!();
  });
  expect(root.querySelector("[role=tab]")?.textContent).toBe("Table");
});

it("ignores a stale language read after a newer setting change", async () => {
  let finish: (value: string) => void = () => {};
  const initial = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const getSetting = vi
    .fn()
    .mockReturnValueOnce(initial)
    .mockResolvedValue("zh-CN");
  const plugin: any = { settings: { getSetting } };
  function Probe() {
    usePluginLanguage(plugin);
    return <span>{t("Open board")}</span>;
  }
  root = document.createElement("div");
  document.body.append(root);
  await act(async () => {
    ReactDOM.render(<Probe />, root!);
  });
  await act(async () => {
    events.get("setting.changed")!();
  });
  expect(getLanguage()).toBe("zh-CN");
  await act(async () => {
    finish("en");
  });
  expect(getLanguage()).toBe("zh-CN");
});

it("ships English demo content with useful record names", () => {
  const labels = [
    fixture.name,
    ...fixture.fields.flatMap((f) => [f.name, ...f.choices.map((c) => c.name)]),
    ...fixture.rows.flatMap((r) => [
      r.name,
      ...Object.values(r.cells).map((c) => c.text),
    ]),
  ];
  for (const label of labels) {
    expect(label).not.toMatch(/[\u3400-\u9fff]/);
    expect(label).not.toMatch(/acceptance|temporary|test record|fixture/i);
  }
});

it("localizes legacy default view labels while keeping custom names", () => {
  const config = inferConfig(fixture);
  const state = defaultViews(fixture, config);
  delete state.views[0].autoName;
  state.views[0].name = "\u8868\u683c";
  delete state.views[1].autoName;
  state.views[1].name = "My board";
  const restored = readViews(state)!;
  expect(viewName(restored.views[0])).toBe("Table");
  expect(viewName(restored.views[1])).toBe("My board");
  expect(state.views[0].name).toBe("\u8868\u683c");
});
