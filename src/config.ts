import type {RNPlugin} from '@remnote/plugin-sdk';
import type {Config} from './model';
export const LAST_CONFIG_KEY = 'database-board:last-config:v1';
export const configKey = (tagId: string) => `database-board:config:v1:${tagId}`;
export async function saveConfig(plugin: RNPlugin, config: Config) {
  await plugin.storage.setSynced(configKey(config.tagId), config);
  await plugin.storage.setSynced(LAST_CONFIG_KEY, config);
}
