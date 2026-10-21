// Native mobile gestures against the application styles; no account or server data.
// Run: node --test scripts/imageTouchNavigation.test.cjs
const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

it('scrolls from instructional images and pans both ways after native zoom', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const client = await page.context().newCDPSession(page);
    const styles = ['classic.css', 'instructional-content.css'].map(file =>
      fs.readFileSync(path.resolve(__dirname, '../public/styles', file), 'utf8')).join('\n');
    const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="800"><rect width="360" height="800" fill="lightblue"/><text x="10" y="100">Left</text><text x="300" y="100">Right</text></svg>');
    const drag = async (x, y, dx, dy) => {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 12; i++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y: y + dy * i / 12 }] });
        await page.waitForTimeout(20);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
    };
    for (const stimulus of [false, true]) {
      await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}
        body { margin: 0; } #column { height: 600px; } figure { margin: 0; }
        #after { min-height: 600px; }
      </style><main id="column" class="sparc-auto-tutor-chat"><div class="sparc-auto-tutor-content">
        <figure class="sparc-prompt-figure"><img ${stimulus ? 'id="questionImage" class="stimulus-image"' : ''} src="${image}" alt="Synthetic wide teaching figure"></figure>
        <div id="after">Later conversation</div></div></main>`);
      await page.locator('img').evaluate(img => img.decode());
      await drag(180, 250, 0, -150);
      const down = await page.locator('#column').evaluate(el => el.scrollTop);
      assert.ok(down > 50, `Dragging upward from ${stimulus ? 'stimulus' : 'SPARC'} image must scroll the column`);
      await drag(180, 180, 0, 120);
      assert.ok(await page.locator('#column').evaluate(el => el.scrollTop) < down - 30, 'Dragging downward from an image must scroll back');
      await page.locator('#column').evaluate(el => { el.scrollTop = 0; });
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 150, y: 230 }, { id: 2, x: 230, y: 230 }] });
      for (let i = 1; i <= 12; i++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: 150 - i * 5, y: 230 }, { id: 2, x: 230 + i * 5, y: 230 }] });
        await page.waitForTimeout(20);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      const zoom = await page.evaluate(() => ({ scale: visualViewport.scale, x: visualViewport.offsetLeft }));
      assert.ok(zoom.scale > 1.5, `Native pinch zoom remains available: ${JSON.stringify(zoom)}`);
      await drag(150, 200, -100, 0);
      const right = await page.evaluate(() => visualViewport.offsetLeft);
      assert.ok(right > zoom.x + 10, 'A drag starting on the enlarged image must reveal its right side');
      await drag(80, 200, 100, 0);
      assert.ok(await page.evaluate(() => visualViewport.offsetLeft) < right - 10, 'The enlarged image must pan back toward its left side');
    }
  } finally { await browser.close(); }
});
