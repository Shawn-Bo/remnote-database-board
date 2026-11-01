import type {Config} from './model';
import type {BoardOpening} from './views';
// RemNote puts both Popup and Pane data under contextData.
export function readPaneContext(context: unknown): {config: Partial<Config>; rowScope?: string[]; openingBoard?: BoardOpening} {
  const data = (context && typeof context === 'object' && 'contextData' in context) ? context.contextData : undefined;
  const raw = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const config: Partial<Config> = {};
  for (const key of ['tagId', 'groupFieldId', 'filterFieldId', 'recordFieldId'] as const) if (typeof raw[key] === 'string') config[key] = raw[key];
  return {
    config,
    rowScope: Array.isArray(raw.rowScope) ? [...new Set(raw.rowScope.filter((x): x is string => typeof x === 'string'))] : undefined,
    ...(raw.openAsBoard === true ? {openingBoard: {groupFieldId: config.groupFieldId}} : {}),
  };
}
