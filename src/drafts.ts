import type { Cell } from "./model";

export interface Draft {
  base: Cell;
  text: string;
}
export interface LegacyDraftReader {
  get(key: string): Promise<Draft | undefined>;
}
export const draftKey = (tag: string, row: string, field: string) =>
  `database-board:draft:v1:${JSON.stringify([tag, row, field])}`;

// Read old drafts without overwriting, deleting, or auto-applying them. New
// editing uses RemNote's own editor and has no separate plugin draft copy.
export function legacyDraftReader(
  get: (key: string) => Promise<unknown>,
): LegacyDraftReader {
  return {
    async get(key) {
      const value = (await get(key)) as Partial<Draft> | null | undefined;
      if (!value) return undefined;
      if (
        typeof value.text !== "string" ||
        typeof value.base?.text !== "string" ||
        !Array.isArray(value.base.refs) ||
        value.base.refs.some((id) => typeof id !== "string")
      )
        throw new Error("旧版草稿无法读取");
      return {
        text: value.text,
        base: { text: value.base.text, refs: [...value.base.refs] },
      };
    },
  };
}
