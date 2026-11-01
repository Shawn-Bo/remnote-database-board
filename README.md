# RemNote Database Board

A database interface for existing RemNote advanced tables, with Notion-inspired table and board views, saved filters, sorting, and direct editing of the original records. No duplicate database is created.

## Use

1. Focus the advanced-table node itself and click **打开看板** below its title. For an embedded table, first use its **以完整页面打开** button. The launcher belongs only to the table node; enclosing documents and ordinary notes do not gain database controls. It re-reads the selected table and preserves its current row scope. You can also open **数据库看板** from RemNote's command menu, or **以看板打开** from an advanced-table property menu. The latter opens a board even when the last view was a table; a single-select column becomes the grouping property. Existing filters and sorts are retained. If necessary, connect using the table's underlying tag link or ID.
2. Switch between **表格** and **看板**. Use **+** to create another view. Each view saves its own layout, displayed properties, filters, sorts, and board grouping. View settings also let you rename, duplicate, or delete a view.
3. Use the toolbar to search, combine filters with **所有 / 任一**, and apply multiple ordered sort rules. Select values use the original option IDs. Numbers sort numerically; empty values stay last. Board settings control grouping, hidden or collapsed groups, card size, and image previews.
4. Drag a card to change its grouping property. Without explicit sorting, dragging also sets its position within that view. On touch screens, drag from the handle; swipe elsewhere to scroll. Open a card or use the table to edit single-select, plain-text, number, and URL properties. **新建** creates an original RemNote record under the database tag; supported equality filters and the chosen board column prefill its properties.
5. Click a record to open its full native RemNote page in the side panel, including the title, tags, properties and children. The embedded `DocumentViewer` edits the original Rem directly. There is no copied note body or plugin **保存记录** step. On desktop, the database remains usable beside the native page: change views, filter, sort, or click another record without closing it. On narrow screens the note fills the available width; closing it returns to the existing view. The arrow opens the same Rem in the main RemNote workspace.

Image properties retain their original contents and use RemNote's native RichText renderer in cards and table cells. The open-note panel uses RemNote's full document editor, with its own native scrolling and editing controls. Native image metadata such as `percent: 0` is omitted only from a temporary text-extraction copy; the original image payload is preserved.

Opening from a table property menu starts with that table's current row IDs. Refresh preserves this subset, and records created here join it. **视图设置 → 数据源 → 显示数据库全部记录** includes all tagged records. Connecting another database clears the prior subset.

View settings use RemNote's synced plugin storage. Native note edits use RemNote's normal saving and synchronization. Real cross-device synchronization and installation must be checked on the target RemNote client; a responsive preview does not prove an iPhone installation works. RemNote plugins require an online client.

## Data and privacy

- Uses RemNote's public SDK; no external APIs, telemetry, or analytics receive note content, IDs, or credentials.
- Requires `All / ReadCreateModify` to access arbitrary existing table properties. It reads the selected tag, properties, options, and records. Explicit edits update original property values; **新建** creates a record under the selected tag. It does not delete, reparent existing records, or duplicate a database.
- Before writes, it checks database membership, property and option identity, and the expected prior value. Afterward, it reads back the value and verifies the record's parent. SDK writes are not atomic across simultaneous edits, and client readback is not confirmation of server synchronization.
- Rich or structured values remain available in the original note. Plain-text editing cannot overwrite image, reference, or formatted content. Multi-select and date fields are displayed and can participate in queries; edit these types in the original note in this release.
- A partially completed create reports the new Rem ID so the user can inspect it instead of blindly creating duplicates.
- Demo data is synthetic and excluded from the installable plugin. Private reference screenshots are not included in the source repository.

## Development

Node.js 22 or later:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run serve
```

The build produces `PluginZip.zip`. `dist/preview.html` is an isolated fixture and does not access a RemNote account. The plugin opens at near-window size (full width on phones), with host-scoped sizing to avoid a small iframe sizing loop. It uses a popup because the tested RemNote 1.28.62 pane parser rejects the SDK's `widget~` pane prefix.

For isolated browser checks, serve the development build on port 8083 with `BOARD_PORT=8083 npm run serve`. The `test:browser`, `test:mobile`, and `test:touch` commands target that fixture; the installed plugin service on 8081 deliberately excludes preview files. These checks do not validate the embedded native editor or a real iPhone installation.

## Release scope

Version 0.3.3 adds a visible launch button on the advanced-table node itself, below its title. It keeps the database interactive beside RemNote's full native record page on desktop, and uses a full-width note on phones. It includes the 0.3.0 table and board views, compound filters, multi-property sorts, per-view configuration, card ordering, and original-property writes. Calendar, timeline, nested filter groups, table grouping, column resizing, and schema creation are deferred. It is not an implementation of Notion's collaboration backend or its full feature set.

Validation and remaining device limitations are recorded in `docs/notion-database-experience.md`. This repository is unlisted; unlisted status is not a privacy boundary for source code.
