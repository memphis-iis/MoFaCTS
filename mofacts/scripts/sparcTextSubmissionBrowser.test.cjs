// Real surface and input controls; synthetic content and stubbed service boundaries.
// Run: node --test scripts/sparcTextSubmissionBrowser.test.cjs
const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, webkit } = require('playwright');
const { buildFixture } = require('./sparcReadingOrderFixture.cjs');

for (const [name, engine, options] of [['chromium', chromium, { channel: 'chrome' }], ['webkit', webkit, {}]]) {
  it(`${name}: empty responses stay usable and text reaches the submission boundary`, { timeout: 120000,
    skip: name === 'webkit' && !fs.existsSync(webkit.executablePath()) ? 'WebKit is not installed; no dependency installed by this test' : false,
  }, async () => {
    const fixture = await buildFixture({ captureSubmissions: true });
    const browser = await engine.launch({ ...options, headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.route('http://sparc-fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="fixture"></div>' }));
      await page.goto('http://sparc-fixture.test/submission');
      await page.addScriptTag({ content: fixture.source });
      await page.evaluate(async () => {
        window.submissionProps = { engine: { curUnit: { sparcsession: {} } }, userId: 'synthetic', tdfId: 'synthetic', attemptId: 'synthetic',
          subsetKind: 'question', levelUnit: 0, display: { unitType: 'sparc-autotutor-dialogue', pageKey: 'page',
            instructionalController: { policyId: 'dynamic-instruction-agent-v2' }, nodes: [
              { id: 'saved:question', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor',
                turnEventId: 'saved', component: 'question', action: 'instruction.dynamic.question.text', value: 'Which species matches?' },
              { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input' },
              { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit' },
            ] } };
        await window.fixture.mount(window.submissionProps);
      });
      const input = page.locator('input[data-node-id="learner-response-input"]');
      const button = page.locator('button[data-node-id="learner-response-submit"]');
      let count = 0;
      for (const restored of [false, true]) {
        if (restored) await page.evaluate(() => window.fixture.mount(window.submissionProps));
        await input.waitFor({ state: 'visible' });
        for (const answer of ['', '   ']) {
          await input.fill(answer);
          await button.click();
          await input.press('Enter');
          assert.equal(await page.evaluate(() => window.fixture.submissions.length), count);
          assert.equal(await input.inputValue(), answer);
          assert.equal(await page.locator('[role="alert"]').count(), 0);
          assert.equal(await page.locator('.sparc-auto-tutor-pending-turn').count(), 0);
        }
        for (const method of ['button', 'enter']) {
          const answer = `Species D matches TACCGATGCTAA (${method}, restored=${restored}).`;
          await input.fill(answer);
          if (method === 'button') await button.click();
          else await input.press('Enter');
          count++;
          await page.waitForFunction(expected => window.fixture.submissions.length === expected, count);
          assert.equal(await page.evaluate(() => window.fixture.submissions.at(-1).submittedNodes['learner-response-input']), answer);
          await input.waitFor({ state: 'visible' });
          assert.equal(await page.locator('[role="alert"]').count(), 0);
        }
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
