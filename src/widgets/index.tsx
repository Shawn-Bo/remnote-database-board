import {
  declareIndexPlugin,
  PluginCommandMenuLocation,
  WidgetLocation,
  type ReactRNPlugin,
} from "@remnote/plugin-sdk";
import { LAST_CONFIG_KEY } from "../config";
import type { Config } from "../model";
import { installNativeClipBridge } from "../native-clip-bridge";

let stopNativeClipBridge: (() => void) | undefined;

export async function activate(plugin: ReactRNPlugin) {
  stopNativeClipBridge?.();
  stopNativeClipBridge = installNativeClipBridge(plugin);
  // Host viewport units are measured in RemNote's window, not in the small
  // initial iframe. This also breaks the auto-height / iframe-vh feedback loop.
  await plugin.app.registerCSS(
    "database-board-window",
    `
    iframe[src*="widgetName=board"][src*="pluginId=fanvane-database-board"] {
      width: 98vw !important;
      height: 96dvh !important;
      max-width: none !important;
      max-height: none !important;
    }
    @media (max-width: 700px) {
      iframe[src*="widgetName=board"][src*="pluginId=fanvane-database-board"] {
        width: 100vw !important;
        height: 100dvh !important;
      }
    }
  `,
  );
  // RemNote 1.28.62 serializes Pane widgets with a widget~ prefix that its
  // own window-string parser does not accept. A popup avoids that route.
  await plugin.app.registerWidget("board", WidgetLocation.Popup, {
    dimensions: { height: "auto", width: "98vw" },
  });
  await plugin.app.unregisterWidget("table-launcher", WidgetLocation.DocumentBelowToolbar);
  await plugin.app.unregisterWidget("table-launcher", WidgetLocation.UnderRemEditor);
  await plugin.app.registerWidget("table-launcher", WidgetLocation.DocumentBelowTitle, {
    dimensions: { height: "auto", width: "100%" },
  });
  const open = async (context: Record<string, unknown>) => {
    await plugin.widget.openPopup("board", context, false);
  };
  await plugin.app.registerCommand({
    id: "open-database-board",
    name: "数据库看板",
    quickCode: "dbk",
    keywords: "kanban database table filter sort 视图 筛选 排序",
    description: "打开当前高级表格的数据库视图，支持看板、筛选和排序",
    action: async () => {
      const focused = await plugin.focus.getFocusedRem();
      let tag;
      if (focused) {
        if (await focused.isProperty()) tag = await focused.getParentRem();
        else if (
          (
            await Promise.all(
              (await focused.getChildrenRem()).map((r) => r.isProperty()),
            )
          ).some(Boolean)
        )
          tag = focused;
        else {
          for (const candidate of await focused.getTagRems()) {
            if (
              (
                await Promise.all(
                  (await candidate.getChildrenRem()).map((r) => r.isProperty()),
                )
              ).some(Boolean)
            ) {
              tag = candidate;
              break;
            }
          }
        }
      }
      const previous = await plugin.storage.getSynced<Config>(LAST_CONFIG_KEY);
      await open(tag ? { tagId: tag._id } : previous ? { ...previous } : {});
    },
  });
  await plugin.app.registerCommand({
    id: "open-last-board",
    name: "打开最近的看板",
    quickCode: "lastboard",
    description: "打开上次连接的数据库看板",
    action: async () => {
      const previous = await plugin.storage.getSynced<Config>(LAST_CONFIG_KEY);
      await open(previous ? { ...previous } : {});
    },
  });
  await plugin.app.registerMenuItem({
    id: "open-property-as-board",
    name: "以看板打开",
    location: PluginCommandMenuLocation.PropertyConfigMenu,
    action: async (args: { columnPropertyId?: string; rowIds?: string[] }) => {
      if (!args.columnPropertyId) {
        await plugin.app.toast("请从表格属性菜单打开。");
        return;
      }
      const property = await plugin.rem.findOne(args.columnPropertyId);
      const tag = await property?.getParentRem();
      if (!property || !tag) {
        await plugin.app.toast("找不到属性所属的表格标签。");
        return;
      }
      await open({
        tagId: tag._id,
        openAsBoard: true,
        ...(String(await property.getPropertyType()) === "single_select"
          ? { groupFieldId: property._id }
          : {}),
        ...(Array.isArray(args.rowIds)
          ? { rowScope: args.rowIds.filter((x) => typeof x === "string") }
          : {}),
      });
    },
  });
}
declareIndexPlugin(activate, async () => {
  stopNativeClipBridge?.();
  stopNativeClipBridge = undefined;
});
