const assert = require('node:assert/strict');
const {webkit,devices} = require(process.env.BOARD_PLAYWRIGHT_MODULE || 'playwright');
const fixture = require('../src/demo-snapshot.json');
const config = require('../src/demo-config.json');
async function main(){
  const browser=await webkit.launch({headless:true});
  const context=await browser.newContext({...devices['iPhone 13'],isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='localhost'?route.continue():route.abort());
  try {
    await page.goto(process.env.BOARD_TEST_URL || 'http://localhost:8081/preview.html');
    await page.waitForSelector('.card');
    assert.equal(await page.locator('.card').count(),9);
    assert.equal(await page.locator('.column').count(),9);
    const row=fixture.rows[0], source=fixture.fields[1].choices[0].id, target=fixture.fields[1].choices[1].id;
    const grip=await page.locator(`[data-row-id="${row.id}"] .grip`).boundingBox();
    assert.ok(grip.height>=44,`touch handle height: ${grip.height}`);
    const status=page.getByLabel(`${row.name}的熟练度`,{exact:true});
    const size=await status.evaluate(el=>({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)}));
    assert.ok(size.height>=44 && size.font>=16,JSON.stringify(size));
    await status.selectOption(target);
    await page.waitForSelector(`[data-column-id="${target}"] [data-row-id="${row.id}"]`);
    await page.locator(`[data-row-id="${row.id}"] .card-title`).tap();
    await page.getByLabel('进展记录',{exact:true}).fill('模拟手机练习记录');
    await page.getByRole('button',{name:'保存记录',exact:true}).tap();
    await page.waitForFunction(({rowId,field})=>JSON.parse(sessionStorage.getItem('remnote-board-preview:v1'))?.rows.find(r=>r.id===rowId)?.cells[field].text==='模拟手机练习记录',{rowId:row.id,field:config.recordFieldId});
    await page.getByRole('button',{name:'关闭记录',exact:true}).tap();
    await page.getByLabel('筛选歌曲',{exact:true}).selectOption('歌曲 B');
    assert.equal(await page.locator('.card').count(),3);
    await page.goto((process.env.BOARD_TEST_URL || 'http://localhost:8081/preview.html')+'?setup=1');
    await page.getByText('首次使用时，粘贴表格所属标签的链接或 ID，然后选择分组属性。').waitFor({state:'visible'});
    await page.getByLabel('表格标签链接或 ID',{exact:true}).fill(fixture.tagId);
    await page.getByRole('button',{name:'连接',exact:true}).tap();
    await page.waitForSelector('.card');
    assert.equal(await page.locator('.card').count(),9);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,device:'Playwright WebKit iPhone 13 emulation',checks:['nine columns and rows','44px grip and select, 16px text','status select changes sample group','tap and save record','filter by song','fresh setup connects a selected table'],pageErrors:errors},null,2));
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
