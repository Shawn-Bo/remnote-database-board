import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {RichText, renderWidget, usePlugin} from '@remnote/plugin-sdk';
import {Board} from '../Board';
import {SdkBoardPort} from '../sdk-port';
import {LAST_CONFIG_KEY, configKey, saveConfig} from '../config';
import {readPaneContext} from '../widget-context';
import {createDraftStore} from '../drafts';
import type {Config} from '../model';
import '../board.css';

function BoardWidget() {
  const plugin = usePlugin();
  const port = useMemo(() => new SdkBoardPort(plugin), [plugin]);
  const drafts = useMemo(() => createDraftStore({
    get: key => plugin.storage.getLocal(key),
    set: (key, value) => plugin.storage.setLocal(key, value)
  }), [plugin]);
  const [context, setContext] = useState<{initial: Partial<Config> & {tagId: string}; rowScope?: string[]}>();
  const [error, setError] = useState('');
  const persist = useCallback((config: Config) => saveConfig(plugin, config), [plugin]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const {config: raw, rowScope} = readPaneContext(await plugin.widget.getWidgetContext());
      const previous = await plugin.storage.getSynced<Config>(LAST_CONFIG_KEY);
      const tagId = typeof raw.tagId === 'string' ? raw.tagId : previous?.tagId ?? '';
      const stored = tagId ? await plugin.storage.getSynced<Config>(configKey(tagId)) : undefined;
      const initial = {...stored, ...raw, tagId};
      if (alive) setContext({initial, rowScope});
    })().catch(e => {if (alive) setError(String(e));});
    return () => {alive = false;};
  }, [plugin]);
  if (error) return <div role="alert">看板初始化失败：{error}</div>;
  return context ? <Board port={port} initial={context.initial} draftStore={drafts} rowScope={context.rowScope} onConfig={persist} onClose={() => plugin.widget.closePopup()}
    renderRichCell={(cell, mode) => <RichText text={cell.richText!} width="100%" height="auto" maxHeight={mode === 'card' ? 160 : mode === 'table' ? 200 : 500}/>}/> : <div style={{padding: 24}}>正在连接 RemNote 数据库…</div>;
}
renderWidget(BoardWidget);
