const assert = require('node:assert/strict');
const {webkit,devices} = require(process.env.BOARD_PLAYWRIGHT_MODULE || 'playwright');
const fixture = require('../src/demo-snapshot.json');
const config = require('../src/demo-config.json');
async function main() {
  const browser = await webkit.launch({headless:true});
  const context = await browser.newContext({...devices['iPhone 13'],isMobile:true,hasTouch:true});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',e => errors.push(e.message));
  await page.route('**/*',route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  const url = process.env.BOARD_TEST_URL || 'http://localhost:8083/preview.html';
  try {
    await page.goto(url);
    await page.waitForSelector('.card');
    assert.equal(await page.locator('.card').count(),9);
    const row = fixture.rows[0], target = fixture.fields[1].choices[1].id;
    const grip = await page.locator(`[data-row-id="${row.id}"] .grip`).boundingBox();
    assert.ok(grip.height >= 44 && grip.width >= 44,JSON.stringify(grip));
    await page.getByRole('tab',{name:'Table',exact:true}).tap();
    const status = page.locator(`tr[data-row-id="${row.id}"]`).getByLabel(fixture.fields.find(f => f.id === config.groupFieldId).name,{exact:true});
    const size = await status.evaluate(el => ({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)}));
    assert.ok(size.height >= 44 && size.font >= 16,JSON.stringify(size));
    await status.selectOption(target);
    await page.waitForFunction(({rowId,field,target}) => JSON.parse(sessionStorage.getItem('remnote-board-preview:v2'))?.rows.find(r => r.id === rowId)?.cells[field].refs[0] === target,{rowId:row.id,field:config.groupFieldId,target});
    await page.locator(`tr[data-row-id="${row.id}"] .table-name`).tap();
    assert.equal(await page.locator('.native-note-slot').count(),1);
    assert.equal(await page.locator('textarea').count(),0);
    await page.getByRole('button',{name:'Close note',exact:true}).tap();
    await page.getByRole('button',{name:'Filter',exact:true}).tap();
    await page.getByRole('button',{name:'Add filter',exact:true}).tap();
    await page.getByLabel('Filter property 1',{exact:true}).selectOption(config.filterFieldId);
    await page.getByLabel('Filter value 1',{exact:true}).selectOption('example-option-1-2');
    assert.equal(await page.locator('tbody tr').count(),3);
    await page.getByRole('button',{name:'Close settings',exact:true}).tap();
    await page.getByRole('tab',{name:'Board',exact:true}).tap();
    await page.waitForSelector(`[data-column-id="${target}"] [data-row-id="${row.id}"]`);
    assert.equal(await page.locator('.card').count(),9);
    await page.goto(url+'?setup=1');
    await page.getByLabel('Table tag link or ID',{exact:true}).fill(fixture.tagId);
    await page.getByRole('button',{name:'Connect',exact:true}).tap();
    await page.waitForSelector('tbody tr');
    assert.equal(await page.locator('tbody tr').count(),9);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,device:'WebKit iPhone 13 emulation; native RemNote editor not included',checks:['44px grip and select, 16px text','status update reflected in board','native-note entry without duplicate editor','per-view filter','fresh database connection'],pageErrors:errors},null,2));
  } finally {await browser.close();}
}
main().catch(e => {console.error(e);process.exitCode=1;});
