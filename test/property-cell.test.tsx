// @vitest-environment happy-dom
import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { PropertyCell } from "../src/PropertyCell";

let root: HTMLDivElement;
afterEach(() => {
  if (root) { act(() => { ReactDOM.unmountComponentAtNode(root); }); root.remove(); }
});
async function setup() {
  const onSave = vi.fn(async () => true);
  root = document.createElement("div"); document.body.append(root);
  await act(async () => {
    ReactDOM.render(<PropertyCell cell={{text:"原文字",refs:[]}}
      field={{id:"notes",name:"备注",type:"text",choices:[]}} disabled={false}
      onSave={onSave} onOpen={() => {}} />, root);
    Simulate.click(root.querySelector("button")!);
  });
  await act(async () => { Simulate.change(root.querySelector("input")!, {target:{value:"zhong"}} as any); });
  return { onSave };
}
it("lets a Chinese input method confirm or dismiss its candidate without saving or closing the cell", async () => {
  const { onSave } = await setup();
  const input = root.querySelector("input")!;
  await act(async () => {
    Simulate.compositionStart(input);
    Simulate.keyDown(input, {key:"Enter"});
    Simulate.keyDown(input, {key:"Escape"});
  });
  expect(onSave).not.toHaveBeenCalled();
  expect(root.querySelector("input")).not.toBeNull();
  await act(async () => {
    Simulate.compositionEnd(input);
    Simulate.change(input, {target:{value:"中文备注"}} as any);
  });
  await act(async () => { Simulate.keyDown(input, {key:"Enter"}); });
  expect(onSave).toHaveBeenCalledOnce();
  expect(onSave).toHaveBeenCalledWith({text:"原文字",refs:[]}, {text:"中文备注",refs:[]});
});
it("ignores the input-method confirmation key reported as code 229 by WebKit", async () => {
  const { onSave } = await setup();
  await act(async () => { Simulate.keyDown(root.querySelector("input")!, {key:"Enter",keyCode:229}); });
  expect(onSave).not.toHaveBeenCalled();
  expect(root.querySelector("input")).not.toBeNull();
});
