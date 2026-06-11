import assert from 'node:assert/strict';
import {
  assertSparcModelTraceEquivalent,
  compareSparcModelTrace,
} from './sparcTraceComparison';
import type {
  SparcModelTraceComparison,
  SparcTraceStep,
} from './sparcSessionContracts';

function sparcStep(overrides: Partial<SparcTraceStep> = {}): SparcTraceStep {
  return {
    traceId: 'trace-1',
    sourceAddress: {
      documentId: 'doc-1',
      nodeId: 'region-1',
    },
    productionRuleId: 'rule-1',
    actionId: 'action-1',
    outcome: 'correct',
    time: 1000,
    details: {
      stimulusKC: 'stim-1',
      responseKC: 'resp-1',
    },
    ...overrides,
  };
}

function comparison(overrides: Partial<SparcModelTraceComparison> = {}): SparcModelTraceComparison {
  return {
    sparcTrace: [sparcStep()],
    referenceTrace: [{
      referenceSystem: 'ctat-brd',
      productionRuleId: 'rule-1',
      actionId: 'action-1',
      outcome: 'correct',
      stimulusKC: 'stim-1',
      responseKC: 'resp-1',
    }],
    ...overrides,
  };
}

describe('sparcTraceComparison', function() {
  it('accepts SPARC traces that match the CTAT BRD production-rule trace', function() {
    const result = compareSparcModelTrace(comparison());

    assert.equal(result.equivalent, true);
    assert.deepEqual(result.mismatches, []);
    assert.doesNotThrow(() => assertSparcModelTraceEquivalent(comparison()));
  });

  it('reports production rule, action, and outcome mismatches by trace index', function() {
    const result = compareSparcModelTrace(comparison({
      sparcTrace: [sparcStep({
        productionRuleId: 'different-rule',
        actionId: 'different-action',
        outcome: 'incorrect',
      })],
    }));

    assert.equal(result.equivalent, false);
    assert.deepEqual(result.mismatches.map((mismatch) => mismatch.kind), [
      'production-rule',
      'action',
      'outcome',
    ]);
    assert.equal(result.mismatches[0]?.index, 0);
  });

  it('checks optional stimulus and response KC identities when the BRD reference supplies them', function() {
    const result = compareSparcModelTrace(comparison({
      sparcTrace: [sparcStep({
        details: {
          stimulusKC: 'other-stim',
          responseKC: 'other-response',
        },
      })],
    }));

    assert.equal(result.equivalent, false);
    assert.deepEqual(result.mismatches.map((mismatch) => mismatch.kind), [
      'stimulus-kc',
      'response-kc',
    ]);
  });

  it('allows BRD trace steps without KC identities to compare only rule, action, and outcome', function() {
    const result = compareSparcModelTrace(comparison({
      referenceTrace: [{
        referenceSystem: 'ctat-brd',
        productionRuleId: 'rule-1',
        actionId: 'action-1',
        outcome: 'correct',
      }],
      sparcTrace: [sparcStep({ details: {} })],
    }));

    assert.equal(result.equivalent, true);
  });

  it('reports trace length mismatches before comparing common steps', function() {
    const result = compareSparcModelTrace(comparison({
      sparcTrace: [sparcStep(), sparcStep({ traceId: 'trace-2' })],
    }));

    assert.equal(result.equivalent, false);
    assert.equal(result.mismatches[0]?.kind, 'length');
    assert.throws(
      () => assertSparcModelTraceEquivalent(comparison({
        sparcTrace: [],
      })),
      /SPARC trace length differs from reference trace length/,
    );
  });
});
