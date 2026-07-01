import { strict as assert } from 'node:assert';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import {
  bandSparcCurrentExpectationCoverage,
  bandSparcStudentAbility,
  bandSparcStudentVerbosity,
  deriveSparcActiveSelectorSignalFacts,
} from './sparcSelectorSignals';

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

describe('SPARC selector signals', function() {
  it('bands current expectation coverage, derived ability, and verbosity', function() {
    assert.equal(bandSparcCurrentExpectationCoverage(0.29), 'LOW');
    assert.equal(bandSparcCurrentExpectationCoverage(0.3), 'MEDIUM');
    assert.equal(bandSparcCurrentExpectationCoverage(0.8), 'HIGH');

    assert.equal(bandSparcStudentAbility(-0.01), 'VERY_LOW');
    assert.equal(bandSparcStudentAbility(0), 'LOW');
    assert.equal(bandSparcStudentAbility(0.3), 'MEDIUM');
    assert.equal(bandSparcStudentAbility(0.8), 'HIGH');

    assert.equal(bandSparcStudentVerbosity(11), 'LOW');
    assert.equal(bandSparcStudentVerbosity(12), 'MEDIUM');
    assert.equal(bandSparcStudentVerbosity(30), 'HIGH');
  });

  it('derives learner-owned selector facts from selected target, coverage, misconception confidence, and word count', function() {
    const result = deriveSparcActiveSelectorSignalFacts([
      fact('learningTarget.source', { clusterKC: 'kc-a' }),
      fact('learningTarget.source', { clusterKC: 'kc-b' }),
      fact('diagnostic.misconceptionSource', { id: 'm-a' }),
      fact('diagnostic.misconceptionSource', { id: 'm-b' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.8 }),
      fact('diagnostic.misconceptionScore', { id: 'm-a', confidence: 0.6 }),
      fact('learningTarget.selected', { clusterKC: 'kc-a' }),
      fact('dialogue.learnerWordCount', { cumulative: 14 }),
    ]);

    assert.deepEqual(result, [{
      factType: 'selector.currentExpectationCoverage',
      slots: {
        clusterKC: 'kc-a',
        value: 0.2,
        band: 'LOW',
      },
    }, {
      factType: 'selector.studentAbility',
      slots: {
        value: 0.2,
        band: 'LOW',
        expectationCoverageMean: 0.5,
        misconceptionConfidenceMean: 0.3,
      },
    }, {
      factType: 'selector.studentVerbosity',
      slots: {
        wordCount: 14,
        band: 'MEDIUM',
      },
    }]);
  });
});
