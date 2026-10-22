// Real SPARC renderers, synthetic content only; no accounts, history or providers.
// Run with the supported localhost watcher: node --test scripts/sparcDialoguePresentationBrowser.test.cjs
const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildFixture } = require('./sparcReadingOrderFixture.cjs');

it('groups speaker labels and shows zero-height-cost admin diagnostics on hover, focus and touch', { timeout: 120000 }, async () => {
  assert.equal((await fetch('http://localhost:3200/health')).ok, true);
  const fixture = await buildFixture();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1050, height: 800 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.route('http://localhost:3200/__sparc-presentation-fixture', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
    }));
    await page.goto('http://localhost:3200/__sparc-presentation-fixture');
    await page.addStyleTag({ content: fs.readFileSync(path.resolve(__dirname, '../public/styles/instructional-content.css'), 'utf8') + `
      :root { --app-space-1: 4px; --app-space-2: 8px; --app-space-3: 12px; --app-font-size-base: 16px;
        --app-line-height-relaxed: 1.5; --app-border-width: 1px; --app-state-disabled-surface-color: white; }
      body { font: 16px sans-serif; margin: 12px; }
      .sparc-auto-tutor-chat { height: 500px; flex: none; }
    ` });
    await page.addScriptTag({ content: fixture.source });
    await page.evaluate(async () => {
      const message = (id, speaker) => ({ id, nodeType: 'atomic', atomType: 'dialogue-utterance', speaker,
        value: 'Synthetic output.', ...(speaker === 'tutor' ? { productionRuleName: `Rule ${id}`,
          action: 'instruction.explain', targetId: 'expectation1', selectionTargetKind: 'expectation' } : {}) });
      await window.fixture.mount({ engine: {}, userId: 'synthetic', tdfId: 'synthetic', attemptId: 'synthetic',
        display: { unitType: 'sparc-autotutor-dialogue', pageKey: 'page',
          nodes: [message('t1', 'tutor'), message('t2', 'tutor'), message('l1', 'learner'), message('t3', 'tutor')] } });
    });
    assert.deepEqual(await page.locator('.sparc-dialogue-speaker').allTextContents(), ['Tutor', 'Learner', 'Tutor']);
    assert.equal(await page.locator('.sparc-production-marker').count(), 0);
    const bubble = page.locator('[data-node-id="t2"] .sparc-dialogue-bubble');
    const originalHeight = (await bubble.boundingBox()).height;
    await page.evaluate(() => window.fixture.update({ adminDiagnosticMode: true }));
    assert.equal(await page.locator('.sparc-production-marker').count(), 3);
    assert.equal(await page.locator('.sparc-production-details').count(), 0);
    assert.equal((await bubble.boundingBox()).height, originalHeight, 'Diagnostics must add no vertical space');
    const marker = bubble.locator('.sparc-production-marker');
    const panel = bubble.getByRole('tooltip');
    const panelHeight = async () => (await bubble.boundingBox()).height;
    await marker.hover();
    assert.equal(await panel.isVisible(), true);
    assert.match(await panel.innerText(), /production: Rule t2/);
    assert.match(await panel.innerText(), /selected:/);
    assert.equal(await panelHeight(), originalHeight, 'Open diagnostics must not reflow output');
    await panel.hover();
    assert.equal(await panel.isVisible(), true, 'Pointer can enter the diagnostic text');
    await page.mouse.move(1000, 750);
    assert.equal(await panel.isVisible(), false);
    await marker.focus();
    assert.equal(await panel.isVisible(), true);
    await marker.press('Escape');
    assert.equal(await panel.isVisible(), false);
    await marker.tap();
    assert.equal(await panel.isVisible(), true);
    await page.touchscreen.tap(1000, 700);
    assert.equal(await panel.isVisible(), false);
    await page.setViewportSize({ width: 390, height: 700 });
    await marker.hover();
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Tooltip stays inside mobile viewport');
    await page.screenshot({ path: path.resolve(__dirname, '../../tmp/sparc-dialogue-presentation-mobile.png') });
    await page.evaluate(() => window.fixture.update({ adminDiagnosticMode: false }));
    assert.equal(await page.locator('.sparc-production-marker').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});
