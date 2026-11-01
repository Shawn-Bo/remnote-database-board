# Changelog

## 0.3.8 · 2026-11-01

- **Readable hidden groups**: Replaced overflowing vertical collapsed columns with a horizontal list of names, counts, and restore controls. Previously collapsed groups keep their saved visibility.
- **Group menu**: Create a page in a group, hide the group, or open its settings from the column menu. Hidden groups still accept dragged cards.
- **Clean product commands**: Keep only board-opening commands in RemNote; enforce developer-preview isolation during builds and an explicit command allowlist in tests.
- **Board product standard**: Documented current capabilities, gaps, priorities, and realistic acceptance scenarios.

## 0.3.7 · 2026-11-01

- **Automatic desktop updates**: Check GitHub Releases on startup and hourly, verify downloads, switch to the new plugin, and remove older update caches.
- **Mac installer permissions**: Preserve executable permissions in the deployment ZIP and verify them after extraction.

## 0.3.6 · 2026-11-01

- **English default & language setting**: Added English as the default UI and demo data language, with an English / Simplified Chinese preference in **RemNote Settings > Plugin Settings > Database Board > Language**.

## 0.3.5 · 2026-11-01

- **Table and Board views**: Save independent filters, sorts, grouping, visible properties, and column widths per view.
- **Drag-and-drop & queries**: Drag cards across columns to update grouping properties, with multi-condition filters, multi-property sorts, and manual card ordering.
- **Table column menus**: Click column headers to filter, sort, or hide properties, and drag column borders to resize.
- **Clean blank cells**: Leave empty cells blank until clicked to select an option or enter text.
- **Native note sidebar**: Click any record to open the full native note and edit body content, tags, properties, and images alongside the database.
- **Quick entry points**: Open a board from the Advanced Table header or property column menu, and jump straight into the native note when creating a record with **New**.
