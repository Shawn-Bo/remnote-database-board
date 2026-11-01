import type { Config, Snapshot } from "./model";
import { defaultViews } from "./views";

// Synthetic layout cases belong to the standalone preview, never the plugin.
export function longGroups(data: Snapshot, initial: Config): Config {
  const field = data.fields.find((f) => f.id === initial.groupFieldId)!;
  const names = [
    "Learning the hand position",
    "Playing each phrase slowly with an even rhythm",
    "Moving smoothly between difficult positions",
    "Keeping a steady tempo through the entire section",
    "Playing from memory without looking at the score",
    "Repeating the whole passage eight times without stopping",
    "Maintaining the melody while changing the bass line",
    "Returning to the original tempo after a difficult transition",
    "Ready to practise as part of the complete song",
  ];
  field.choices.forEach((choice, index) => {
    choice.name = names[index];
  });
  data.rows.forEach((row, index) => {
    const choice = field.choices[index < 3 ? 0 : index < 6 ? 1 : index - 4];
    row.cells[field.id] = { text: choice.name, refs: [choice.id] };
  });
  const config = { ...initial, viewState: defaultViews(data, initial) };
  const view = config.viewState.views[1];
  config.viewState.activeViewId = view.id;
  view.hideEmptyGroups = true;
  view.collapsedGroups = field.choices.slice(2).map((c) => c.id);
  return config;
}
