import { t } from "./i18n";
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
import { displayRichText } from "./rich-text";

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
    return displayRichText(this.plugin, value);
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
      throw new Error(
        t("This isn't a valid table or tag. Use an Advanced Table tag link."),
      );
    return fields;
  }
  async load(tagId: string, rowIds?: string[]): Promise<Snapshot> {
    const tag = await this.plugin.rem.findOne(tagId);
    if (!tag)
      throw new Error(
        t("Table not found. Check your knowledge base and table tag link."),
      );
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
    if (this.locks.has(key)) throw new Error(t("Saving record, please wait."));
    this.locks.add(key);
    try {
      const tag = await this.plugin.rem.findOne(request.config.tagId);
      const rem = await this.plugin.rem.findOne(request.rowId);
      if (!tag || !rem)
        throw new Error(t("Table or record was deleted. Refresh the view."));
      if (!(await rem.getTagRems()).some((t) => t._id === tag._id))
        throw new Error(
          t("This record is no longer in this database. Refresh the view."),
        );
      const fields = await this.fields(tag);
      const field = fields.find((f) => f.id === request.fieldId);
      if (!field) throw new Error(t("Property was deleted. Refresh the view."));
      const next = request.value;
      this.validateValue(field, next);
      const rawCurrent = await rem.getTagPropertyValue(field.id);
      if (
        !field.type.endsWith("_select") &&
        rawCurrent &&
        !rawCurrent.every((part) => typeof part === "string")
      )
        throw new Error(
          t(
            "This property contains rich text. Edit it in RemNote to preserve formatting.",
          ),
        );
      const current = await this.cell(rawCurrent);
      if (!sameCell(current, request.expected))
        throw new Error(
          t("This value was modified elsewhere. Refresh and try again."),
        );
      const parent = rem.parent;
      const raw = await this.rawValue(next);
      await rem.setTagPropertyValue(field.id, raw);
      const fresh = await this.plugin.rem.findOne(rem._id);
      if (!fresh)
        throw new Error(
          t("Could not verify saved content. Check the original table."),
        );
      const actual = await this.cell(await fresh.getTagPropertyValue(field.id));
      if (!sameCell(actual, next))
        throw new Error(
          t(
            "Could not confirm property update. Refresh and check the original table.",
          ),
        );
      if (fresh.parent !== parent)
        throw new Error(
          t("Content position changed elsewhere. Check the note in RemNote."),
        );
      return this.row(fresh, fields);
    } finally {
      this.locks.delete(key);
    }
  }
  private validateValue(field: Field, next: Cell) {
    if (next.richText) throw new Error(t("Edit rich text in RemNote."));
    if (field.type === "single_select" || field.type === "multi_select") {
      if (
        (field.type === "single_select" && next.refs.length > 1) ||
        (!next.refs.length && next.text.trim())
      )
        throw new Error(t("Select an option from the original table."));
      if (
        new Set(next.refs).size !== next.refs.length ||
        next.refs.some((id) => !field.choices.some((c) => c.id === id))
      )
        throw new Error(t("Target option was deleted. Refresh the view."));
      return;
    }
    if (!["text", "0", "number", "url"].includes(field.type))
      throw new Error(t("Edit this property in RemNote."));
    if (next.refs.length)
      throw new Error(t("This property doesn't accept option references."));
    if (
      field.type === "number" &&
      next.text.trim() &&
      !Number.isFinite(Number(next.text))
    )
      throw new Error(t("Enter a valid number."));
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
    const recordName = name.trim() || t("Untitled");
    const tag = await this.plugin.rem.findOne(tagId);
    if (!tag) throw new Error(t("Database was deleted. Refresh the view."));
    const fields = await this.sourceFields(tag);
    for (const [id, value] of Object.entries(cells)) {
      const field = fields.find((f) => f.id === id);
      if (!field)
        throw new Error(
          t("Properties changed. Refresh before creating a record."),
        );
      this.validateValue(field, value);
    }
    const rem = await this.plugin.rem.createRem();
    if (!rem) throw new Error(t("Could not create record. Try again."));
    try {
      await rem.setParent(tagId);
      await rem.setText([recordName]);
      await rem.addTag(tagId);
      for (const [id, value] of Object.entries(cells))
        await rem.setTagPropertyValue(id, await this.rawValue(value));
      const fresh = await this.plugin.rem.findOne(rem._id);
      if (
        !fresh ||
        !(await fresh.getTagRems()).some((t) => t._id === tagId) ||
        fresh.parent !== tagId
      )
        throw new Error(t("Could not verify new record"));
      const saved = await this.row(fresh, fields);
      if (
        saved.name !== recordName ||
        Object.entries(cells).some(
          ([id, value]) => !sameCell(saved.cells[id], value),
        )
      )
        throw new Error(t("Could not verify property"));
      return saved;
    } catch (e) {
      throw new Error(
        t(
          "Record created ({p0}), but setup didn't finish. Check the note in RemNote before creating another. {p1}",
          { p0: rem._id, p1: String(e) },
        ),
      );
    }
  }
  async rename(
    tagId: string,
    rowId: string,
    expectedName: string,
    name: string,
  ): Promise<Row> {
    if (this.locks.has(rowId))
      throw new Error(t("Saving record, please wait."));
    this.locks.add(rowId);
    try {
      const tag = await this.plugin.rem.findOne(tagId),
        rem = await this.plugin.rem.findOne(rowId);
      if (
        !tag ||
        !rem ||
        !(await rem.getTagRems()).some((t) => t._id === tagId)
      )
        throw new Error(t("Record is no longer in this database."));
      if (rem.text?.some((p) => typeof p !== "string"))
        throw new Error(t("Name contains rich text. Edit it in RemNote."));
      if ((await this.title(rem)) !== expectedName)
        throw new Error(t("Name was modified elsewhere. Refresh the view."));
      const parent = rem.parent;
      await rem.setText([name]);
      const fresh = await this.plugin.rem.findOne(rowId);
      if (
        !fresh ||
        (await this.title(fresh)) !== name ||
        fresh.parent !== parent
      )
        throw new Error(t("Could not confirm name update."));
      return this.row(fresh, await this.fields(tag));
    } finally {
      this.locks.delete(rowId);
    }
  }
  async open(id: string): Promise<void> {
    const rem = await this.plugin.rem.findOne(id);
    if (!rem) throw new Error(t("Original note not found."));
    await this.plugin.window.openRem(rem);
  }
}
