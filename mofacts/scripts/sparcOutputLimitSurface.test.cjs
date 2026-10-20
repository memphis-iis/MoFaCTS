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

it('keeps startup and submitted-response limit failures inline, focusable, and retryable without resubmitting', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLMediaElement', 'HTMLInputElement', 'HTMLFormElement', 'HTMLSelectElement', 'Element', 'Document', 'Node', 'Text', 'Comment', 'Event', 'CustomEvent', 'MouseEvent', 'MutationObserver']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  const originalLoad = Module._load;
  Module._load = function(request, parent, main) {
    if (request === 'meteor/tracker') return { Tracker: {} };
    return originalLoad.call(this, request, parent, main);
  };
  const { SparcOutputLimitRecoveryError } = require('../client/views/experiment/svelte/services/sparcOutputLimitRecovery.ts');
  const { compile } = require('svelte/compiler');
  const { mount, unmount, tick, flushSync } = require('svelte');
  const { translatePlatformString } = require('../client/lib/interfaceI18n.ts');
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
  const node = component(`<script>export let node = {}; export let onButtonActivate = () => {};</script>
    {#if node.atomType === 'button'}<button disabled={node.readOnly} on:click={() => onButtonActivate(node)}>{node.label}</button>
    {:else if node.atomType === 'text-input'}<input readonly={node.readOnly} value={node.value || ''} />
    {:else}<p>{node.value || ''}</p>{/if}`, 'surfaceNodeFixture.svelte');
  let loads = 0, submissions = 0, failLoad = true, failSubmit = false;
  const stubs = {
    sparcMoveLibraryClient: { sparcMoveLibraryClient: {}, readSparcAdministrativeRemovals: async () => [] },
    sparcAdministrativeRemoval: { sparcContentReferenceIds: () => [], projectSparcAdministrativeRemovals: nodes => nodes },
    sparcController: { resolveSparcControllerDisplay: display => display, resolveSparcControllerResult: (_display, detail) => detail },
    sparcAutoTutorRuleCommit: { isSparcAutoTutorDisplay: () => true,
      commitSparcAutoTutorDocumentLoad: async () => { loads++; if (failLoad) throw new SparcOutputLimitRecoveryError(); return { sparcNodeValues: {} }; },
      commitSparcAutoTutorSubmit: async () => { submissions++; if (failSubmit) throw new SparcOutputLimitRecoveryError(); return { sparcNodeValues: {} }; },
    },
    sparcControllerDialogueOpenRouter: { createSparcDialogueOpenRouterProvider: () => ({}) },
    sparcOpenRouterSession: { createSparcOpenRouterSession: () => ({ sessionIdForScope: () => 'test' }) },
    sparcRuntimeState: { readSparcResumeSnapshot: () => ({ nodeValues: {} }) },
    sparcInstructionalPolicies: { isSparcCategorizedPolicy: () => true },
    sparcInstructionalPrimitives: { projectSparcInstructionMessages: nodes => nodes },
    sparcProductionRuleActionCommit: { commitSparcProductionRuleAction: async () => ({}) },
    sparcBoxLayout: { buildSparcBoxedNodeGroups: () => [] },
    sparcProgressiveNodes: { SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY: 'operations', applySparcProgressiveNodeOperations: nodes => nodes },
    sparcAutoTutorProgress: { buildSparcAutoTutorProgressSnapshot: () => ({ completed: false }), selectSparcAutoTutorProgressSnapshotForRender: ({ currentSnapshot }) => currentSnapshot },
    interfaceLocaleState: { getActiveUiLocale: () => 'en' },
    sparcCitationDiagnostics: { redactSparcDialogueDiagnosticText: text => text },
  };
  Module._load = function(request, parent, main) {
    if (request.endsWith('.svelte')) return request.endsWith('/SparcNode.svelte') ? node : empty;
    const stub = stubs[request.split('/').at(-1)];
    return stub ?? originalLoad.call(this, request, parent, main);
  };
  let app;
  try {
    const surfacePath = path.resolve(__dirname, '../client/views/experiment/svelte/components/SparcSessionSurface.svelte');
    const surface = component(fs.readFileSync(surfacePath, 'utf8'), surfacePath);
    const settle = async () => { for (let i = 0; i < 12; i++) { flushSync(); await tick(); } };
    const target = document.body;
    const display = { unitType: 'sparc-autotutor-dialogue', pageKey: 'page', instructionalController: { policyId: 'dynamic-instruction-agent-v2' }, nodes: [
      { id: 'learner-response-input', atomType: 'text-input', value: 'An answer' },
      { id: 'learner-response-submit', atomType: 'button', label: 'Submit' },
    ] };
    const props = { display, engine: {}, userId: 'user', tdfId: 'tdf', attemptId: 'attempt', levelUnit: 0, subsetKind: 'question' };
    app = mount(surface, { target, props });
    await settle();
    const assertRecovery = () => {
      assert.ok(target.querySelector('[data-sparc-retry]'));
      assert.equal(target.querySelector('input').readOnly, true);
      assert.equal(target.querySelector('.sparc-auto-tutor-submit button').disabled, true);
      assert.equal(target.querySelector('[data-sparc-retry]'), document.activeElement);
      assert.match(target.textContent, /saved progress is retained/);
      assert.doesNotMatch(target.textContent, /configuration or service error|Technical detail/);
      assert.equal(target.querySelector('[role="status"]').textContent, translatePlatformString('en', 'autoTutor.responseRetry'));
    };
    assertRecovery(); assert.equal(loads, 1);
    target.querySelector('[data-sparc-retry]').click(); await settle();
    assertRecovery(); assert.equal(loads, 2, 'Repeated exhaustion must not loop automatically');
    failLoad = false;
    target.querySelector('[data-sparc-retry]').click(); await settle();
    assert.equal(loads, 3); assert.equal(target.querySelector('[data-sparc-retry]'), null);
    assert.equal(target.querySelector('input').readOnly, false);
    failSubmit = true;
    target.querySelector('.sparc-auto-tutor-submit button').click(); await settle();
    assertRecovery(); assert.equal(submissions, 1);
    target.querySelector('[data-sparc-retry]').click(); await settle();
    assert.equal(loads, 4); assert.equal(submissions, 1, 'Student retry continues accepted work instead of submitting another answer');
    assert.equal(target.querySelector('[data-sparc-retry]'), null);
  } finally {
    if (app) await unmount(app);
    Module._load = originalLoad;
    dom.window.close();
  }
});
