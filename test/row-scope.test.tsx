// @vitest-environment happy-dom
import React from 'react';
import ReactDOM from 'react-dom';
import {act, Simulate} from 'react-dom/test-utils';
import {afterEach, expect, it, vi} from 'vitest';
import {Board} from '../src/Board';
import type {BoardPort, Snapshot} from '../src/model';
import fixture from '../src/demo-snapshot.json';
import config from '../src/demo-config.json';

let root: HTMLDivElement;
afterEach(() => {act(() => {ReactDOM.unmountComponentAtNode(root);}); root.remove();});
async function setup() {
  const other: Snapshot = {...structuredClone(fixture), tagId: 'other-example-table', rows: fixture.rows.map((row, i) => ({...row, id: `other-example-row-${i}`}))};
  const port: BoardPort = {
    load: vi.fn(async (tagId, rowIds) => {
      const data: Snapshot = structuredClone(tagId === fixture.tagId ? fixture : other);
      if (rowIds) data.rows = data.rows.filter(row => rowIds.includes(row.id));
      return data;
    }),
    write: vi.fn(async () => {throw new Error('unused');}), open: vi.fn(async () => {})
  };
  root = document.createElement('div'); document.body.append(root);

  await act(async () => {ReactDOM.render(<Board port={port} initial={config} rowScope={[fixture.rows[0].id]}/>, root);});
  return {port, other};
}
const click = async (name: string) => {await act(async () => {Simulate.click([...root.querySelectorAll('button')].find(button => button.textContent === name || button.getAttribute('aria-label') === name)!);});};
const connection = async () => {await click('视图设置'); await act(async()=>{Simulate.click([...root.querySelectorAll('.settings-row')].find(b=>b.textContent?.includes('来源'))!);});};

it('never applies the original table row IDs to a different database', async () => {
  const {port, other} = await setup();
  expect(root.querySelectorAll('.card')).toHaveLength(1);
  await connection();
  await act(async () => {
    Simulate.change(root.querySelector('.connection input')!, {target: {value: other.tagId}} as any);
  });
  await act(async () => {Simulate.submit(root.querySelector('.connection form')!);});
  expect(port.load).toHaveBeenLastCalledWith(other.tagId, undefined);
  expect(root.querySelectorAll('[data-row-id]')).toHaveLength(9);
  await click('刷新');
  expect(port.load).toHaveBeenLastCalledWith(other.tagId, undefined);
  expect(root.querySelector('.connection')?.textContent).toContain('数据库全部记录');
});

it('keeps the initial subset on refresh until the user explicitly requests all database rows', async () => {
  const {port} = await setup(); await click('刷新');
  expect(port.load).toHaveBeenLastCalledWith(fixture.tagId, [fixture.rows[0].id]);
  expect(root.querySelectorAll('.card')).toHaveLength(1);
  await connection();
  await click('显示数据库全部记录');
  expect(root.querySelectorAll('[data-row-id]')).toHaveLength(9);
  await click('刷新'); expect(port.load).toHaveBeenLastCalledWith(fixture.tagId, undefined);
});
