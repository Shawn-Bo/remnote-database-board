import type { RNPlugin, RichTextInterface } from "@remnote/plugin-sdk";

export async function displayRichText(
  plugin: RNPlugin,
  value: RichTextInterface | undefined,
): Promise<string> {
  // Native percent: 0 means an explicit pixel size, but the SDK input schema
  // only accepts 5/25/50/100. Normalize the text-extraction copy only.
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
  return input.length ? await plugin.richText.toString(input) : "";
}
