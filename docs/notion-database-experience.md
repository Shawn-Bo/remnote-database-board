# Notion-Style Database Experience: Validation Record

Prior native-client validation: 0.3.5 (2026-11-01) on RemNote 1.29.1. Current release: 0.3.8 (2026-11-01).

Modeled on [Notion Views, Filters, and Sorts](https://www.notion.com/help/views-filters-and-sorts), [Boards](https://www.notion.com/help/boards), and [Tables](https://www.notion.com/help/tables), implementing **Table** and **Board** layouts, per-view configuration, direct property editing, and the native note sidebar.

## 0.3.8 Group Interaction

- Typechecking, 94 plugin tests, and 23 desktop tests pass. The production build rejects imports of developer fixtures and preview modules.
- Browser preview verified long labels, seven hidden groups, hide/restore menus, a real pointer drag into a hidden group, updated counts, and persistence after reload.
- At 390 × 844, horizontal scrolling reaches the hidden groups; the page itself does not overflow horizontally; group menus and restore controls are at least 44px high.
- Regression tests cover legacy collapsed-group settings, CJK labels, restoring empty groups, and preserving the note parent and unrelated properties when dropping into a hidden group.
- Installed 0.3.8 locally, verified all 15 served file digests, and removed the previous runtime. After reloading RemNote, its command menu exposed only the two board-opening commands for this plugin.
- This checks layout at a phone-sized viewport, not physical iPhone installation or native mobile editing.

## 0.3.7 Desktop Updates

- Typechecking, 91 plugin tests, and 23 desktop tests pass.
- Tests cover update integrity, offline operation, restart persistence, rejected downgrades, cache cleanup, and installation rollback.
- The generated deployment ZIP was extracted with macOS `ditto`; both `.command` launchers retain mode `0755` and execute successfully.
- Installed the real extracted bundle, verified all 15 served file digests, and confirmed the old runtime was removed.
- Static plugin updates switch the active in-memory snapshot while keeping the serving process running. The runtime checks at startup and hourly.

## 0.3.6 Localization Scope

Release 0.3.6 switches the default UI and synthetic demo data to English and adds an English / Simplified Chinese preference under **RemNote Settings > Plugin Settings > Database Board > Language**. This setting updates plugin UI and command labels (`Open board`, `Open as board`, `Table`, `Board`, `View settings`, `New`, `Database Board`, `Open recent board`) without modifying user notes or property names.

## Completed Validation (0.3.6)

- Verified the English Guitar Practice demo in the browser.
- Switched the native RemNote plugin from English to Simplified Chinese and back through its Language preference; the table launcher and database toolbar updated correctly.
- Reloaded the native client with the final build and verified English Table / Board labels for previously saved default views.
- Verified all 15 served files against release digests after installation; the previous runtime was removed.

## Completed Validation (0.3.5)

| Area                       | Result                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data source & entry points | Advanced Tables display **Open board** and update on page navigation; native filtered 3-row scope is preserved when opening the board                  |
| Filters, sorts & views     | Project filtering and name sorting return expected records; view config and order persist across reopen; other views remain independent                |
| Board drag-and-drop        | Moving a card across columns in a native table updates the underlying grouping property on MCP read-back while leaving other records unchanged         |
| Native note sidebar        | Renders title, tags, properties, images, and body; typing updates the underlying Rem on read-back while the database remains interactive               |
| New record creation        | Clicking **New** opens the native note immediately, inherits board grouping and supported equality filters, and creates a single record per submission |
| Column widths & menus      | Dragging the Name column from 200px to 320px, sorting, and filtering via column menus persist across reopen; menus stay within the database bounds     |
| Image rendering            | Native cover images and musical score examples render intact; menus only overlay intersecting areas and restore the full image on close                |
| Blank cells                | Empty single-select and text cells render blank and open the option picker or text input when clicked                                                  |
| Mobile viewport layout     | 390 × 844 preview verified filtering, editing, horizontal scrolling, 44px touch targets, full-width note view, and state restoration on close          |
| Service upgrade            | All 15 release file digests match; old service exits cleanly; only the active runtime directory is retained; bundle integrity check passes             |

## Automated Checks

Typechecking, 91 automated tests, and the production build passed for 0.3.6. Coverage includes view queries, saved configurations, write verification, record creation, CJK IME composition, native note mounting, image preservation, table entry points, column resizing, and menu interactions. Localization checks cover language changes, stale preference reads, translated placeholders, English demo content, legacy default view names, and record creation during a language change.

The `test:browser`, `test:mobile`, and `test:touch` scripts were updated alongside the UI and pass syntax checks; full automated execution of those suites remains pending, with interactive evidence currently provided by manual browser preview and native client verification.

## Pending Verification

- Physical iPhone installation, touch interaction, and cross-device sync.
- Additional visual regression checks across UI states.

Source files and installer bundles use synthetic demo data; client screenshots and test node IDs are kept in local working records.
