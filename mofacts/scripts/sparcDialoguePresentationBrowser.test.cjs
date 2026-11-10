// Real SPARC renderers, synthetic content only; no accounts, history or providers.
// The production renderers run in an intercepted synthetic page; no app server is needed.
// Run: node --test scripts/sparcDialoguePresentationBrowser.test.cjs
const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildFixture } = require('./sparcReadingOrderFixture.cjs');

it('groups speaker labels and shows zero-height-cost admin diagnostics on hover, focus and touch', { timeout: 120000 }, async () => {
  const fixture = await buildFixture();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1050, height: 800 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.route('http://sparc-fixture.test/__sparc-presentation-fixture', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
    }));
    await page.goto('http://sparc-fixture.test/__sparc-presentation-fixture');
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
    await page.evaluate(async () => {
      const message = (id, speaker, action) => ({ id, speaker, action,
        nodeType: 'atomic', atomType: 'dialogue-utterance', value: id });
      const nodes = [message('opening', 'tutor'), message('answer1', 'learner'),
        message('feedback1', 'tutor', 'instruction.feedback'), message('next', 'tutor'),
        message('answer2', 'learner'), message('feedback2', 'tutor', 'instruction.feedback')];
      window.fixture.turnDisplay = { unitType: 'sparc-autotutor-dialogue', pageKey: 'turns',
        instructionalController: { policyId: 'dynamic-instruction-agent-v2' }, nodes };
      await window.fixture.mount({ display: window.fixture.turnDisplay });
    });
    assert.deepEqual(await page.locator('.sparc-dialogue-turn-label').allTextContents(), ['Turn 1', 'Turn 2']);
    const order = await page.locator('.sparc-auto-tutor-content').evaluate(element =>
      [...element.children].map(child => child.matches('h2') ? child.textContent : child.dataset.nodeId).filter(Boolean));
    assert.deepEqual(order, ['Turn 1', 'opening', 'answer1', 'feedback1', 'Turn 2', 'next', 'answer2', 'feedback2']);
    await page.evaluate(async () => {
      await window.fixture.destroy();
      await window.fixture.mount({ display: window.fixture.turnDisplay });
    });
    assert.deepEqual(await page.locator('.sparc-dialogue-turn-label').allTextContents(), ['Turn 1', 'Turn 2']);
    assert.deepEqual(errors, []);
    await page.evaluate(async () => {
      const message = (id, event, value, extra = {}) => ({ id, turnEventId: event, speaker: 'tutor',
        nodeType: 'atomic', atomType: 'dialogue-utterance', value, ...extra });
      const nodes = [
        { id: 'choice:selected', nodeType: 'group', groupType: 'button-group', children: [
          { id: 'choice:option', nodeType: 'atomic', atomType: 'button', label: 'Question', value: 'question.text', selected: true, readOnly: true },
        ] },
        message('one:orientation', 'one', 'Let us begin with confidence levels.', { navigationOnly: true }),
        message('one:question', 'one', 'What does a confidence level describe?'),
        message('feedback', 'answer', 'You have met this goal.', { action: 'instruction.feedback' }),
        message('two:orientation', 'two', '', { navigationOnly: true }),
        message('two:question', 'two', 'Compare the interval widths.'),
        message('feedback2', 'done', 'These lesson goals are complete.', { action: 'instruction.feedback' }),
        message('done:orientation', 'done', 'You have completed all the learning goals.', { navigationOnly: true, completionOrientation: true }),
      ];
      await window.fixture.mount({ display: { unitType: 'sparc-autotutor-dialogue', pageKey: 'oriented',
        instructionalController: { policyId: 'dynamic-instruction-agent-v2' }, nodes },
        runtimeNodeValues: { __sparcTurnOrientations: {
          one: { reason: 'introduction', current: { text: 'Confidence levels' }, progress: { total: 2, met: 0, remaining: 2 } },
          two: { reason: 'continue', current: { text: 'Interval width' }, progress: { total: 2, met: 1, remaining: 1 } },
          done: { reason: 'completion', progress: { total: 2, met: 2, remaining: 0 } },
        } },
      });
    });
    assert.deepEqual(await page.locator('.sparc-dialogue-turn-label').allTextContents(), [
      'Turn 1 · Confidence levels', 'Turn 2 · Interval width',
    ]);
    assert.deepEqual(await page.locator('.sparc-dialogue-turn-progress').allTextContents(), [
      '0 of 2 learning goals met · 2 remaining', '1 of 2 learning goals met · 1 remaining',
      '2 of 2 learning goals met · 0 remaining',
    ]);
    assert.equal(await page.locator('[data-node-id="two:orientation"]').count(), 0, 'Heading-only marker has no empty message');
    assert.equal(await page.locator('[data-node-id="done:orientation"]').count(), 1, 'Completion bridge is retained');
    await page.setViewportSize({ width: 1050, height: 800 });
    await page.locator('.sparc-auto-tutor-chat').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.resolve(__dirname, '../../tmp/sparc-turn-orientation-desktop.png') });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator('.sparc-auto-tutor-chat').evaluate(element => { element.scrollTop = 0; });
    for (const heading of await page.locator('.sparc-dialogue-turn-heading').all()) {
      const rect = await heading.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= 390, 'KC heading and progress fit the mobile viewport');
    }
    assert.equal(await page.evaluate(() => {
      const control = document.querySelector('.sparc-auto-tutor-progress-popout > summary').getBoundingClientRect();
      return [...document.querySelectorAll('.sparc-dialogue-turn-heading h2, .sparc-dialogue-turn-heading p')].some(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()].some(rect => rect.left < control.right && rect.right > control.left
          && rect.top < control.bottom && rect.bottom > control.top);
      });
    }), false, 'Progress disclosure does not cover KC or remaining-count text');
    await page.screenshot({ path: path.resolve(__dirname, '../../tmp/sparc-turn-orientation-mobile.png') });
    await page.evaluate(async () => {
      await window.fixture.mount({ display: { unitType: 'sparc-autotutor-dialogue', pageKey: 'headings-completion',
        instructionalController: { policyId: 'dynamic-instruction-agent-v2' }, nodes: [
          { id: 'turn:orientation', turnEventId: 'turn', nodeType: 'atomic', atomType: 'html-block', value: '', navigationOnly: true },
          { id: 'turn:question', turnEventId: 'turn', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'What does confidence describe?' },
          { id: 'done:feedback', turnEventId: 'done', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', action: 'instruction.feedback', value: 'Your answer identifies repeated sampling.' },
          { id: 'done:orientation', turnEventId: 'done', nodeType: 'atomic', atomType: 'html-block', value: '', navigationOnly: true, completionOrientation: true },
        ] }, runtimeNodeValues: { __sparcTurnOrientations: {
          turn: { reason: 'introduction', current: { text: 'Confidence' }, progress: { total: 1, met: 0, remaining: 1 } },
          done: { reason: 'completion', progress: { total: 1, met: 1, remaining: 0 } },
        } },
      });
    });
    assert.deepEqual(await page.locator('.sparc-dialogue-turn-label').allTextContents(), ['Turn 1 · Confidence']);
    assert.deepEqual(await page.locator('.sparc-dialogue-turn-progress').allTextContents(), [
      '0 of 1 learning goals met · 1 remaining', '1 of 1 learning goals met · 0 remaining',
    ], 'Closing progress is visible without altering the historical snapshot or adding a turn');
    assert.equal(await page.locator('[data-node-id="done:orientation"]').count(), 0, 'Heading-only completion has no empty tutor message');
    const closing = page.locator('.sparc-dialogue-completion-progress');
    assert.equal(await closing.getAttribute('role'), 'status');
    assert.equal(await page.locator('[data-node-id="done:feedback"]').evaluate((feedback, closing) =>
      Boolean(feedback.compareDocumentPosition(document.querySelector(closing)) & Node.DOCUMENT_POSITION_FOLLOWING), '.sparc-dialogue-completion-progress'), true);
    for (const width of [390, 1050]) {
      await page.setViewportSize({ width, height: 800 });
      const rect = await closing.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width, 'Closing progress fits mobile and desktop');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});
