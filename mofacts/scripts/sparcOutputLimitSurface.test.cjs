// Render the real Svelte surface with injected service boundaries; no account, model, or database.
// Run with: node --conditions=browser --test scripts/sparcOutputLimitSurface.test.cjs
const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
require('./registerHistoryTypescript.cjs');

it('renders inline response controls through choice, text, reload, pending and completion states', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLMediaElement', 'HTMLInputElement', 'HTMLFormElement', 'HTMLSelectElement', 'Element', 'Document', 'Node', 'Text', 'Comment', 'Event', 'CustomEvent', 'MouseEvent', 'MutationObserver']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  dom.window.matchMedia = () => ({ matches: false });
  // JSDOM has no layout observer. Real geometry is covered by the browser fixture.
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  const originalLoad = Module._load;
  Module._load = function(request, parent, main) {
    if (request === 'meteor/tracker') return { Tracker: {} };
    return originalLoad.call(this, request, parent, main);
  };
  const { compile } = require('svelte/compiler');
  const { mount, unmount, tick, flushSync } = require('svelte');
  function component(source, name) {
    const filename = path.resolve(__dirname, name);
    const generated = compile(source, { filename, generate: 'client' }).js.code;
    const compiled = ts.transpileModule(generated, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const compiledModule = new Module(filename);
    compiledModule.filename = filename;
    compiledModule.paths = Module._nodeModulePaths(__dirname);
    compiledModule._compile(compiled, filename);
    return compiledModule.exports.default;
  }
  const empty = component('<div></div>', 'emptySurfaceChild.svelte');
  let node, reportActivity, publishNodeValues;
  let coveredExpectations = 0;
  let loads = 0, submissions = 0, completed = false, turnCount = 2, ordinaryFailure = false, holdSubmit, holdLoad;
  const stubs = {
    sparcMoveLibraryClient: { sparcMoveLibraryClient: {}, readSparcAdministrativeRemovals: async () => [] },
    sparcAdministrativeRemoval: { sparcContentReferenceIds: () => [], projectSparcAdministrativeRemovals: nodes => nodes },
    sparcController: { resolveSparcControllerDisplay: display => display, resolveSparcControllerResult: (_display, detail) => detail },
    sparcAutoTutorRuleCommit: { isSparcAutoTutorDisplay: () => true,
      commitSparcAutoTutorDocumentLoad: async () => { loads++; if (holdLoad) await holdLoad; return { sparcNodeValues: {} }; },
      commitSparcAutoTutorSubmit: async params => { submissions++; publishNodeValues = params.onNodeValues; reportActivity?.('assessment'); if (holdSubmit) await holdSubmit; if (ordinaryFailure) throw new Error('Synthetic service failure'); return { sparcNodeValues: {} }; },
    },
    sparcControllerDialogueOpenRouter: { createSparcDialogueOpenRouterProvider: options => { reportActivity = options.onActivity; return {}; } },
    sparcOpenRouterSession: { createSparcOpenRouterSession: () => ({ sessionIdForScope: () => 'test' }) },
    sparcRuntimeState: { readSparcResumeSnapshot: () => ({ nodeValues: {} }) },
    sparcInstructionalPolicies: { isSparcCategorizedPolicy: () => true },
    sparcProductionRuleActionCommit: { commitSparcProductionRuleAction: async () => ({}) },
    sparcBoxLayout: { buildSparcBoxedNodeGroups: () => [] },
    sparcProgressiveNodes: { SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY: 'operations', applySparcProgressiveNodeOperations: nodes => nodes },
    sparcAutoTutorProgress: { ...require('../client/views/experiment/svelte/services/sparcAutoTutorProgress.ts'),
      buildSparcAutoTutorProgressSnapshot: () => ({ completed, turnCount, coveredExpectations, requiredExpectations: 2, misconceptionScore: 0, totalMisconceptions: 1 }) },
    interfaceLocaleState: { getActiveUiLocale: () => 'en' },
    sparcCitationDiagnostics: { redactSparcDialogueDiagnosticText: text => text },
  };
  Module._load = function(request, parent, main) {
    if (request === 'meteor/tracker') return { Tracker: {} };
    if (request === './TestSurface.svelte') return surface;
    if (request === './captureRuntime.cjs') return { capture: event => runtimeEvents.push(event.detail) };
    if (request.endsWith('/SparcAutoTutorProgress.svelte')) return component(fs.readFileSync(path.resolve(__dirname, '../client/views/experiment/svelte/components/SparcAutoTutorProgress.svelte'), 'utf8'), path.resolve(__dirname, '../client/views/experiment/svelte/components/SparcAutoTutorProgress.svelte'));
    if (request.endsWith('.svelte')) return request.endsWith('/SparcNode.svelte') ? node : empty;
    const stub = stubs[request.split('/').at(-1)];
    return stub ?? originalLoad.call(this, request, parent, main);
  };
  let app, surface;
  const runtimeEvents = [];
  try {
    const nodePath = path.resolve(__dirname, '../client/views/experiment/svelte/components/SparcNode.svelte');
    node = component(fs.readFileSync(nodePath, 'utf8'), nodePath);
    const surfacePath = path.resolve(__dirname, '../client/views/experiment/svelte/components/SparcSessionSurface.svelte');
    surface = component(fs.readFileSync(surfacePath, 'utf8'), surfacePath);
    const settle = async () => {
      for (let i = 0; i < 12; i++) { flushSync(); await tick(); }
      await new Promise(resolve => dom.window.requestAnimationFrame(resolve));
    };
    const target = document.body;
    const display = { unitType: 'sparc-autotutor-dialogue', pageKey: 'page', instructionalController: { policyId: 'dynamic-instruction-agent-v2' }, nodes: [
      { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input', value: 'An answer' },
      { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit' },
    ] };
    const props = { display, engine: { curUnit: { sparcsession: {} } }, userId: 'user', tdfId: 'tdf', attemptId: 'attempt', levelUnit: 0, subsetKind: 'question' };
    const wrapper = component(`<script>
      import Surface from './TestSurface.svelte';
      import { capture } from './captureRuntime.cjs';
      export let initial;
      let current = initial;
      export function update(display) { current = { ...current, display }; }
    </script><Surface {...current} on:runtimeevent={capture} />`, 'surfaceWrapper.svelte');
    app = mount(wrapper, { target, props: { initial: props } });
    await settle();
    assert.equal(target.querySelector('[data-sparc-retry]'), null);
    assert.doesNotMatch(target.textContent, /another moment|Try again/);
    assert.equal(loads, 1);
    const assertText = () => {
      const chat = target.querySelector('.sparc-auto-tutor-chat');
      assert.ok(chat.querySelector('.sparc-auto-tutor-input-bar input'));
      assert.equal(document.activeElement, chat.querySelector('input'));
      assert.equal(chat.scrollTop, chat.scrollHeight);
      assert.equal(target.querySelector('footer'), null);
    };
    const assertNoText = () => {
      assert.equal(target.querySelector('.sparc-auto-tutor-input-bar'), null);
      assert.equal(target.querySelector('input'), null);
      assert.equal(target.querySelector('.sparc-auto-tutor-submit'), null);
    };
    assertText();
    const { projectSparcInstructionMessages } = require('../../learning-components/units/sparcsession/sparcInstructionalPrimitives.ts');
    const comparisonNodes = ['richContent', 'explanation', 'question'].map(kind => ({
      id: `comparison-turn:${kind}`, turnEventId: 'comparison-turn', nodeType: 'atomic',
      atomType: kind === 'richContent' ? 'html-block' : 'dialogue-utterance', speaker: 'tutor',
      action: 'instruction.dynamic.explanation-rich-question.text', component: kind,
      value: kind === 'richContent' ? '| Feature | First | Second |\n| --- | --- | --- |\n| **One comparison** | A | B |'
        : kind === 'explanation' ? 'Interpret the two cases.' : 'Which case differs?',
      ...(kind === 'richContent' ? { supportHeading: 'Comparison' } : {}),
    }));
    const groupedComparison = projectSparcInstructionMessages(comparisonNodes);
    for (const messages of [comparisonNodes, groupedComparison,
      [{ ...groupedComparison[0], atomType: 'html-block' }],
      JSON.parse(JSON.stringify(groupedComparison)),
    ]) {
      app.update({ ...display, nodes: [...messages, ...display.nodes] }); await settle();
      assert.equal(target.querySelectorAll('.sparc-worked-example').length, 1, 'A comparison has one themed owner');
      assert.equal(target.querySelectorAll('.sparc-worked-example table').length, 1, 'Markdown becomes a semantic table inside its themed support');
      assert.equal(target.querySelectorAll('.sparc-worked-example strong').length, 1, 'Emphasis renders once');
      assert.equal((target.textContent.match(/One comparison/g) || []).length, 1, 'Support must not also appear through a second message path');
      assert.doesNotMatch(target.textContent, /\| --- |\*\*One comparison\*\*/);
      assertText();
    }
    for (const format of ['multiple-choice', 'true-false', 'menu']) {
      const choiceDisplay = { ...display, nodes: [
        { id: 'question', nodeType: 'atomic', atomType: 'dialogue-utterance', value: format },
        ...display.nodes.map(node => ({ ...node, readOnly: true })),
      ] };
      app.update(choiceDisplay); await settle(); assertNoText();
      assert.match(target.querySelector('.sparc-auto-tutor-chat').textContent, new RegExp(format));
      await unmount(app);
      app = mount(wrapper, { target, props: { initial: { ...props, display: choiceDisplay } } });
      await settle(); assertNoText();
      app.update({ ...display, nodes: [{ id: 'cloze-question', nodeType: 'atomic', atomType: 'dialogue-utterance', value: 'Fill the blank: ___' }, ...display.nodes] });
      await settle(); assertText();
    }
    // Answer-key review must precede the awaited tutor assessment for both formats.
    for (const format of ['multiple-choice', 'true-false']) {
      for (const correct of [true, false]) {
        const choices = format === 'true-false'
          ? [{ id: 'true', label: 'True', correct }, { id: 'false', label: 'False', correct: !correct }]
          : [{ id: 'a', label: 'Case A', correct }, { id: 'b', label: 'Case B', correct: !correct }, { id: 'c', label: 'Case C', correct: false }];
        const questionId = `immediate-${format}:question`;
        const question = { id: questionId, nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor',
          component: 'question', turnEventId: `immediate-${format}`, value: 'Synthetic question', action: `instruction.dynamic.question.${format}`, choices };
        let releaseChoice;
        holdSubmit = new Promise(resolve => { releaseChoice = resolve; });
        app.update({ ...display, nodes: [question, ...display.nodes.map(node => ({ ...node, readOnly: true }))] });
        await settle();
        const selectedId = `${questionId}:answer:${choices[0].id}`;
        target.querySelector(`[data-node-id="${selectedId}"]`).click();
        await settle();
        assert.ok(target.querySelector('.sparc-auto-tutor-pending-spinner'));
        assert.match(target.querySelector('[role="status"]').textContent, /Assessing your answer/);
        assert.equal(target.querySelector('.sparc-auto-tutor-skeleton-lines'), null);
        const values = runtimeEvents.at(-1).sparcNodeValues;
        assert.equal(values[`${selectedId}::correctness`], correct ? 'correct' : 'incorrect');
        assert.equal(values.operations, undefined, 'A click must not append a learner utterance');
        assert.equal(target.querySelector('.sparc-dialogue-utterance-learner'), null, 'Do not echo the selected option as learner speech');
        releaseChoice(); await settle(); holdSubmit = null;
      }
    }
    dom.window.matchMedia = () => ({ matches: true });
    app.update({ ...display }); await settle();
    assert.equal(document.activeElement, target.querySelector('.sparc-auto-tutor-input-bar'));
    target.querySelector('input').focus();
    assert.equal(document.activeElement, target.querySelector('input'));
    dom.window.matchMedia = () => ({ matches: false });
    await unmount(app);
    app = mount(wrapper, { target, props: { initial: props } }); await settle();
    submissions = 0;
    ordinaryFailure = true;
    const input = target.querySelector('input');
    input.value = 'My draft answer';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(); assertText();
    assert.equal(target.querySelector('input').value, 'My draft answer');
    assert.match(target.querySelector('[role="alert"]').textContent, /service/i);
    assert.equal(submissions, 1);
    ordinaryFailure = false;
    let releaseSubmit;
    holdSubmit = new Promise(resolve => { releaseSubmit = resolve; });
    target.querySelector('.sparc-auto-tutor-submit button').click();
    await settle(); assertNoText();
    assert.ok(target.querySelector('.sparc-auto-tutor-pending-turn'));
    assert.match(target.querySelector('summary').textContent, /2 turns/);
    assert.equal(target.querySelector('[role="meter"]').getAttribute('aria-valuenow'), '0');
    coveredExpectations = 2;
    turnCount = 3;
    completed = true;
    app.update({ ...display }); await settle();
    assert.equal(target.querySelector('[role="meter"]').getAttribute('aria-valuenow'), '0', 'Hold the prior score until assessment is accepted');
    await publishNodeValues({}); await settle();
    assert.equal(target.querySelector('[role="meter"]').getAttribute('aria-valuenow'), '2', 'Show accepted credit before tutor generation finishes');
    assert.match(target.querySelector('summary').textContent, /3 turns/);
    assert.ok(target.querySelector('.sparc-auto-tutor-pending-turn'));
    assert.equal(target.querySelector('.sparc-auto-tutor-continue'), null, 'Completion navigation still waits for the tutor turn');
    assertNoText();
    completed = false;
    turnCount = 2;
    app.update({ ...display }); await settle();
    releaseSubmit(); await settle(); holdSubmit = null; assertText();
    completed = true;
    app.update({ ...display }); await settle(); assertNoText();
    assert.ok(target.querySelector('.sparc-auto-tutor-chat .sparc-auto-tutor-continue'));
    const progress = target.querySelector('details');
    assert.match(progress.querySelector('summary').textContent, /Progress.*2 turns/s);
    assert.equal(progress.querySelectorAll('.sparc-auto-tutor-meter-row').length, 2);
    assert.equal(progress.querySelector('.sparc-auto-tutor-progress .sparc-auto-tutor-turns'), null);
    progress.open = true; await settle();
    assert.match(progress.querySelector('summary').textContent, /2 turns/);
    turnCount = 1;
    app.update({ ...display }); await settle();
    assert.match(target.querySelector('summary').textContent, /1 turn$/);
    completed = false;
    let releaseLoad;
    holdLoad = new Promise(resolve => { releaseLoad = resolve; });
    await unmount(app);
    app = mount(wrapper, { target, props: { initial: props } });
    await settle(); assertNoText();
    releaseLoad(); await settle(); holdLoad = null; assertText();
  } finally {
    if (app) await unmount(app);
    Module._load = originalLoad;
    dom.window.close();
  }
});
