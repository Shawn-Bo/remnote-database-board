import zh from "./locales/zh-CN.json";

export type Language = "en" | "zh-CN";
export const LANGUAGE_SETTING = "interface-language";
export const languages = [
  { key: "en", value: "en", label: "English" },
  { key: "zh-CN", value: "zh-CN", label: "\u7b80\u4f53\u4e2d\u6587" },
];
let language: Language = "en";
const listeners = new Set<() => void>();
export const normalizeLanguage = (value: unknown): Language =>
  value === "zh-CN" ? "zh-CN" : "en";
export const getLanguage = () => language;
export function setLanguage(value: unknown) {
  const next = normalizeLanguage(value);
  if (language === next) return;
  language = next;
  listeners.forEach((listener) => listener());
}
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function translate(
  locale: Language,
  message: string,
  values: Record<string, string | number | undefined> = {},
) {
  const text =
    locale === "zh-CN"
      ? ((zh as Record<string, string>)[message] ?? message)
      : message;
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key] ?? "")
      : placeholder,
  );
}
export const t = (
  message: string,
  values?: Record<string, string | number | undefined>,
) => translate(language, message, values);
