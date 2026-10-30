import React from 'react';
import ReactDOM from 'react-dom';
import {Board} from './Board';
import type {BoardPort, Snapshot, WriteRequest} from './model';
import {sameCell} from './model';
import initial from './demo-config.json';
import fixture from './demo-snapshot.json';
import './board.css';
// Isolated UI fixture. No SDK, credentials or RemNote write endpoint is included.
const storageKey = 'remnote-board-preview:v1';
let data: Snapshot = structuredClone(fixture);
try {const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); if (saved?.tagId === fixture.tagId && Array.isArray(saved.rows)) data = saved;} catch {}
const port: BoardPort = {
  async load(tagId) {if(tagId !== fixture.tagId)throw new Error('示例数据库不存在。');return structuredClone({...data, loadedAt: Date.now()});},
  async write(req: WriteRequest) {
    await new Promise(r => setTimeout(r, 180));
    const row = data.rows.find(r => r.id === req.rowId);
    if (!row || !sameCell(row.cells[req.fieldId], req.expected)) throw new Error('演示数据已改变，请刷新。');
    row.cells[req.fieldId] = structuredClone(req.value);
    sessionStorage.setItem(storageKey, JSON.stringify(data));
    return structuredClone(row);
  },
  async open() {throw new Error('这是独立演示。正式插件会在 RemNote 打开对应的原笔记。');}
};
const start = new URLSearchParams(location.search).has('setup') ? {tagId:''} : initial;
ReactDOM.render(<Board port={port} initial={start} preview/>, document.getElementById('root'));
