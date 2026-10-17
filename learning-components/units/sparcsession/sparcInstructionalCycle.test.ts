import { strict as assert } from 'node:assert';
import { SPARC_INSTRUCTIONAL_POLICY_IDS, sparcPolicyForAccount } from '../../runtime/sparcInstructionalPolicies';
import { assertSparcInstructionalControllerConfig } from './sparcInstructionalControl';

describe('Supported SPARC policy contract', () => {
  it('supports exactly the retained policies and preserves authored identity for both account roles', () => {
    assert.deepEqual(SPARC_INSTRUCTIONAL_POLICY_IDS, ['progressive-scaffolding-v1', 'dynamic-instruction-agent-v2', 'dynamic-instruction-student-v2']);
    for (const policyId of SPARC_INSTRUCTIONAL_POLICY_IDS) {
      assert.equal(sparcPolicyForAccount(true, policyId), policyId);
      if (policyId === 'progressive-scaffolding-v1') assert.equal(sparcPolicyForAccount(false, policyId), policyId);
      else assert.throws(() => sparcPolicyForAccount(false, policyId), /admin account/);
      assertSparcInstructionalControllerConfig({ adapterId: 'sparc-autotutor-v1', policyId, policyVersion: 1 });
    }
  });
  it('rejects every retired policy and unknown identifiers without translation', () => {
    for (const policyId of ['student-selected-v2', 'agent-selected-v1', 'oet-boltzmann-v2', 'dynamic-instruction-agent-v1', 'dynamic-instruction-student-v1', 'unknown-policy']) {
      for (const admin of [false, true]) assert.throws(() => sparcPolicyForAccount(admin, policyId), /Unsupported/);
      assert.throws(() => assertSparcInstructionalControllerConfig({ adapterId: 'sparc-autotutor-v1', policyId, policyVersion: 1 }), /not registered/);
    }
  });
});
