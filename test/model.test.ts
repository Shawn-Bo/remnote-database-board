import { describe, expect, it } from "vitest";
import {
  EMPTY,
  UNKNOWN,
  cellForChoice,
  groupKey,
  groupedRows,
  inferConfig,
  parseRemId,
  visibleRows,
} from "../src/model";
import type { Snapshot } from "../src/model";
import fixture from "../src/demo-snapshot.json";

describe("database grouping uses original row and option identities", () => {
  const snapshot: Snapshot = structuredClone(fixture);
  const config = inferConfig(snapshot);
  const field = snapshot.fields[1];
  it("infers proficiency, song and record from real native table schema", () => {
    expect(config).toEqual({
      tagId: snapshot.tagId,
      groupFieldId: field.id,
      filterFieldId: snapshot.fields[0].id,
      recordFieldId: snapshot.fields[2].id,
    });
  });
  it("puts every row in exactly one group across nine native choices", () => {
    const groups = groupedRows(snapshot.rows, field);
    expect(groups.size).toBe(11);
    expect(
      [...groups.values()]
        .flat()
        .map((r) => r.id)
        .sort(),
    ).toEqual(snapshot.rows.map((r) => r.id).sort());
    for (const c of field.choices) expect(groups.get(c.id)).toHaveLength(1);
  });
  it("does not lose unknown or empty values", () => {
    expect(groupKey({ text: "", refs: [] }, field)).toBe(EMPTY);
    expect(groupKey({ text: "Old option", refs: ["deleted"] }, field)).toBe(
      UNKNOWN,
    );
    expect(
      groupKey({ text: field.choices[0].name, refs: ["deleted"] }, field),
    ).toBe(UNKNOWN);
  });
  it("distinguishes same-name options by ID and rejects ambiguous text", () => {
    const f = {
      ...field,
      choices: [
        { id: "a", name: "Same name" },
        { id: "b", name: "Same name" },
      ],
    };
    expect(groupKey({ text: "Same name", refs: ["b"] }, f)).toBe("b");
    expect(groupKey({ text: "Same name", refs: [] }, f)).toBe(UNKNOWN);
  });
  it("filters by song without changing original row IDs or parents", () => {
    const result = visibleRows(snapshot, config, "Ocean Lights", "");
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.parentId === snapshot.tagId)).toBe(true);
    expect(
      visibleRows(snapshot, config, "*", "09. Full arrangement")[0].id,
    ).toBe(snapshot.rows[8].id);
  });
  it("rejects unknown destinations and supports clearing the single-select", () => {
    expect(() => cellForChoice("deleted", field)).toThrow();
    expect(cellForChoice(EMPTY, field)).toEqual({ text: "", refs: [] });
  });
  it("accepts RemNote links and refuses unrelated URLs", () => {
    expect(parseRemId("https://www.remnote.com/w/kb/AbCd123")).toBe("AbCd123");
    expect(() => parseRemId("https://example.com/AbCd123")).toThrow();
  });
});
