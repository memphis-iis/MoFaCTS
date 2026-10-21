// Run against the supported localhost watcher, without accounts or provider calls:
// node --test scripts/sparcReadingOrderBrowser.test.cjs
const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildFixture } = require('./sparcReadingOrderFixture.cjs');

it('keeps real SPARC components ordered through checks, image decoding, restore, focus and manual scrolling', { timeout: 120000 }, async () => {
  const health = await fetch('http://localhost:3200/health');
  assert.equal(health.ok, true, 'Start the supported localhost watcher before this test');
  const fixture = await buildFixture();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1050, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const css = fs.readFileSync(path.resolve(__dirname, '../public/styles/instructional-content.css'), 'utf8');
  await page.route('http://localhost:3200/__sparc-reading-order-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  try {
    await page.goto('http://localhost:3200/__sparc-reading-order-fixture');
    await page.addStyleTag({ content: css + `
      :root { --app-space-1: 4px; --app-space-2: 8px; --app-space-3: 12px; --app-font-size-base: 16px; }
      body { font: 16px sans-serif; margin: 12px; }
      .sparc-auto-tutor-chat { height: 320px; flex: none; }
      .sparc-dialogue-bubble { padding: 10px; border: 1px solid #888; }
      img { max-width: 100%; } textarea, input { font: inherit; }
    ` });
    await page.addScriptTag({ content: fixture.source });
    assert.deepEqual(errors, [], 'Fixture initialization must succeed');
    const action = 'instruction.dynamic.explanation-visual-question.text';
    const component = (kind, extras = {}) => ({ id: `turn:${kind}`, component: kind, turnEventId: 'turn', action,
      nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: kind === 'explanation' ? 'Explanation first.' : kind === 'question' ? 'Question last?' : 'Support in the middle.', ...extras });
    const explanation = component('explanation', { primitiveReference: { entryId: 'explanation1' } });
    const support = component('richContent', { primitiveReference: { entryId: 'support1' }, figure: { assetId: 'image123', description: 'Synthetic teaching figure', displayWidth: 360 } });
    const question = component('question', { primitiveReference: { entryId: 'question1' } });
    const controls = [{ id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input', value: '' }, { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit' }];
    const display = nodes => ({ unitType: 'sparc-autotutor-dialogue', pageKey: 'page', instructionalController: { policyId: 'dynamic-instruction-agent-v2' }, nodes: [...nodes, ...controls] });
    const props = nodes => ({ display: display(nodes), engine: {}, userId: 'synthetic', tdfId: 'synthetic', attemptId: 'synthetic', levelUnit: 0, subsetKind: 'question' });
    const update = nodes => page.evaluate(display => window.fixture.update({ display }), display(nodes));
    const visible = () => page.locator('.sparc-instruction-component').evaluateAll(nodes => nodes.map(node => node.id.split('%3A').at(-1)));
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const assertVisible = async expected => {
      await settle();
      assert.deepEqual(errors, [], 'Rendering must succeed');
      assert.deepEqual(await visible(), expected, await page.locator('#fixture').innerText());
    };
    const input = page.locator('.sparc-auto-tutor-input-bar textarea, .sparc-auto-tutor-input-bar input');
    await page.evaluate(() => {
      window.fixture.checkRemovals = ids => new Promise(resolve => { window.pendingChecks = { ids, resolve }; });
      window.fixture.readImage = () => new Promise((resolve, reject) => { window.pendingImage = { resolve, reject }; });
    });
    // A restored partial move with support and question saved before the explanation.
    await page.evaluate(props => window.fixture.mount(props), props([support, question]));
    await assertVisible([]); assert.equal(await input.count(), 0);
    await update([support, question, explanation]);
    await assertVisible([]);
    assert.ok((await page.evaluate(() => window.pendingChecks.ids)).includes('explanation1'));
    await page.evaluate(() => window.pendingChecks.resolve([]));
    await assertVisible(['explanation', 'richContent']); assert.equal(await input.count(), 0);
    assert.match(await page.locator('.sparc-prompt-figure').innerText(), /Loading figure/);
    // Complete the actual reader and native image decode. No question precedes the image.
    await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 600;
      canvas.getContext('2d').fillRect(0, 0, 360, 600);
      window.syntheticImage = canvas.toDataURL('image/png');
      window.pendingImage.resolve({ dataUrl: window.syntheticImage });
    });
    await page.waitForSelector('.sparc-auto-tutor-input-bar');
    await assertVisible(['explanation', 'richContent', 'question']);
    assert.equal(await page.locator('img').evaluate(image => image.complete && image.naturalWidth > 0), true);
    await page.locator('img').evaluate(image => { window.loadedImage = image; });
    await update([support, question, explanation]); await settle();
    assert.equal(await page.evaluate(() => window.loadedImage === document.querySelector('img')), true, 'Ordinary updates retain the decoded image');
    assert.equal(await input.evaluate(element => document.activeElement === element), true);
    const chat = page.locator('.sparc-auto-tutor-chat');
    const atBottom = () => chat.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop <= 1);
    assert.equal(await atBottom(), true);
    // Checking a new component keeps its checked predecessor mounted.
    await page.evaluate(() => { window.fixture.checkRemovals = async () => []; });
    await page.evaluate(props => window.fixture.mount(props), props([explanation]));
    await assertVisible(['explanation']);
    await page.locator('.sparc-instruction-component').evaluate(node => { window.originalExplanation = node; });
    await page.evaluate(() => { window.fixture.checkRemovals = ids => new Promise(resolve => { window.pendingChecks = { ids, resolve }; }); });
    await update([explanation, support, question]);
    await assertVisible(['explanation']);
    assert.equal(await page.evaluate(() => window.originalExplanation === document.querySelector('.sparc-instruction-component')), true);
    await page.evaluate(() => window.pendingChecks.resolve([]));
    await assertVisible(['explanation', 'richContent']);
    // A failed read leaves the inline error and never releases question/input.
    await page.evaluate(() => window.pendingImage.reject(Error('Synthetic image failure')));
    await page.waitForSelector('.sparc-prompt-figure [role="alert"]');
    await assertVisible(['explanation', 'richContent']); assert.equal(await input.count(), 0);
    // Content-check failures preserve the checked explanation and block new pieces.
    await page.evaluate(() => { window.fixture.checkRemovals = async () => []; });
    await page.evaluate(props => window.fixture.mount(props), props([explanation]));
    await assertVisible(['explanation']);
    await page.evaluate(() => { window.fixture.checkRemovals = async () => { throw Error('Synthetic check failure'); }; });
    await update([explanation, support, question]);
    await page.waitForSelector('.sparc-auto-tutor-content > [role="alert"]');
    await assertVisible(['explanation']); assert.equal(await input.count(), 0);
    // Reload accepted components, then fail native decoding separately.
    await page.evaluate(() => { window.fixture.checkRemovals = async () => []; window.fixture.readImage = async () => ({ dataUrl: 'data:image/png;base64,broken' }); });
    await page.evaluate(props => window.fixture.mount(props), props([support, question, explanation]));
    await page.waitForSelector('.sparc-prompt-figure [role="alert"]');
    await assertVisible(['explanation', 'richContent']); assert.equal(await input.count(), 0);
    // Administrative receipts and links resolve their position without a new image request.
    await page.evaluate(() => { window.fixture.checkRemovals = async () => ['support1']; window.fixture.readImage = () => { throw Error('Removed image must not load'); }; });
    await page.evaluate(props => window.fixture.mount(props), props([support, question, explanation]));
    await page.waitForSelector('.sparc-auto-tutor-input-bar');
    await assertVisible(['explanation', 'richContent', 'question']);
    assert.match(await page.locator('.sparc-dialogue-bubble').innerText(), /Administrative removal/);
    assert.equal(await page.locator('img').count(), 0);
    await page.evaluate(() => { window.fixture.checkRemovals = async () => []; });
    await page.evaluate(props => window.fixture.mount(props), props([explanation, { ...support, primitiveReference: { entryId: 'support1', priorNodeId: 'earlier-support' } }, question]));
    await page.waitForSelector('.sparc-auto-tutor-input-bar');
    assert.equal(await page.locator('.sparc-support-reference').count(), 1);
    // Choice options obey the same image gate in both conditions.
    for (const format of ['multiple-choice', 'true-false']) {
      const choiceAction = `instruction.dynamic.explanation-visual-question.${format}`;
      const choices = format === 'true-false'
        ? [{ id: 'true', label: 'True', correct: true }, { id: 'false', label: 'False', correct: false }]
        : [{ id: 'a', label: 'Answer A', correct: true }, { id: 'b', label: 'Answer B', correct: false }, { id: 'c', label: 'Answer C', correct: false }];
      const choiceProps = props([explanation, support, { ...question, choices }].map(node => ({ ...node, action: choiceAction })));
      choiceProps.display.nodes = choiceProps.display.nodes.map(node => node.id.startsWith('learner-response-') ? { ...node, readOnly: true } : node);
      if (format === 'multiple-choice') choiceProps.display.instructionalController.policyId = 'dynamic-instruction-student-v2';
      await page.evaluate(() => { window.fixture.readImage = () => new Promise(resolve => { window.pendingImage = { resolve }; }); });
      await page.evaluate(props => window.fixture.mount(props), choiceProps);
      await assertVisible(['explanation', 'richContent']);
      assert.equal(await page.locator('.sparc-instruction-component button').count(), 0);
      await page.evaluate(() => window.pendingImage.resolve({ dataUrl: window.syntheticImage }));
      await page.waitForSelector('.sparc-instruction-component button');
      await assertVisible(['explanation', 'richContent', 'question']);
      assert.equal(await page.locator('.sparc-instruction-component button').count(), choices.length);
      assert.equal(await input.count(), 0);
    }
    // A checked video shell releases the question without waiting for playback.
    const video = { segmentId: 'a'.repeat(64), videoId: 'abcdefghijk', startSeconds: 0, endSeconds: 10, transcript: 'Synthetic passage', language: 'en', title: 'Synthetic passage', channel: 'Fixture' };
    const videoSupport = { ...support, figure: undefined, video };
    await page.evaluate(props => window.fixture.mount(props), props([explanation, videoSupport, question]));
    await page.waitForSelector('.sparc-auto-tutor-input-bar');
    await assertVisible(['explanation', 'richContent', 'question']);
    assert.equal(await page.locator('[data-video-shell]').count(), 1);
    // Readiness callbacks from an obsolete session cannot release its replacement.
    await page.evaluate(() => { window.fixture.readImage = () => new Promise(resolve => { window.pendingImage = { resolve }; }); });
    await page.evaluate(props => window.fixture.mount(props), props([explanation, support, question]));
    await assertVisible(['explanation', 'richContent']);
    await page.evaluate(() => { window.oldImage = window.pendingImage; });
    await page.evaluate(display => window.fixture.update({ attemptId: 'replacement', display }), display([explanation, support, question]));
    await settle();
    await page.evaluate(() => window.oldImage.resolve({ dataUrl: window.syntheticImage }));
    await assertVisible(['explanation', 'richContent']);
    // Follow content growth, but preserve scroll and keyboard focus during rereading.
    const earlier = Array.from({ length: 10 }, (_, index) => ({ id: `earlier${index}`, nodeType: 'atomic', atomType: 'dialogue-utterance', value: `Earlier paragraph ${index}. `.repeat(25) }));
    await page.evaluate(props => window.fixture.mount(props), props([...earlier, explanation]));
    await assertVisible(['explanation']); assert.equal(await atBottom(), true);
    await chat.evaluate(element => { element.scrollTop = 120; element.dispatchEvent(new Event('scroll')); });
    await page.evaluate(() => { document.querySelector('main').tabIndex = -1; document.querySelector('main').focus(); });
    const manualTop = await chat.evaluate(element => element.scrollTop);
    await update([...earlier, explanation, support, question]);
    await assertVisible(['explanation', 'richContent']);
    await page.evaluate(() => window.pendingImage.resolve({ dataUrl: window.syntheticImage }));
    await page.waitForSelector('.sparc-auto-tutor-input-bar'); await settle();
    assert.equal(await chat.evaluate(element => element.scrollTop), manualTop);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture');
    await chat.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); });
    await page.setViewportSize({ width: 390, height: 700 }); await settle();
    assert.equal(await atBottom(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.sparc-instruction-component').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await input.evaluate(element => document.activeElement === element), true);
    await page.keyboard.type('A synthetic answer');
    assert.equal(await input.inputValue(), 'A synthetic answer');
    await page.screenshot({ path: path.join(fixture.directory, 'narrow.png') });
    await page.evaluate(() => window.fixture.destroy()); await settle();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});


