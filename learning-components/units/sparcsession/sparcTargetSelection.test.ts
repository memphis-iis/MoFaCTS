import { strict as assert } from 'node:assert';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import { selectSparcLearningTargetFromFacts } from './sparcTargetSelection';

function source(clusterKC: string): SparcWorkingMemoryFact {
  return {
    factType: 'autotutor.expectation',
    slots: {
      clusterKC,
    },
  };
}

function score(clusterKC: string, coverage: number): SparcWorkingMemoryFact {
  return {
    factType: 'learningTarget.score',
    slots: {
      clusterKC,
      coverage,
    },
  };
}

function misconceptionSource(id: string): SparcWorkingMemoryFact {
  return {
    factType: 'autotutor.misconception',
    slots: {
      id,
    },
  };
}

function misconceptionScore(id: string, confidence: number): SparcWorkingMemoryFact {
  return {
    factType: 'diagnostic.misconceptionScore',
    slots: {
      id,
      confidence,
    },
  };
}

function node(clusterKC: string, centrality: number): SparcWorkingMemoryFact {
  return {
    factType: 'kcGraph.node',
    slots: {
      clusterKC,
      description: `${clusterKC} description`,
      centrality,
    },
  };
}

function relationship(sourceClusterKC: string, targetClusterKC: string, strength: number): SparcWorkingMemoryFact {
  return {
    factType: 'kcGraph.relationship',
    slots: {
      sourceClusterKC,
      targetClusterKC,
      strength,
    },
  };
}

function baseFacts(): SparcWorkingMemoryFact[] {
  return [
    source('kc-a'),
    source('kc-b'),
    source('kc-c'),
    score('kc-a', 0.2),
    score('kc-b', 0.1),
    score('kc-c', 0.7),
    node('kc-a', 0.1),
    node('kc-b', 0.8),
    node('kc-c', 0.2),
    relationship('kc-a', 'kc-b', 0.9),
    relationship('kc-a', 'kc-c', 0.4),
    relationship('kc-b', 'kc-a', 0.9),
    relationship('kc-b', 'kc-c', 0.6),
    relationship('kc-c', 'kc-a', 0.4),
    relationship('kc-c', 'kc-b', 0.6),
  ];
}

