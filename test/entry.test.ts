import { expect, it, vi } from "vitest";
vi.mock("@remnote/plugin-sdk", () => ({
  declareIndexPlugin: vi.fn(),
  AppEvents: {
    SettingChanged: "setting.changed",
    MessageBroadcast: "messaging.broadcast",
  },
  BuiltInPowerupCodes: { SearchPortal: "sp" },
  WidgetLocation: {
    Popup: "Popup",
    DocumentBelowToolbar: "DocumentBelowToolbar",
    DocumentBelowTitle: "DocumentBelowTitle",
    UnderRemEditor: "UnderRemEditor",
  },
  PluginCommandMenuLocation: { PropertyConfigMenu: "PropertyConfigMenu" },
}));
import { activate } from "../src/widgets/index";
function setup() {
  const commands: any[] = [],
    menus: any[] = [];
  const tag = { _id: "source" };
  const property = {
    _id: "status",
    getParentRem: async () => tag,
    getPropertyType: async () => "single_select",
  };
  const plugin: any = {
    settings: {
      registerDropdownSetting: vi.fn(async () => {}),
      getSetting: vi.fn(async () => "en"),
    },
    event: { addListener: vi.fn(), removeListener: vi.fn() },
    app: {
      registerCSS: vi.fn(async () => {}),
      registerWidget: vi.fn(async () => {}),
      unregisterWidget: vi.fn(async () => {}),
      registerCommand: vi.fn(async (c: any) => commands.push(c)),
      registerMenuItem: vi.fn(async (m: any) => menus.push(m)),
      toast: vi.fn(),
    },
    focus: { getFocusedRem: async () => undefined },
    storage: { getSynced: async () => undefined },
    widget: { openPopup: vi.fn(async () => {}) },
    rem: { findOne: async () => property },
  };
  return { plugin, commands, menus, property };
}
it("registers a popup instead of a pane, along with both commands and the table menu", async () => {
  const { plugin, commands, menus } = setup();
  await activate(plugin);
  expect(plugin.app.registerWidget).toHaveBeenCalledWith(
    "board",
    "Popup",
    expect.anything(),
  );
  expect(commands.map((c) => c.name)).toEqual([
    "Database Board",
    "Open recent board",
  ]);
  expect(plugin.app.registerWidget).toHaveBeenCalledWith(
    "table-launcher",
    "DocumentBelowTitle",
    expect.anything(),
  );
  expect(menus[0].location).toBe("PropertyConfigMenu");
});
it("does not pass a stale grouping override when opening from a non-select column", async () => {
  const { plugin, menus, property } = setup();
  property.getPropertyType = async () => "text";
  plugin.storage.getSynced = async () => ({
    tagId: "source",
    groupFieldId: "old-status",
  });
  await activate(plugin);
  await menus[0].action({ columnPropertyId: "status", rowIds: ["r1"] });
  expect(plugin.widget.openPopup).toHaveBeenCalledWith(
    "board",
    {
      tagId: "source",
      openAsBoard: true,
      rowScope: ["r1"],
    },
    false,
  );
});
it("opens a native table in the popup using its real property parent and passed row scope", async () => {
  const { plugin, menus } = setup();
  await activate(plugin);
  await menus[0].action({ columnPropertyId: "status", rowIds: ["r1", "r2"] });
  expect(plugin.widget.openPopup).toHaveBeenCalledWith(
    "board",
    {
      tagId: "source",
      openAsBoard: true,
      groupFieldId: "status",
      rowScope: ["r1", "r2"],
    },
    false,
  );
});
it("registers an English default and refreshes command labels after changing the saved language", async () => {
  const { plugin, commands, menus } = setup();
  await activate(plugin);
  expect(plugin.settings.registerDropdownSetting).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "interface-language",
      defaultValue: "en",
    }),
  );
  plugin.settings.getSetting.mockResolvedValue("zh-CN");
  const callback = plugin.event.addListener.mock.calls.find(
    (call: any[]) => call[0] === "setting.changed",
  )[2];
  callback();
  await vi.waitFor(() =>
    expect(commands.at(-1).name).toBe(
      "\u6253\u5f00\u6700\u8fd1\u7684\u770b\u677f",
    ),
  );
  expect(menus.at(-1).name).toBe("\u4ee5\u770b\u677f\u6253\u5f00");
  plugin.settings.getSetting.mockResolvedValue("en");
  callback();
  await vi.waitFor(() =>
    expect(commands.at(-1).name).toBe("Open recent board"),
  );
});
