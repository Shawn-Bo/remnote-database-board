// @vitest-environment happy-dom
import React from 'react';
import ReactDOM from 'react-dom';
import {act, Simulate} from 'react-dom/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Board} from '../src/Board';
import {createDraftStore} from '../src/drafts';
import type {Draft} from '../src/drafts';
import type {BoardPort, Snapshot} from '../src/model';
import {sameCell} from '../src/model';
import fixture from '../src/demo-snapshot.json';
import config from '../src/demo-config.json';

const roots = new Set<HTMLDivElement>();
afterEach(() => {
  for (const root of roots) act(() => {ReactDOM.unmountComponentAtNode(root); root.remove();});
  roots.clear();
});

function setup() {
  const data: Snapshot = structuredClone(fixture);
  const saved = new Map<string, Draft | null>();
  const storage = {
    get: vi.fn(async (key: string) => saved.get(key)),
    set: vi.fn(async (key: string, value: Draft | null) => {saved.set(key, structuredClone(value));})
  };
  const port: BoardPort = {
    load: vi.fn(async () => structuredClone(data)),
    write: vi.fn(async request => {
      const row = data.rows.find(row => row.id === request.rowId)!;
      if (!sameCell(row.cells[request.fieldId], request.expected)) throw new Error('其他操作已修改记录');
      row.cells[request.fieldId] = structuredClone(request.value);
      return structuredClone(row);
    }),
    open: vi.fn(async () => {})
  };
  const mount = async (onClose?: () => Promise<void>) => {
    const root = document.createElement('div'); document.body.append(root); roots.add(root);
    await act(async () => {ReactDOM.render(<Board port={port} initial={config} draftStore={createDraftStore(storage)} onClose={onClose}/>, root);});
    return root;
  };
  return {data, saved, storage, port, mount};
}
const button = (root: HTMLElement, name: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name || b.getAttribute('aria-label') === name)!;
const click = async (element: HTMLElement) => {await act(async () => {Simulate.click(element);});};
const openRecord = async (root: HTMLElement) => {await click(root.querySelector<HTMLButtonElement>('.card-title')!);};
const edit = async (root: HTMLElement, text: string) => {await act(async () => {Simulate.change(root.querySelector('#record-draft')!, {target: {value: text}} as any);});};
const text = (root: HTMLElement) => root.querySelector<HTMLTextAreaElement>('#record-draft')!.value;

describe('record draft recovery', () => {
  it('recovers an unsaved draft after closing the whole widget without changing the original record', async () => {
    const {mount, port, data} = setup();
    const original = data.rows[0].cells[config.recordFieldId].text;
    const root = await mount(); await openRecord(root); await edit(root, '尚未完成的训练记录');
    expect(root.querySelector('.draft-status')?.textContent).toContain('暂存在此设备');
    act(() => {ReactDOM.unmountComponentAtNode(root);});
    // Recreate both the widget and its storage adapter, as when reopening a popup.
    const reopened = await mount(); await openRecord(reopened);
    expect(text(reopened)).toBe('尚未完成的训练记录');
    expect(button(reopened, '保存记录').disabled).toBe(false);
    expect(port.write).not.toHaveBeenCalled();
    expect(data.rows[0].cells[config.recordFieldId].text).toBe(original);
  });

  it('removes the old save confirmation as soon as the user edits or appends again', async () => {
    const {mount, data} = setup(); const root = await mount(); await openRecord(root);
    await edit(root, '第一次保存'); await click(button(root, '保存记录'));
    expect(root.querySelector('.drawer-feedback')?.textContent).toContain('记录已写入');
    await edit(root, '第二次尚未保存');
    expect(root.querySelector('.drawer-feedback')).toBeNull();
    expect(root.querySelector('.draft-status')?.textContent).toContain('尚未写入');
    expect(data.rows[0].cells[config.recordFieldId].text).toBe('第一次保存');
    await click(button(root, '保存记录')); await click(button(root, '追加今日记录'));
    expect(root.querySelector('.drawer-feedback')).toBeNull();
    expect(button(root, '保存记录').disabled).toBe(false);
  });

  it('waits for local draft persistence before opening the original note and closing', async () => {
    const {mount, storage, port, saved} = setup();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => {release = resolve;});
    storage.set.mockImplementation(async (key, value) => {await waiting; saved.set(key, structuredClone(value));});
    const onClose = vi.fn(async () => {});
    const root = await mount(onClose); await openRecord(root); await edit(root, '退出前的草稿');
    await click(button(root, '在 RemNote 打开完整笔记 ↗'));
    expect(port.open).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
    await act(async () => {release();});
    expect([...saved.values()].find(Boolean)?.text).toBe('退出前的草稿');
    expect(port.open).toHaveBeenCalledTimes(1); expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the record open when draft storage fails, and retries without dropping the text', async () => {
    const {mount, storage} = setup(); const root = await mount(); await openRecord(root);
    storage.set.mockRejectedValue(new Error('storage unavailable'));
    await edit(root, '不能丢掉的草稿'); await click(button(root, '关闭记录'));
    expect(text(root)).toBe('不能丢掉的草稿');
    expect(root.querySelector('.draft-status.error')?.textContent).toContain('暂存失败');
    storage.set.mockResolvedValue(undefined);
    await click(button(root, '关闭记录'));
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('leaves an unreadable stored draft intact and lets the user close and retry', async () => {
    const {mount, storage} = setup(); storage.get.mockRejectedValue(new Error('storage unavailable'));
    const root = await mount(); await openRecord(root);
    expect(root.querySelector<HTMLTextAreaElement>('#record-draft')!.disabled).toBe(true);
    expect(root.querySelector('.draft-status.error')?.textContent).toContain('无法读取');
    await click(button(root, '关闭记录'));
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('preserves the local draft on an external edit and requires an explicit merge before saving', async () => {
    const {mount, data, port} = setup(); const root = await mount(); await openRecord(root);
    await edit(root, '本机的新记录');
    data.rows[0].cells[config.recordFieldId] = {text: '其他设备的新记录', refs: []};
    await click(button(root, '刷新'));
    expect(text(root)).toBe('本机的新记录');
    expect(root.querySelector('.record-conflict pre')?.textContent).toBe('其他设备的新记录');
    expect(button(root, '保存记录').disabled).toBe(true);
    expect(port.write).not.toHaveBeenCalled();
    await edit(root, '其他设备的新记录\n本机的新记录'); await click(button(root, '已合并，允许保存'));
    expect(button(root, '保存记录').disabled).toBe(false);
    await click(button(root, '保存记录'));
    expect(data.rows[0].cells[config.recordFieldId].text).toBe('其他设备的新记录\n本机的新记录');
    expect(vi.mocked(port.write).mock.calls[0][0].expected.text).toBe('其他设备的新记录');
  });

  it('refreshes a clean open editor when the original record changes', async () => {
    const {mount, data} = setup(); const root = await mount(); await openRecord(root);
    data.rows[0].cells[config.recordFieldId] = {text: '已更新的原记录', refs: []};
    await click(button(root, '刷新'));
    expect(text(root)).toBe('已更新的原记录');
    expect(root.querySelector('.record-conflict')).toBeNull();
    expect(button(root, '保存记录').disabled).toBe(true);
  });
});
