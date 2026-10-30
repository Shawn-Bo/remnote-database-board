// @vitest-environment happy-dom
import React from 'react';
import ReactDOM from 'react-dom';
import {act, Simulate} from 'react-dom/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Board} from '../src/Board';
import type {BoardPort, Snapshot} from '../src/model';
import fixture from '../src/demo-snapshot.json';
import config from '../src/demo-config.json';
import {createDraftStore} from '../src/drafts';

describe('record save feedback', () => {
  afterEach(() => {vi.useRealTimers(); document.body.innerHTML = '';});

  it('keeps an unsuccessful save visible in the open record after background refresh', async () => {
    vi.useFakeTimers();
    const data: Snapshot = structuredClone(fixture);
    const port: BoardPort = {
      load: vi.fn(async () => structuredClone(data)),
      write: vi.fn(async () => {throw new Error('记录保存失败');}),
      open: vi.fn(async () => {})
    };
    const root = document.createElement('div');
    document.body.append(root);
    const drafts = createDraftStore({get: async () => undefined, set: async () => {}});
    await act(async () => {ReactDOM.render(<Board port={port} initial={config} draftStore={drafts} />, root);});
    const card = root.querySelector<HTMLButtonElement>('.card-title')!;
    await act(async () => {Simulate.click(card);});
    const editor = root.querySelector<HTMLTextAreaElement>('#record-draft')!;
    await act(async () => {Simulate.change(editor, {target: {value: '练习记录'} } as any);});
    const save = root.querySelector<HTMLButtonElement>('.detail-drawer .primary-button')!;
    expect(save.disabled).toBe(false);
    await act(async () => {Simulate.click(save);});
    const alert = () => root.querySelector('[role="dialog"] [role="alert"]');
    expect(alert()?.textContent).toContain('记录保存失败');
    expect(editor.value).toBe('练习记录');
    await act(async () => {await vi.advanceTimersByTimeAsync(6000);});
    expect(alert()?.textContent).toContain('记录保存失败');
    expect(editor.value).toBe('练习记录');
    act(() => {ReactDOM.unmountComponentAtNode(root);});
  });
});
