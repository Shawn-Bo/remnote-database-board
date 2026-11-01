# Development & Deployment

## Local Build

Requires Node.js 22 or newer:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run serve
```

Build artifacts are written to `dist/` and `PluginZip.zip`. Load the local build in RemNote via **Settings → Plugins → Build → Develop from localhost** using `http://localhost:8081`.

To publish, upload `PluginZip.zip` under **Settings → Plugins → Build → Upload Plugin** and publish the matching source to the GitHub repository linked in the manifest. Marketplace copy is read from the root `README.md`.

## Interactive Verification

Run the isolated preview with synthetic demo data on a separate port:

```sh
BOARD_PORT=8083 npm run serve
```

Open `http://localhost:8083/preview.html`. The `test:browser`, `test:mobile`, and `test:touch` scripts run interactive checks against this preview. Native editor behavior, device installation, and cross-device sync are verified in the RemNote client; see [Validation Record](notion-database-experience.md).

## Data & Editing Architecture

- **Data source**: Uses the underlying tag, properties, and records of an Advanced Table. Opening from a table preserves its row scope; **View settings → Data source → Show all database records** expands the scope to all records under the tag. Data source and row scope are shared across views.
- **View configuration**: Layout, visible properties, column widths, filters, sorts, grouping, and manual card order are stored per view using RemNote's synced plugin storage.
- **Localization**: Defaults to English UI and demo data. The **RemNote Settings > Plugin Settings > Database Board > Language** preference switches between English and Simplified Chinese for plugin UI and command labels without altering user notes or property names.
- **Property editing**: Single-select, plain text, number, and URL properties are editable directly in the table. Rich text, multi-select, date, and other property types are edited via the native note sidebar. Writes validate the target record, property, option, and prior value before saving, followed by a read-back check.
- **New records**: Clicking **New** creates a Rem under the database tag, pre-fills properties from supported equality filters and the target board column, and opens its native note. If a multi-step creation partially fails, the created Rem ID is returned for recovery.
- **Native content**: The sidebar renders full notes through the SDK `DocumentViewer`, delegating save and sync to RemNote. Images render as native RichText; parameter stripping used for plain-text extraction only runs on temporary clones.
- **Permissions & networking**: Uses the public SDK with `All / ReadCreateModify` permissions. Note content is handled by RemNote, while the local server serves static plugin assets on `127.0.0.1:8081`.

Concurrent edits use prior-value checks and read-back verification; multi-step SDK write atomicity and server sync depend on the host client.

## Compatibility & Roadmap

| Area                   | Status / Implementation                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Plugin window          | Near-fullscreen popup; used because the RemNote 1.28.62 pane parser rejects the SDK `widget~` prefix                   |
| Desktop note sidebar   | Side-by-side database view and full native note editor                                                                 |
| Narrow viewport layout | Full-width native note; minimum 44px touch targets; verified in mobile-sized preview                                   |
| iPhone                 | Physical device installation, touch interaction, and cross-device sync pending verification                            |
| Planned layouts        | Calendar, timeline, and grouped table views                                                                            |
| Planned configuration  | Nested filter groups, direct editing for additional property types, and schema designer                                |
| SDK dependency         | Zod is affected by GHSA-mrhx-c7xc-m3w5 (oversized invalid arrays may exhaust memory); tracking upstream compatible fix |

## Desktop Deployment Bundle

The deployment bundle includes prebuilt plugin assets and launcher scripts. Run `Install-Mac.command` on macOS or `Start-Windows.cmd` on Windows, then load the plugin via RemNote's localhost development entry.

The macOS installer stops any previous service, starts and verifies the new build, cleans up older runtime directories created by this plugin, and rolls back to the previous service if startup fails. Health status is served at `http://localhost:8081/__board_health`.
