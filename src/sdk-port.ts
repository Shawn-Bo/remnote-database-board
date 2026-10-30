import type {RNPlugin, PluginRem, RichTextInterface} from '@remnote/plugin-sdk';
import type {BoardPort, Cell, Choice, Field, Row, Snapshot, WriteRequest} from './model';
import {emptyCell, sameCell} from './model';

export function references(value: unknown): string[] {
  const result: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') {
      const x = v as Record<string, unknown>;
      if (x.i === 'q' && typeof x._id === 'string') result.push(x._id);
      // Do not reinterpret links, image IDs or arbitrary object IDs as Rem references.
    }
  };
  walk(value);
  return result;
}

export class SdkBoardPort implements BoardPort {
  private locks = new Set<string>();
  constructor(private plugin: RNPlugin) {}
  private async title(rem: PluginRem): Promise<string> {
    return await this.plugin.richText.toString(rem.text ?? []);
  }
  private async cell(value: RichTextInterface | undefined): Promise<Cell> {
    return {text: value ? await this.plugin.richText.toString(value) : '', refs: references(value)};
  }
  private async fields(tag: PluginRem): Promise<Field[]> {
    const fields: Field[] = [];
    for (const rem of await tag.getChildrenRem()) {
      if (!(await rem.isProperty())) continue;
      const type = String((await rem.getPropertyType()) ?? 'text');
      let choices: Choice[] = [];
      if (type === 'single_select' || type === 'multi_select') {
        let options = await rem.getChildrenRem();
        if (!options.length) {
          const optionTag = await rem.getPowerupPropertyAsRem('y', 't');
          if (optionTag) options = await optionTag.taggedRem();
        }
        for (const option of options) {
          if (await option.isProperty()) continue;
          const name = await this.title(option);
          if (name.trim() && !choices.some(c => c.id === option._id)) choices.push({id: option._id, name});
        }
      }
      fields.push({id: rem._id, name: await this.title(rem), type, choices});
    }
    return fields;
  }
  private async row(rem: PluginRem, fields: Field[]): Promise<Row> {
    const cells: Record<string, Cell> = {};
    for (const field of fields) cells[field.id] = await this.cell(await rem.getTagPropertyValue(field.id));
    return {id: rem._id, name: await this.title(rem), parentId: rem.parent, cells};
  }
  async load(tagId: string, rowIds?: string[]): Promise<Snapshot> {
    const tag = await this.plugin.rem.findOne(tagId);
    if (!tag) throw new Error('找不到这张表，请确认当前知识库和表格标签链接。');
    const fields = await this.fields(tag);
    if (!fields.length) throw new Error('这个节点没有表格属性。请使用表格所关联标签的链接，或从表格属性菜单打开。');
    const scope = rowIds ? new Set(rowIds) : undefined;
    const members = (await tag.taggedRem()).filter(r => !scope || scope.has(r._id));
    const rows: Row[] = [];
    // Bound SDK concurrency for databases with many rows.
    for (let i = 0; i < members.length; i += 8) rows.push(...await Promise.all(members.slice(i, i + 8).map(r => this.row(r, fields))));
    return {tagId, name: await this.title(tag), fields, rows, loadedAt: Date.now()};
  }
  async write(request: WriteRequest): Promise<Row> {
    const key = request.rowId;
    if (this.locks.has(key)) throw new Error('这个分段正在保存，请稍候。');
    this.locks.add(key);
    try {
      const tag = await this.plugin.rem.findOne(request.config.tagId);
      const rem = await this.plugin.rem.findOne(request.rowId);
      if (!tag || !rem) throw new Error('表格或分段已被删除，请刷新。');
      if (!(await rem.getTagRems()).some(t => t._id === tag._id)) throw new Error('这个分段已不属于当前数据库，请刷新。');
      const fields = await this.fields(tag);
      const field = fields.find(f => f.id === request.fieldId);
      const isGroup = request.fieldId === request.config.groupFieldId;
      const isRecord = request.fieldId === request.config.recordFieldId;
      if (!field || (!isGroup && !isRecord)) throw new Error('不能修改未配置的属性。');
      if (isGroup && field.type !== 'single_select') throw new Error('熟练度属性类型已改变，请重新连接表格。');
      if (isRecord && !['text', '0'].includes(field.type)) throw new Error('训练记录必须是文本属性。');
      const next = request.value;
      if (isGroup && (next.refs.length > 1 || (next.refs.length === 0 && next.text.trim()))) throw new Error('熟练度必须使用原表格中的单选选项。');
      if (isGroup && next.refs.length && !field.choices.some(c => c.id === next.refs[0])) throw new Error('目标熟练度选项已被删除，请刷新。');
      if (isRecord && next.refs.length) throw new Error('训练记录只接受纯文本。');
      const rawCurrent = await rem.getTagPropertyValue(field.id);
      if (isRecord && rawCurrent && !rawCurrent.every(part => typeof part === 'string')) throw new Error('这个记录含有富文本内容，请打开原笔记编辑，以保留格式。');
      const current = await this.cell(rawCurrent);
      if (!sameCell(current, request.expected)) throw new Error('这项内容刚被其他操作修改，已停止覆盖。请刷新后重试。');
      const parent = rem.parent;
      let raw: RichTextInterface | undefined;
      if (next.refs.length) raw = await this.plugin.richText.rem(next.refs[0]).value();
      else if (next.text) raw = [next.text];
      await rem.setTagPropertyValue(field.id, raw);
      const fresh = await this.plugin.rem.findOne(rem._id);
      if (!fresh) throw new Error('保存后无法读取分段，请在原表格检查。');
      const actual = await this.cell(await fresh.getTagPropertyValue(field.id));
      if (!sameCell(actual, next)) throw new Error('属性写入后未能确认结果，请刷新并检查原表格。');
      if (fresh.parent !== parent) throw new Error('分段位置被其他操作改变，请检查原笔记。');
      return this.row(fresh, fields);
    } finally { this.locks.delete(key); }
  }
  async open(id: string): Promise<void> {
    const rem = await this.plugin.rem.findOne(id);
    if (!rem) throw new Error('找不到原笔记。');
    await this.plugin.window.openRem(rem);
  }
}
