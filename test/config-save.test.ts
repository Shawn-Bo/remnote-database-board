import { expect, it, vi } from "vitest";
import { saveConfig, LAST_CONFIG_KEY, configKey } from "../src/config";
it("serializes rapid view edits so a slow earlier storage write cannot overwrite a later edit", async () => {
  const data = new Map<string, unknown>();
  let unblock!: () => void;
  const barrier = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let first = true;
  const plugin: any = {
    storage: {
      setSynced: vi.fn(async (key: string, value: unknown) => {
        if (first) {
          first = false;
          await barrier;
        }
        data.set(key, value);
      }),
    },
  };
  const base = {
    tagId: "db",
    groupFieldId: "one",
    filterFieldId: "",
    recordFieldId: "",
  };
  const a = saveConfig(plugin, base),
    b = saveConfig(plugin, { ...base, groupFieldId: "two" });
  base.groupFieldId = "mutated";
  try {
    await vi.waitFor(() =>
      expect(plugin.storage.setSynced).toHaveBeenCalledTimes(1),
    );
  } finally {
    unblock();
  }
  await Promise.all([a, b]);
  expect(data.get(configKey("db"))).toMatchObject({ groupFieldId: "two" });
  expect(data.get(LAST_CONFIG_KEY)).toEqual(data.get(configKey("db")));
});
it("allows a retry after a failed storage write", async () => {
  const plugin: any = {
    storage: {
      setSynced: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue(undefined),
    },
  };
  const cfg = {
    tagId: "db",
    groupFieldId: "",
    filterFieldId: "",
    recordFieldId: "",
  };
  await expect(saveConfig(plugin, cfg)).rejects.toThrow("offline");
  await expect(saveConfig(plugin, cfg)).resolves.toBeUndefined();
});
