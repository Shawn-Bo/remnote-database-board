// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import {
  clipInsets,
  NativeClipSheet,
  visibleClip,
} from "../src/NativeRichText";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("clips a native embed to the intersection of nested viewports without hiding its visible part", () => {
  expect(
    clipInsets({ top: 20, left: 30, right: 330, bottom: 220 }, [
      { top: 50, left: 0, right: 300, bottom: 300 },
      { top: 0, left: 40, right: 400, bottom: 200 },
    ]),
  ).toBe("inset(30px 30px 20px 10px)");
  expect(
    clipInsets({ top: -100, left: 30, right: 330, bottom: -20 }, [
      { top: 0, left: 0, right: 400, bottom: 300 },
    ]),
  ).toBe("inset(100%)");
});

it("cuts an overlapping column menu out of the native image while retaining its uncovered area", () => {
  const box = { top: 0, left: 0, right: 300, bottom: 200 };
  expect(
    clipInsets(box, [], [{ top: 20, left: 100, right: 200, bottom: 80 }]),
  ).toBe(
    "polygon(evenodd, 0px 0px, 300px 0px, 300px 200px, 0px 200px, 0px 0px, 100px 20px, 200px 20px, 200px 80px, 100px 80px, 100px 20px, 0px 0px)",
  );
  expect(
    clipInsets(box, [], [{ top: 0, left: 400, right: 600, bottom: 100 }]),
  ).toBe("inset(0px 0px 0px 0px)");
});

it("clips cards beside the native page, and hides them only for a modal or covered mobile workspace", () => {
  vi.stubGlobal("innerWidth", 500);
  vi.stubGlobal("innerHeight", 300);
  const board = document.createElement("main");
  board.className = "db-board";
  const workspace = document.createElement("div");
  workspace.className = "database-workspace";
  const scroll = document.createElement("div");
  scroll.style.overflow = "auto";
  const host = document.createElement("div");
  board.append(workspace);
  workspace.append(scroll);
  scroll.append(host);
  document.body.append(board);
  vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({
    top: 50,
    left: 0,
    right: 300,
    bottom: 250,
  } as DOMRect);
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
    top: 20,
    left: 20,
    right: 350,
    bottom: 180,
  } as DOMRect);
  Object.defineProperties(scroll, {
    clientWidth: { value: 300 },
    clientHeight: { value: 200 },
  });
  expect(visibleClip(host)).toBe("inset(30px 50px 0px 0px)");
  const nativePage = document.createElement("aside");
  nativePage.className = "detail-drawer";
  board.append(nativePage);
  expect(visibleClip(host)).toBe("inset(30px 50px 0px 0px)");
  workspace.style.visibility = "hidden";
  expect(visibleClip(host)).toBe("inset(100%)");
  workspace.style.visibility = "visible";
  const modal = document.createElement("div");
  modal.className = "create-backdrop";
  board.append(modal);
  expect(visibleClip(host)).toBe("inset(100%)");
  modal.remove();
  expect(visibleClip(host)).toBe("inset(30px 50px 0px 0px)");
});

it("serializes clip updates and removes the stylesheet after an in-flight update finishes", async () => {
  let release!: () => void;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  const register = vi
    .fn()
    .mockImplementationOnce(() => first)
    .mockResolvedValue(undefined);
  let frame!: FrameRequestCallback;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const sheet = new NativeClipSheet(register);
  const started = sheet.start();
  const host = document.createElement("div");
  document.body.append(host);
  sheet.add("example", host);
  frame(0);
  const stopped = sheet.stop();
  await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
  release();
  await started;
  await stopped;
  expect(register.mock.calls.at(-1)).toEqual([sheet.prefix, ""]);
  expect(register.mock.calls.every(([id]) => id === sheet.prefix)).toBe(true);
});
