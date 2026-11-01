import { t } from "../i18n";
import {
  declareIndexPlugin,
  AppEvents,
  PluginCommandMenuLocation,
  WidgetLocation,
  type ReactRNPlugin,
} from "@remnote/plugin-sdk";
import { LAST_CONFIG_KEY } from "../config";
import type { Config } from "../model";
import { installNativeClipBridge } from "../native-clip-bridge";

import { LANGUAGE_SETTING, languages, setLanguage } from "../i18n";

let stopLanguageListener: (() => void) | undefined;
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
  await plugin.app.unregisterWidget(
    "table-launcher",
    WidgetLocation.DocumentBelowToolbar,
  );
  await plugin.app.unregisterWidget(
    "table-launcher",
    WidgetLocation.UnderRemEditor,
  );
  await plugin.app.registerWidget(
    "table-launcher",
    WidgetLocation.DocumentBelowTitle,
    {
      dimensions: { height: "auto", width: "100%" },
    },
  );
  const open = async (context: Record<string, unknown>) => {
    await plugin.widget.openPopup("board", context, false);
  };
  await plugin.settings.registerDropdownSetting({
    id: LANGUAGE_SETTING,
    title: "Language",
    description: "Choose the language for Database Board.",
    defaultValue: "en",
    options: languages,
  });
  const registerActions = async () => {
    await plugin.app.registerCommand({
      id: "open-database-board",
      name: t("Database Board"),
      quickCode: "dbk",
      keywords: t("kanban database table board view filter sort"),
      description: t(
        "Open the current Advanced Table in Database Board with views, filters, and sorting",
      ),
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
                    (await candidate.getChildrenRem()).map((r) =>
                      r.isProperty(),
                    ),
                  )
                ).some(Boolean)
              ) {
                tag = candidate;
                break;
              }
            }
          }
        }
        const previous =
          await plugin.storage.getSynced<Config>(LAST_CONFIG_KEY);
        await open(tag ? { tagId: tag._id } : previous ? { ...previous } : {});
      },
    });
    await plugin.app.registerCommand({
      id: "open-last-board",
      name: t("Open recent board"),
      quickCode: "lastboard",
      description: t("Open the last connected Database Board"),
      action: async () => {
        const previous =
          await plugin.storage.getSynced<Config>(LAST_CONFIG_KEY);
        await open(previous ? { ...previous } : {});
      },
    });
    await plugin.app.registerMenuItem({
      id: "open-property-as-board",
      name: t("Open as board"),
      location: PluginCommandMenuLocation.PropertyConfigMenu,
      action: async (args: {
        columnPropertyId?: string;
        rowIds?: string[];
      }) => {
        if (!args.columnPropertyId) {
          await plugin.app.toast(t("Open from a table property menu."));
          return;
        }
        const property = await plugin.rem.findOne(args.columnPropertyId);
        const tag = await property?.getParentRem();
        if (!property || !tag) {
          await plugin.app.toast(
            t("Could not find the table tag for this property."),
          );
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
  };
  let updates = Promise.resolve();
  const refreshLanguage = () => {
    updates = updates
      .catch(() => {})
      .then(async () => {
        setLanguage(await plugin.settings.getSetting(LANGUAGE_SETTING));
        await registerActions();
      });
    return updates;
  };
  stopLanguageListener?.();
  await refreshLanguage();
  const languageChanged = () => {
    void refreshLanguage().catch(() => {});
  };
  plugin.event.addListener(
    AppEvents.SettingChanged,
    LANGUAGE_SETTING,
    languageChanged,
  );
  stopLanguageListener = () =>
    plugin.event.removeListener(
      AppEvents.SettingChanged,
      LANGUAGE_SETTING,
      languageChanged,
    );
}
declareIndexPlugin(activate, async () => {
  stopLanguageListener?.();
  stopLanguageListener = undefined;
  stopNativeClipBridge?.();
  stopNativeClipBridge = undefined;
});
