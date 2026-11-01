# Board Product Standard

The board is a saved view of existing RemNote records. Moving a card changes its grouping property; opening it uses RemNote's native note editor. A useful board must remain readable and predictable when groups, titles, images, and records grow.

## Reference behavior

Notion supports property-based groups, optional subgroups, manual column and card order, hidden groups that still accept dropped cards, configurable card size and previews, and group calculations. These are reference behaviors for this product, rather than a claim of feature parity. [Notion: Boards](https://www.notion.com/help/boards)

Saved views keep their own presentation, filters, and sorts. Notion also provides nested filter groups and choices for opening pages. [Notion: Views, filters, and sorts](https://www.notion.com/help/views-filters-and-sorts)

## Capability audit — 0.3.8

| Area | Present | Remaining work | Priority |
| --- | --- | --- | --- |
| Group navigation | Property grouping, counts, color, hide empty, hide/show individual groups; readable hidden-group list and drop targets | Manual group order; create/rename group choices; subgroups | Next |
| Moving cards | Change the grouping value, reorder cards when no sort is active, edge scrolling, pointer cancellation, prior-value conflict detection and read-back | Undo; keyboard-based moves; clearer feedback for read-only grouping types | Next |
| Cards | Three sizes, visible property selection/order, native rich text and image rendering, native note sidebar | Cover source choices, image fit/crop and reposition controls | Next |
| Finding records | Search, flat all/any filters, multiple ordered sorts | Nested filter groups; richer operators for more property types | Later |
| Saved views | Table/board, create/rename/duplicate/delete, independent filters/sorts/layout/visibility/order; synced storage | More layouts; preserving external view changes made during an editing session | Later |
| Records | New record inherits supported filters and group; plain text/number/URL/single-select editing; native editor for full content | Duplicate records, multi-selection and bulk changes, templates | Later |
| Large databases | Horizontal scrolling and source-table row scope | Virtualized rendering, incremental reads, benchmarked record-count targets | Next |
| Mobile | Narrow layout, full-width note view, touch drag handle, 44px controls | Physical iPhone validation, including scrolling, drag, native editor and sync | Release gate |
| Production interface | Two normal commands and one table-property menu action; isolated developer preview | Keep the allowlist and build isolation checks in every release | Release gate |

“Present” identifies an implementation, not complete maturity. The original collapsed-column failure showed why realistic layout checks are necessary even when data operations pass tests.

## Immediate repair

Collapsed groups previously used 48px vertical strips. Long names could extend outside their strips, overlap adjacent groups and obscure counts. Version 0.3.8 replaces this with a horizontal hidden-group list, with bounded labels, separate counts, and restore buttons. The group menu exposes **New page**, **Hide group**, and **Group settings**.

Previously saved collapsed groups appear in this list. Changing visibility affects the current view only and preserves other hidden groups. Dropping a card on a hidden group changes its property without restoring or deleting that group. Restoring an explicitly hidden empty group also turns off automatic empty-group hiding so that the user's action has a visible result.

## Acceptance scenarios

1. At least ten groups with long English and CJK names: names and counts never overlap another group, menu, or card. Full names remain available through titles and accessible labels.
2. Mix populated, empty, hidden, and legacy collapsed groups: restore individually or all at once; reopen and retain the choice; other saved views remain independent.
3. Move a card into a hidden group: the target highlights, one grouping value changes, the note parent/content/other properties remain intact, and counts update after confirmation.
4. With an active sort, dragging changes the group but respects the sort. Failed/conflicting writes remain visible and do not imply a successful move.
5. At 390px width, controls fit the viewport and are at least 44px tall; horizontal scrolling reaches every group. A viewport check is separate from physical iPhone acceptance.
6. Product commands contain only **Database Board** and **Open recent board**; table property menus expose **Open as board**. Test creation, fixtures, and diagnostics are accessed from the repository, never the production command menu.

## Work order

First make ordinary browsing, grouping, dragging, images, and native note opening dependable. Then add group ordering and undo, validate real phones and large datasets, and expand advanced database features based on actual workflows. New layouts do not take precedence over a reliable board.
