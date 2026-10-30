import {describe, expect, it, vi} from 'vitest';
import {SdkBoardPort, references} from '../src/sdk-port';
import {inferConfig} from '../src/model';
import type {Snapshot, WriteRequest} from '../src/model';
import fixture from '../src/demo-snapshot.json';

function setup() {
  const data: Snapshot=structuredClone(fixture);
  const nodes=new Map<string, any>();
  const writes: {row:string;field:string;raw:any}[]=[];
  const strings=(raw:any):string=>(raw??[]).map((v:any)=>typeof v==='string'?v:nodes.get(v._id)?.text.join('')??'').join('');
  const tag={_id:data.tagId,text:[data.name],getChildrenRem:async()=>data.fields.map(f=>nodes.get(f.id)),taggedRem:async()=>data.rows.map(r=>nodes.get(r.id))};
  nodes.set(tag._id,tag);
  for(const f of data.fields){nodes.set(f.id,{_id:f.id,text:[f.name],isProperty:async()=>true,getPropertyType:async()=>f.type,getChildrenRem:async()=>f.choices.map(c=>nodes.get(c.id)),getPowerupPropertyAsRem:async()=>undefined});for(const c of f.choices)nodes.set(c.id,{_id:c.id,text:[c.name],isProperty:async()=>false});}
  for(const row of data.rows){const values:Record<string,any>={};for(const [key,c]of Object.entries(row.cells))values[key]=c.refs.length?c.refs.map(id=>({i:'q',_id:id})):c.text?[c.text]:undefined;nodes.set(row.id,{_id:row.id,text:[row.name],parent:row.parentId,getTagRems:async()=>[tag],getTagPropertyValue:vi.fn(async(id:string)=>values[id]),setTagPropertyValue:vi.fn(async(id:string,raw:any)=>{writes.push({row:row.id,field:id,raw});values[id]=raw;}),values});}
  const plugin:any={rem:{findOne:async(id:string)=>nodes.get(id)},richText:{toString:async(raw:any)=>strings(raw),rem:(id:string)=>({value:async()=>[{i:'q',_id:id}]})},window:{openRem:vi.fn(async()=>{})}};
  const port=new SdkBoardPort(plugin);
  const config=inferConfig(data);
  const request:WriteRequest={config,rowId:data.rows[0].id,fieldId:config.groupFieldId,expected:data.rows[0].cells[config.groupFieldId],value:{text:data.fields[1].choices[1].name,refs:[data.fields[1].choices[1].id]}};
  return{data,nodes,writes,plugin,port,config,request};
}
describe('public SDK property write adapter',()=>{
  it('loads all rows, property options and a current-table subset',async()=>{const{port,data}=setup();expect((await port.load(data.tagId)).rows).toHaveLength(9);expect((await port.load(data.tagId,[data.rows[2].id])).rows.map(r=>r.id)).toEqual([data.rows[2].id]);expect((await port.load(data.tagId,[])).rows).toHaveLength(0);});
  it('writes only proficiency, reads it back, and preserves identity, parent and record',async()=>{const{port,request,data,writes}=setup();const saved=await port.write(request);expect(writes).toEqual([{row:request.rowId,field:request.fieldId,raw:[{i:'q',_id:request.value.refs[0]}]}]);expect(saved.parentId).toBe(data.rows[0].parentId);expect(saved.cells[request.config.recordFieldId]).toEqual(data.rows[0].cells[request.config.recordFieldId]);expect(saved.id).toBe(request.rowId);});
  it('saves and reads back progress text independently',async()=>{const{port,request,data,writes}=setup();request.fieldId=request.config.recordFieldId;request.expected=data.rows[0].cells[request.fieldId];request.value={text:'慢速练习8次\n定位改善',refs:[]};const saved=await port.write(request);expect(saved.cells[request.fieldId]).toEqual(request.value);expect(writes).toHaveLength(1);});
  it('refuses stale edits before writing',async()=>{const{port,request,nodes,writes}=setup();nodes.get(request.rowId).values[request.fieldId]=['别的窗口刚改过'];await expect(port.write(request)).rejects.toThrow('其他操作修改');expect(writes).toHaveLength(0);});
  it('refuses deleted options and records no longer in this database',async()=>{const a=setup();a.data.fields[1].choices=a.data.fields[1].choices.filter(c=>c.id!==a.request.value.refs[0]);await expect(a.port.write(a.request)).rejects.toThrow('选项已被删除');expect(a.writes).toHaveLength(0);const b=setup();b.nodes.get(b.request.rowId).getTagRems=async()=>[];await expect(b.port.write(b.request)).rejects.toThrow('已不属于');expect(b.writes).toHaveLength(0);});
  it('does not treat an unconfirmed write as success',async()=>{const{port,request,nodes}=setup();nodes.get(request.rowId).setTagPropertyValue=async()=>{};await expect(port.write(request)).rejects.toThrow('未能确认');});
  it('unlocks a failed row for retry',async()=>{const{port,request,nodes}=setup();const row=nodes.get(request.rowId);const original=row.setTagPropertyValue;row.setTagPropertyValue=async()=>{throw new Error('offline')};await expect(port.write(request)).rejects.toThrow('offline');row.setTagPropertyValue=original;await expect(port.write(request)).resolves.toMatchObject({id:request.rowId});});
  it('rejects a second in-flight change to the same row',async()=>{const{port,request}=setup();const first=port.write(request);await expect(port.write(request)).rejects.toThrow('正在保存');await first;});
  it('opens original Rem through public SDK',async()=>{const{port,request,plugin}=setup();await port.open(request.rowId);expect(plugin.window.openRem.mock.calls[0][0]._id).toBe(request.rowId);});
  it('ignores unrelated image and hyperlink IDs',()=>{expect(references(['x',{i:'q',_id:'option'},{i:'img',_id:'image'},{i:'a',_id:'url'}])).toEqual(['option']);});
});
