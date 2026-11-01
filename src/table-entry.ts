import { BuiltInPowerupCodes, type RNPlugin, type PluginRem, type RichTextInterface } from "@remnote/plugin-sdk";
import { displayRichText } from "./rich-text";

export interface TableEntry {
  tableId: string;
  tagId: string;
  name: string;
}

export function tableQueryTag(query: RichTextInterface): string | undefined {
  const refs = query.filter(part => typeof part === "object" && part.i === "q");
  if (refs.length !== 1) return undefined;
  const index = query.indexOf(refs[0]);
  const before = query.slice(0, index);
  const after = query.slice(index + 1);
  if (![...before, ...after].every(part => typeof part === "string")) return undefined;
  if (!/^query:\s*#\s*$/.test(before.join("").trim()) || after.join("").trim()) return undefined;
  return refs[0]._id;
}

async function tableTag(plugin: RNPlugin, table: PluginRem) {
  const query = await table.getPowerupPropertyAsRichText(BuiltInPowerupCodes.SearchPortal, "Query");
  if (query?.length) {
    const tagId = tableQueryTag(query);
    const tag = tagId ? await plugin.rem.findOne(tagId) : undefined;
    if (!tag) throw new Error("这张表的来源较复杂，请从属性列菜单选择“以看板打开”。");
    return tag;
  }
  const roots = await table.getPortalDirectlyIncludedRem();
  // Non-query tables point directly at their database tag. Advanced tables
  // instead expose matching records here, so their query above is authoritative.
  if (roots.length !== 1) throw new Error("无法确认这张表的数据源。");
  const properties = await Promise.all((await roots[0].getChildrenRem()).map(rem => rem.isProperty()));
  if (!properties.some(Boolean)) throw new Error("无法确认这张表的数据源。");
  return roots[0];
}

export async function tableEntriesAtRem(plugin: RNPlugin, documentId: string): Promise<TableEntry[]> {
  const document = await plugin.rem.findOne(documentId);
  if (!document || !(await document.isTable())) return [];
  const tag = await tableTag(plugin, document);
  const title = await displayRichText(plugin, document.text);
  const name = title.trim() || (await displayRichText(plugin, tag.text)).trim() || "未命名表格";
  return [{ tableId: document._id, tagId: tag._id, name }];
}

export async function nativeTableOpening(plugin: RNPlugin, tableId: string) {
  const table = await plugin.rem.findOne(tableId);
  if (!table || !(await table.isTable())) throw new Error("这张表已不存在，请重新打开页面。");
  const tag = await tableTag(plugin, table);
  const [contextRems, records] = await Promise.all([
    table.allRemInDocumentOrPortal(),
    tag.taggedRem(),
  ]);
  const members = new Set(records.map(rem => rem._id));
  return {
    tagId: tag._id,
    openAsBoard: true,
    rowScope: [...new Set(contextRems.map(rem => rem._id).filter(id => members.has(id)))],
  };
}
