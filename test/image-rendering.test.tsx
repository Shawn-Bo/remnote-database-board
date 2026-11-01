// @vitest-environment happy-dom
import React from 'react';
import ReactDOM from 'react-dom';
import {act, Simulate} from 'react-dom/test-utils';
import {expect, it, vi} from 'vitest';
import {Board} from '../src/Board';
import type {BoardPort, Cell, Snapshot} from '../src/model';
import fixture from '../src/demo-snapshot.json';
import config from '../src/demo-config.json';

it('renders original image rich text in cards and table cells without writing records',async()=>{
  const data:Snapshot=structuredClone(fixture);
  const raw:any=['说明 ',{i:'i',url:'%LOCAL_FILE%score.png',percent:0,width:1052,height:387}];
  data.fields.push({id:'score',name:'小节截图',type:'text',choices:[]});
  data.rows[0].cells.score={text:'说明',refs:[],richText:raw};
  const port:BoardPort={load:async()=>data,write:vi.fn(),open:vi.fn()};
  const render=vi.fn((cell:Cell,mode:string)=><div data-image-mode={mode}><img src="score.png" alt="小节截图"/></div>);

  const root=document.createElement('div');document.body.append(root);
  try {
    await act(async()=>{ReactDOM.render(<Board port={port} initial={config} renderRichCell={render}/>,root);});
    expect(root.querySelector('.card-media img')).not.toBeNull();
    expect(render.mock.calls.find(([,mode])=>mode==='card')?.[0].richText).toBe(raw);
    await act(async()=>{Simulate.click(root.querySelector<HTMLButtonElement>('.card-title')!);});
    expect(root.querySelector(".native-note-slot")).not.toBeNull();
    await act(async()=>{Simulate.click(root.querySelector<HTMLButtonElement>('[aria-label="关闭笔记"]')!);});
    const tableButton=[...root.querySelectorAll('[role="tab"]')].find(button=>button.textContent==='表格')!;
    await act(async()=>{Simulate.click(tableButton);});
    expect(root.querySelector('td img')).not.toBeNull();
    expect(render.mock.calls.find(([,mode])=>mode==='table')?.[0].richText).toBe(raw);
    expect(port.write).not.toHaveBeenCalled();
    expect((raw[1] as any).percent).toBe(0);
  } finally {act(()=>{ReactDOM.unmountComponentAtNode(root);});root.remove();}
});
