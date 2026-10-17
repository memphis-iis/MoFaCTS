// Pure removal boundaries and preserved shared contracts; no Meteor/DDP or database.
require('./registerHistoryTypescript.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
for (const name of ['describe', 'it', 'before', 'after', 'beforeEach', 'afterEach']) global[name] = test[name];

for (const file of [
  '../server/conversions/convert.test.ts',
  '../common/learningComponentContext.test.ts',
  '../common/learningComponentCatalog.test.ts',
  '../common/learningComponentManifest.test.ts',
  '../common/fieldRegistrySections.test.ts',
  '../common/lib/learnerTdfConfig.test.ts',
  '../client/views/experiment/svelte/services/sessionSurfaceMode.test.ts',
  '../client/views/experiment/svelte/services/contentSurfaceActivation.test.ts',
  '../client/views/experiment/svelte/services/contentLaunchCoordinator.test.ts',
  '../../learning-components/content/tdf/runtimeStimulusInterpretation.test.ts',
  '../../learning-components/units/sparcsession/sparcAuthoredInitialState.test.ts',
]) require(file);

const { defaultUnitComponentManifests } = require('../../learning-components/units/defaultUnitComponents.ts');
const { registerLearningComponents } = require('../../learning-components/runtime/registerLearningComponents.ts');
const registry = require('../../learning-components/units/UnitEngineRegistry.ts');
const { SPARC_INSTRUCTIONAL_POLICY_IDS, sparcPolicyForAccount } = require('../../learning-components/runtime/sparcInstructionalPolicies.ts');

test.it('registers the supported engines and cannot construct the removed standalone runtime', async () => {
  registry.resetUnitEngineRegistryForTests();
  registerLearningComponents(defaultUnitComponentManifests, {
    capabilities: new Set(defaultUnitComponentManifests.flatMap(manifest => manifest.requiredCapabilities || [])),
    serverMethods: new Set(defaultUnitComponentManifests.flatMap(manifest => manifest.requiredServerMethods || [])),
    registerUnitEngine: registry.registerUnitEngine,
    registerUnitEngineWithDeps: registry.registerUnitEngineWithDeps,
    registerTrialDisplayAdapter() {},
  });
  assert.ok(registry.getRegisteredUnitEngineTypes().includes('sparc'));
  assert.equal(registry.hasRegisteredUnitEngine('autotutor'), false);
  await assert.rejects(() => registry.createRegisteredUnitEngine('autotutor'), /No unit engine registered/);
  registry.resetUnitEngineRegistryForTests();
});

test.it('preserves supported authored policies and rejects retired policies for both account roles', () => {
  const expected = {
    'progressive-scaffolding-v1': 'progressive-scaffolding-v1',
    'dynamic-instruction-agent-v2': 'dynamic-instruction-agent-v2',
    'dynamic-instruction-student-v2': 'dynamic-instruction-student-v2',
  };
  assert.deepEqual([...SPARC_INSTRUCTIONAL_POLICY_IDS], Object.keys(expected));
  for (const [authoredPolicy, adminPolicy] of Object.entries(expected)) {
    assert.equal(sparcPolicyForAccount(true, authoredPolicy), adminPolicy);
    if (authoredPolicy.startsWith('dynamic-')) {
      assert.throws(() => sparcPolicyForAccount(false, authoredPolicy), /requires an admin account/);
    } else {
      assert.equal(sparcPolicyForAccount(false, authoredPolicy), 'progressive-scaffolding-v1');
    }
  }
  for (const policy of [
    'student-selected-v2', 'agent-selected-v1', 'oet-boltzmann-v2',
    'dynamic-instruction-agent-v1', 'dynamic-instruction-student-v1', 'unknown',
  ]) {
    for (const isAdmin of [true, false]) {
      assert.throws(() => sparcPolicyForAccount(isAdmin, policy), /Unsupported AutoTutor instructional policy/);
    }
  }
});
