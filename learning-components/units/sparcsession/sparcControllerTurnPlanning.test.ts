import { strict as assert } from 'node:assert';
import type { SparcAuthoredDocument, SparcInterfaceEvent, SparcWorkingMemoryFact } from './sparcSessionContracts';
import { evaluateSparcControllerTurnPlanning } from './sparcControllerTurnPlanning';

function literal(value: unknown) {
  return { type: 'literal' as const, value };
}

function variable(name: string) {
  return { type: 'variable' as const, name };
}

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

function document(): SparcAuthoredDocument {
  return {
    id: 'sparc-doc',
    schemaVersion: 1,
    workingMemoryFacts: [
      fact('controller.targetSelectionPolicy', {
        policy: 'kc-graph-priority',
        coverageThreshold: 0.8,
        frontierWeight: 0.5,
        coherenceWeight: 0.3,
        centralityWeight: 0.2,
      }),
      fact('autotutor.expectation', { clusterKC: 'kc-a' }),
      fact('autotutor.expectation', { clusterKC: 'kc-b' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.1 }),
      fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.1, description: 'A' }),
      fact('kcGraph.node', { clusterKC: 'kc-b', centrality: 0.8, description: 'B' }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-b', strength: 0.9 }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-b', targetClusterKC: 'kc-a', strength: 0.9 }),
      fact('dialogue.learnerWordCount', { cumulative: 2 }),
      fact('session.turnState', { turnCount: 1 }),
    ],
    productionRules: [{
      id: 'dialogue.move.test-hint',
      module: 'dialogue.move-selection',
      salience: 10,
      when: [{
        factType: 'learningTarget.selected',
        slots: {
          clusterKC: { type: 'bind', variable: 'targetClusterKC' },
        },
      }, {
        factType: 'learningTarget.coverageMean',
        slots: {
          scope: { type: 'literal', value: 'required' },
          value: { type: 'range', min: 0, max: 0.5 },
        },
      }, {
        factType: 'dialogue.learnerWordCount',
        slots: {
          cumulative: { type: 'range', min: 5 },
        },
      }],
      then: [{
        type: 'assert-fact',
        persist: true,
        fact: {
          factType: 'controller.selectedAction',
          slots: {
            targetType: literal('learningTarget'),
            clusterKC: variable('targetClusterKC'),
            action: literal('hint'),
          },
        },
      }, {
        type: 'terminate-production-phase',
        reason: 'move-selected',
      }],
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'learner-input',
        kind: 'input',
      }],
    },
  };
}

function completedDocument(): SparcAuthoredDocument {
  return {
    id: 'sparc-doc',
    schemaVersion: 1,
    workingMemoryFacts: [
      fact('dialogue.graduation', { requiredTargetCount: 2 }),
      fact('dialogue.thresholds', { coverageThreshold: 0.8 }),
      fact('controller.targetSelectionPolicy', {
        policy: 'kc-graph-priority',
        coverageThreshold: 0.8,
      }),
      fact('autotutor.expectation', { clusterKC: 'kc-a' }),
      fact('autotutor.expectation', { clusterKC: 'kc-b' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.9 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.85 }),
      fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.1, description: 'A' }),
      fact('kcGraph.node', { clusterKC: 'kc-b', centrality: 0.8, description: 'B' }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-b', strength: 0.9 }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-b', targetClusterKC: 'kc-a', strength: 0.9 }),
    ],
    productionRules: [{
      id: 'dialogue.move.test-summary',
      module: 'dialogue.move-selection',
      salience: 10,
      when: [{
        factType: 'learningTarget.selected',
        slots: {
          clusterKC: { type: 'bind', variable: 'targetClusterKC' },
        },
      }, {
        factType: 'controller.completionState',
        slots: {
          completed: { type: 'literal', value: true },
        },
      }, {
        factType: 'learningTarget.score',
        slots: {
          clusterKC: { type: 'bound', variable: 'targetClusterKC' },
          coverage: { type: 'range', min: 0.8, max: 1, maxInclusive: true },
        },
      }],
      then: [{
        type: 'assert-fact',
        persist: true,
        fact: {
          factType: 'controller.selectedAction',
          slots: {
            targetType: literal('learningTarget'),
            clusterKC: variable('targetClusterKC'),
            action: literal('summary'),
          },
        },
      }, {
        type: 'terminate-production-phase',
        reason: 'move-selected',
      }],
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'learner-input',
        kind: 'input',
      }],
    },
  };
}

