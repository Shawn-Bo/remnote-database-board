import { expect, it, vi } from "vitest";
vi.mock("@remnote/plugin-sdk", () => ({
  AppEvents: { MessageBroadcast: "messaging.broadcast" },
}));
import type { RNPlugin } from "@remnote/plugin-sdk";
import {
  installNativeClipBridge,
  registerNativeClip,
} from "../src/native-clip-bridge";

function peers(register = vi.fn().mockResolvedValue(undefined)) {
  const listeners = new Set<(event: unknown) => void>();
  const event = {
    addListener: (_: unknown, __: unknown, fn: (event: unknown) => void) =>
      listeners.add(fn),
    removeListener: (_: unknown, __: unknown, fn: (event: unknown) => void) =>
      listeners.delete(fn),
  };
  const messaging = {
    broadcast: async (message: unknown) => {
      for (const fn of [...listeners]) fn({ message });
    },
  };
  return {
    index: {
      event,
      messaging,
      app: { registerCSS: register },
    } as unknown as RNPlugin,
    popup: {
      event,
      messaging,
      app: {
        registerCSS: () => {
          throw new Error("index only");
        },
      },
    } as unknown as RNPlugin,
    listeners,
    register,
  };
}

it("registers native image styles from the index widget and waits for its acknowledgement", async () => {
  const { index, popup, register, listeners } = peers();
  const stop = installNativeClipBridge(index);
  await registerNativeClip(
    popup,
    "fanvane-db-rich-test",
    ".fanvane-db-rich-test{clip-path:inset(0)}",
  );
  expect(register).toHaveBeenCalledWith(
    "fanvane-db-rich-test",
    ".fanvane-db-rich-test{clip-path:inset(0)}",
  );
  expect(listeners.size).toBe(1);
  stop();
  expect(listeners.size).toBe(0);
  expect(register).toHaveBeenLastCalledWith("fanvane-db-rich-test", "");
});

it("returns registration failure to the popup without leaking its response listener", async () => {
  const { index, popup, listeners } = peers(
    vi.fn().mockRejectedValue(new Error("registration rejected")),
  );
  const stop = installNativeClipBridge(index);
  await expect(
    registerNativeClip(popup, "fanvane-db-rich-test", ""),
  ).rejects.toThrow("registration rejected");
  expect(listeners.size).toBe(1);
  stop();
});

it("ignores unrelated messages and reports a missing index widget", async () => {
  vi.useFakeTimers();
  try {
    const { popup, listeners } = peers();
    const pending = registerNativeClip(popup, "fanvane-db-rich-test", "");
    const failed = expect(pending).rejects.toThrow("图片显示服务未响应");
    await popup.messaging.broadcast({ type: "unrelated" });
    await vi.advanceTimersByTimeAsync(10000);
    await failed;
    expect(listeners.size).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
