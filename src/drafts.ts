import {useEffect, useRef, useState} from 'react';
import type {Cell} from './model';
import {sameCell} from './model';

export interface Draft {base: Cell; text: string}
export interface DraftStore {
  get(key: string): Promise<Draft | undefined>;
  put(key: string, draft?: Draft): Promise<void>;
}

export const draftKey = (tag: string, row: string, field: string) =>
  `database-board:draft:v1:${JSON.stringify([tag, row, field])}`;

// Use RemNote's device-local plugin storage in the widget. The preview supplies
// its own isolated storage; drafts never become extra Rems or external uploads.
export function createDraftStore(storage: {
  get(key: string): Promise<unknown>;
  set(key: string, value: Draft | null): Promise<void>;
}): DraftStore {
  let tail: Promise<void> = Promise.resolve();
  return {
    async get(key) {
      await tail.catch(() => {});
      const value = await storage.get(key) as Partial<Draft> | null | undefined;
      if (!value) return undefined;
      if (typeof value.text !== 'string' || typeof value.base?.text !== 'string' ||
        !Array.isArray(value.base.refs) || value.base.refs.some(id => typeof id !== 'string')) {
        throw new Error('暂存草稿无法读取。请保留原数据，再重试打开记录。');
      }
      return {text: value.text, base: {text: value.base.text, refs: [...value.base.refs]}};
    },
    put(key, draft) {
      // Ordered writes prevent an earlier keystroke from replacing a later one.
      const next = tail.catch(() => {}).then(() => storage.set(key, draft ?? null));
      tail = next;
      return next;
    }
  };
}

interface State extends Draft {key: string; ready: boolean; persisted: boolean; error: string}
const blank = (key: string): State => ({key, text: '', base: {text: '', refs: []}, ready: false, persisted: false, error: ''});

export function useRecordDraft(store: DraftStore, key: string, current?: Cell) {
  const [state, setState] = useState<State>(() => blank(key));
  const ref = useRef(state);
  const generation = useRef(0);
  const revision = useRef(0);
  const latestCell = useRef(current);
  latestCell.current = current;
  const replace = (next: State) => {ref.current = next; setState(next);};
  const persist = async (next: State): Promise<boolean> => {
    if (!next.key || !next.ready) return !next.key;
    const gen = generation.current, rev = ++revision.current;
    try {
      await store.put(next.key, next.text === next.base.text ? undefined : {base: next.base, text: next.text});
      if (generation.current === gen && revision.current === rev) replace({...ref.current, persisted: true, error: ''});
      return true;
    } catch {
      if (generation.current === gen && revision.current === rev) replace({...ref.current, persisted: false, error: '草稿暂存失败，请重试暂存或保存记录后再关闭。'});
      return false;
    }
  };

  useEffect(() => {
    const gen = ++generation.current;
    replace(blank(key));
    if (key) void store.get(key).then(saved => {
      if (generation.current !== gen) return;
      const cell = latestCell.current;
      if (!cell) throw new Error('找不到当前记录，请刷新后重试。');
      // A confirmed save may have completed immediately before the popup closed.
      // In that case an identical retained draft is already in the original Rem.
      const restored = saved && saved.text !== cell.text && saved.text !== saved.base.text;
      replace({key, base: restored ? saved.base : cell, text: restored ? saved.text : cell.text, ready: true, persisted: true, error: ''});
    }).catch(() => {
      if (generation.current === gen) replace({...blank(key), error: '无法读取暂存草稿，请关闭记录后重试。'});
    });
    return () => {++generation.current;};
  }, [store, key]);

  useEffect(() => {
    const value = ref.current;
    if (value.key === key && value.ready && value.text === value.base.text && current && !sameCell(current, value.base)) {
      replace({...value, text: current.text, base: current});
    }
  }, [key, current]);

  const active = state.key === key ? state : blank(key);
  return {
    ...active,
    dirty: active.ready && active.text !== active.base.text,
    conflict: active.ready && !!current && !sameCell(active.base, current),
    update(text: string) {
      if (ref.current.key !== key || !ref.current.ready) return;
      const next = {...ref.current, text, persisted: false, error: ''};
      replace(next); void persist(next);
    },
    acknowledgeLatest() {
      if (!current || !ref.current.ready || ref.current.key !== key) return;
      const next = {...ref.current, base: current, persisted: false, error: ''};
      replace(next); void persist(next);
    },
    async saved(cell: Cell) {
      if (ref.current.key !== key || !ref.current.ready) return;
      const next = {...ref.current, base: cell, text: cell.text, persisted: false, error: ''};
      replace(next); await persist(next);
    },
    async flush() {
      while (key && ref.current.ready && ref.current.key === key) {
        const value = ref.current;
        if (!await persist(value)) return false;
        if (value.text === ref.current.text && sameCell(value.base, ref.current.base)) return true;
      }
      return true;
    }
  };
}
