import { expect, it, vi } from "vitest";
vi.mock("@remnote/plugin-sdk", () => ({
  RemType: { PORTAL: 6 },
  BuiltInPowerupCodes: { SearchPortal: "sp" },
}));
import {
  tableEntriesAtRem,
  nativeTableOpening,
  tableQueryTag,
} from "../src/table-entry";

function setup() {
  const tag = {
    _id: "database",
    text: ["Practice log"],
    getChildrenRem: async () => [
      { _id: "property", isProperty: async () => true },
    ],
    taggedRem: vi.fn(async () => [{ _id: "r1" }, { _id: "r2" }, { _id: "r3" }]),
  };
  const table = {
    _id: "table",
    type: 6,
    text: [],
    isTable: vi.fn(async () => true),
    getPortalDirectlyIncludedRem: vi.fn(async () => [tag]),
    getPowerupPropertyAsRichText: vi.fn(async (): Promise<any[]> => []),
    allRemInDocumentOrPortal: vi.fn(async () => [
      { _id: "database" },
      { _id: "r2" },
      { _id: "r2" },
      { _id: "child" },
    ]),
  };
  const ordinary = { _id: "note", type: 0, isTable: vi.fn(async () => false) };
  const portal = { _id: "portal", type: 6, isTable: vi.fn(async () => false) };
  const document = {
    _id: "document",
    isTable: vi.fn(async () => false),
    getDescendants: vi.fn(async () => [ordinary, portal, table, table]),
  };
  const plugin: any = {
    rem: {
      findOne: vi.fn(async (id: string) =>
        id === "document"
          ? document
          : id === "table"
            ? table
            : id === "database"
              ? tag
              : undefined,
      ),
    },
    richText: { toString: vi.fn(async (text: string[]) => text.join("")) },
  };
  return { plugin, table, tag, document, ordinary };
}

it("does not turn the enclosing document into a database entry, even when it contains tables", async () => {
  const { plugin, document } = setup();
  expect(await tableEntriesAtRem(plugin, "document")).toEqual([]);
  expect(document.getDescendants).not.toHaveBeenCalled();
});

it("opens the selected table's current row scope, excluding properties and child notes", async () => {
  const { plugin } = setup();
  expect(await nativeTableOpening(plugin, "table")).toEqual({
    tagId: "database",
    openAsBoard: true,
    rowScope: ["r2"],
  });
});

it("keeps an empty filtered table empty and propagates read errors", async () => {
  const { plugin, table } = setup();
  table.allRemInDocumentOrPortal.mockResolvedValue([]);
  expect((await nativeTableOpening(plugin, "table")).rowScope).toEqual([]);
  table.allRemInDocumentOrPortal.mockRejectedValue(new Error("offline"));
  await expect(nativeTableOpening(plugin, "table")).rejects.toThrow("offline");
});

it("refuses a removed table or ambiguous source rather than opening a different database", async () => {
  const { plugin, table, tag } = setup();
  await expect(nativeTableOpening(plugin, "gone")).rejects.toThrow(
    "no longer exists",
  );
  table.getPortalDirectlyIncludedRem.mockResolvedValue([
    tag,
    { ...tag, _id: "other" },
  ]);
  await expect(nativeTableOpening(plugin, "table")).rejects.toThrow(
    "Could not determine",
  );
});

it("also recognizes a table opened as its own page", async () => {
  const { plugin } = setup();
  expect((await tableEntriesAtRem(plugin, "table"))[0].tableId).toBe("table");
});

it("uses the advanced table's tag reference even when its portal returns records", async () => {
  const { plugin, table } = setup();
  table.getPowerupPropertyAsRichText.mockResolvedValue([
    "query: #",
    { i: "q", _id: "database" },
  ]);
  table.getPortalDirectlyIncludedRem.mockResolvedValue([]);
  expect((await nativeTableOpening(plugin, "table")).tagId).toBe("database");
});

it("does not guess a database from negated, multiple or unrelated query references", () => {
  expect(
    tableQueryTag(["query: !#", { i: "q", _id: "wrong" }]),
  ).toBeUndefined();
  expect(
    tableQueryTag([
      "query: #",
      { i: "q", _id: "a" },
      " or #",
      { i: "q", _id: "b" },
    ]),
  ).toBeUndefined();
  expect(
    tableQueryTag(["query: ", { i: "q", _id: "text-reference" }]),
  ).toBeUndefined();
});
