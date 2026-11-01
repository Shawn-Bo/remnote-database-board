const assert = require('node:assert/strict');
const {chromium, devices} = require('playwright');
const fixture = require('../src/demo-snapshot.json');
const config = require('../src/demo-config.json');

// This test controls only the local preview with synthetic rows, never RemNote.
const url = process.env.BOARD_TEST_URL || 'http://localhost:8083/preview.html';
const point = (x, y) => ({x: Math.round(x), y: Math.round(y), radiusX: 2, radiusY: 2, force: 1, id: 1});

async function newFixture(browser) {
  const context = await browser.newContext({...devices['iPhone 13'], isMobile: true, hasTouch: true});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await page.goto(url);
  await page.waitForSelector('.card');
  return {context, page, errors, cdp: await context.newCDPSession(page)};
}

async function startAtGrip(page, cdp, row) {
  const grip = page.locator(`[data-row-id="${row.id}"] .grip`);
  await grip.scrollIntoViewIfNeeded();
  const rect = await grip.boundingBox();
  assert.ok(rect && rect.height >= 44, 'drag handle must be visible and touch-sized');
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point(x, y)]});
  return {x, y};
}

async function moveTouch(cdp, start, endX) {
  for (let i = 1; i <= 20; i++) {
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [point(start.x + (endX - start.x) * i / 20, start.y)]});
  }
}

async function main() {
  const browser = await chromium.launch({headless: true});
  const checks = [];
  try {
    {
      const {context, page, cdp, errors} = await newFixture(browser);
      try {
        const row = fixture.rows[0], target = fixture.fields[1].choices[7].id;
        const start = await startAtGrip(page, cdp, row);
        const edgeX = page.viewportSize().width - 15;
        await moveTouch(cdp, start, edgeX);
        await page.waitForFunction(({x, y, target}) =>
          document.elementFromPoint(x, y)?.closest('[data-column-id]')?.getAttribute('data-column-id') === target,
          {x: edgeX, y: Math.round(start.y), target}, {timeout: 10000});
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        await page.waitForFunction(({id, field, target}) =>
          JSON.parse(sessionStorage.getItem('remnote-board-preview:v1'))?.rows.find(r => r.id === id)?.cells[field]?.refs[0] === target,
          {id: row.id, field: config.groupFieldId, target});
        const saved = await page.evaluate(id => JSON.parse(sessionStorage.getItem('remnote-board-preview:v1')).rows.find(r => r.id === id), row.id);
        assert.equal(saved.parentId, row.parentId);
        for (const [id, cell] of Object.entries(row.cells)) if (id !== config.groupFieldId) assert.deepEqual(saved.cells[id], cell);
        assert.deepEqual(errors, []);
        checks.push('A stationary finger at the right edge scrolls across eight columns and drops into the intended group');
      } finally {await context.close();}
    }
    {
      const {context, page, cdp, errors} = await newFixture(browser);
      try {
        const row = fixture.rows[8];
        const start = await startAtGrip(page, cdp, row);
        const scroller = page.locator('.board-scroll');
        const initial = await scroller.evaluate(el => el.scrollLeft);
        assert.ok(initial > 200, 'last column should require horizontal scrolling');
        await moveTouch(cdp, start, 15);
        await page.waitForFunction(initial => document.querySelector('.board-scroll').scrollLeft < initial - 80, initial, {timeout: 5000});
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
        await page.waitForTimeout(200);
        const stopped = await scroller.evaluate(el => el.scrollLeft);
        await page.waitForTimeout(350);
        assert.equal(await scroller.evaluate(el => el.scrollLeft), stopped);
        assert.equal(await page.locator('.card.dragging').count(), 0);
        assert.equal(await page.evaluate(() => sessionStorage.getItem('remnote-board-preview:v1')), null);
        assert.deepEqual(errors, []);
        checks.push('A cancelled touch drag stops scrolling and does not write');
      } finally {await context.close();}
    }
    {
      const {context, page, cdp, errors} = await newFixture(browser);
      try {
        const song = page.locator('.card-property').first();
        await song.scrollIntoViewIfNeeded();
        const rect = await song.boundingBox();
        const start = {x: rect.x + 150, y: rect.y + rect.height / 2};
        const scroller = page.locator('.board-scroll');
        const before = await scroller.evaluate(el => el.scrollLeft);
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point(start.x, start.y)]});
        await moveTouch(cdp, start, start.x - 110);
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        await page.waitForTimeout(400);
        assert.ok(await scroller.evaluate(el => el.scrollLeft) > before + 20, 'swiping on a card should scroll the board');
        assert.equal(await page.evaluate(() => sessionStorage.getItem('remnote-board-preview:v1')), null);
        assert.deepEqual(errors, []);
        checks.push('A horizontal swipe on a card scrolls without changing the record');
      } finally {await context.close();}
    }
    console.log(JSON.stringify({passed: true, engine: 'Chromium touch input, iPhone 13 viewport, synthetic fixture', checks}, null, 2));
  } finally {await browser.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});
