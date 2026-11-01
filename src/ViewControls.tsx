import { t } from "./i18n";
import React, { useEffect, useRef, useState } from "react";
import type { Config, Snapshot } from "./model";
import { Icon, fieldIcon } from "./Icons";
import {
  LAYOUTS,
  NAME,
  newId,
  newView,
  viewName,
  isGroupHidden,
  groupVisibility,
  type DatabaseView,
  type DatabaseViews,
  type FilterRule,
  type Layout,
  type RowGroup,
} from "./views";

export type Panel =
  | "settings"
  | "filters"
  | "sorts"
  | "group"
  | "properties"
  | "layout"
  | "add"
  | "connection"
  | null;
interface Common {
  snapshot: Snapshot;
  config: Config;
  state: DatabaseViews;
  view: DatabaseView;
  onChange: (state: DatabaseViews) => void;
  panel: Panel;
  setPanel: (panel: Panel) => void;
  disabled: boolean;
}
export function ViewToolbar({
  snapshot,
  config,
  state,
  view,
  onChange,
  panel,
  setPanel,
  disabled,
  search,
  setSearch,
  onCreate,
  onRefresh,
}: Common & {
  search: string;
  setSearch: (s: string) => void;
  onCreate?: () => void;
  onRefresh: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const toggle = (next: Panel) => setPanel(panel === next ? null : next);
  return (
    <>
      <div className="database-toolbar">
        <div
          className="view-tabs"
          role="tablist"
          aria-label={t("Database views")}
        >
          {state.views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === view.id}
              className={`view-tab ${v.id === view.id ? "active" : ""}`}
              disabled={disabled}
              onClick={() => onChange({ ...state, activeViewId: v.id })}
              onDoubleClick={() => setPanel("settings")}
            >
              <Icon name={v.layout} />
              {viewName(v)}
            </button>
          ))}
          <button
            className="icon-button add-view"
            title={t("Add view")}
            aria-label={t("Add view")}
            onClick={() => toggle("add")}
            disabled={disabled}
          >
            <Icon name="plus" />
          </button>
        </div>
        <div className="database-actions">
          <button
            className={`icon-button ${view.filters.length ? "applied" : ""}`}
            title={t("Filter")}
            aria-label={t("Filter")}
            aria-expanded={panel === "filters"}
            onClick={() => toggle("filters")}
          >
            <Icon name="filter" />
            {!!view.filters.length && (
              <span className="sr-only">
                {view.filters.length} {t(" filters")}
              </span>
            )}
          </button>
          <button
            className={`icon-button ${view.sorts.length ? "applied" : ""}`}
            title={t("Sort")}
            aria-label={t("Sort")}
            aria-expanded={panel === "sorts"}
            onClick={() => toggle("sorts")}
          >
            <Icon name="sort" />
          </button>
          <button
            className="icon-button"
            title={t("Search")}
            aria-label={t("Search")}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Icon name="search" />
          </button>
          <button
            className="icon-button"
            title={t("Refresh")}
            aria-label={t("Refresh")}
            disabled={disabled}
            onClick={onRefresh}
          >
            <Icon name="refresh" />
          </button>
          <button
            className={`icon-button ${panel === "settings" ? "active" : ""}`}
            title={t("View settings")}
            aria-label={t("View settings")}
            aria-expanded={!!panel}
            onClick={() => toggle("settings")}
          >
            <Icon name="settings" />
          </button>
          {onCreate && (
            <button
              className="new-button"
              disabled={disabled}
              onClick={onCreate}
            >
              {t("New")}
            </button>
          )}
        </div>
      </div>
      {(searchOpen || search) && (
        <div className="database-search">
          <Icon name="search" />
          <input
            autoFocus
            aria-label={t("Search records")}
            placeholder={t("Search database…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="icon-button"
            aria-label={t("Close search")}
            onClick={() => {
              setSearch("");
              setSearchOpen(false);
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {(view.filters.length > 0 || view.sorts.length > 0) && (
        <div className="query-chips">
          {view.filters.map((f) => (
            <button
              key={f.id}
              className="query-chip"
              onClick={() => setPanel("filters")}
            >
              <Icon name="filter" />
              {f.fieldId === NAME
                ? t("Name")
                : (snapshot.fields.find((p) => p.id === f.fieldId)?.name ??
                  t("Deleted property"))}
              <Icon name="down" />
            </button>
          ))}
          {view.sorts.length > 0 && (
            <button className="query-chip" onClick={() => setPanel("sorts")}>
              <Icon name="sort" />
              {view.sorts.length} {t(" sorts")}
            </button>
          )}
          <button
            className="subtle-button"
            onClick={() =>
              onChange({
                ...state,
                views: state.views.map((v) =>
                  v.id === view.id ? { ...v, filters: [], sorts: [] } : v,
                ),
              })
            }
          >
            {t("Clear")}
          </button>
        </div>
      )}
    </>
  );
}

export function ViewPanel({
  snapshot,
  config,
  state,
  view,
  onChange,
  panel,
  setPanel,
  disabled,
  groups,
  connection,
}: Common & { groups: RowGroup[]; connection: React.ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const [newName, setNewName] = useState("");
  const [newLayout, setNewLayout] = useState<Layout>("board");
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!panel) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanel(null);
        previousFocus.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [panel, setPanel]);
  if (!panel) return null;
  const patch = (next: Partial<DatabaseView>) =>
    onChange({
      ...state,
      views: state.views.map((v) => (v.id === view.id ? { ...v, ...next } : v)),
    });
  const removeFilter = (id: string) =>
    patch({ filters: view.filters.filter((f) => f.id !== id) });
  const patchFilter = (id: string, next: Partial<FilterRule>) =>
    patch({
      filters: view.filters.map((f) => (f.id === id ? { ...f, ...next } : f)),
    });
  const labels: Record<Exclude<Panel, null>, string> = {
    settings: t("View settings"),
    filters: t("Filter"),
    sorts: t("Sort"),
    group: t("Group"),
    properties: t("Property visibility"),
    layout: t("Layout"),
    add: t("New view"),
    connection: t("Data source"),
  };
  const fields = [
    { id: NAME, name: t("Name"), type: "text", choices: [] },
    ...snapshot.fields,
  ];
  const reorder = <T,>(values: T[], index: number, delta: number) => {
    const next = [...values];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    return next;
  };
  const menu = (target: Panel, icon: string, label: string, value?: string) => (
    <button className="settings-row" onClick={() => setPanel(target)}>
      <Icon name={icon} />
      <span>{label}</span>
      <small>{value}</small>
      <Icon name="chevron" />
    </button>
  );
  return (
    <aside
      className={`database-panel panel-${panel}`}
      ref={root}
      role="dialog"
      aria-label={labels[panel]}
    >
      <div className="panel-heading">
        {panel !== "settings" && (
          <button
            className="icon-button back"
            aria-label={t("Back to view settings")}
            onClick={() => setPanel("settings")}
          >
            <Icon name="chevron" />
          </button>
        )}
        <strong>{labels[panel]}</strong>
        <button
          className="icon-button"
          aria-label={t("Close settings")}
          onClick={() => setPanel(null)}
        >
          <Icon name="close" />
        </button>
      </div>
      <fieldset disabled={disabled}>
        {panel === "settings" && (
          <>
            <label className="view-name-input">
              <Icon name={view.layout} />
              <input
                aria-label={t("View name")}
                value={viewName(view)}
                onChange={(e) =>
                  patch({ name: e.target.value, autoName: false })
                }
              />
            </label>
            {menu(
              "layout",
              view.layout,
              t("Layout"),
              t(LAYOUTS.find((l) => l.id === view.layout)?.name ?? ""),
            )}
            {menu(
              "properties",
              "eye",
              t("Property visibility"),
              `${view.visibleFieldIds.length + 1}`,
            )}
            {menu(
              "filters",
              "filter",
              t("Filter"),
              view.filters.length ? `${view.filters.length}` : undefined,
            )}
            {menu(
              "sorts",
              "sort",
              t("Sort"),
              view.sorts.length ? `${view.sorts.length}` : undefined,
            )}
            {view.layout === "board" &&
              menu(
                "group",
                "board",
                t("Group"),
                snapshot.fields.find((f) => f.id === view.groupFieldId)?.name ||
                  t("None"),
              )}
            <hr />
            <div className="panel-caption">{t("Data source settings")}</div>
            {menu("connection", "table", t("Source"), snapshot.name)}
            <hr />
            <button
              className="settings-row"
              onClick={() => {
                const copy = {
                  ...structuredClone(view),
                  id: newId(),
                  name: t("{p0} copy", { p0: viewName(view) }),
                  autoName: false,
                };
                onChange({
                  ...state,
                  activeViewId: copy.id,
                  views: [...state.views, copy],
                });
              }}
            >
              <Icon name="page" />
              {t("Duplicate view")}
            </button>
            <button
              className="settings-row danger"
              disabled={state.views.length === 1}
              onClick={() => {
                const views = state.views.filter((v) => v.id !== view.id);
                onChange({ ...state, views, activeViewId: views[0].id });
                setPanel(null);
              }}
            >
              <Icon name="close" />
              {t("Delete view")}
            </button>
          </>
        )}
        {panel === "add" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = newView(newLayout, snapshot, config, newName.trim());
              onChange({
                ...state,
                views: [...state.views, v],
                activeViewId: v.id,
              });
              setNewName("");
              setPanel(null);
            }}
          >
            <input
              className="panel-input"
              autoFocus
              placeholder={t("View name")}
              aria-label={t("New view name")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="layout-options">
              {LAYOUTS.map((l) => (
                <button
                  type="button"
                  aria-pressed={newLayout === l.id}
                  className={newLayout === l.id ? "selected" : ""}
                  key={l.id}
                  onClick={() => setNewLayout(l.id)}
                >
                  <Icon name={l.id} />
                  {t(l.name)}
                </button>
              ))}
            </div>
            <button className="new-button panel-submit" type="submit">
              {t("Create")}
            </button>
          </form>
        )}
        {panel === "layout" && (
          <>
            <div className="layout-options">
              {LAYOUTS.map((l) => (
                <button
                  aria-pressed={view.layout === l.id}
                  className={view.layout === l.id ? "selected" : ""}
                  key={l.id}
                  onClick={() =>
                    patch({
                      layout: l.id,
                      groupFieldId:
                        l.id === "board"
                          ? view.groupFieldId || config.groupFieldId
                          : view.groupFieldId,
                    })
                  }
                >
                  <Icon name={l.id} />
                  {t(l.name)}
                </button>
              ))}
            </div>
            {view.layout === "board" ? (
              <>
                <label className="setting-label">
                  {t("Card size")}
                  <select
                    aria-label={t("Card size")}
                    value={view.cardSize}
                    onChange={(e) =>
                      patch({
                        cardSize: e.target.value as DatabaseView["cardSize"],
                      })
                    }
                  >
                    <option value="small">{t("Small")}</option>
                    <option value="medium">{t("Medium")}</option>
                    <option value="large">{t("Large")}</option>
                  </select>
                </label>
                <label className="setting-label">
                  {t("Card preview")}
                  <select
                    aria-label={t("Card preview")}
                    value={view.coverFieldId}
                    onChange={(e) => patch({ coverFieldId: e.target.value })}
                  >
                    <option value="">{t("None")}</option>
                    {snapshot.fields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label className="setting-label">
                {t("Wrap text")}
                <input
                  type="checkbox"
                  checked={view.wrapCells}
                  onChange={(e) => patch({ wrapCells: e.target.checked })}
                />
              </label>
            )}
          </>
        )}
        {panel === "properties" && (
          <>
            <div className="panel-caption">{t("Shown in view")}</div>
            <div className="property-visibility">
              <span>Aa</span>
              <span>{t("Name")}</span>
              <Icon name="eye" />
            </div>
            {[
              ...view.visibleFieldIds,
              ...snapshot.fields
                .filter((f) => !view.visibleFieldIds.includes(f.id))
                .map((f) => f.id),
            ].map((id) => {
              const field = snapshot.fields.find((f) => f.id === id);
              if (!field) return null;
              const index = view.visibleFieldIds.indexOf(id);
              return (
                <div className="property-visibility" key={id}>
                  <Icon name={fieldIcon(field.type)} />
                  <span>{field.name}</span>
                  {index >= 0 && (
                    <button
                      className="icon-button"
                      disabled={index === 0}
                      aria-label={t("Move {p0} up", { p0: field.name })}
                      onClick={() =>
                        patch({
                          visibleFieldIds: reorder(
                            view.visibleFieldIds,
                            index,
                            -1,
                          ),
                        })
                      }
                    >
                      ↑
                    </button>
                  )}
                  <button
                    className={`icon-button ${index < 0 ? "muted" : ""}`}
                    aria-label={t(index >= 0 ? "Hide {p0}" : "Show {p0}", {
                      p0: field.name,
                    })}
                    aria-pressed={index >= 0}
                    onClick={() =>
                      patch({
                        visibleFieldIds:
                          index >= 0
                            ? view.visibleFieldIds.filter((v) => v !== id)
                            : [...view.visibleFieldIds, id],
                      })
                    }
                  >
                    <Icon name={index >= 0 ? "eye" : "plus"} />
                  </button>
                </div>
              );
            })}
          </>
        )}
        {panel === "filters" && (
          <>
            <div className="filter-join">
              <span>{t("Show records matching")}</span>
              <select
                aria-label={t("Filter match mode")}
                value={view.filterMode}
                onChange={(e) =>
                  patch({ filterMode: e.target.value as "all" | "any" })
                }
              >
                <option value="all">{t("all")}</option>
                <option value="any">{t("any")}</option>
              </select>
              <span>{t("of the conditions")}</span>
            </div>
            {view.filters.map((rule, index) => {
              const field = fields.find((f) => f.id === rule.fieldId);
              const choice =
                field?.type.endsWith("_select") &&
                ["is", "is_not"].includes(rule.operator);
              return (
                <div className="filter-rule" key={rule.id}>
                  <div className="rule-top">
                    <select
                      aria-label={t("Filter property {p0}", { p0: index + 1 })}
                      value={rule.fieldId}
                      onChange={(e) =>
                        patchFilter(rule.id, {
                          fieldId: e.target.value,
                          value: "",
                          operator: "is",
                        })
                      }
                    >
                      {!field && (
                        <option value={rule.fieldId}>
                          {t("Deleted property")}
                        </option>
                      )}
                      {fields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t("Filter condition {p0}", { p0: index + 1 })}
                      value={rule.operator}
                      onChange={(e) =>
                        patchFilter(rule.id, {
                          operator: e.target.value as FilterRule["operator"],
                          value: "",
                        })
                      }
                    >
                      <option value="is">{t("is")}</option>
                      <option value="is_not">{t("is not")}</option>
                      <option value="contains">{t("contains")}</option>
                      <option value="not_contains">
                        {t("does not contain")}
                      </option>
                      <option value="empty">{t("is empty")}</option>
                      <option value="not_empty">{t("is not empty")}</option>
                      {["number", "date"].includes(field?.type ?? "") && (
                        <>
                          <option value="gt">{t("is greater than")}</option>
                          <option value="lt">{t("is less than")}</option>
                          <option value="gte">{t("is at least")}</option>
                          <option value="lte">{t("is at most")}</option>
                        </>
                      )}
                    </select>
                    <button
                      className="icon-button"
                      aria-label={t("Remove filter {p0}", { p0: index + 1 })}
                      onClick={() => removeFilter(rule.id)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                  {!["empty", "not_empty"].includes(rule.operator) &&
                    (choice ? (
                      <select
                        className="rule-value"
                        aria-label={t("Filter value {p0}", { p0: index + 1 })}
                        value={rule.value}
                        onChange={(e) =>
                          patchFilter(rule.id, { value: e.target.value })
                        }
                      >
                        <option value="">{t("Select option…")}</option>
                        {field?.choices.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="rule-value"
                        aria-label={t("Filter value {p0}", { p0: index + 1 })}
                        type={
                          field?.type === "date"
                            ? "date"
                            : field?.type === "number"
                              ? "number"
                              : "text"
                        }
                        placeholder={t("Enter value…")}
                        value={rule.value}
                        onChange={(e) =>
                          patchFilter(rule.id, { value: e.target.value })
                        }
                      />
                    ))}
                </div>
              );
            })}
            <button
              className="settings-row"
              onClick={() =>
                patch({
                  filters: [
                    ...view.filters,
                    {
                      id: newId(),
                      fieldId: snapshot.fields[0]?.id ?? NAME,
                      operator: "is",
                      value: "",
                    },
                  ],
                })
              }
            >
              <Icon name="plus" />
              {t("Add filter")}
            </button>
          </>
        )}
        {panel === "sorts" && (
          <>
            <div className="panel-caption">{t("Sort in order")}</div>
            {view.sorts.map((sort, index) => (
              <div className="sort-rule" key={sort.id}>
                <select
                  aria-label={t("Sort property {p0}", { p0: index + 1 })}
                  value={sort.fieldId}
                  onChange={(e) =>
                    patch({
                      sorts: view.sorts.map((s) =>
                        s.id === sort.id
                          ? { ...s, fieldId: e.target.value }
                          : s,
                      ),
                    })
                  }
                >
                  {!fields.some((f) => f.id === sort.fieldId) && (
                    <option value={sort.fieldId}>
                      {t("Deleted property")}
                    </option>
                  )}
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("Sort direction {p0}", { p0: index + 1 })}
                  value={sort.direction}
                  onChange={(e) =>
                    patch({
                      sorts: view.sorts.map((s) =>
                        s.id === sort.id
                          ? {
                              ...s,
                              direction: e.target.value as "asc" | "desc",
                            }
                          : s,
                      ),
                    })
                  }
                >
                  <option value="asc">{t("Ascending")}</option>
                  <option value="desc">{t("Descending")}</option>
                </select>
                <button
                  className="icon-button"
                  aria-label={t("Move sort {p0} up", { p0: index + 1 })}
                  disabled={index === 0}
                  onClick={() =>
                    patch({ sorts: reorder(view.sorts, index, -1) })
                  }
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Remove sort {p0}", { p0: index + 1 })}
                  onClick={() =>
                    patch({ sorts: view.sorts.filter((s) => s.id !== sort.id) })
                  }
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
            <button
              className="settings-row"
              onClick={() =>
                patch({
                  sorts: [
                    ...view.sorts,
                    { id: newId(), fieldId: NAME, direction: "asc" },
                  ],
                })
              }
            >
              <Icon name="plus" />
              {t("Add sort")}
            </button>
            {view.sorts.length > 0 && (
              <button
                className="settings-row muted"
                onClick={() => patch({ sorts: [] })}
              >
                {t("Remove all sorts")}
              </button>
            )}
          </>
        )}
        {panel === "group" && (
          <>
            <label className="setting-label">
              {t("Group by")}
              <select
                aria-label={t("Group by")}
                value={view.groupFieldId}
                onChange={(e) =>
                  patch({
                    groupFieldId: e.target.value,
                    hiddenGroups: [],
                    collapsedGroups: [],
                  })
                }
              >
                <option value="">{t("None")}</option>
                {snapshot.fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-label">
              {t("Hide empty groups")}
              <input
                type="checkbox"
                checked={view.hideEmptyGroups}
                onChange={(e) => patch({ hideEmptyGroups: e.target.checked })}
              />
            </label>
            <label className="setting-label">
              {t("Color groups")}
              <input
                type="checkbox"
                checked={view.colorColumns}
                onChange={(e) => patch({ colorColumns: e.target.checked })}
              />
            </label>
            <hr />
            {groups.map((g) => (
              <button
                className="settings-row"
                key={g.id}
                aria-label={t("{p0} group {p1}", {
                  p0: isGroupHidden(view, g.id) ? t("Show") : t("Hide"),
                  p1: g.name,
                })}
                onClick={() =>
                  patch({
                    ...groupVisibility(view, g.id, !isGroupHidden(view, g.id)),
                    ...(isGroupHidden(view, g.id) && !g.rows.length
                      ? { hideEmptyGroups: false }
                      : {}),
                  })
                }
              >
                <Icon name={isGroupHidden(view, g.id) ? "eye-off" : "eye"} />
                <span>{g.name}</span>
                <small>{g.rows.length}</small>
              </button>
            ))}
          </>
        )}
        {panel === "connection" && connection}
      </fieldset>
    </aside>
  );
}
