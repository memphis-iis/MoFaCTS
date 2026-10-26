const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildFixture } = require('./sparcReadingOrderFixture.cjs');

it('reveals restored history once after staggered checks and decoded images, and exposes failures', { timeout: 120000 }, async () => {
  const fixture = await buildFixture();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://localhost:3200/__restore-layout', route => route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><html><body><main id="fixture"></main></body></html>' }));
    await page.goto('http://localhost:3200/__restore-layout');
    await page.addStyleTag({ content: fs.readFileSync(path.resolve(__dirname, '../public/styles/instructional-content.css'), 'utf8') + `
      :root { --app-space-1: 4px; --app-space-2: 8px; --app-space-3: 12px; --app-font-size-base: 16px; }
      body { font: 16px sans-serif; margin: 12px; }
      .sparc-auto-tutor-chat { height: 320px; flex: none; }
    ` });
    await page.addScriptTag({ content: fixture.source });
    for (const width of [1050, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(async () => {
        window.images = {};
        window.fixture.checkRemovals = () => new Promise(resolve => { window.check = resolve; });
        window.fixture.readImage = id => new Promise((resolve, reject) => { window.images[id] = { resolve, reject }; });
        const nodes = [];
        for (let i = 0; i < 3; i++) {
          const action = 'instruction.dynamic.explanation-visual-question.text';
          for (const component of ['explanation', 'richContent', 'question']) nodes.push({
            id: `turn${i}:${component}`, turnEventId: `turn${i}`, component, action, speaker: 'tutor',
            nodeType: 'atomic', atomType: 'dialogue-utterance', value: component,
            primitiveReference: { entryId: `entry${i}${component}` },
            ...(component === 'richContent' ? { figure: { assetId: `image${i}`, description: 'Synthetic figure', displayWidth: 360 } } : {}) });
          nodes.push({ id: `answer${i}`, speaker: 'learner', nodeType: 'atomic', atomType: 'dialogue-utterance', value: 'Saved answer' });
          nodes.push({ id: `feedback${i}`, action: 'instruction.feedback', speaker: 'tutor', nodeType: 'atomic', atomType: 'dialogue-utterance', value: 'Saved feedback' });
        }
        window.restoreDisplay = { unitType: 'sparc-autotutor-dialogue', pageKey: 'restore', instructionalController: { policyId: 'dynamic-instruction-agent-v2' }, nodes };
        window.fixture.historyRecords = [{ id: 'synthetic-history' }];
        await window.fixture.mount({ display: window.restoreDisplay, engine: { curUnit: { sparcsession: { readingLevel: 'unbiased' } } },
          userId: 'synthetic', tdfId: 'synthetic', attemptId: 'synthetic', levelUnit: 0, subsetKind: 'question' });
      });
      const chat = page.locator('.sparc-auto-tutor-chat');
      assert.equal(await chat.isVisible(), false, 'Unreferenced answers must not flash before content checks');
      await page.evaluate(() => window.check([]));
      await page.waitForFunction(() => Object.keys(window.images).length === 3);
      assert.equal(await chat.isVisible(), false);
      for (const index of [2, 0, 1]) {
        await page.evaluate(index => {
          const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 300 + index * 200;
          window.images[`image${index}`].resolve({ dataUrl: canvas.toDataURL('image/png') });
        }, index);
        await page.waitForFunction(index => document.querySelectorAll('img').length >= index, [2, 0, 1].indexOf(index) + 1);
        if (index !== 1) assert.equal(await chat.isVisible(), false, 'Partially decoded history stays hidden');
      }
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.sparc-auto-tutor-chat')).visibility === 'visible');
      const samples = await chat.evaluate(async element => {
        const samples = [];
        for (let frame = 0; frame < 8; frame++) {
          await new Promise(requestAnimationFrame);
          samples.push([element.scrollTop, element.scrollHeight, element.clientWidth,
            element.lastElementChild.getBoundingClientRect().bottom]);
        }
        return samples;
      });
      assert.ok(samples.every(sample => JSON.stringify(sample) === JSON.stringify(samples[0])), 'Revealed history must have stable geometry');
      assert.equal(await chat.evaluate(element => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 1), true);
      assert.deepEqual(await page.locator('.sparc-dialogue-turn-label').allTextContents(), ['Turn 1', 'Turn 2', 'Turn 3']);
      await page.evaluate(() => window.fixture.destroy());
    }
    await page.evaluate(async () => {
      window.fixture.checkRemovals = async () => [];
      window.fixture.readImage = async () => { throw Error('Synthetic image failure'); };
      window.fixture.historyRecords = [{ id: 'synthetic-history' }];
        await window.fixture.mount({ display: window.restoreDisplay, engine: { curUnit: { sparcsession: { readingLevel: 'unbiased' } } },
          userId: 'synthetic', tdfId: 'synthetic', attemptId: 'synthetic', levelUnit: 0, subsetKind: 'question' });
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.sparc-auto-tutor-chat')).visibility === 'visible');
    assert.equal(await page.locator('.sparc-prompt-figure [role="alert"]').count(), 3);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});