function misconceptionDocument(confidence = 0.25): SparcAuthoredDocument {
  return {
    id: 'sparc-doc',
    schemaVersion: 1,
    workingMemoryFacts: [
      fact('controller.targetSelectionPolicy', {
        policy: 'kc-graph-priority',
        coverageThreshold: 0.8,
      }),
      fact('autotutor.expectation', { clusterKC: 'kc-a' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
      fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.5, description: 'A' }),
      fact('autotutor.misconception', { id: 'm-active' }),
      fact('diagnostic.misconceptionScore', { id: 'm-active', confidence }),
      fact('dialogue.learnerWordCount', { cumulative: 5 }),
      fact('session.turnState', { turnCount: 1 }),
    ],
    productionRules: [{
      id: 'dialogue.move.test-repair',
      module: 'dialogue.move-selection',
      salience: 80,
      when: [{
        factType: 'diagnostic.misconceptionSelected',
        slots: {
          id: { type: 'bind', variable: 'misconceptionId' },
        },
      }, {
        factType: 'diagnostic.misconceptionScore',
        slots: {
          id: { type: 'bound', variable: 'misconceptionId' },
          confidence: { type: 'range', min: 0.2, max: 1, maxInclusive: true },
        },
      }],
      then: [{
        type: 'assert-fact',
        persist: true,
        fact: {
          factType: 'controller.selectedAction',
          slots: {
            targetType: literal('misconception'),
            id: variable('misconceptionId'),
            action: literal('splice'),
          },
        },
      }, {
        type: 'terminate-production-phase',
        reason: 'move-selected',
      }],
    }, {
      id: 'dialogue.move.paper-rule-09-elaborate',
      module: 'dialogue.move-selection',
      salience: 70,
      when: [{
        factType: 'learningTarget.selected',
        slots: {
          clusterKC: { type: 'bind', variable: 'targetClusterKC' },
        },
      }, {
        factType: 'selector.currentExpectationCoverage',
        slots: {
          clusterKC: { type: 'bound', variable: 'targetClusterKC' },
          band: literal('MEDIUM'),
        },
      }],
      then: [{
        type: 'assert-fact',
        persist: true,
        fact: {
          factType: 'controller.selectedAction',
          slots: {
            targetType: literal('learningTarget'),
            clusterKC: variable('targetClusterKC'),
            action: literal('elaborate'),
          },
        },
      }, {
        type: 'terminate-production-phase',
        reason: 'move-selected',
      }],
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'learner-input',
        kind: 'input',
      }],
    },
  };
}

function mediumExpectationDocument(): SparcAuthoredDocument {
  const base = misconceptionDocument(0.05);
  return {
    ...base,
    workingMemoryFacts: (base.workingMemoryFacts ?? []).filter((entry) => (
      entry.factType !== 'autotutor.misconception'
      && entry.factType !== 'diagnostic.misconceptionScore'
    )),
    productionRules: (base.productionRules ?? []).filter((entry) => entry.id === 'dialogue.move.paper-rule-09-elaborate'),
  };
}

const event: SparcInterfaceEvent = {
  eventId: 'event-plan-turn',
  type: 'response-submitted',
  source: {
    pageKey: 'sparc-doc',
    nodeId: 'learner-input',
  },
  time: 1200,
  payload: {
    input: 'three more words',
  },
};

