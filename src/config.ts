import type { RNPlugin } from "@remnote/plugin-sdk";
import type { Config } from "./model";
export const LAST_CONFIG_KEY = "database-board:last-config:v1";
export const configKey = (tagId: string) => `database-board:config:v1:${tagId}`;
let saveTail: Promise<void> = Promise.resolve();
export async function saveConfig(plugin: RNPlugin, config: Config) {
  const value = structuredClone(config);
  const next = saveTail
    .catch(() => {})
    .then(async () => {
      await plugin.storage.setSynced(configKey(value.tagId), value);
      await plugin.storage.setSynced(LAST_CONFIG_KEY, value);
    });
  saveTail = next;
  await next;
}
