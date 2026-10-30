import {expect,it} from 'vitest';
import {readPaneContext} from '../src/widget-context';
it('reads the public SDK Popup contextData shape and retains an empty table scope',()=>{
  expect(readPaneContext({paneId:'pane',contextData:{tagId:'tag',groupFieldId:'status',rowScope:[]}})).toEqual({config:{tagId:'tag',groupFieldId:'status'},rowScope:[]});
});
it('deduplicates valid scope IDs and ignores unrelated or malformed widget data',()=>{
  expect(readPaneContext({contextData:{tagId:'tag',rowScope:['a',null,'a','b'],filterFieldId:17}})).toEqual({config:{tagId:'tag'},rowScope:['a','b']});
  expect(readPaneContext(null)).toEqual({config:{},rowScope:undefined});
});
