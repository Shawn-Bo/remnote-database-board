import {declareIndexPlugin, PluginCommandMenuLocation, WidgetLocation, type ReactRNPlugin} from '@remnote/plugin-sdk';
import {LAST_CONFIG_KEY, configKey} from '../config';
import type {Config} from '../model';

export async function activate(plugin: ReactRNPlugin) {
  // RemNote 1.28.62 serializes Pane widgets with a widget~ prefix that its
  // own window-string parser does not accept. A popup avoids that route.
  await plugin.app.registerWidget('board', WidgetLocation.Popup, {dimensions: {height: 'auto', width: 'min(1200px, 94vw)'}});
  const open = async (context: Record<string, unknown>) => {await plugin.widget.openPopup('board', context, false);};
  await plugin.app.registerCommand({id: 'open-database-board', name: '数据库看板', quickCode: 'dbk', keywords: 'kanban database 训练 熟练度', description: '为当前表格标签或上次数据库打开看板', action: async () => {
    const focused = await plugin.focus.getFocusedRem();
    let tag;
    if (focused) {
      if (await focused.isProperty()) tag = await focused.getParentRem();
      else if ((await Promise.all((await focused.getChildrenRem()).map(r => r.isProperty()))).some(Boolean)) tag = focused;
      else {
        for (const candidate of await focused.getTagRems()) {
          if ((await Promise.all((await candidate.getChildrenRem()).map(r => r.isProperty()))).some(Boolean)) {tag = candidate; break;}
        }
      }
    }
    const previous = await plugin.storage.getSynced<Config>(LAST_CONFIG_KEY);
    await open(tag ? {tagId: tag._id} : previous ? {...previous} : {});
  }});
  await plugin.app.registerCommand({id: 'open-last-board', name: '打开最近的看板', quickCode: 'lastboard', description: '打开上次连接的数据库看板', action: async () => {
    const previous = await plugin.storage.getSynced<Config>(LAST_CONFIG_KEY);
    await open(previous ? {...previous} : {});
  }});
  await plugin.app.registerMenuItem({id: 'open-property-as-board', name: '以看板打开', location: PluginCommandMenuLocation.PropertyConfigMenu, action: async (args: {columnPropertyId?: string; rowIds?: string[]}) => {
    if (!args.columnPropertyId) {await plugin.app.toast('请从表格属性菜单打开。'); return;}
    const property = await plugin.rem.findOne(args.columnPropertyId);
    const tag = await property?.getParentRem();
    if (!property || !tag) {await plugin.app.toast('找不到属性所属的表格标签。'); return;}
    const stored = await plugin.storage.getSynced<Config>(configKey(tag._id));
    await open({...stored, tagId: tag._id, ...(String(await property.getPropertyType()) === 'single_select' ? {groupFieldId: property._id} : {}), ...(Array.isArray(args.rowIds) ? {rowScope: args.rowIds.filter(x => typeof x === 'string')} : {})});
  }});
}
declareIndexPlugin(activate, async () => {});
