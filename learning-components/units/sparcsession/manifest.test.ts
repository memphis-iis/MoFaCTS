import assert from 'node:assert/strict';
import { summarizeLearningComponentManifest } from '../../runtime/registerLearningComponents';
import {
  sparcSessionUnitComponentManifest,
  SPARC_SESSION_UNIT_TYPE,
} from './manifest';

describe('sparcSessionUnitComponentManifest', function() {
  it('advertises SPARC-owned services at the unit component boundary', function() {
    const summary = summarizeLearningComponentManifest(sparcSessionUnitComponentManifest);

    assert.equal(summary.id, 'mofacts.sparcsession-unit');
    assert.deepEqual(summary.unitTypes, [SPARC_SESSION_UNIT_TYPE]);
    assert.deepEqual(summary.requiredCapabilities, [
      'adaptive-card-model',
      'authz',
      'card-state',
      'delivery-settings',
      'history',
      'logging',
      'server-methods',
      'session',
      'stimuli',
      'ui-alerts',
    ]);
    assert.deepEqual(summary.providedServices, [
      'sparc.authored-initial-state',
      'sparc.authored-model-targets',
      'sparc.authored-response-outcome',
      'sparc.condition-evaluation',
      'sparc.document-addressing',
      'sparc.document-replay',
      'sparc.document-validation',
      'sparc.model-history-exchange',
      'sparc.model-query-adapter',
      'sparc.model-update-request',
      'sparc.production-rule-commit',
      'sparc.production-rule-evaluation',
      'sparc.response-outcome-authored-rules',
      'sparc.response-outcome-commit',
      'sparc.response-outcome-history',
      'sparc.reactive-rule-commit',
      'sparc.reactive-rule-evaluation',
      'sparc.state-replay',
      'sparc.state-transition-history',
      'sparc.trial-display-production-rule-commit',
      'sparc.trial-display-production-rule-evaluation',
      'sparc.vertical-layout-validation',
    ]);
    assert.deepEqual(
      summary.providedServiceDetails
        .filter((service) => service.runtimeEntry !== undefined)
        .map((service) => [service.serviceName, service.runtimeEntry]),
      [
        [
          'sparc.document-addressing',
          'SparcSessionUnitEngine.validateSparcDocumentReferences',
        ],
        [
          'sparc.document-replay',
          'SparcSessionUnitEngine.replaySparcDocumentHistory',
        ],
        [
          'sparc.document-validation',
          'SparcSessionUnitEngine.validateSparcAuthoredDocument',
        ],
        [
          'sparc.production-rule-commit',
          'SparcSessionUnitEngine.commitSparcAuthoredProductionRuleEvent',
        ],
        [
          'sparc.production-rule-evaluation',
          'SparcSessionUnitEngine.evaluateSparcAuthoredProductionRules',
        ],
        [
          'sparc.trial-display-production-rule-commit',
          'SparcSessionUnitEngine.commitSparcTrialDisplayProductionRuleEvents',
        ],
        [
          'sparc.trial-display-production-rule-evaluation',
          'SparcSessionUnitEngine.evaluateSparcTrialDisplayProductionRuleEvents',
        ],
        [
          'sparc.response-outcome-commit',
          'SparcSessionUnitEngine.processAndCommitSparcAuthoredResponseOutcome',
        ],
      ],
    );
  });
});
