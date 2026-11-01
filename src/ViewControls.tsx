import React, { useEffect, useRef, useState } from "react";
import type { Config, Snapshot } from "./model";
import { Icon, fieldIcon } from "./Icons";
import {
  LAYOUTS,
  NAME,
  newId,
  newView,
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
        <div className="view-tabs" role="tablist" aria-label="数据库视图">
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
              {v.name}
            </button>
          ))}
          <button
            className="icon-button add-view"
            title="添加视图"
            aria-label="添加视图"
            onClick={() => toggle("add")}
            disabled={disabled}
          >
            <Icon name="plus" />
          </button>
        </div>
        <div className="database-actions">
          <button
            className={`icon-button ${view.filters.length ? "applied" : ""}`}
            title="筛选"
            aria-label="筛选"
            aria-expanded={panel === "filters"}
            onClick={() => toggle("filters")}
          >
            <Icon name="filter" />
            {!!view.filters.length && (
              <span className="sr-only">{view.filters.length} 个条件</span>
            )}
          </button>
          <button
            className={`icon-button ${view.sorts.length ? "applied" : ""}`}
            title="排序"
            aria-label="排序"
            aria-expanded={panel === "sorts"}
            onClick={() => toggle("sorts")}
          >
            <Icon name="sort" />
          </button>
          <button
            className="icon-button"
            title="搜索"
            aria-label="搜索"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Icon name="search" />
          </button>
          <button
            className="icon-button"
            title="刷新"
            aria-label="刷新"
            disabled={disabled}
            onClick={onRefresh}
          >
            <Icon name="refresh" />
          </button>
          <button
            className={`icon-button ${panel === "settings" ? "active" : ""}`}
            title="视图设置"
            aria-label="视图设置"
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
              新建
            </button>
          )}
        </div>
      </div>
      {(searchOpen || search) && (
        <div className="database-search">
          <Icon name="search" />
          <input
            autoFocus
            aria-label="搜索记录"
            placeholder="搜索数据库…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="icon-button"
            aria-label="关闭搜索"
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
                ? "名称"
                : (snapshot.fields.find((p) => p.id === f.fieldId)?.name ??
                  "属性已删除")}
              <Icon name="down" />
            </button>
          ))}
          {view.sorts.length > 0 && (
            <button className="query-chip" onClick={() => setPanel("sorts")}>
              <Icon name="sort" />
              {view.sorts.length} 项排序
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
            清除
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
    settings: "视图设置",
    filters: "筛选",
    sorts: "排序",
    group: "分组",
    properties: "属性是否可见",
    layout: "布局",
    add: "新建视图",
    connection: "数据源",
  };
  const fields = [
    { id: NAME, name: "名称", type: "text", choices: [] },
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
            aria-label="返回视图设置"
            onClick={() => setPanel("settings")}
          >
            <Icon name="chevron" />
          </button>
        )}
        <strong>{labels[panel]}</strong>
        <button
          className="icon-button"
          aria-label="关闭设置"
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
                aria-label="视图名称"
                value={view.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            {menu(
              "layout",
              view.layout,
              "布局",
              LAYOUTS.find((l) => l.id === view.layout)?.name,
            )}
            {menu(
              "properties",
              "eye",
              "属性是否可见",
              `${view.visibleFieldIds.length + 1}`,
            )}
            {menu(
              "filters",
              "filter",
              "筛选",
              view.filters.length ? `${view.filters.length}` : undefined,
            )}
            {menu(
              "sorts",
              "sort",
              "排序",
              view.sorts.length ? `${view.sorts.length}` : undefined,
            )}
            {view.layout === "board" &&
              menu(
                "group",
                "board",
                "分组",
                snapshot.fields.find((f) => f.id === view.groupFieldId)?.name ||
                  "无",
              )}
            <hr />
            <div className="panel-caption">数据源设置</div>
            {menu("connection", "table", "来源", snapshot.name)}
            <hr />
            <button
              className="settings-row"
              onClick={() => {
                const copy = {
                  ...structuredClone(view),
                  id: newId(),
                  name: `${view.name} 副本`,
                };
                onChange({
                  ...state,
                  activeViewId: copy.id,
                  views: [...state.views, copy],
                });
              }}
            >
              <Icon name="page" />
              复制视图
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
              删除视图
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
              placeholder="视图名称"
              aria-label="新视图名称"
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
                  {l.name}
                </button>
              ))}
            </div>
            <button className="new-button panel-submit" type="submit">
              创建
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
                  {l.name}
                </button>
              ))}
            </div>
            {view.layout === "board" ? (
              <>
                <label className="setting-label">
                  卡片大小
                  <select
                    aria-label="卡片大小"
                    value={view.cardSize}
                    onChange={(e) =>
                      patch({
                        cardSize: e.target.value as DatabaseView["cardSize"],
                      })
                    }
                  >
                    <option value="small">小</option>
                    <option value="medium">中</option>
                    <option value="large">大</option>
                  </select>
                </label>
                <label className="setting-label">
                  卡片预览
                  <select
                    aria-label="卡片预览"
                    value={view.coverFieldId}
                    onChange={(e) => patch({ coverFieldId: e.target.value })}
                  >
                    <option value="">无</option>
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
                自动换行
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
            <div className="panel-caption">在当前视图中显示</div>
            <div className="property-visibility">
              <span>Aa</span>
              <span>名称</span>
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
                      aria-label={`上移${field.name}`}
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
                    aria-label={`${index >= 0 ? "隐藏" : "显示"}${field.name}`}
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
              <span>显示满足</span>
              <select
                aria-label="条件组合"
                value={view.filterMode}
                onChange={(e) =>
                  patch({ filterMode: e.target.value as "all" | "any" })
                }
              >
                <option value="all">所有</option>
                <option value="any">任一</option>
              </select>
              <span>条件的记录</span>
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
                      aria-label={`筛选属性 ${index + 1}`}
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
                        <option value={rule.fieldId}>属性已删除</option>
                      )}
                      {fields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`筛选条件 ${index + 1}`}
                      value={rule.operator}
                      onChange={(e) =>
                        patchFilter(rule.id, {
                          operator: e.target.value as FilterRule["operator"],
                          value: "",
                        })
                      }
                    >
                      <option value="is">是</option>
                      <option value="is_not">不是</option>
                      <option value="contains">包含</option>
                      <option value="not_contains">不包含</option>
                      <option value="empty">为空</option>
                      <option value="not_empty">不为空</option>
                      {["number", "date"].includes(field?.type ?? "") && (
                        <>
                          <option value="gt">大于</option>
                          <option value="lt">小于</option>
                          <option value="gte">大于等于</option>
                          <option value="lte">小于等于</option>
                        </>
                      )}
                    </select>
                    <button
                      className="icon-button"
                      aria-label={`移除筛选 ${index + 1}`}
                      onClick={() => removeFilter(rule.id)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                  {!["empty", "not_empty"].includes(rule.operator) &&
                    (choice ? (
                      <select
                        className="rule-value"
                        aria-label={`筛选值 ${index + 1}`}
                        value={rule.value}
                        onChange={(e) =>
                          patchFilter(rule.id, { value: e.target.value })
                        }
                      >
                        <option value="">选择选项…</option>
                        {field?.choices.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="rule-value"
                        aria-label={`筛选值 ${index + 1}`}
                        type={
                          field?.type === "date"
                            ? "date"
                            : field?.type === "number"
                              ? "number"
                              : "text"
                        }
                        placeholder="输入值…"
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
              添加筛选条件
            </button>
          </>
        )}
        {panel === "sorts" && (
          <>
            <div className="panel-caption">按顺序应用排序</div>
            {view.sorts.map((sort, index) => (
              <div className="sort-rule" key={sort.id}>
                <select
                  aria-label={`排序属性 ${index + 1}`}
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
                    <option value={sort.fieldId}>属性已删除</option>
                  )}
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`排序方向 ${index + 1}`}
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
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
                <button
                  className="icon-button"
                  aria-label={`上移排序 ${index + 1}`}
                  disabled={index === 0}
                  onClick={() =>
                    patch({ sorts: reorder(view.sorts, index, -1) })
                  }
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  aria-label={`移除排序 ${index + 1}`}
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
              添加排序
            </button>
            {view.sorts.length > 0 && (
              <button
                className="settings-row muted"
                onClick={() => patch({ sorts: [] })}
              >
                删除所有排序
              </button>
            )}
          </>
        )}
        {panel === "group" && (
          <>
            <label className="setting-label">
              分组依据
              <select
                aria-label="分组依据"
                value={view.groupFieldId}
                onChange={(e) =>
                  patch({
                    groupFieldId: e.target.value,
                    hiddenGroups: [],
                    collapsedGroups: [],
                  })
                }
              >
                <option value="">不分组</option>
                {snapshot.fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-label">
              隐藏空组
              <input
                type="checkbox"
                checked={view.hideEmptyGroups}
                onChange={(e) => patch({ hideEmptyGroups: e.target.checked })}
              />
            </label>
            <label className="setting-label">
              为分组着色
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
                aria-label={`${view.hiddenGroups.includes(g.id) ? "显示" : "隐藏"}分组 ${g.name}`}
                onClick={() =>
                  patch({
                    hiddenGroups: view.hiddenGroups.includes(g.id)
                      ? view.hiddenGroups.filter((id) => id !== g.id)
                      : [...view.hiddenGroups, g.id],
                  })
                }
              >
                <Icon
                  name={view.hiddenGroups.includes(g.id) ? "plus" : "eye"}
                />
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