describe('evaluateSparcControllerTurnPlanning', function() {
  it('runs target selection, derived facts, and move-selection production rules in order', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: document(),
      event,
      targetSelectionOptions: {
        anchorClusterKC: 'kc-a',
      },
    });

    assert.equal(result.targetSelection.selectedClusterKC, 'kc-b');
    assert.equal(result.derivedFacts.find((entry) => entry.factType === 'dialogue.learnerWordCount')?.slots?.cumulative, 5);
    assert.equal(result.derivedFacts.find((entry) => entry.factType === 'learningTarget.coverageMean')?.slots?.value, 0.15);
    assert.equal(result.derivedFacts.find((entry) => entry.factType === 'session.turnState')?.slots?.turnCount, 2);
    assert.equal(result.derivedFacts.find((entry) => entry.factType === 'controller.completionState')?.slots?.completed, false);
    assert.deepEqual(result.productionRuleFacts.filter((entry) => entry.factType.startsWith('selector.')), [{
      factType: 'selector.currentExpectationCoverage',
      slots: {
        clusterKC: 'kc-b',
        value: 0.1,
        band: 'LOW',
      },
    }, {
      factType: 'selector.studentAbility',
      slots: {
        value: 0.15,
        band: 'LOW',
        expectationCoverageMean: 0.15,
        misconceptionConfidenceMean: 0,
      },
    }, {
      factType: 'selector.studentVerbosity',
      slots: {
        wordCount: 5,
        band: 'LOW',
      },
    }]);
    assert.equal(result.productionRuleEvaluation.execution.firings.length, 1);
    assert.equal(result.productionRuleEvaluation.execution.firings[0]?.ruleId, 'dialogue.move.test-hint');
    assert.ok(result.productionRuleEvaluation.execution.facts.some((entry) => (
      entry.factType === 'controller.selectedAction'
      && entry.slots?.clusterKC === 'kc-b'
      && entry.slots?.action === 'hint'
    )));
  });

  it('selects a completion target when all required targets are covered', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: completedDocument(),
      event,
    });

    assert.equal(result.targetSelection.selectedClusterKC, 'kc-a');
    assert.ok(result.targetSelection.facts.some((entry) => (
      entry.factType === 'dialogue.completionSelected'
      && entry.slots?.reason === 'required-coverage'
    )));
    assert.equal(result.derivedFacts.find((entry) => entry.factType === 'controller.completionState')?.slots?.completed, true);
    assert.equal(result.productionRuleEvaluation.execution.firings.length, 1);
    assert.ok(result.productionRuleEvaluation.execution.facts.some((entry) => (
      entry.factType === 'controller.selectedAction'
      && entry.slots?.clusterKC === 'kc-a'
      && entry.slots?.action === 'summary'
    )));
  });

  it('selects low-confidence misconception repair before paper-rule-09 elaborate when a misconception is active', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: misconceptionDocument(),
      event,
    });

    assert.equal(result.targetSelection.selectedTargetType, 'misconception');
    assert.equal(result.targetSelection.selectedMisconceptionId, 'm-active');
    assert.ok(result.targetSelection.facts.some((entry) => (
      entry.factType === 'diagnostic.misconceptionSelected'
      && entry.slots?.id === 'm-active'
    )));
    assert.equal(result.productionRuleEvaluation.execution.firings[0]?.ruleId, 'dialogue.move.test-repair');
    assert.ok(result.productionRuleEvaluation.execution.facts.some((entry) => (
      entry.factType === 'controller.selectedAction'
      && entry.slots?.targetType === 'misconception'
      && entry.slots?.id === 'm-active'
      && entry.slots?.action === 'splice'
    )));
  });

  it('uses medium expectation coverage for paper-rule-09 elaborate without bag-match selector facts', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: mediumExpectationDocument(),
      event,
    });

    assert.equal(result.targetSelection.selectedTargetType, 'learningTarget');
    assert.equal(result.productionRuleEvaluation.execution.firings[0]?.ruleId, 'dialogue.move.paper-rule-09-elaborate');
    assert.equal(result.productionRuleEvaluation.execution.facts.some((entry) => (
      entry.factType === 'selector.goodAnswerMatch'
      || entry.factType === 'selector.badAnswerMatch'
    )), false);
    assert.ok(result.productionRuleEvaluation.execution.facts.some((entry) => (
      entry.factType === 'controller.selectedAction'
      && entry.slots?.targetType === 'learningTarget'
      && entry.slots?.clusterKC === 'kc-a'
      && entry.slots?.action === 'elaborate'
    )));
  });
});