describe('selectSparcLearningTargetFromFacts', function() {
  it('selects the highest-priority uncovered target from SPARC graph facts', function() {
    const result = selectSparcLearningTargetFromFacts(baseFacts(), {
      anchorClusterKC: 'kc-a',
    });

    assert.equal(result.selectedClusterKC, 'kc-b');
    assert.equal(result.facts.at(-1)?.factType, 'learningTarget.selected');
    assert.equal(result.facts.at(-1)?.slots?.clusterKC, 'kc-b');
    assert.equal(result.facts.at(-1)?.slots?.focusActive, true);
    assert.equal(result.facts.at(-1)?.slots?.focusTurnCount, 0);
    assert.equal(result.facts.at(-1)?.slots?.firstFocusTurn, 0);
    assert.equal(result.facts.at(-1)?.slots?.moveCycleIndex, 0);
    const candidate = result.candidates.find((entry) => entry.clusterKC === 'kc-b');
    assert.ok(candidate);
    assert.equal(candidate.coherenceToAnchor, 0.9);
    assert.equal(candidate.frontierScore, 0.7875);
    assert.equal(candidate.centralityScore, 0.8);
    assert.equal(candidate.priorityScore, 0.82375);
    assert.equal(candidate.eligible, true);
    const anchorCandidate = result.candidates.find((entry) => entry.clusterKC === 'kc-a');
    assert.ok(anchorCandidate);
    assert.equal(anchorCandidate.coherenceToAnchor, 1);
    assert.equal(anchorCandidate.frontierScore, 0.75);
    assert.equal(anchorCandidate.priorityScore, 0.695);
  });

  it('emits candidate facts for counterfactual/replay inspection', function() {
    const result = selectSparcLearningTargetFromFacts(baseFacts(), {
      anchorClusterKC: 'kc-a',
    });

    const candidateFacts = result.facts.filter((fact) => fact.factType === 'learningTarget.candidate');
    assert.equal(candidateFacts.length, 3);
    assert.deepEqual(candidateFacts.map((fact) => fact.slots?.clusterKC), ['kc-a', 'kc-b', 'kc-c']);
    assert.equal(candidateFacts.find((fact) => fact.slots?.clusterKC === 'kc-b')?.slots?.priorityScore, 0.82375);
  });

  it('fails clearly when required graph facts are missing', function() {
    assert.throws(
      () => selectSparcLearningTargetFromFacts(baseFacts().filter((fact) => (
        fact.factType !== 'kcGraph.relationship'
        || fact.slots?.sourceClusterKC !== 'kc-a'
        || fact.slots?.targetClusterKC !== 'kc-b'
      )), {
        anchorClusterKC: 'kc-a',
      }),
      /missing kcGraph\.relationship from "kc-a" to "kc-b"/,
    );
  });

  it('fails clearly when all required targets are covered', function() {
    const facts = baseFacts().filter((fact) => fact.factType !== 'learningTarget.score');
    facts.push(score('kc-a', 0.9), score('kc-b', 0.95), score('kc-c', 0.8));

    assert.throws(
      () => selectSparcLearningTargetFromFacts(facts, {
        anchorClusterKC: 'kc-a',
      }),
      /could not select an uncovered required learning target/,
    );
  });

  it('breaks equal priority ties by clusterKC', function() {
    const facts: SparcWorkingMemoryFact[] = [
      source('kc-b'),
      source('kc-a'),
      node('kc-b', 0.5),
      node('kc-a', 0.5),
    ];

    const result = selectSparcLearningTargetFromFacts(facts);

    assert.equal(result.selectedClusterKC, 'kc-a');
  });

  it('can exclude the current focus while still falling back to another target', function() {
    const result = selectSparcLearningTargetFromFacts(baseFacts(), {
      anchorClusterKC: 'kc-a',
      excludeClusterKC: 'kc-b',
    });

    assert.equal(result.selectedClusterKC, 'kc-c');
    assert.equal(result.candidates.find((candidate) => candidate.clusterKC === 'kc-b')?.eligible, false);
  });

  it('increments focus counters when replayed selected target remains active', function() {
    const result = selectSparcLearningTargetFromFacts([
      ...baseFacts(),
      {
        factType: 'session.turnState',
        slots: {
          turnCount: 3,
        },
      },
      {
        factType: 'learningTarget.selected',
        slots: {
          clusterKC: 'kc-b',
          focusActive: true,
          focusTurnCount: 2,
          firstFocusTurn: 1,
          moveCycleIndex: 4,
        },
      },
    ], {
      anchorClusterKC: 'kc-a',
    });

    assert.equal(result.selectedClusterKC, 'kc-b');
    assert.deepEqual(result.facts.at(-1)?.slots, {
      clusterKC: 'kc-b',
      focusActive: true,
      focusTurnCount: 3,
      firstFocusTurn: 1,
      moveCycleIndex: 5,
    });
  });

  it('reads authored target-selection policy facts when options omit weights', function() {
    const result = selectSparcLearningTargetFromFacts([
      ...baseFacts(),
      {
        factType: 'controller.targetSelectionPolicy',
        slots: {
          coverageThreshold: 0.8,
          frontierWeight: 0,
          coherenceWeight: 0,
          centralityWeight: 1,
        },
      },
    ], {
      anchorClusterKC: 'kc-a',
    });

    assert.equal(result.selectedClusterKC, 'kc-b');
    assert.equal(result.candidates.find((candidate) => candidate.clusterKC === 'kc-b')?.priorityScore, 0.8);
  });

  it('selects the strongest repair-active misconception before expectation candidates', function() {
    const result = selectSparcLearningTargetFromFacts([
      ...baseFacts(),
      misconceptionSource('m-low'),
      misconceptionSource('m-high'),
      misconceptionScore('m-low', 0.4),
      misconceptionScore('m-high', 0.75),
    ], {
      anchorClusterKC: 'kc-a',
    });

    assert.equal(result.selectedTargetType, 'misconception');
    assert.equal(result.selectedMisconceptionId, 'm-high');
    assert.deepEqual(result.facts.at(-1), {
      factType: 'diagnostic.misconceptionSelected',
      slots: {
        id: 'm-high',
      },
    });
  });

  it('keeps a repair-active selected misconception focused until confidence drops below threshold', function() {
    const result = selectSparcLearningTargetFromFacts([
      ...baseFacts(),
      misconceptionSource('m-prior'),
      misconceptionSource('m-stronger'),
      misconceptionScore('m-prior', 0.3),
      misconceptionScore('m-stronger', 0.9),
      {
        factType: 'diagnostic.misconceptionSelected',
        slots: {
          id: 'm-prior',
        },
      },
    ], {
      anchorClusterKC: 'kc-a',
    });

    assert.equal(result.selectedTargetType, 'misconception');
    assert.equal(result.selectedMisconceptionId, 'm-prior');

    const repaired = selectSparcLearningTargetFromFacts([
      ...baseFacts(),
      misconceptionSource('m-prior'),
      misconceptionScore('m-prior', 0.19),
      {
        factType: 'diagnostic.misconceptionSelected',
        slots: {
          id: 'm-prior',
        },
      },
    ], {
      anchorClusterKC: 'kc-a',
    });

    assert.equal(repaired.selectedTargetType, 'learningTarget');
    assert.equal(repaired.selectedMisconceptionId, undefined);
  });
});
