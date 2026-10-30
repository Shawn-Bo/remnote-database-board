import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {BoardPort, Cell, Config, Row, Snapshot} from './model';
import {EMPTY, UNKNOWN, cellForChoice, emptyCell, groupKey, groupedRows, inferConfig, parseRemId, sameCell, visibleRows} from './model';

interface Props {
  port: BoardPort;
  initial: Partial<Config> & {tagId: string};
  rowScope?: string[];
  onConfig?: (config: Config) => Promise<void>;
  onClose?: () => Promise<void>;
  preview?: boolean;
}
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const PALETTE = ['#cbbfde','#b9c6e1','#d8bdb4','#c8d3ac','#ead393','#c1dcd7','#d5c4db','#c2d1e0','#dcc9ab'];

export function Board({port, initial, rowScope, onConfig, onClose, preview}: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [config, setConfig] = useState<Config>({tagId: initial.tagId, groupFieldId: initial.groupFieldId ?? '', filterFieldId: initial.filterFieldId ?? '', recordFieldId: initial.recordFieldId ?? ''});
  const [sourceInput, setSourceInput] = useState(initial.tagId);
  const [filter, setFilter] = useState('*');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'board'|'table'>('board');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState('');
  const [over, setOver] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [recordDraft, setRecordDraft] = useState('');
  const [recordExpected, setRecordExpected] = useState<Cell>(emptyCell());
  const configRef = useRef(config);
  const pendingRef = useRef(new Set<string>());
  const loadingRef = useRef(false);
  const sequence = useRef(0);
  const dragRef = useRef<{row: Row; tagId: string; fieldId: string; pointerId: number; x: number; y: number; currentX: number; currentY: number; scroller: HTMLElement | null; active: boolean}>();
  const scrollFrameRef = useRef<number>();
  const connect = useCallback(async (input: string, prior?: Partial<Config>) => {
    if (pendingRef.current.size || loadingRef.current || dragRef.current) return;
    const seq = ++sequence.current;
    loadingRef.current = true;
    setLoading(true); setError(''); setNotice('');
    try {
      const data = await port.load(parseRemId(input), rowScope);
      if (sequence.current !== seq) return;
      const next = inferConfig(data, prior);
      configRef.current = next;
      setConfig(next); setSnapshot(data); setFilter('*'); setSelectedId('');
      await onConfig?.(next);
    } catch (e) { if (sequence.current === seq) setError(message(e)); }
    finally {loadingRef.current = false; setLoading(false);}
  }, [port, onConfig, rowScope]);

  const refresh = useCallback(async () => {
    if (pendingRef.current.size || loadingRef.current || dragRef.current) return;
    const id = configRef.current.tagId;
    if (!id) return;
    const seq = ++sequence.current;
    loadingRef.current = true;
    try {
      const data = await port.load(id, rowScope);
      if (sequence.current === seq && !pendingRef.current.size && !dragRef.current) {
        const current = configRef.current;
        if (!data.fields.some(f => f.id === current.groupFieldId && f.type === 'single_select')) throw new Error('分组属性已改变，请重新选择熟练度属性。');
        setSnapshot(data); setError('');
      }
    } catch (e) { if (sequence.current === seq) setError(message(e)); }
    finally { loadingRef.current = false; }
  }, [port, rowScope]);

  useEffect(() => {if (initial.tagId) void connect(initial.tagId, initial);}, [connect, initial]);
  useEffect(() => {
    const tick = () => {if (!document.hidden) void refresh();};
    const timer = window.setInterval(tick, 6000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {window.clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick);};
  }, [refresh]);

  const chooseConfig = async (patch: Partial<Config>) => {
    const next = {...configRef.current, ...patch};
    if (next.groupFieldId === next.filterFieldId) next.filterFieldId = '';
    configRef.current = next; setConfig(next); setFilter('*'); setSelectedId('');
    try {await onConfig?.(next);} catch (e) {setError(message(e));}
  };
  const write = async (row: Row, fieldId: string, expected: Cell, value: Cell) => {
    if (pendingRef.current.has(row.id)) return false;
    ++sequence.current;
    pendingRef.current.add(row.id); setPending(new Set(pendingRef.current));
    setError(''); setNotice('');
    // Keep the last confirmed state until the SDK has written and read the value back.
    try {
      const saved = await port.write({config: configRef.current, rowId: row.id, fieldId, expected, value});
      setSnapshot(s => s ? {...s, rows: s.rows.map(r => r.id === saved.id ? saved : r)} : s);
      if (fieldId === configRef.current.recordFieldId) {setRecordExpected(saved.cells[fieldId] ?? emptyCell()); setRecordDraft(saved.cells[fieldId]?.text ?? '');}
      setNotice(preview ? '演示数据已更新（不写入 RemNote）' : '已写入原笔记，并回读确认');
      return true;
    } catch (e) {setError(message(e)); return false;}
    finally {pendingRef.current.delete(row.id); setPending(new Set(pendingRef.current));}
  };
  const groupField = snapshot?.fields.find(f => f.id === config.groupFieldId);
  const filterField = snapshot?.fields.find(f => f.id === config.filterFieldId);
  const recordField = snapshot?.fields.find(f => f.id === config.recordFieldId);
  const rows = snapshot ? visibleRows(snapshot, config, filter, search) : [];
  const groups = groupField ? groupedRows(rows, groupField) : new Map<string, Row[]>();
  const filterOptions = snapshot ? [...new Set(snapshot.rows.map(r => r.cells[config.filterFieldId]?.text ?? ''))].sort((a,b) => a.localeCompare(b, 'zh-CN')) : [];
  const selected = snapshot?.rows.find(r => r.id === selectedId);

  const move = async (row: Row, target: string) => {
    if (!groupField) return;
    try {
      const next = cellForChoice(target, groupField);
      const expected = row.cells[groupField.id] ?? emptyCell();
      if (!sameCell(expected, next)) await write(row, groupField.id, expected, next);
    } catch (e) {setError(message(e));}
  };
  const stopAutoScroll = () => {
    if (scrollFrameRef.current !== undefined) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = undefined;
  };
  const cancelDrag = () => {stopAutoScroll(); dragRef.current = undefined; setDragging(''); setOver('');};
  const columnAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-column-id]')?.dataset.columnId;
  const startAutoScroll = () => {
    if (scrollFrameRef.current !== undefined) return;
    let last = 0;
    const step = (now: number) => {
      scrollFrameRef.current = undefined;
      const drag = dragRef.current;
      const scroller = drag?.scroller;
      if (!drag?.active || !scroller?.isConnected) return;
      const rect = scroller.getBoundingClientRect();
      if (drag.currentY < rect.top || drag.currentY > rect.bottom) return;
      const edge = Math.min(56, rect.width / 4);
      const speed = drag.currentX < rect.left + edge
        ? -Math.min(1, (rect.left + edge - drag.currentX) / edge)
        : drag.currentX > rect.right - edge
          ? Math.min(1, (drag.currentX - (rect.right - edge)) / edge)
          : 0;
      if (!speed) return;
      const elapsed = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 1 / 60;
      scroller.scrollLeft += speed * 900 * elapsed;
      last = now;
      const target = columnAt(drag.currentX, drag.currentY);
      setOver(target && target !== UNKNOWN ? target : '');
      const canScroll = speed > 0 ? scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth : scroller.scrollLeft > 0;
      if (canScroll) scrollFrameRef.current = window.requestAnimationFrame(step);
    };
    scrollFrameRef.current = window.requestAnimationFrame(step);
  };
  const startDrag = (e: React.PointerEvent<HTMLElement>, row: Row) => {
    const target = e.target as HTMLElement;
    if (e.button !== 0 || pendingRef.current.has(row.id) || target.closest('button,select,input,textarea,a') || (e.pointerType === 'touch' && !target.closest('.grip'))) return;
    dragRef.current = {row, tagId: config.tagId, fieldId: config.groupFieldId, pointerId: e.pointerId, x: e.clientX, y: e.clientY, currentX: e.clientX, currentY: e.clientY, scroller: e.currentTarget.closest('.board-scroll'), active: false};
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const updateDrag = (e: React.PointerEvent<HTMLElement>) => {
    const payload = dragRef.current;
    if (!payload || payload.pointerId !== e.pointerId) return;
    if (!payload.active && Math.hypot(e.clientX - payload.x, e.clientY - payload.y) < 8) return;
    payload.active = true; payload.currentX = e.clientX; payload.currentY = e.clientY;
    e.preventDefault(); setDragging(payload.row.id); startAutoScroll();
    const target = columnAt(e.clientX, e.clientY);
    setOver(target && target !== UNKNOWN ? target : '');
  };
  const finishDrag = (e: React.PointerEvent<HTMLElement>) => {
    const payload = dragRef.current;
    const target = columnAt(e.clientX, e.clientY);
    cancelDrag();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!payload?.active || payload.pointerId !== e.pointerId || !target || target === UNKNOWN || payload.tagId !== configRef.current.tagId || payload.fieldId !== configRef.current.groupFieldId) return;
    // Use the value captured at pointer-down, so a concurrent edit is rejected by the write guard.
    void move(payload.row, target);
  };
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {if (e.key === 'Escape') cancelDrag();};
    window.addEventListener('keydown', cancel);
    return () => {window.removeEventListener('keydown', cancel); stopAutoScroll(); dragRef.current = undefined;};
  }, []);
  const selectRow = (row: Row) => {
    setSelectedId(row.id);
    const cell = row.cells[config.recordFieldId] ?? emptyCell();
    setRecordExpected(cell); setRecordDraft(cell.text);
  };
  const open = async (id: string) => {try {await port.open(id); await onClose?.();} catch(e) {setError(message(e));}};
  const statusSelect = (row: Row) => <select aria-label={`${row.name}的熟练度`} value={groupField ? groupKeyForRow(row) : EMPTY} disabled={pending.has(row.id)} onChange={e => void move(row, e.target.value)} onClick={e => e.stopPropagation()}>
    <option value={EMPTY}>未设置</option>
    {groupField?.choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    {groupField && groupKeyForRow(row) === UNKNOWN && <option value={UNKNOWN} disabled>未识别的原值</option>}
  </select>;
  function groupKeyForRow(row: Row) {return groupField ? groupKey(row.cells[groupField.id] ?? emptyCell(), groupField) : EMPTY;}

  const columns = groupField ? [{id: EMPTY, name: '未设置'}, ...groupField.choices, {id: UNKNOWN, name: '未识别的原值'}].filter(c => {
    const count = groups.get(c.id)?.length ?? 0;
    if (c.id === UNKNOWN) return count > 0;
    if (c.id === EMPTY) return count > 0 || groupField.choices.length === 0;
    return !hideEmpty || count > 0;
  }) : [];

  return <main className="db-board">
    <header className="board-header">
      <div className="eyebrow">REMNOTE · DATABASE BOARD {preview && <span className="preview-tag">交互演示</span>}</div>
      <div className="title-row"><h1>训练看板</h1><span className="database-label">{snapshot?.name || '连接数据库'}</span>{onClose && <button className="close-board" aria-label="关闭看板" disabled={pending.size > 0} onClick={() => void onClose()}>×</button>}</div>
      <p className="subtitle">每张卡片都是原笔记。拖动更新熟练度，训练记录保留在原处。</p>
      <div className="toolbar">
        <div className="view-switch" role="group" aria-label="显示方式"><button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>▥ 看板</button><button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>☷ 表格</button></div>
        {filterField && <label className="filter-control"><span>{filterField.name}</span><select aria-label={`筛选${filterField.name}`} value={filter} onChange={e => setFilter(e.target.value)}><option value="*">全部{filterField.name}</option>{filterOptions.map(v => <option key={v || '__blank__'} value={v}>{v || '未设置'}</option>)}</select></label>}
        <input className="search" aria-label="搜索分段" placeholder="搜索分段、难点或记录…" value={search} onChange={e => setSearch(e.target.value)}/>
        <label className="empty-toggle"><input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)}/>隐藏空栏</label>
        <button className="subtle-button" disabled={pending.size > 0 || loading} onClick={() => void refresh()}>刷新</button>
      </div>
      <details className="connection" open={!snapshot ? true : undefined}><summary>连接与字段 <span>{rowScope ? '· 当前表格行范围' : '· 数据库全部分段'}</span></summary>
        {!snapshot && <p>首次使用时，粘贴表格所属标签的链接或 ID，然后选择分组属性。</p>}
        <form onSubmit={e => {e.preventDefault(); void connect(sourceInput, config);}}><label>表格标签链接或 ID<input value={sourceInput} onChange={e => setSourceInput(e.target.value)} disabled={pending.size > 0}/></label><button disabled={loading || pending.size > 0}>连接</button></form>
        {snapshot && <div className="field-settings"><label>分组属性<select aria-label="分组属性" disabled={pending.size > 0} value={config.groupFieldId} onChange={e => void chooseConfig({groupFieldId: e.target.value})}>{snapshot.fields.filter(f => f.type === 'single_select').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label>筛选属性<select aria-label="筛选属性" disabled={pending.size > 0} value={config.filterFieldId} onChange={e => void chooseConfig({filterFieldId: e.target.value})}><option value="">不设置</option>{snapshot.fields.filter(f => f.id !== config.groupFieldId).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label>记录属性<select aria-label="记录属性" disabled={pending.size > 0} value={config.recordFieldId} onChange={e => void chooseConfig({recordFieldId: e.target.value})}><option value="">不设置</option>{snapshot.fields.filter(f => ['text','0'].includes(f.type)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <button className="subtle-button" onClick={() => void open(config.tagId)}>打开原表格标签 ↗</button></div>}
      </details>
      <div className="status-line"><span>{rows.length} 个分段{snapshot && rows.length !== snapshot.rows.length ? ` / 共 ${snapshot.rows.length} 个` : ''}</span><span aria-live="polite">{loading ? '正在读取…' : pending.size ? '正在保存…' : notice || (snapshot ? '与原笔记连接 · 每 6 秒刷新' : '')}</span></div>
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => void refresh()}>重新读取</button></div>}
      {preview && <div className="preview-banner">这是独立交互演示，数据不写入 RemNote。正式插件使用相同界面，直接读写原表格属性。</div>}
    </header>

    {view === 'board' ? <div className="board-scroll"><div className="columns">
      {columns.map((column, index) => <section key={column.id} data-column-id={column.id} className={`column ${over === column.id ? 'drag-over' : ''}`} style={{'--column-color': PALETTE[index % PALETTE.length]} as React.CSSProperties}>
        <div className="column-heading"><span className="column-dot"/><h2>{column.name}</h2><span className="count">{groups.get(column.id)?.length ?? 0}</span></div>
        <div className="card-list">{groups.get(column.id)?.map(row => <article key={row.id} data-row-id={row.id} className={`card ${dragging === row.id ? 'dragging' : ''} ${pending.has(row.id) ? 'saving' : ''}`} draggable={false}
          onPointerDown={e => startDrag(e,row)} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}>
          <div className="card-top"><span className="grip" aria-hidden="true">⠿</span><button className="card-title" onClick={() => selectRow(row)}>{row.name}</button><button className="open-note" aria-label={`打开${row.name}原笔记`} title="打开原笔记" onClick={() => void open(row.id)}>↗</button></div>
          {filterField && <div className="card-song">{row.cells[filterField.id]?.text || '未设置'}</div>}
          {recordField && row.cells[recordField.id]?.text && <p className="card-preview">{row.cells[recordField.id].text}</p>}
          <div className="card-bottom">{statusSelect(row)}<button className="record-button" onClick={() => selectRow(row)}>记录</button></div>
        </article>)}
          {!groups.get(column.id)?.length && <div className="empty-column">拖动分段到这里</div>}
        </div>
      </section>)}
      {!columns.length && snapshot && <div className="empty-state">没有符合条件的分段。可以切换歌曲、清除搜索或显示空栏。</div>}
    </div></div> : <div className="table-scroll"><table><thead><tr><th>分段</th>{snapshot?.fields.map(f => <th key={f.id}>{f.name}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} data-row-id={row.id}><td><button className="table-name" onClick={() => selectRow(row)}>{row.name}</button><button className="open-note" aria-label={`打开${row.name}原笔记`} onClick={() => void open(row.id)}>↗</button></td>{snapshot?.fields.map(f => <td key={f.id}>{f.id === config.groupFieldId ? statusSelect(row) : row.cells[f.id]?.text || '—'}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="empty-state">没有符合条件的分段。</div>}</div>}

    {selected && <div className="drawer-backdrop" onClick={() => {if (!pending.has(selected.id)) setSelectedId('');}}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={`${selected.name}训练记录`} onClick={e => e.stopPropagation()}>
      <div className="drawer-heading"><span>分段记录</span><button aria-label="关闭记录" disabled={pending.has(selected.id)} onClick={() => setSelectedId('')}>×</button></div>
      <h2>{selected.name}</h2><p className="drawer-song">{filterField && selected.cells[filterField.id]?.text}</p>
      <label className="drawer-status">{groupField?.name}{statusSelect(selected)}</label>
      {recordField ? <><label className="record-label" htmlFor="record-draft">{recordField.name}</label><textarea id="record-draft" rows={12} value={recordDraft} disabled={pending.has(selected.id)} onChange={e => setRecordDraft(e.target.value)} placeholder="记录本次练习的内容、困难和进步…"/>
        <div className="drawer-actions"><button className="subtle-button" disabled={pending.has(selected.id)} onClick={() => setRecordDraft(t => `${t}${t ? '\n\n' : ''}${new Date().toLocaleDateString('sv-SE')}\n`)}>追加今日记录</button><button className="primary-button" disabled={pending.has(selected.id) || recordDraft === recordExpected.text} onClick={() => void write(selected, recordField.id, recordExpected, {text: recordDraft, refs: []})}>{pending.has(selected.id) ? '正在保存…' : '保存记录'}</button></div></> : <p>请在连接与字段中选择文本记录属性，或直接打开原笔记继续记录。</p>}
      <button className="original-note" onClick={() => void open(selected.id)}>在 RemNote 打开完整笔记 ↗</button>
    </aside></div>}
  </main>;
}
