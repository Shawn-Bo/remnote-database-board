import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../src/i18n";
import { SdkBoardPort, references } from "../src/sdk-port";
import { inferConfig } from "../src/model";
import type { Snapshot, WriteRequest } from "../src/model";
import fixture from "../src/demo-snapshot.json";
afterEach(() => setLanguage("en"));

function setup() {
  const data: Snapshot = structuredClone(fixture);
  const nodes = new Map<string, any>();
  const writes: { row: string; field: string; raw: any }[] = [];
  const strings = (raw: any): string =>
    (raw ?? [])
      .map((v: any) =>
        typeof v === "string" ? v : (nodes.get(v._id)?.text.join("") ?? ""),
      )
      .join("");
  const tag = {
    _id: data.tagId,
    text: [data.name],
    getChildrenRem: async () => data.fields.map((f) => nodes.get(f.id)),
    taggedRem: async () => data.rows.map((r) => nodes.get(r.id)),
  };
  nodes.set(tag._id, tag);
  for (const f of data.fields) {
    nodes.set(f.id, {
      _id: f.id,
      text: [f.name],
      isProperty: async () => true,
      getPropertyType: async () => f.type,
      getChildrenRem: async () => f.choices.map((c) => nodes.get(c.id)),
      getPowerupPropertyAsRem: async () => undefined,
    });
    for (const c of f.choices)
      nodes.set(c.id, {
        _id: c.id,
        text: [c.name],
        isProperty: async () => false,
      });
  }
  for (const row of data.rows) {
    const values: Record<string, any> = {};
    for (const [key, c] of Object.entries(row.cells))
      values[key] = c.refs.length
        ? c.refs.map((id) => ({ i: "q", _id: id }))
        : c.text
          ? [c.text]
          : undefined;
    nodes.set(row.id, {
      _id: row.id,
      text: [row.name],
      parent: row.parentId,
      getTagRems: async () => [tag],
      getTagPropertyValue: vi.fn(async (id: string) => values[id]),
      setTagPropertyValue: vi.fn(async (id: string, raw: any) => {
        writes.push({ row: row.id, field: id, raw });
        values[id] = raw;
      }),
      values,
    });
  }
  const plugin: any = {
    rem: { findOne: async (id: string) => nodes.get(id) },
    richText: {
      toString: async (raw: any) => strings(raw),
      rem: (id: string) => ({ value: async () => [{ i: "q", _id: id }] }),
    },
    window: { openRem: vi.fn(async () => {}) },
  };
  const port = new SdkBoardPort(plugin);
  const config = inferConfig(data);
  const request: WriteRequest = {
    config,
    rowId: data.rows[0].id,
    fieldId: config.groupFieldId,
    expected: data.rows[0].cells[config.groupFieldId],
    value: {
      text: data.fields[1].choices[1].name,
      refs: [data.fields[1].choices[1].id],
    },
  };
  return { data, nodes, writes, plugin, port, config, request };
}
describe("public SDK property write adapter", () => {
  it("loads native image cells without sending incompatible image payloads to the text converter", async () => {
    const { port, data, nodes, plugin, request, writes } = setup();
    const fieldId = "image-field";
    data.fields.push({
      id: fieldId,
      name: "Score image",
      type: "text",
      choices: [],
    });
    nodes.set(fieldId, {
      _id: fieldId,
      text: ["Score image"],
      isProperty: async () => true,
      getPropertyType: async () => "text",
      getChildrenRem: async () => [],
    });
    // A real native image uses percent: 0; the public SDK only accepts
    // 5/25/50/100. It must remain intact when other fields are changed.
    const raw = [
      "",
      {
        i: "i",
        url: "%LOCAL_FILE%score.png",
        title: "Score image",
        percent: 0,
        width: 1052,
        height: 387,
        drawingData: { items: [] },
      },
      "",
    ];
    nodes.get(request.rowId).values[fieldId] = raw;
    const before = structuredClone(raw);
    const convert = plugin.richText.toString;
    plugin.richText.toString = vi.fn(async (value: any) => {
      if (value.some((part: any) => part?.i === "i" && part.percent === 0))
        throw new Error("richText.toString richText parameter: Invalid input");
      return convert(value);
    });
    const loaded = await port.load(data.tagId);
    expect(loaded.rows[0].cells[fieldId]).toEqual({
      text: "",
      refs: [],
      richText: before,
    });
    const sdkImage = plugin.richText.toString.mock.calls
      .flatMap(([value]: any[]) => value)
      .find((part: any) => part?.i === "i");
    expect(sdkImage).toMatchObject({
      i: "i",
      url: "%LOCAL_FILE%score.png",
      width: 1052,
      height: 387,
      drawingData: { items: [] },
    });
    expect(sdkImage).not.toHaveProperty("percent");
    const saved = await port.write(request);
    expect(saved.cells[fieldId].richText).toEqual(before);
    expect(nodes.get(request.rowId).values[fieldId]).toEqual(before);
    expect(writes).toHaveLength(1);
    expect(writes[0].field).toBe(request.fieldId);
  });
  it("keeps text and reference previews when an untitled image occurs in a row title or mixed cell", async () => {
    const { port, data, nodes, plugin } = setup();
    const row = nodes.get(data.rows[0].id);
    const option = data.fields[0].choices[0];
    row.text = [
      "Section ",
      { i: "i", url: "%LOCAL_FILE%title.png", percent: 0 },
    ];
    row.values[data.fields[2].id] = [
      "Notes ",
      { i: "i", url: "%LOCAL_FILE%score.png", percent: 0 },
      " ",
      { i: "q", _id: option.id },
    ];
    const convert = plugin.richText.toString;
    plugin.richText.toString = vi.fn(async (value: any) => {
      if (value.some((part: any) => part?.i === "i" && part.percent === 0))
        throw new Error("invalid image");
      return convert(value);
    });
    const loaded = await port.load(data.tagId);
    expect(loaded.rows[0].name).toBe("Section ");
    expect(loaded.rows[0].title?.richText).toEqual(row.text);
    expect(loaded.rows[0].cells[data.fields[2].id]).toEqual({
      text: `Notes  ${option.name}`,
      refs: [option.id],
      richText: row.values[data.fields[2].id],
    });
  });
  it("preserves supported image sizes and refuses to replace an image record with plain text", async () => {
    const { port, data, nodes, plugin, request, writes } = setup();
    const raw = [
      {
        i: "i",
        url: "%LOCAL_FILE%score.png",
        percent: 50,
        width: 400,
        height: 200,
      },
    ];
    request.fieldId = request.config.recordFieldId;
    nodes.get(request.rowId).values[request.fieldId] = raw;
    const convert = plugin.richText.toString;
    plugin.richText.toString = vi.fn(convert);
    const loaded = await port.load(data.tagId);
    request.expected = loaded.rows[0].cells[request.fieldId];
    request.value = { text: "Replacement text", refs: [] };
    expect(
      plugin.richText.toString.mock.calls.some(
        ([value]: any[]) => value[0] === raw[0],
      ),
    ).toBe(true);
    await expect(port.write(request)).rejects.toThrow("rich text");
    expect(writes).toEqual([]);
    expect(nodes.get(request.rowId).values[request.fieldId]).toEqual(raw);
  });
  it("loads all rows, property options and a current-table subset", async () => {
    const { port, data } = setup();
    expect((await port.load(data.tagId)).rows).toHaveLength(9);
    expect(
      (await port.load(data.tagId, [data.rows[2].id])).rows.map((r) => r.id),
    ).toEqual([data.rows[2].id]);
    expect((await port.load(data.tagId, [])).rows).toHaveLength(0);
  });
  it("writes only proficiency, reads it back, and preserves identity, parent and record", async () => {
    const { port, request, data, writes } = setup();
    const saved = await port.write(request);
    expect(writes).toEqual([
      {
        row: request.rowId,
        field: request.fieldId,
        raw: [{ i: "q", _id: request.value.refs[0] }],
      },
    ]);
    expect(saved.parentId).toBe(data.rows[0].parentId);
    expect(saved.cells[request.config.recordFieldId]).toEqual(
      data.rows[0].cells[request.config.recordFieldId],
    );
    expect(saved.id).toBe(request.rowId);
  });
  it("saves and reads back progress text independently", async () => {
    const { port, request, data, writes } = setup();
    request.fieldId = request.config.recordFieldId;
    request.expected = data.rows[0].cells[request.fieldId];
    request.value = {
      text: "Eight slow repetitions\nPositioning improved",
      refs: [],
    };
    const saved = await port.write(request);
    expect(saved.cells[request.fieldId]).toEqual(request.value);
    expect(writes).toHaveLength(1);
  });
  it("refuses stale edits before writing", async () => {
    const { port, request, nodes, writes } = setup();
    nodes.get(request.rowId).values[request.fieldId] = [
      "Changed in another window",
    ];
    await expect(port.write(request)).rejects.toThrow("modified elsewhere");
    expect(writes).toHaveLength(0);
  });
  it("refuses deleted options and records no longer in this database", async () => {
    const a = setup();
    a.data.fields[1].choices = a.data.fields[1].choices.filter(
      (c) => c.id !== a.request.value.refs[0],
    );
    await expect(a.port.write(a.request)).rejects.toThrow("option was deleted");
    expect(a.writes).toHaveLength(0);
    const b = setup();
    b.nodes.get(b.request.rowId).getTagRems = async () => [];
    await expect(b.port.write(b.request)).rejects.toThrow("no longer in");
    expect(b.writes).toHaveLength(0);
  });
  it("does not treat an unconfirmed write as success", async () => {
    const { port, request, nodes } = setup();
    nodes.get(request.rowId).setTagPropertyValue = async () => {};
    await expect(port.write(request)).rejects.toThrow("Could not confirm");
  });
  it("unlocks a failed row for retry", async () => {
    const { port, request, nodes } = setup();
    const row = nodes.get(request.rowId);
    const original = row.setTagPropertyValue;
    row.setTagPropertyValue = async () => {
      throw new Error("offline");
    };
    await expect(port.write(request)).rejects.toThrow("offline");
    row.setTagPropertyValue = original;
    await expect(port.write(request)).resolves.toMatchObject({
      id: request.rowId,
    });
  });
  it("rejects a second in-flight change to the same row", async () => {
    const { port, request } = setup();
    const first = port.write(request);
    await expect(port.write(request)).rejects.toThrow("Saving record");
    await first;
  });
  it("opens original Rem through public SDK", async () => {
    const { port, request, plugin } = setup();
    await port.open(request.rowId);
    expect(plugin.window.openRem.mock.calls[0][0]._id).toBe(request.rowId);
  });
  it("ignores unrelated image and hyperlink IDs", () => {
    expect(
      references([
        "x",
        { i: "q", _id: "option" },
        { i: "img", _id: "image" },
        { i: "a", _id: "url" },
      ]),
    ).toEqual(["option"]);
  });
  it("edits an arbitrary native single-select, not only the legacy proficiency field", async () => {
    const { port, request, data, writes } = setup();
    const field = data.fields[3];
    request.fieldId = field.id;
    request.expected = data.rows[0].cells[field.id];
    request.value = {
      text: field.choices[1].name,
      refs: [field.choices[1].id],
    };
    const saved = await port.write(request);
    expect(saved.cells[field.id]).toEqual(request.value);
    expect(saved.cells[request.config.groupFieldId]).toEqual(
      data.rows[0].cells[request.config.groupFieldId],
    );
    expect(writes).toHaveLength(1);
  });
  it("refuses malformed numbers and writes valid values without changing other properties", async () => {
    const { port, request, data, writes, nodes } = setup();
    const field = { id: "amount", name: "Amount", type: "number", choices: [] };
    data.fields.push(field);
    nodes.set(field.id, {
      _id: field.id,
      text: [field.name],
      isProperty: async () => true,
      getPropertyType: async () => field.type,
      getChildrenRem: async () => [],
    });
    request.fieldId = field.id;
    request.expected = { text: "", refs: [] };
    request.value = { text: "not a number", refs: [] };
    await expect(port.write(request)).rejects.toThrow("valid number");
    expect(writes).toHaveLength(0);
    request.value = { text: "0", refs: [] };
    expect((await port.write(request)).cells[field.id]).toEqual(request.value);
    expect(writes).toHaveLength(1);
  });
  it.each(["New record", ""])(
    "creates a tagged Rem named %j and verifies it across a language change",
    async (name) => {
      const { port, plugin, nodes, data } = setup();
      const tag = nodes.get(data.tagId);
      const values: Record<string, any> = {};
      const fresh: any = {
        _id: "new-row",
        text: [],
        parent: null,
        getTagRems: async () => [tag],
        setText: async (raw: any) => {
          fresh.text = raw;
          setLanguage("zh-CN");
        },
        setParent: async (id: string) => {
          fresh.parent = id;
        },
        addTag: vi.fn(async () => {}),
        getTagPropertyValue: async (id: string) => values[id],
        setTagPropertyValue: async (id: string, raw: any) => {
          values[id] = raw;
        },
      };
      plugin.rem.createRem = vi.fn(async () => {
        nodes.set(fresh._id, fresh);
        return fresh;
      });
      const choice = data.fields[0].choices[1];
      const result = await port.create(data.tagId, name, {
        [data.fields[0].id]: { text: choice.name, refs: [choice.id] },
      });
      expect(result).toMatchObject({
        id: "new-row",
        name: name || "Untitled",
        parentId: data.tagId,
      });
      expect(fresh.addTag).toHaveBeenCalledWith(data.tagId);
      expect(result.cells[data.fields[0].id].refs).toEqual([choice.id]);
    },
  );
  it("validates create properties before creating any Rem", async () => {
    const { port, plugin, data } = setup();
    plugin.rem.createRem = vi.fn();
    await expect(
      port.create(data.tagId, "bad", { gone: { text: "x", refs: [] } }),
    ).rejects.toThrow("Properties changed");
    expect(plugin.rem.createRem).not.toHaveBeenCalled();
  });
  it("opens an empty native tag but never converts an ordinary document into a database", async () => {
    const { port, plugin, nodes, data } = setup();
    const tag = nodes.get(data.tagId);
    tag.getChildrenRem = async () => [];
    tag.taggedRem = async () => [];
    tag.hasPowerup = async () => true;
    expect((await port.load(data.tagId)).rows).toEqual([]);
    tag.hasPowerup = async () => false;
    plugin.rem.createRem = vi.fn();
    await expect(port.create(data.tagId, "no implicit tag")).rejects.toThrow(
      "valid table or tag",
    );
    expect(plugin.rem.createRem).not.toHaveBeenCalled();
  });
});
