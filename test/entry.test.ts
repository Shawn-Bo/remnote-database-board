import { expect, it, vi } from "vitest";
vi.mock("@remnote/plugin-sdk", () => ({
  declareIndexPlugin: vi.fn(),
  AppEvents: { MessageBroadcast: "messaging.broadcast" },
  WidgetLocation: { Popup: "Popup" },
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
    event: { addListener: vi.fn(), removeListener: vi.fn() },
    app: {
      registerCSS: vi.fn(async () => {}),
      registerWidget: vi.fn(async () => {}),
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
  expect(commands.map((c) => c.name)).toEqual(["数据库看板", "打开最近的看板"]);
  expect(menus[0].location).toBe("PropertyConfigMenu");
});
it("does not pass a stale grouping override when opening from a non-select column", async () => {
  const {plugin, menus, property} = setup();
  property.getPropertyType = async () => 'text';
  plugin.storage.getSynced = async () => ({tagId:'source',groupFieldId:'old-status'});
  await activate(plugin);
  await menus[0].action({columnPropertyId:'status',rowIds:['r1']});
  expect(plugin.widget.openPopup).toHaveBeenCalledWith('board',{
    tagId:'source',openAsBoard:true,rowScope:['r1'],
  },false);
});
it("opens a native table in the popup using its real property parent and passed row scope", async () => {
  const { plugin, menus } = setup();
  await activate(plugin);
  await menus[0].action({ columnPropertyId: "status", rowIds: ["r1", "r2"] });
  expect(plugin.widget.openPopup).toHaveBeenCalledWith(
    "board",
    { tagId: "source", openAsBoard: true, groupFieldId: "status", rowScope: ["r1", "r2"] },
    false,
  );
});