it('retains assessed choices without chat echoes and keeps typed-answer bubbles after reload in both themes and viewport sizes', { timeout: 120000 }, async () => {
  require('./registerHistoryTypescript.cjs');
  const { projectSparcResponseCorrectness, projectSparcAnsweredQuestionOperations } = require('../../learning-components/units/sparcsession/sparcMultipleChoiceQuestion.ts');
  const { applySparcProgressiveNodeOperations } = require('../../learning-components/trial-displays/sparc/sparcProgressiveNodes.ts');
  const { createEmptySparcReplayState } = require('../../learning-components/units/sparcsession/sparcStateReplay.ts');
  const fixture = await buildFixture();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const app = path.resolve(__dirname, '..');
  const styles = ['classic.css', 'instructional-content.css'].map(file => fs.readFileSync(path.join(app, 'public/styles', file), 'utf8')).join('\n');
  const doc = { id: 'review', schemaVersion: 2, root: { id: 'root', kind: 'document', children: [] }, workingMemoryFacts: [
    { factType: 'learningTarget.score', slots: { clusterKC: 'kc', coverage: .4 } },
    { factType: 'diagnostic.misconceptionScore', slots: { id: 'm', supportStrength: .7 } },
  ] };
  const history = [];
  const checks = [];
  const writeNode = node => ({ target: { pageKey: 'review', nodeId: 'root' }, key: 'progressiveNodeOperation',
    value: { type: 'append-node', boxId: 'dialogue-flow', node } });
  // Use the source-owned operation key; this is also the real resume projection.
  const { SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY } = require('../../learning-components/trial-displays/sparc/sparcProgressiveNodes.ts');
  const append = node => ({ ...writeNode(node), key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY });
  for (const [index, [format, correct]] of [
    ['multiple-choice', true], ['multiple-choice', false], ['true-false', true], ['true-false', false],
    ['text', true], ['text', false], ['cloze', true], ['cloze', false],
  ].entries()) {
    const choice = format === 'multiple-choice' || format === 'true-false';
    const qid = `q${index}:question`, id = `answer${index}`;
    const choices = format === 'true-false'
      ? [{ id: 'true', label: 'True', correct: true }, { id: 'false', label: 'False', correct: false }]
      : [{ id: 'a', label: 'Choice A', correct: true }, { id: 'b', label: 'Choice B', correct: false }, { id: 'c', label: 'Choice C', correct: false }];
    const selected = correct ? choices[0].id : choices[1].id;
    const question = { id: qid, turnEventId: `q${index}`, nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor',
      component: 'question', action: `instruction.dynamic.question.${format}`, value: `Synthetic ${format} review question ${index}.`, ...(choice ? { choices } : {}) };
    history.push({ transitionId: `q${index}:primitive`, event: { eventId: `q${index}`, type: 'document-loaded', source: { pageKey: 'review', nodeId: 'root' }, time: index * 2 }, writes: [append(question)] });
    const event = { eventId: id, type: 'response-submitted', source: { pageKey: 'review', nodeId: 'root' }, time: index * 2 + 1,
      payload: { input: choice ? choices.find(option => option.id === selected).label : `Synthetic ${format} learner answer ${index}.`, responseFormat: format, questionId: qid, ...(choice ? { choiceId: selected } : {}) } };
    const learner = { id: `${id}:learner`, turnEventId: id, nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'learner', value: event.payload.input };
    const scores = index === 4 ? [{ factType: 'learningTarget.score', slots: { clusterKC: 'kc', coverage: .401 } }]
      : index === 6 ? [{ factType: 'diagnostic.misconceptionScore', slots: { id: 'm', supportStrength: .6 } }] : [];
    history.push({ transitionId: `${id}:assessment`, event, writes: [...scores.map(value => ({ target: { pageKey: 'review', nodeId: 'root' }, key: `workingMemoryFact:${value.factType}`, value })), append(learner)] });
    checks.push({ format, correct, learnerId: learner.id, questionId: qid, selected });
  }
  const replay = { ...createEmptySparcReplayState(), transitions: history };
  const props = restored => {
    const saved = restored ? JSON.parse(JSON.stringify(replay)) : replay;
    return { display: { unitType: 'sparc-autotutor-dialogue', pageKey: 'review', instructionalController: { policyId: 'dynamic-instruction-agent-v2' },
      nodes: applySparcProgressiveNodeOperations([], projectSparcAnsweredQuestionOperations(saved)) },
      runtimeNodeValues: projectSparcResponseCorrectness(doc, saved), engine: {}, userId: 'synthetic', tdfId: 'synthetic', attemptId: 'synthetic', levelUnit: 0, subsetKind: 'question' };
  };
  await page.route('http://localhost:3200/__sparc-answer-review-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main id="fixture"></main></body></html>' }));
  try {
    await page.goto('http://localhost:3200/__sparc-answer-review-fixture');
    const install = async properties => {
      await page.addStyleTag({ content: styles + '\nbody { margin: 12px; } .sparc-auto-tutor-chat { height: 600px; flex: none; } .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }' });
      await page.addStyleTag({ content: ':root {' + Object.entries(properties).map(([key, value]) => `--${key.replaceAll('_', '-')}: ${value};`).join('') + '}' });
      await page.addScriptTag({ content: fixture.source });
    };

    for (const theme of ['mofacts-default', 'dark-industrial']) {
      const properties = JSON.parse(fs.readFileSync(path.join(app, `public/themes/${theme}.json`), 'utf8')).properties;
      await page.reload(); await install(properties);
      for (const width of [1050, 390]) {
        await page.setViewportSize({ width, height: 800 });
        for (const restored of [false, true]) {
          if (restored) { await page.reload(); await install(properties); }
          await page.evaluate(props => window.fixture.mount(props), props(restored));
          await page.waitForSelector('[data-node-id="answer7:learner"]');
          for (const check of checks) {
            const outcome = check.correct ? 'correct' : 'incorrect';
            const bubble = page.locator(`[data-node-id="${check.learnerId}"]`);
            const choice = check.format === 'multiple-choice' || check.format === 'true-false';
            if (choice) {
              assert.equal(await bubble.count(), 0, 'A clicked choice is shown once in its question, without learner speech');
            } else {
              assert.match(await bubble.getAttribute('class'), new RegExp(`sparc-correctness-${outcome}`));
              assert.match(await bubble.innerText(), new RegExp(check.correct ? 'Response made progress' : 'Response made no progress'));
            }
            if (choice) {
              const selected = page.locator(`[data-node-id="${check.questionId}:answer:${check.selected}"]`);
              assert.equal(await selected.getAttribute('aria-pressed'), 'true');
              assert.equal(await selected.isDisabled(), true);
              assert.match(await selected.getAttribute('class'), new RegExp(`sparc-correctness-${outcome}`));
              const question = selected.locator('..');
              assert.equal(await question.locator('[aria-pressed="true"]').count(), 1);
              assert.equal(await question.locator('[aria-pressed="false"].sparc-correctness-correct').count(), 0);
              const colors = await selected.evaluate(element => ({ color: getComputedStyle(element).color, opacity: getComputedStyle(element).opacity, background: getComputedStyle(element).backgroundColor,
                border: getComputedStyle(element).borderColor, outline: getComputedStyle(element).outlineColor, root: getComputedStyle(document.documentElement).getPropertyValue('--app-text-color').trim() }));
              assert.equal(colors.opacity, '1');
              assert.notEqual(colors.background, 'rgba(0, 0, 0, 0)');
              const expectedBorder = properties[check.correct ? 'feedback_correct_color' : 'feedback_error_color'];
              const rgb = expectedBorder.slice(1).match(/../g).map(value => parseInt(value, 16)).join(', ');
              assert.equal(colors.border, `rgb(${rgb})`);
              assert.equal(colors.outline, `rgb(${rgb})`);
              const padding = await selected.evaluate(element => ({ top: getComputedStyle(element).paddingTop, bottom: getComputedStyle(element).paddingBottom, minHeight: getComputedStyle(element).minHeight }));
              const typedPadding = await page.locator('[data-node-id="answer4:learner"] .sparc-dialogue-bubble').evaluate(element => ({ top: getComputedStyle(element).paddingTop, bottom: getComputedStyle(element).paddingBottom }));
              assert.equal(padding.top, typedPadding.top, 'Choice vertical padding matches a typed learner response');
              assert.equal(padding.bottom, typedPadding.bottom);
              assert.equal(padding.minHeight, '0px', 'No full-size button minimum height adds extra space');
            }
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        await page.locator('[data-node-id="q0:question:answer:a"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(fixture.directory, `review-choices-${theme}-${width}.png`) });
        await page.locator('[data-node-id="answer7:learner"]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(fixture.directory, `review-${theme}-${width}.png`) });
      }
    }
    const pending = { ...createEmptySparcReplayState(), transitions: [history[0], { ...history[1], transitionId: 'answer0:decision', writes: [] }] };
    const pendingProps = props(true);
    pendingProps.display.nodes = applySparcProgressiveNodeOperations([], projectSparcAnsweredQuestionOperations(pending));
    pendingProps.runtimeNodeValues = projectSparcResponseCorrectness(doc, pending);
    await page.evaluate(props => window.fixture.mount(props), pendingProps);
    const pendingAnswer = page.locator('[data-node-id="q0:question:answer:a"]');
    await pendingAnswer.waitFor();
    assert.equal(await pendingAnswer.getAttribute('aria-pressed'), 'true');
    assert.doesNotMatch(await pendingAnswer.getAttribute('class'), /sparc-correctness-/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
