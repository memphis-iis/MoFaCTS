// Real Svelte surface, app commit, replay and instructional cycle; synthetic provider/history.
const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { buildFixture } = require('./sparcReadingOrderFixture.cjs');

for (const checkpoint of ['composed', 'question']) {
  it(`leaving during ${checkpoint} prevents old startup writes while reopening resumes saved history`, { timeout: 120000 }, async () => {
    const fixture = await buildFixture({ realStartup: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://sparc-fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: '<main id="fixture"></main>' }));
      await page.goto('http://sparc-fixture.test/startup');
      await page.addScriptTag({ content: fixture.source });
      assert.deepEqual(errors, [], 'fixture must load the real runtime');
      await page.evaluate(async checkpoint => {
        const f = window.fixture;
        f.rows = []; f.conflicts = 0; f.calls = 0; f.cancelled = false;
        f.writeHistory = async row => {
          const id = row.sparc.stateTransition.transitionId;
          const saved = f.rows.find(previous => previous.sparc.stateTransition.transitionId === id);
          if (saved && JSON.stringify(saved) !== JSON.stringify(row)) { f.conflicts++; throw Error('Conflicting history write'); }
          if (!saved) f.rows.push(row);
        };
        f.generate = async request => {
          const call = ++f.calls;
          const gate = async stage => {
            if (call === 1 && checkpoint === stage) {
              f.waiting = true;
              await new Promise(resolve => { f.release = resolve; });
            }
          };
          const output = { explanation: 'The synthetic condition.', richContent: 'A worked example.', question: `Question from run ${call}?` };
          try {
            if (request.instructionCheckpoint?.stage !== 'accepted') {
              await gate('composed');
              const content = { text: output.explanation, support: { text: output.richContent } };
              await request.onInstructionCheckpoint({ stage: 'composed', content });
              await request.onInstructionCheckpoint({ stage: 'accepted', content });
            }
            await gate('question');
            await request.onInstructionComponent('question', output.question);
            return output;
          } catch (error) { if (call === 1 && error.name === 'AbortError') f.cancelled = true; throw error; }
        };
        f.props = { engine: { curUnit: { sparcsession: {} }, commitSparcTrialDisplayAutoTutorRules: params =>
          f.commitSparcTrialDisplayAutoTutorRules({ ...params, document: { ...params.document,
            productionRules: params.document.productionRules.filter(rule => rule.module !== 'dialogue.instructional-competition'
              || rule.id.includes('instruction.dynamic.explanation-rich-question.text')) } }) },
          userId: 'synthetic', tdfId: 'synthetic', attemptId: 'attempt', levelUnit: 0, subsetKind: 'question',
          display: { pageKey: 'startup', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
            instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'dynamic-instruction-agent-v2', policyVersion: 1 },
            autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A', category: 'model-rule' }], misconceptions: [] },
            clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }],
            workingMemoryFacts: [{ factType: 'dialogue.source', slots: { topic: 'Explain the synthetic lesson.' } },
              { factType: 'kcGraph.node', slots: { clusterKC: 'a', centrality: 1 } }],
            nodes: [{ id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input', readOnly: true },
              { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit', readOnly: true }] } };
        await f.mount(f.props);
      }, checkpoint);
      await page.waitForFunction(() => window.fixture.waiting).catch(async error => {
        throw new Error(`${error.message}: ${await page.locator('body').innerText()}; ${JSON.stringify(errors)}`);
      });
      await page.evaluate(async () => { await window.fixture.destroy(); await window.fixture.mount(window.fixture.props); });
      await page.waitForFunction(() => window.fixture.rows.some(row => row.sparc.stateTransition.transitionId.endsWith(':cycle')));
      const before = await page.evaluate(() => JSON.stringify(window.fixture.rows));
      await page.evaluate(() => window.fixture.release());
      await page.waitForFunction(() => window.fixture.cancelled);
      assert.equal(await page.evaluate(() => JSON.stringify(window.fixture.rows)), before, 'abandoned startup must not write after reopening');
      assert.equal(await page.evaluate(() => window.fixture.conflicts), 0);
      assert.equal(await page.locator('[role="alert"]').count(), 0);
      assert.deepEqual(errors, []);
      // A second reopen restores the completed turn without another generation.
      await page.evaluate(() => window.fixture.mount(window.fixture.props));
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      assert.equal(await page.evaluate(() => window.fixture.calls), 2);
    } finally { await browser.close(); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
  });
}
