import type {
  RNPlugin,
  PluginRem,
  RichTextInterface,
} from "@remnote/plugin-sdk";
import type {
  BoardPort,
  Cell,
  Choice,
  Field,
  Row,
  Snapshot,
  WriteRequest,
} from "./model";
import { sameCell } from "./model";

export function references(value: unknown): string[] {
  const result: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v && typeof v === "object") {
      const x = v as Record<string, unknown>;
      if (x.i === "q" && typeof x._id === "string") result.push(x._id);
      // Do not reinterpret links, image IDs or arbitrary object IDs as Rem references.
    }
  };
  walk(value);
  return result;
}

export class SdkBoardPort implements BoardPort {
  private locks = new Set<string>();
  constructor(private plugin: RNPlugin) {}
  private async displayText(
    value: RichTextInterface | undefined,
  ): Promise<string> {
    // Native percent: 0 means an explicit pixel size, but the SDK input schema
    // only accepts 5/25/50/100. Omit that unsupported hint in a copy used solely
    // for text extraction; render the untouched original with RemNote RichText.
    const input = (value ?? []).map((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        part.i === "i" &&
        part.percent !== undefined &&
        ![5, 25, 50, 100].includes(part.percent)
      ) {
        const { percent, ...image } = part;
        return image;
      }
      return part;
    });
    return input.length ? await this.plugin.richText.toString(input) : "";
  }
  private async title(rem: PluginRem): Promise<string> {
    return this.displayText(rem.text);
  }
  private async cell(value: RichTextInterface | undefined): Promise<Cell> {
    const hasImage = value?.some(
      (part) => typeof part === "object" && part !== null && part.i === "i",
    );
    return {
      text: await this.displayText(value),
      refs: references(value),
      ...(hasImage ? { richText: value } : {}),
    };
  }
  private async fields(tag: PluginRem): Promise<Field[]> {
    const fields: Field[] = [];
    for (const rem of await tag.getChildrenRem()) {
      if (!(await rem.isProperty())) continue;
      const type = String((await rem.getPropertyType()) ?? "text");
      let choices: Choice[] = [];
      if (type === "single_select" || type === "multi_select") {
        let options = await rem.getChildrenRem();
        if (!options.length) {
          const optionTag = await rem.getPowerupPropertyAsRem("y", "t");
          if (optionTag) options = await optionTag.taggedRem();
        }
        for (const option of options) {
          if (await option.isProperty()) continue;
          const name = await this.title(option);
          if (name.trim() && !choices.some((c) => c.id === option._id))
            choices.push({ id: option._id, name });
        }
      }
      fields.push({ id: rem._id, name: await this.title(rem), type, choices });
    }
    return fields;
  }
  private async row(rem: PluginRem, fields: Field[]): Promise<Row> {
    const cells: Record<string, Cell> = {};
    for (const field of fields)
      cells[field.id] = await this.cell(
        await rem.getTagPropertyValue(field.id),
      );
    const title = await this.cell(rem.text);
    return {
      id: rem._id,
      name: title.text,
      ...(title.richText ? { title } : {}),
      parentId: rem.parent,
      cells,
    };
  }
  private async sourceFields(tag: PluginRem): Promise<Field[]> {
    const fields = await this.fields(tag);
    // A pasted ordinary document must not become a tag as a side effect of New.
    if (!fields.length && !(await tag.hasPowerup("g")))
      throw new Error("这不是现有表格或标签，请使用高级表格的标签链接。");
    return fields;
  }
  async load(tagId: string, rowIds?: string[]): Promise<Snapshot> {
    const tag = await this.plugin.rem.findOne(tagId);
    if (!tag) throw new Error("找不到这张表，请确认当前知识库和表格标签链接。");
    const fields = await this.sourceFields(tag);
    const scope = rowIds ? new Set(rowIds) : undefined;
    const members = (await tag.taggedRem()).filter(
      (r) => !scope || scope.has(r._id),
    );
    const rows: Row[] = [];
    // Bound SDK concurrency for databases with many rows.
    for (let i = 0; i < members.length; i += 8)
      rows.push(
        ...(await Promise.all(
          members.slice(i, i + 8).map((r) => this.row(r, fields)),
        )),
      );
    return {
      tagId,
      name: await this.title(tag),
      fields,
      rows,
      loadedAt: Date.now(),
    };
  }
  async write(request: WriteRequest): Promise<Row> {
    const key = request.rowId;
    if (this.locks.has(key)) throw new Error("这条记录正在保存，请稍候。");
    this.locks.add(key);
    try {
      const tag = await this.plugin.rem.findOne(request.config.tagId);
      const rem = await this.plugin.rem.findOne(request.rowId);
      if (!tag || !rem) throw new Error("表格或记录已被删除，请刷新。");
      if (!(await rem.getTagRems()).some((t) => t._id === tag._id))
        throw new Error("这条记录已不属于当前数据库，请刷新。");
      const fields = await this.fields(tag);
      const field = fields.find((f) => f.id === request.fieldId);
      if (!field) throw new Error("属性已被删除，请刷新。");
      const next = request.value;
      this.validateValue(field, next);
      const rawCurrent = await rem.getTagPropertyValue(field.id);
      if (
        !field.type.endsWith("_select") &&
        rawCurrent &&
        !rawCurrent.every((part) => typeof part === "string")
      )
        throw new Error(
          "这个属性含有富文本内容，请打开原笔记编辑，以保留格式。",
        );
      const current = await this.cell(rawCurrent);
      if (!sameCell(current, request.expected))
        throw new Error("这项内容刚被其他操作修改，已停止覆盖。请刷新后重试。");
      const parent = rem.parent;
      const raw = await this.rawValue(next);
      await rem.setTagPropertyValue(field.id, raw);
      const fresh = await this.plugin.rem.findOne(rem._id);
      if (!fresh) throw new Error("保存后无法读取分段，请在原表格检查。");
      const actual = await this.cell(await fresh.getTagPropertyValue(field.id));
      if (!sameCell(actual, next))
        throw new Error("属性写入后未能确认结果，请刷新并检查原表格。");
      if (fresh.parent !== parent)
        throw new Error("分段位置被其他操作改变，请检查原笔记。");
      return this.row(fresh, fields);
    } finally {
      this.locks.delete(key);
    }
  }
  private validateValue(field: Field, next: Cell) {
    if (next.richText) throw new Error("富文本内容请在原笔记中编辑。");
    if (field.type === "single_select" || field.type === "multi_select") {
      if (
        (field.type === "single_select" && next.refs.length > 1) ||
        (!next.refs.length && next.text.trim())
      )
        throw new Error("请选择原表格中的选项。");
      if (
        new Set(next.refs).size !== next.refs.length ||
        next.refs.some((id) => !field.choices.some((c) => c.id === id))
      )
        throw new Error("目标选项已被删除，请刷新。");
      return;
    }
    if (!["text", "0", "number", "url"].includes(field.type))
      throw new Error("此属性请在 RemNote 原笔记中编辑。");
    if (next.refs.length) throw new Error("此属性不接受选项引用。");
    if (
      field.type === "number" &&
      next.text.trim() &&
      !Number.isFinite(Number(next.text))
    )
      throw new Error("请输入有效数字。");
  }
  private async rawValue(value: Cell): Promise<RichTextInterface | undefined> {
    if (value.refs.length) {
      const raw: RichTextInterface = [];
      for (const id of value.refs)
        raw.push(...(await this.plugin.richText.rem(id).value()));
      return raw;
    }
    return value.text ? [value.text] : undefined;
  }
  async create(
    tagId: string,
    name: string,
    cells: Record<string, Cell> = {},
  ): Promise<Row> {
    const tag = await this.plugin.rem.findOne(tagId);
    if (!tag) throw new Error("数据库已被删除，请刷新。");
    const fields = await this.sourceFields(tag);
    for (const [id, value] of Object.entries(cells)) {
      const field = fields.find((f) => f.id === id);
      if (!field) throw new Error("属性已改变，请刷新后新建。");
      this.validateValue(field, value);
    }
    const rem = await this.plugin.rem.createRem();
    if (!rem) throw new Error("无法创建记录，请重试。");
    try {
      await rem.setParent(tagId);
      await rem.setText([name.trim() || "未命名"]);
      await rem.addTag(tagId);
      for (const [id, value] of Object.entries(cells))
        await rem.setTagPropertyValue(id, await this.rawValue(value));
      const fresh = await this.plugin.rem.findOne(rem._id);
      if (
        !fresh ||
        !(await fresh.getTagRems()).some((t) => t._id === tagId) ||
        fresh.parent !== tagId
      )
        throw new Error("无法确认新记录");
      const saved = await this.row(fresh, fields);
      if (
        saved.name !== (name.trim() || "未命名") ||
        Object.entries(cells).some(
          ([id, value]) => !sameCell(saved.cells[id], value),
        )
      )
        throw new Error("无法确认属性");
      return saved;
    } catch (e) {
      throw new Error(
        `记录已创建（${rem._id}），但未完成初始化。请在原笔记检查后继续，避免重复新建。${String(e)}`,
      );
    }
  }
  async rename(
    tagId: string,
    rowId: string,
    expectedName: string,
    name: string,
  ): Promise<Row> {
    if (this.locks.has(rowId)) throw new Error("这条记录正在保存，请稍候。");
    this.locks.add(rowId);
    try {
      const tag = await this.plugin.rem.findOne(tagId),
        rem = await this.plugin.rem.findOne(rowId);
      if (
        !tag ||
        !rem ||
        !(await rem.getTagRems()).some((t) => t._id === tagId)
      )
        throw new Error("记录已不属于此数据库。");
      if (rem.text?.some((p) => typeof p !== "string"))
        throw new Error("名称包含富文本，请打开原笔记编辑。");
      if ((await this.title(rem)) !== expectedName)
        throw new Error("名称刚被其他操作修改，请刷新。");
      const parent = rem.parent;
      await rem.setText([name]);
      const fresh = await this.plugin.rem.findOne(rowId);
      if (
        !fresh ||
        (await this.title(fresh)) !== name ||
        fresh.parent !== parent
      )
        throw new Error("名称写入后未能确认结果。");
      return this.row(fresh, await this.fields(tag));
    } finally {
      this.locks.delete(rowId);
    }
  }
  async open(id: string): Promise<void> {
    const rem = await this.plugin.rem.findOne(id);
    if (!rem) throw new Error("找不到原笔记。");
    await this.plugin.window.openRem(rem);
  }
}
