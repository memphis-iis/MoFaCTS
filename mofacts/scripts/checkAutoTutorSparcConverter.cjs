const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createJiti = require('jiti');

const jiti = createJiti(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const evaluator = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcProductionRuleEvaluator.ts'));
const autoTutorPlanner = jiti(path.join(repoRoot, 'learning-components/units/autotutor/AutoTutorPlanner.ts'));
const derivedFacts = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcControllerDerivedFacts.ts'));
const controllerDialogueTurn = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcControllerDialogueTurn.ts'));
const turnPlanning = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcControllerTurnPlanning.ts'));
const targetSelection = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcTargetSelection.ts'));
const utteranceRequest = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcUtteranceRequest.ts'));
const selectorSignals = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcSelectorSignals.ts'));
const moveDefinitions = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcMoveDefinitions.ts'));
const moveSelectionAudit = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcMoveSelectionAudit.ts'));
const dialogueTurnNodes = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcDialogueTurnNodes.ts'));
const progressiveNodes = jiti(path.join(repoRoot, 'learning-components/trial-displays/sparc/sparcProgressiveNodes.ts'));
const sparcSessionUnitEngine = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/SparcSessionUnitEngine.ts'));
const sparcStateReplay = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/sparcStateReplay.ts'));
const dialogueOpenRouter = jiti(path.join(repoRoot, 'mofacts/client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.ts'));
const sparcAutoTutorProgress = jiti(path.join(repoRoot, 'mofacts/client/views/experiment/svelte/services/sparcAutoTutorProgress.ts'));
const template = jiti(path.join(repoRoot, 'mofacts/scripts/autotutorSparcMoveRuleTemplate.ts'));
const converter = require('./convertAutoTutorToSparc.cjs');

function collectFiles(rootPath, extensions = new Set(['.ts', '.js', '.cjs', '.svelte'])) {
  const stats = fs.statSync(rootPath);
  if (stats.isFile()) {
    return extensions.has(path.extname(rootPath)) ? [rootPath] : [];
  }
  return fs.readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(childPath, extensions);
    }
    return extensions.has(path.extname(entry.name)) ? [childPath] : [];
  });
}

function assertNoOriginalAutoTutorRuntimeImports() {
  const implementationRoots = [
    path.join(repoRoot, 'learning-components/units/sparcsession'),
    path.join(repoRoot, 'learning-components/runtime/clusterKcRelationshipEngine.ts'),
    path.join(repoRoot, 'mofacts/scripts/convertAutoTutorToSparc.cjs'),
    path.join(repoRoot, 'mofacts/scripts/autotutorSparcMoveRuleTemplate.ts'),
    path.join(repoRoot, 'mofacts/client/views/experiment/svelte/services/sparcControllerDialogueCommit.ts'),
    path.join(repoRoot, 'mofacts/client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.ts'),
    path.join(repoRoot, 'mofacts/client/views/experiment/svelte/components/SparcNode.svelte'),
  ];
  const forbiddenImportPattern = /\b(?:from\s+|require\()\s*['"][^'"]*(?:units[/\\]autotutor|AutoTutorSession\.svelte|AutoTutorPlanner|AutoTutorStateMachine|AutoTutorUnitEngine|AutoTutorRuntimeConfig|AutoTutorRuntimeCapabilities)/;
  const violations = implementationRoots
    .flatMap((rootPath) => collectFiles(rootPath))
    .filter((filePath) => forbiddenImportPattern.test(fs.readFileSync(filePath, 'utf8')))
    .map((filePath) => path.relative(repoRoot, filePath));
  assert.deepEqual(
    violations,
    [],
    `SPARC-backed AutoTutor implementation must not import original AutoTutor runtime/UI internals: ${violations.join(', ')}`,
  );
}

function selectedAction(facts) {
  const action = facts.find((fact) => fact.factType === 'controller.selectedAction');
  assert.ok(action, 'generated move rules did not assert controller.selectedAction');
  assert.ok(action.slots, 'controller.selectedAction missing slots');
  return action.slots;
}

function runMoveRules(facts) {
  const result = evaluator.runSparcProductionRules({
    facts,
    rules: template.buildAutoTutorSparcMoveProductionRules(),
  });
  assert.equal(result.firings.length, 1, 'move selection should stop after one terminal rule');
  assert.equal(result.firings[0]?.terminatesProductionPhase, true);
  return selectedAction(result.facts);
}

function baseLearningTargetFacts(coverage, options = {}) {
  const wordCount = options.wordCount ?? 20;
  const turnCount = options.turnCount ?? 1;
  const facts = [{
    factType: 'learningTarget.source',
    slots: {
      clusterKC: 'lesson.kc.expectation-1',
    },
  }, {
    factType: 'learningTarget.selected',
    slots: {
      clusterKC: 'lesson.kc.expectation-1',
    },
  }, {
    factType: 'learningTarget.score',
    slots: {
      clusterKC: 'lesson.kc.expectation-1',
      coverage,
    },
  }, {
    factType: 'learningTarget.source',
    slots: {
      clusterKC: 'lesson.kc.expectation-2',
    },
  }, {
    factType: 'learningTarget.score',
    slots: {
      clusterKC: 'lesson.kc.expectation-2',
      coverage: 0.8 - coverage,
    },
  }, {
    factType: 'dialogue.learnerWordCount',
    slots: { cumulative: wordCount },
  }, {
    factType: 'session.turnState',
    slots: { turnCount },
  }, {
    factType: 'interface-event',
    slots: {
      eventType: 'response-submitted',
      input: 'three more words',
    },
  }];
  const withDerivedFacts = [
    ...facts,
    ...derivedFacts.deriveSparcControllerFacts(facts),
  ];
  return [
    ...withDerivedFacts,
    ...selectorSignals.deriveSparcActiveSelectorSignalFacts(withDerivedFacts),
    {
      factType: 'selector.goodAnswerMatch',
      slots: {
        value: options.goodAnswerMatch ?? 0.45,
        band: options.goodAnswerMatchBand ?? 'MEDIUM',
        metric: 'cosine_similarity_normalized_vectors',
      },
    },
    {
      factType: 'selector.badAnswerMatch',
      slots: {
        value: options.badAnswerMatch ?? 0.05,
        band: options.badAnswerMatchBand ?? 'NONE',
        metric: 'cosine_similarity_normalized_vectors',
      },
    },
  ];
}

function assertRuleTemplateShape(rules) {
  assert.equal(rules.length, 9, 'converter must emit the 9 active paper-derived instructional move rules');
  assert.equal(new Set(rules.map((rule) => rule.id)).size, 9, 'generated rule ids must be unique');
  assert.equal(rules.every((rule) => rule.module === 'dialogue.move-selection'), true);
  assert.equal(rules.every((rule) => rule.then.some((effect) => effect.type === 'terminate-production-phase')), true);
  assert.equal(rules.every((rule) => rule.then.some((effect) => (
    effect.type === 'assert-fact'
    && effect.fact.factType === 'controller.selectedAction'
  ))), true);
  assert.deepEqual(rules.map((rule) => rule.id).sort(), [
    'dialogue.move.paper-rule-01-pump',
    'dialogue.move.paper-rule-02-pump',
    'dialogue.move.paper-rule-03-positive-pump',
    'dialogue.move.paper-rule-04-splice',
    'dialogue.move.paper-rule-05-prompt',
    'dialogue.move.paper-rule-06-hint',
    'dialogue.move.paper-rule-07-hint',
    'dialogue.move.paper-rule-08-summary',
    'dialogue.move.paper-rule-09-elaborate',
  ]);

  const legacyRules = template.buildAutoTutorSparcLegacyFeedbackMoveProductionRules();
  assert.equal(legacyRules.length, 6, 'feedback-labeled paper rules must remain available as legacy disabled definitions');
  assert.deepEqual(legacyRules.map((rule) => rule.id).sort(), [
    'dialogue.move.paper-rule-10-positive-feedback',
    'dialogue.move.paper-rule-11-negative-feedback',
    'dialogue.move.paper-rule-12-positive-neutral-feedback',
    'dialogue.move.paper-rule-13-negative-neutral-feedback',
    'dialogue.move.paper-rule-14-negative-neutral-feedback',
    'dialogue.move.paper-rule-15-neutral-feedback',
  ]);
}

function assertGeneratedRulesCompile() {
  evaluator.compileSparcProductionRulePlan(template.buildAutoTutorSparcMoveProductionRules());
}

function assertGeneratedRulesSelectMoves() {
  const summary = runMoveRules(baseLearningTargetFacts(0.72, { turnCount: 8 }));
  assert.equal(summary.action, 'summary');
  assert.equal(summary.sourceRuleId, 'paper-rule-08-summary');
  assert.equal(summary.templateVersion, template.AUTOTUTOR_SPARC_MOVE_RULE_TEMPLATE_VERSION);

  const hint = runMoveRules(baseLearningTargetFacts(0.2, {
    goodAnswerMatch: 0.45,
    goodAnswerMatchBand: 'MEDIUM',
  }));
  assert.equal(hint.action, 'hint');
  assert.equal(hint.sourceRuleId, 'paper-rule-06-hint');

  const splice = runMoveRules([
    ...baseLearningTargetFacts(0.2, {
      badAnswerMatch: 0.75,
      badAnswerMatchBand: 'HIGH',
    }),
    {
      factType: 'diagnostic.misconceptionSelected',
      slots: {
        id: 'misconception-1',
      },
    },
    {
      factType: 'diagnostic.misconceptionScore',
      slots: {
        id: 'misconception-1',
        confidence: 0.75,
        repaired: false,
      },
    },
  ]);
  assert.equal(splice.action, 'splice');
  assert.equal(splice.sourceRuleId, 'paper-rule-04-splice');
}

function assertProductionRuleContractRegressions() {
  const createRangeRule = (range) => ({
    id: 'dialogue.range-boundary',
    when: [{
      factType: 'learningTarget.score',
      slots: {
        coverage: {
          type: 'range',
          ...range,
        },
      },
    }],
    then: [{
      type: 'assert-fact',
      fact: {
        factType: 'dialogue.rangeMatched',
      },
    }],
  });
  const firingCount = (coverage, range) => evaluator.evaluateSparcProductionRules({
    facts: [{
      factType: 'learningTarget.score',
      slots: { coverage },
    }],
    rules: [createRangeRule(range)],
  }).length;
  assert.equal(firingCount(0.6, { min: 0.6, max: 0.8 }), 1);
  assert.equal(firingCount(0.8, { min: 0.6, max: 0.8 }), 1);
  assert.equal(firingCount(0.6, { min: 0.6, minInclusive: false, max: 0.8 }), 0);
  assert.equal(firingCount(0.8, { min: 0.6, max: 0.8, maxInclusive: false }), 0);
  assert.throws(
    () => evaluator.evaluateSparcProductionRules({
      facts: [{ factType: 'learningTarget.score', slots: { coverage: 'medium' } }],
      rules: [createRangeRule({ min: 0.33 })],
    }),
    /range pattern requires a numeric fact-slot value/,
  );

  const nestedAnyNotRule = {
    id: 'dialogue.safe-nested-any-not',
    when: [{
      type: 'any',
      conditions: [{
        factType: 'learnerResponse.answerQuality',
        slots: {
          value: { type: 'literal', value: 'high' },
        },
      }, {
        type: 'not',
        pattern: {
          factType: 'diagnostic.misconceptionSelected',
        },
      }],
    }],
    then: [{
      type: 'assert-fact',
      fact: {
        factType: 'dialogue.safeNestedMatch',
      },
    }],
  };
  evaluator.compileSparcProductionRulePlan([nestedAnyNotRule]);
  assert.equal(evaluator.evaluateSparcProductionRules({
    facts: [{ factType: 'learnerResponse.answerQuality', slots: { value: 'low' } }],
    rules: [nestedAnyNotRule],
  }).length, 1);

  assert.throws(
    () => evaluator.compileSparcProductionRulePlan([{
      id: 'dialogue.unsafe-nested-any-not',
      when: [{
        type: 'any',
        conditions: [{
          factType: 'learningTarget.score',
          slots: {
            clusterKC: { type: 'bind', variable: 'targetClusterKC' },
          },
        }, {
          type: 'not',
          pattern: {
            factType: 'diagnostic.misconceptionScore',
            slots: {
              id: { type: 'bind', variable: 'misconceptionId' },
            },
          },
        }],
      }, {
        factType: 'learningTarget.metadata',
        slots: {
          clusterKC: { type: 'bound', variable: 'targetClusterKC' },
        },
      }],
      then: [],
    }]),
    /any condition branch-local bindings are referenced outside the any condition: targetClusterKC/,
  );
}

function assertTargetSelectionMatchesOriginalAutoTutorPlanner() {
  const script = {
    expectations: [{
      id: 'E1',
      proposition: 'First expectation.',
      assertion: 'First expectation.',
    }, {
      id: 'E2',
      proposition: 'Second expectation.',
      assertion: 'Second expectation.',
    }, {
      id: 'E3',
      proposition: 'Third expectation.',
      assertion: 'Third expectation.',
    }],
    expectationRelationships: {
      E1: { E2: 0.9, E3: 0.4 },
      E2: { E1: 0.9, E3: 0.6 },
      E3: { E1: 0.4, E2: 0.6 },
    },
    dialogPolicy: {
      requiredExpectations: ['E1', 'E2', 'E3'],
    },
    summary: 'Summary.',
  };
  const sourceToClusterKC = {
    E1: 'autotutor.fixture.kc.e1',
    E2: 'autotutor.fixture.kc.e2',
    E3: 'autotutor.fixture.kc.e3',
  };
  const scores = {
    E1: { current: true, coverage: 0.2, frontier: 0, coherence: 0, centrality: 0, priority: 0 },
    E2: { current: true, coverage: 0.1, frontier: 0, coherence: 0, centrality: 0, priority: 0 },
    E3: { current: true, coverage: 0.7, frontier: 0, coherence: 0, centrality: 0, priority: 0 },
  };
  const originalPriorities = autoTutorPlanner.recomputeExpectationPriorities(
    script,
    scores,
    undefined,
    'E1',
  );
  const originalTarget = autoTutorPlanner.selectAutoTutorTarget({
    script,
    plannerState: {
      focusTurnCount: 7,
      moveCycleIndex: 0,
      focusedExpectationId: 'E1',
      expectationScores: originalPriorities,
      misconceptionScores: {},
    },
    learnerQuestion: {
      current: false,
      answerableFromAuthoredContent: false,
    },
    learnerContribution: {
      type: 'assertion',
      confidence: 1,
    },
    answerQuality: 'partial',
  });

  const sparcFacts = [
    { factType: 'controller.targetSelectionPolicy', slots: { coverageThreshold: 0.8 } },
    ...script.expectations.map((expectation) => ({
      factType: 'learningTarget.source',
      slots: {
        clusterKC: sourceToClusterKC[expectation.id],
        sourceId: expectation.id,
      },
    })),
    ...Object.entries(scores).map(([sourceId, score]) => ({
      factType: 'learningTarget.score',
      slots: {
        clusterKC: sourceToClusterKC[sourceId],
        coverage: score.coverage,
      },
    })),
    ...Object.entries(originalPriorities).map(([sourceId, score]) => ({
      factType: 'kcGraph.node',
      slots: {
        clusterKC: sourceToClusterKC[sourceId],
        centrality: score.centrality,
      },
    })),
    ...Object.entries(script.expectationRelationships).flatMap(([sourceId, targets]) => (
      Object.entries(targets).map(([targetId, strength]) => ({
        factType: 'kcGraph.relationship',
        slots: {
          sourceClusterKC: sourceToClusterKC[sourceId],
          targetClusterKC: sourceToClusterKC[targetId],
          strength,
        },
      }))
    )),
  ];
  const sparcSelection = targetSelection.selectSparcLearningTargetFromFacts(sparcFacts, {
    anchorClusterKC: sourceToClusterKC.E1,
    excludeClusterKC: sourceToClusterKC.E1,
  });
  assert.deepEqual(originalTarget, { type: 'expectation', id: 'E2' });
  assert.equal(sparcSelection.selectedClusterKC, sourceToClusterKC[originalTarget.id]);
  for (const [sourceId, originalScore] of Object.entries(originalPriorities)) {
    const candidate = sparcSelection.candidates.find((entry) => entry.clusterKC === sourceToClusterKC[sourceId]);
    assert.ok(candidate, `missing SPARC target candidate for ${sourceId}`);
    const expectedFrontier = ((0.8 - originalScore.coverage) / 0.8) * originalScore.coherence;
    const expectedPriority = 0.5 * expectedFrontier + 0.3 * originalScore.coherence + 0.2 * originalScore.centrality;
    assert.equal(candidate.frontierScore, expectedFrontier);
    assert.equal(candidate.coherenceToAnchor, originalScore.coherence);
    assert.equal(candidate.centralityScore, originalScore.centrality);
    assert.equal(candidate.priorityScore, expectedPriority);
  }
}

function assertMoveSelectionCounterfactualAudit() {
  const facts = [
    {
      factType: 'learningTarget.selected',
      slots: { clusterKC: 'kc-a' },
    },
    {
      factType: 'dialogue.moveContent',
      slots: {
        targetType: 'learningTarget',
        clusterKC: 'kc-a',
        action: 'hint',
        text: 'Use a hint.',
      },
    },
    {
      factType: 'dialogue.moveContent',
      slots: {
        targetType: 'learningTarget',
        clusterKC: 'kc-a',
        action: 'prompt',
        text: 'Use a prompt.',
      },
    },
  ];
  const rules = [{
    id: 'dialogue.move.hint',
    salience: 90,
    when: [{
      factType: 'learningTarget.selected',
      slots: {
        clusterKC: { type: 'bind', variable: 'clusterKC' },
      },
    }],
    then: [{
      type: 'assert-fact',
      fact: {
        factType: 'controller.selectedAction',
        slots: {
          targetType: { type: 'literal', value: 'learningTarget' },
          clusterKC: { type: 'variable', name: 'clusterKC' },
          action: { type: 'literal', value: 'hint' },
        },
      },
    }, {
      type: 'terminate-production-phase',
      reason: 'move-selected',
    }],
  }, {
    id: 'dialogue.move.prompt',
    salience: 80,
    when: [{
      factType: 'learningTarget.selected',
      slots: {
        clusterKC: { type: 'bind', variable: 'clusterKC' },
      },
    }],
    then: [{
      type: 'assert-fact',
      fact: {
        factType: 'controller.selectedAction',
        slots: {
          targetType: { type: 'literal', value: 'learningTarget' },
          clusterKC: { type: 'variable', name: 'clusterKC' },
          action: { type: 'literal', value: 'prompt' },
        },
      },
    }, {
      type: 'terminate-production-phase',
      reason: 'move-selected',
    }],
  }];
  const baseline = moveSelectionAudit.auditSparcMoveSelection({ facts, rules });
  assert.deepEqual(baseline.candidates.map((candidate) => candidate.ruleId), [
    'dialogue.move.hint',
    'dialogue.move.prompt',
  ]);
  assert.equal(baseline.selected.ruleId, 'dialogue.move.hint');
  assert.equal(baseline.utteranceRequest.action, 'hint');

  const counterfactual = moveSelectionAudit.auditSparcMoveSelection({
    facts,
    rules,
    salienceOverrides: {
      'dialogue.move.prompt': 95,
    },
  });
  assert.deepEqual(counterfactual.candidates.map((candidate) => candidate.ruleId), [
    'dialogue.move.prompt',
    'dialogue.move.hint',
  ]);
  assert.equal(counterfactual.selected.ruleId, 'dialogue.move.prompt');
  assert.equal(counterfactual.utteranceRequest.action, 'prompt');
  assert.deepEqual(facts.map((fact) => fact.factType), [
    'learningTarget.selected',
    'dialogue.moveContent',
    'dialogue.moveContent',
  ]);
}

async function assertControllerCompletionPlanning() {
  const document = {
    id: 'completion-doc',
    schemaVersion: 1,
    workingMemoryFacts: [
      { factType: 'dialogue.thresholds', slots: { coverageThreshold: 0.8 } },
      { factType: 'dialogue.graduation', slots: { requiredTargetCount: 2 } },
      { factType: 'controller.targetSelectionPolicy', slots: { policy: 'kc-graph-priority', coverageThreshold: 0.8 } },
      { factType: 'learningTarget.source', slots: { clusterKC: 'kc-a' } },
      { factType: 'learningTarget.source', slots: { clusterKC: 'kc-b' } },
      { factType: 'learningTarget.source', slots: { clusterKC: 'kc-c' } },
      { factType: 'learningTarget.score', slots: { clusterKC: 'kc-a', coverage: 0.91 } },
      { factType: 'learningTarget.score', slots: { clusterKC: 'kc-b', coverage: 0.84 } },
      { factType: 'learningTarget.score', slots: { clusterKC: 'kc-c', coverage: 0.2 } },
      { factType: 'kcGraph.node', slots: { clusterKC: 'kc-a', centrality: 0.2 } },
      { factType: 'kcGraph.node', slots: { clusterKC: 'kc-b', centrality: 0.3 } },
      { factType: 'kcGraph.node', slots: { clusterKC: 'kc-c', centrality: 0.9 } },
      { factType: 'kcGraph.relationship', slots: { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-b', strength: 0.7 } },
      { factType: 'kcGraph.relationship', slots: { sourceClusterKC: 'kc-b', targetClusterKC: 'kc-a', strength: 0.7 } },
      { factType: 'kcGraph.relationship', slots: { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-c', strength: 0.9 } },
      { factType: 'kcGraph.relationship', slots: { sourceClusterKC: 'kc-b', targetClusterKC: 'kc-c', strength: 0.9 } },
      { factType: 'kcGraph.relationship', slots: { sourceClusterKC: 'kc-c', targetClusterKC: 'kc-a', strength: 0.9 } },
      { factType: 'kcGraph.relationship', slots: { sourceClusterKC: 'kc-c', targetClusterKC: 'kc-b', strength: 0.9 } },
      { factType: 'dialogue.moveContent', slots: { targetType: 'completion', action: 'summary', text: 'Completion summary.' } },
    ],
    productionRules: [{
      id: 'dialogue.move.completion-summary',
      module: 'dialogue.move-selection',
      salience: 20,
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
      }],
      then: [{
        type: 'assert-fact',
        persist: true,
        fact: {
          factType: 'controller.selectedAction',
          slots: {
            targetType: { type: 'literal', value: 'completion' },
            action: { type: 'literal', value: 'summary' },
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
      children: [],
    },
  };
  const event = {
    eventId: 'event-completion',
    type: 'response-submitted',
    source: {
      documentId: 'completion-doc',
      nodeId: 'learner-input',
    },
    time: 1700,
    payload: {
      input: 'final answer',
    },
  };
  const planningResult = turnPlanning.evaluateSparcControllerTurnPlanning({ document, event });
  assert.equal(planningResult.targetSelection.selectedClusterKC, 'kc-a');
  assert.equal(
    planningResult.derivedFacts.find((fact) => fact.factType === 'controller.completionState')?.slots?.completed,
    true,
  );
  assert.ok(planningResult.targetSelection.facts.some((fact) => (
    fact.factType === 'dialogue.completionSelected'
    && fact.slots.reason === 'required-coverage'
  )));
  assert.ok(planningResult.productionRuleEvaluation.execution.facts.some((fact) => (
    fact.factType === 'controller.selectedAction'
    && fact.slots.targetType === 'completion'
    && fact.slots.action === 'summary'
  )));
  const controllerTurn = await controllerDialogueTurn.evaluateSparcControllerDialogueTurn({
    document,
    event,
    generateTutorUtterance: (request) => {
      assert.equal(request.targetType, 'completion');
      assert.equal(request.targetId, 'completion');
      assert.equal(request.action, 'summary');
      assert.deepEqual(request.contentTexts, ['Completion summary.']);
      return 'Completion summary.';
    },
  });
  assert.equal(controllerTurn.utteranceRequest.targetType, 'completion');
  const renderedNodes = progressiveNodes.applySparcProgressiveNodeOperations([
    {
      id: 'dialogue-thread',
      nodeType: 'group',
      groupType: 'dialogue-thread',
      children: [],
    },
    {
      id: 'learner-response-input',
      nodeType: 'atomic',
      atomType: 'text-input',
      label: 'Response',
    },
    {
      id: 'learner-response-submit',
      nodeType: 'atomic',
      atomType: 'button',
      label: 'Submit',
      value: 'submit',
    },
  ], progressiveNodes.collectSparcProgressiveNodeOperations([controllerTurn.transition]));
  const inputNode = renderedNodes.find((node) => node.id === 'learner-response-input');
  const submitNode = renderedNodes.find((node) => node.id === 'learner-response-submit');
  assert.equal(inputNode?.readOnly, true);
  assert.equal(submitNode?.readOnly, true);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createGeneratedSparcEngineDeps(result) {
  return createSparcEngineDeps({
    tdf: result.generated.tdf,
    stimulus: result.generated.stimulus,
    unit: result.generated.tdf.tutor.unit[0],
    tdfId: result.generated.tdf.tutor.setspec.name,
    userId: 'user-fixture',
  });
}

function createSparcEngineDeps({ tdf, stimulus, unit, tdfId, userId }) {
  const clusters = stimulus.setspec.clusters;
  return {
    getSessionValue(key) {
      if (key === 'currentTdfUnit') return unit;
      if (key === 'currentTdfId') return tdfId;
      if (key === 'currentStimuliSetId') return tdfId;
      if (key === 'curStudentPerformance') return { totalTime: 0 };
      return undefined;
    },
    setSessionValue() {},
    getDeliverySettings: () => ({}),
    getStimCount: () => clusters.length,
    getStimCluster: (clusterIndex) => clusters[clusterIndex],
    getTestType: () => 'd',
    getHiddenItems: () => [],
    setNumVisibleCards() {},
    setQuestionIndex() {},
    getDisplayAnswerText: (answer) => String(answer || ''),
    updateCurStudentPerformance() {},
    updateCurStudedentPracticeTime() {},
    serverMethods: {
      getResponseKCMapForTdf: async () => ({}),
      getStimulusCrowdStatsForDeck: async () => [],
      getLearningHistoryForUnit: async () => [],
    },
    getCurrentUserId: () => userId,
    reconstructLearningStateFromHistory: () => ({}),
    extractDelimFields(source, fields) {
      fields.push(...String(source).split(/[,\s]+/).map((field) => field.trim()).filter(Boolean));
    },
    rangeVal(source) {
      const match = String(source).match(/^(\d+)-(\d+)$/);
      if (!match) return [];
      const start = Number(match[1]);
      const end = Number(match[2]);
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    },
    legacyFloat: (source) => Number(source),
    legacyInt: (source) => Number.parseInt(String(source), 10),
    currentUserHasRole: () => false,
    displayify: (value) => value,
    unitIsFinished() {},
    alertUser() {},
    log() {},
    findTdfById: () => ({
      ...tdf,
      rawStimuliFile: stimulus,
    }),
  };
}

const CANONICAL_AUTOTUTOR_PACKAGE_NAMES = [
  'AutoTutor Compound Interest',
  'AutoTutor Confidence Interval',
  'AutoTutor Correlation Causation',
  'AutoTutor Natural Selection',
  'AutoTutor Nonviolent Communication',
  'AutoTutor Reinforcement Punishment',
  'AutoTutor Special Relativity',
  'AutoTutor Statistical Power',
  'AutoTutor Stock Shorting',
  'AutoTutor Working Memory Long Term Memory',
];

function packageJsonFiles(packageDir, suffix) {
  return fs.readdirSync(packageDir)
    .filter((entry) => entry.endsWith(suffix))
    .map((entry) => path.join(packageDir, entry));
}

function assertConvertedAutoTutorPackage(packageDir, packageName) {
  const tdfFiles = packageJsonFiles(packageDir, '_TDF.json');
  const stimFiles = packageJsonFiles(packageDir, '_stims.json');
  assert.equal(tdfFiles.length, 1, `${packageName} should have one converted TDF JSON`);
  assert.equal(stimFiles.length, 1, `${packageName} should have one converted stimulus JSON`);
  const tdf = JSON.parse(fs.readFileSync(tdfFiles[0], 'utf8'));
  const stimulus = JSON.parse(fs.readFileSync(stimFiles[0], 'utf8'));
  const units = Array.isArray(tdf.tutor?.unit) ? tdf.tutor.unit : [];
  assert.equal(units.filter((unit) => unit?.autotutorsession).length, 0, `${packageName} should not retain autotutorsession runtime units after conversion`);
  const sparcUnits = units.filter((unit) => unit?.sparcsession);
  assert.equal(sparcUnits.length, 1, `${packageName} should contain one sparcsession unit after conversion`);
  const pageId = sparcUnits[0].sparcsession.pageId;
  assert.equal(typeof pageId, 'string', `${packageName} converted sparcsession unit should declare pageId`);
  const pages = Array.isArray(stimulus.setspec?.sparcPages) ? stimulus.setspec.sparcPages : [];
  const page = pages.find((candidate) => candidate.pageId === pageId);
  assert.ok(page, `${packageName} converted stimulus should contain sparcPage ${pageId}`);
  const rules = page.display?.productionRules;
  assert.equal(Array.isArray(rules), true, `${packageName} converted SPARC display should contain productionRules`);
  const ruleIds = rules.map((rule) => String(rule.id || '').trim()).filter(Boolean);
  for (const expectedRuleId of [
    'dialogue.move.paper-rule-01-pump',
    'dialogue.move.paper-rule-02-pump',
    'dialogue.move.paper-rule-03-positive-pump',
    'dialogue.move.paper-rule-04-splice',
    'dialogue.move.paper-rule-05-prompt',
    'dialogue.move.paper-rule-06-hint',
    'dialogue.move.paper-rule-07-hint',
    'dialogue.move.paper-rule-08-summary',
    'dialogue.move.paper-rule-09-elaborate',
    'dialogue.move.generated-completion-summary',
  ]) {
    assert.equal(ruleIds.includes(expectedRuleId), true, `${packageName} missing materialized production rule ${expectedRuleId}`);
  }
}

async function assertExistingCanonicalSparcPackageLoad() {
  const packageDir = path.join('C:', 'dev', 'mofacts_config', 'SPARC Fractions Addition');
  const tdfPath = path.join(packageDir, 'SPARC Fractions Addition_TDF.json');
  const stimulusPath = path.join(packageDir, 'SPARC_Fractions_Addition_stims.json');
  assert.equal(fs.existsSync(tdfPath), true, `canonical SPARC smoke TDF is missing: ${tdfPath}`);
  assert.equal(fs.existsSync(stimulusPath), true, `canonical SPARC smoke stimulus file is missing: ${stimulusPath}`);
  const tdf = JSON.parse(fs.readFileSync(tdfPath, 'utf8'));
  const stimulus = JSON.parse(fs.readFileSync(stimulusPath, 'utf8'));
  const unit = tdf.tutor.unit.find((candidate) => candidate?.sparcsession);
  assert.ok(unit, 'canonical SPARC smoke package must include a sparcsession unit');
  const configuredPageId = unit.sparcsession.pageId;
  assert.equal(typeof configuredPageId, 'string', 'canonical SPARC smoke sparcsession must declare pageId');
  const matchingPages = stimulus.setspec.sparcPages.filter((page) => page.pageId === configuredPageId);
  assert.equal(matchingPages.length, 1, 'canonical SPARC smoke pageId must resolve to one setspec.sparcPages entry');
  assert.ok(matchingPages[0].display, 'canonical SPARC smoke page must provide display');

  const tdfId = tdf.tutor.setspec.name || tdf.tutor.setspec.lessonname || 'SPARC Fractions Addition';
  const engine = await sparcSessionUnitEngine.createSparcSessionUnitEngine(
    createSparcEngineDeps({
      tdf,
      stimulus,
      unit,
      tdfId,
      userId: 'canonical-sparc-smoke-user',
    }),
  );
  const preparedState = await engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]);
  assert.equal(preparedState.currentDisplay.type, 'sparc');
  assert.equal(preparedState.currentDisplay.pageId, configuredPageId);
  assert.equal(preparedState.currentDisplay.documentId, matchingPages[0].display.documentId);
  assert.equal(preparedState.currentDisplay.nodes.length > 0, true);
  assert.equal(preparedState.currentDisplay.clusterTargets.length, stimulus.setspec.clusters.length);
  assert.deepEqual(
    preparedState.currentDisplay.clusterTargets.map((target) => target.clusterKC),
    stimulus.setspec.clusters.map((cluster) => cluster.clusterKC),
  );
}

async function assertCanonicalAutoTutorConfigInventory() {
  const configDir = path.join('C:', 'dev', 'mofacts_config');
  assert.equal(fs.existsSync(configDir), true, `canonical config repo is missing: ${configDir}`);
  const report = await converter.buildConversionReport(configDir);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.configDir, path.resolve(configDir));
  assert.equal(report.failureCount, 0);
  assert.deepEqual(report.warnings, []);
  if (report.convertedCount === 10) {
    assert.equal(report.packageCount, 10);
    assert.deepEqual(report.converted.map((item) => item.sourcePackageName).sort(), CANONICAL_AUTOTUTOR_PACKAGE_NAMES);
    assert.equal(report.converted.every((item) => item.relationshipValidation.relationshipGenerationRequired === true), true);
    assert.equal(report.skipped.every((item) => !/^AutoTutor /.test(item.sourcePackageName)), true);
    return;
  }

  assert.equal(report.packageCount, 0, 'canonical AutoTutor content should either be fully pre-conversion or fully converted');
  assert.equal(report.convertedCount, 0);
  for (const packageName of CANONICAL_AUTOTUTOR_PACKAGE_NAMES) {
    const packageDir = path.join(configDir, packageName);
    assert.equal(fs.existsSync(packageDir), true, `canonical converted package is missing: ${packageDir}`);
    assertConvertedAutoTutorPackage(packageDir, packageName);
  }
}

async function withFixtureConfig(options, callback) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mofacts-autotutor-sparc-'));
  try {
    const packageDir = path.join(tempRoot, 'AutoTutor Fixture');
    writeJson(path.join(packageDir, 'AutoTutor_Fixture_TDF.json'), {
      tutor: {
        setspec: {
          lessonname: 'AutoTutor Fixture',
          name: 'autotutor_fixture',
          stimulusfile: 'AutoTutor_Fixture_stims.json',
          userselect: 'true',
          tags: ['autotutor'],
        },
        unit: [{
          unitname: 'Fixture AutoTutor',
          autotutorsession: {
            cluster: 0,
            maxTurns: 12,
            graduation: {
              requiredExpectationCount: 2,
              maxActiveMisconceptions: 0,
            },
          },
        }],
      },
    });
    writeJson(path.join(packageDir, 'AutoTutor_Fixture_stims.json'), {
      setspec: {
        clusters: [{
          stims: [{
            display: {
              text: 'Tell me what you know about the fixture topic.',
            },
            autoTutor: {
              id: 'fixture_script',
              topic: 'Fixture Topic',
              learningGoal: 'Explain the fixture topic.',
              idealAnswer: 'The fixture has two linked ideas.',
              expectations: [{
                id: 'E1',
                label: 'first idea',
                proposition: 'The first fixture idea matters.',
                assertion: 'The first fixture idea matters.',
                hints: ['Think about the first idea.'],
                prompts: [{ stem: 'What is the first idea?', target: 'first idea' }],
              }, {
                id: 'E2',
                label: 'second idea',
                proposition: 'The second fixture idea relates to the first.',
                assertion: 'The second fixture idea relates to the first.',
                hints: ['Think about the second idea.'],
                prompts: [{ stem: 'What is the second idea?', target: 'second idea' }],
              }],
              ...(options.withRelationships === false
                ? {}
                : {
                    expectationRelationships: {
                      E1: { E2: 0.75 },
                      E2: { E1: 0.75 },
                    },
                  }),
              misconceptions: [{
                id: 'M1',
                label: 'fixture misconception',
                description: 'A wrong fixture idea.',
                repair: 'Repair the fixture misconception.',
              }],
              dialogPolicy: {
                allowAnyOrder: true,
                requiredExpectations: ['E1', 'E2'],
                optionalExpectations: [],
              },
              summary: 'The fixture has two linked ideas.',
            },
          }],
        }],
      },
    });
    const plainPackageDir = path.join(tempRoot, 'Plain SPARC Fixture');
    writeJson(path.join(plainPackageDir, 'Plain_SPARC_Fixture_TDF.json'), {
      tutor: {
        setspec: {
          lessonname: 'Plain SPARC Fixture',
          name: 'plain_sparc_fixture',
          stimulusfile: 'Plain_SPARC_Fixture_stims.json',
        },
        unit: [{
          unitname: 'Plain SPARC Unit',
          sparcsession: {
            pageId: 'plain-page',
          },
        }],
      },
    });
    await callback(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function assertConverterFixtureOutput() {
  await withFixtureConfig({}, async (configDir) => {
    const result = await converter.translatePackage(configDir, 'AutoTutor Fixture');
    assert.equal(result.generated.tdf.tutor.unit[0].sparcsession.pageId, 'sparc-session-fixture');
    assert.equal(result.generated.tdf.tutor.unit[0].autotutorsession, undefined);
    assert.equal(result.sourcePackageName, 'AutoTutor Fixture');
    assert.equal(path.basename(result.sourceTdfPath), 'AutoTutor_Fixture_TDF.json');
    assert.equal(path.basename(result.sourceStimulusPath), 'AutoTutor_Fixture_stims.json');
    assert.equal(result.generated.stimulus.setspec.sourceAutoTutorConversion.sourcePackageName, 'AutoTutor Fixture');
    assert.equal(result.generated.stimulus.setspec.sourceAutoTutorConversion.sourceScriptId, 'fixture_script');
    assert.equal(result.relationshipValidation.valid, true);
    assert.equal(result.relationshipValidation.sourceShape, 'matrix');
    assert.equal(result.relationshipValidation.resolvedRelationshipCount, 2);
    assert.deepEqual(result.expectationClusterMappings.map((entry) => ({
      sourceExpectationId: entry.sourceExpectationId,
      clusterIndex: entry.clusterIndex,
      clusterKC: entry.clusterKC,
    })), [{
      sourceExpectationId: 'E1',
      clusterIndex: 0,
      clusterKC: 'autotutor.fixture-script.kc.e1',
    }, {
      sourceExpectationId: 'E2',
      clusterIndex: 1,
      clusterKC: 'autotutor.fixture-script.kc.e2',
    }]);
    const stimulus = result.generated.stimulus;
    assert.equal(stimulus.setspec.clusters.length, 2);
    assert.equal(stimulus.setspec.clusters.some((cluster) => cluster.stims.some((stim) => stim.autoTutor)), false);
    assert.deepEqual(stimulus.setspec.clusters.map((cluster) => cluster.stims[0].sourceAutoTutor.expectationId), ['E1', 'E2']);
    assert.deepEqual(stimulus.setspec.clusters.map((cluster) => ({
      clusterKC: cluster.clusterKC,
      stimulusKC: cluster.stims[0].stimulusKC,
    })), [{
      clusterKC: 'autotutor.fixture-script.kc.e1',
      stimulusKC: 'autotutor.fixture-script.kc.e1.stim',
    }, {
      clusterKC: 'autotutor.fixture-script.kc.e2',
      stimulusKC: 'autotutor.fixture-script.kc.e2.stim',
    }]);
    assert.equal(stimulus.setspec.sparcPages.length, 1);
    assert.equal(result.generated.tdf.tutor.unit[0].sparcsession.pageId, stimulus.setspec.sparcPages[0].pageId);
    assert.equal(stimulus.setspec.sourceAutoTutorConversion.relationshipValidation.valid, true);
    const display = stimulus.setspec.sparcPages[0].display;
    assert.equal(display.productionRules.filter((rule) => rule.id.startsWith('dialogue.move.paper-rule-')).length, 9);
    assert.ok(display.productionRules.some((rule) => (
      rule.id === 'dialogue.move.generated-completion-summary'
      && rule.then.some((effect) => effect.type === 'terminate-production-phase')
    )));
    assert.deepEqual(display.clusterTargets.map((target) => target.clusterIndex), [0, 1]);
    assert.deepEqual(display.clusterTargets.map((target) => target.clusterKC), [
      'autotutor.fixture-script.kc.e1',
      'autotutor.fixture-script.kc.e2',
    ]);
    assert.equal(display.clusterTargets.some((target) => target.sourceExpectationId), false);
    assert.equal(JSON.stringify(display.productionRules).includes('E1'), false);
    assert.equal(JSON.stringify(display.productionRules).includes('E2'), false);
    assert.equal(display.nodes[0].groupType, 'dialogue-thread');
    assert.equal(display.nodes[0].children[0].nodeType, 'atomic');
    assert.equal(display.nodes[0].children[0].atomType, 'dialogue-utterance');
    assert.equal(display.nodes[0].children[0].speaker, 'tutor');
    assert.equal(display.nodes[0].children[0].value, 'Tell me what you know about the fixture topic.');
    assert.deepEqual(display.nodes[0].children[0].clusterIndices, [0, 1]);
    assert.equal(display.nodes[1].atomType, 'text-input');
    assert.equal(display.nodes[2].atomType, 'button');
    assert.equal(display.nodes[2].label, 'Submit');
    assert.ok(display.workingMemoryFacts.some((fact) => (
      fact.factType === 'kcGraph.relationship'
      && fact.slots.sourceClusterKC === 'autotutor.fixture-script.kc.e1'
      && fact.slots.targetClusterKC === 'autotutor.fixture-script.kc.e2'
      && fact.slots.strength === 0.75
    )));
    assert.deepEqual(display.workingMemoryFacts.filter((fact) => fact.factType === 'kcGraph.node').map((fact) => fact.slots.clusterKC), [
      'autotutor.fixture-script.kc.e1',
      'autotutor.fixture-script.kc.e2',
    ]);
    assert.deepEqual(display.workingMemoryFacts.filter((fact) => fact.factType === 'kcGraph.relationship').map((fact) => (
      `${fact.slots.sourceClusterKC}->${fact.slots.targetClusterKC}`
    )).sort(), [
      'autotutor.fixture-script.kc.e1->autotutor.fixture-script.kc.e2',
      'autotutor.fixture-script.kc.e2->autotutor.fixture-script.kc.e1',
    ]);
    assert.ok(display.workingMemoryFacts.some((fact) => (
      fact.factType === 'dialogue.moveContent'
      && fact.slots.action === 'splice'
      && fact.slots.id === 'M1'
    )));
    assert.ok(display.workingMemoryFacts.some((fact) => (
      fact.factType === 'dialogue.moveContent'
      && fact.slots.action === 'hint'
      && fact.slots.clusterKC === 'autotutor.fixture-script.kc.e1'
      && fact.slots.sourceId === undefined
    )));
    assert.ok(display.workingMemoryFacts.some((fact) => (
      fact.factType === 'dialogue.moveContent'
      && fact.slots.targetType === 'completion'
      && fact.slots.action === 'summary'
      && fact.slots.text === 'The fixture has two linked ideas.'
    )));
    const completionRequest = utteranceRequest.createSparcUtteranceRequestFromFacts([
      ...display.workingMemoryFacts,
      {
        factType: 'controller.selectedAction',
        slots: {
          targetType: 'completion',
          action: 'summary',
        },
      },
    ]);
    assert.equal(completionRequest.targetType, 'completion');
    assert.equal(completionRequest.targetId, 'completion');
    assert.deepEqual(completionRequest.contentTexts, ['The fixture has two linked ideas.']);
    const generatedCompletionPlanning = turnPlanning.evaluateSparcControllerTurnPlanning({
      document: {
        id: display.documentId,
        schemaVersion: 1,
        workingMemoryFacts: display.workingMemoryFacts,
        productionRules: display.productionRules,
        root: {
          id: 'root',
          kind: 'document',
          children: [],
        },
      },
      event: {
        eventId: 'event-generated-completion-planning',
        type: 'response-submitted',
        source: {
          documentId: display.documentId,
          nodeId: 'learner-response-input',
        },
        time: 1250,
        payload: {
          input: 'ready to finish',
        },
      },
      extraFacts: [{
        factType: 'learningTarget.score',
        slots: {
          clusterKC: 'autotutor.fixture-script.kc.e1',
          coverage: 0.9,
        },
      }, {
        factType: 'learningTarget.score',
        slots: {
          clusterKC: 'autotutor.fixture-script.kc.e2',
          coverage: 0.9,
        },
      }],
    });
    const generatedCompletionAction = generatedCompletionPlanning.productionRuleEvaluation.execution.facts.find((fact) => (
      fact.factType === 'controller.selectedAction'
    ));
    assert.equal(generatedCompletionAction?.slots?.targetType, 'completion');
    assert.equal(generatedCompletionAction?.slots?.action, 'summary');
    assert.equal(generatedCompletionAction?.slots?.sourceRuleId, 'generated-completion-summary');
    assert.equal(generatedCompletionPlanning.productionRuleEvaluation.execution.firings[0]?.ruleId, 'dialogue.move.generated-completion-summary');
    const engine = await sparcSessionUnitEngine.createSparcSessionUnitEngine(
      createGeneratedSparcEngineDeps(result),
    );
    const preparedState = await engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]);
    assert.equal(preparedState.currentDisplay.pageId, result.generated.tdf.tutor.unit[0].sparcsession.pageId);
    assert.equal(preparedState.currentDisplay.documentId, display.documentId);
    assert.equal(preparedState.currentDisplay.clusterTargets.length, 2);
    assert.deepEqual(
      preparedState.currentDisplay.clusterTargets.map((target) => target.clusterKC),
      [
        'autotutor.fixture-script.kc.e1',
        'autotutor.fixture-script.kc.e2',
      ],
    );
    assert.equal(result.generated.tdf.tutor.unit[0].autotutorsession, undefined);
    const targetResult = targetSelection.selectSparcLearningTargetFromFacts([
      ...display.workingMemoryFacts,
      {
        factType: 'learningTarget.score',
        slots: {
          clusterKC: 'autotutor.fixture-script.kc.e1',
          coverage: 0.2,
        },
      },
      {
        factType: 'learningTarget.score',
        slots: {
          clusterKC: 'autotutor.fixture-script.kc.e2',
          coverage: 0.1,
        },
      },
    ], {
      anchorClusterKC: 'autotutor.fixture-script.kc.e1',
      excludeClusterKC: 'autotutor.fixture-script.kc.e1',
    });
    assert.equal(targetResult.selectedClusterKC, 'autotutor.fixture-script.kc.e2');
    assert.ok(targetResult.facts.some((fact) => (
      fact.factType === 'learningTarget.selected'
      && fact.slots.clusterKC === 'autotutor.fixture-script.kc.e2'
      && fact.slots.focusActive === true
      && fact.slots.focusTurnCount === 0
      && fact.slots.moveCycleIndex === 0
    )));
    const continuedFocusResult = targetSelection.selectSparcLearningTargetFromFacts([
      ...display.workingMemoryFacts,
      {
        factType: 'session.turnState',
        slots: { turnCount: 3 },
      },
      {
        factType: 'learningTarget.selected',
        slots: {
          clusterKC: 'autotutor.fixture-script.kc.e2',
          focusActive: true,
          focusTurnCount: 2,
          firstFocusTurn: 1,
          moveCycleIndex: 4,
        },
      },
      {
        factType: 'learningTarget.score',
        slots: {
          clusterKC: 'autotutor.fixture-script.kc.e1',
          coverage: 0.82,
        },
      },
      {
        factType: 'learningTarget.score',
        slots: {
          clusterKC: 'autotutor.fixture-script.kc.e2',
          coverage: 0.1,
        },
      },
    ], {
      anchorClusterKC: 'autotutor.fixture-script.kc.e1',
    });
    assert.ok(continuedFocusResult.facts.some((fact) => (
      fact.factType === 'learningTarget.selected'
      && fact.slots.clusterKC === 'autotutor.fixture-script.kc.e2'
      && fact.slots.focusTurnCount === 3
      && fact.slots.firstFocusTurn === 1
      && fact.slots.moveCycleIndex === 5
    )));
    const planningResult = turnPlanning.evaluateSparcControllerTurnPlanning({
      document: {
        id: display.documentId,
        schemaVersion: 1,
        workingMemoryFacts: display.workingMemoryFacts,
        productionRules: display.productionRules,
        root: {
          id: 'root',
          kind: 'document',
          children: [],
        },
      },
      event: {
        eventId: 'event-converter-planning',
        type: 'response-submitted',
        source: {
          documentId: display.documentId,
          nodeId: 'learner-response-input',
        },
        time: 1200,
        payload: {
          input: 'three learner words',
        },
      },
      extraFacts: [{
        factType: 'learningTarget.score',
        slots: {
          clusterKC: 'autotutor.fixture-script.kc.e1',
          coverage: 0.2,
        },
      }, {
        factType: 'learningTarget.score',
        slots: {
          clusterKC: 'autotutor.fixture-script.kc.e2',
          coverage: 0.1,
        },
      }, {
        factType: 'selector.goodAnswerMatch',
        slots: {
          value: 0.25,
          band: 'LOW',
          metric: 'cosine_similarity_normalized_vectors',
        },
      }, {
        factType: 'selector.badAnswerMatch',
        slots: {
          value: 0.05,
          band: 'NONE',
          metric: 'cosine_similarity_normalized_vectors',
        },
      }],
      targetSelectionOptions: {
        anchorClusterKC: 'autotutor.fixture-script.kc.e1',
        excludeClusterKC: 'autotutor.fixture-script.kc.e1',
      },
    });
    assert.equal(planningResult.targetSelection.selectedClusterKC, 'autotutor.fixture-script.kc.e2');
    assert.ok(planningResult.targetSelection.facts.some((fact) => (
      fact.factType === 'learningTarget.selected'
      && fact.slots.clusterKC === 'autotutor.fixture-script.kc.e2'
      && fact.slots.focusActive === true
      && fact.slots.focusTurnCount === 0
    )));
    assert.equal(planningResult.productionRuleEvaluation.execution.firings.length, 1);
    const request = utteranceRequest.createSparcUtteranceRequestFromFacts(
      planningResult.productionRuleEvaluation.execution.facts,
    );
    assert.equal(request.targetType, 'learningTarget');
    assert.equal(request.targetId, 'autotutor.fixture-script.kc.e2');
    assert.equal(request.action, request.selectedAction.action);
    assert.equal(request.contentTexts.length > 0, true);
    const dialogueTransition = dialogueTurnNodes.createSparcDialogueTurnTransition({
      document: {
        id: display.documentId,
        schemaVersion: 1,
        root: {
          id: 'root',
          kind: 'document',
          children: [],
        },
      },
      event: {
        eventId: 'event-converter-planning',
        type: 'response-submitted',
        source: {
          documentId: display.documentId,
          nodeId: 'learner-response-input',
        },
        time: 1200,
        payload: {
          input: 'three learner words',
        },
      },
      learnerText: 'three learner words',
      utteranceRequest: request,
      tutorText: request.contentTexts[0],
    });
    const dialogueOperations = progressiveNodes.collectSparcProgressiveNodeOperations([dialogueTransition]);
    const renderedDialogueNodes = progressiveNodes.applySparcProgressiveNodeOperations(display.nodes, dialogueOperations);
    const progressiveDialogueNodes = renderedDialogueNodes.filter((node) => node.atomType === 'dialogue-utterance');
    assert.deepEqual(progressiveDialogueNodes.map((node) => node.speaker), ['learner', 'tutor']);
    assert.deepEqual(progressiveDialogueNodes.map((node) => node.placement.region), ['dialogue-flow', 'dialogue-flow']);
    assert.equal(progressiveDialogueNodes[1].action, request.action);
    assert.equal(progressiveDialogueNodes[1].targetId, request.targetId);
    const controllerTurn = await controllerDialogueTurn.evaluateSparcControllerDialogueTurn({
      document: {
        id: display.documentId,
        schemaVersion: 1,
        workingMemoryFacts: display.workingMemoryFacts,
        productionRules: display.productionRules,
        root: {
          id: 'root',
          kind: 'document',
          children: [],
        },
      },
      event: {
        eventId: 'event-converter-controller-turn',
        type: 'response-submitted',
        source: {
          documentId: display.documentId,
          nodeId: 'learner-response-input',
        },
        time: 1300,
        payload: {
          input: 'three learner words',
        },
      },
      learnerResponseScore: {
        learningTargetScores: [{
          clusterKC: 'autotutor.fixture-script.kc.e1',
          coverage: 0.2,
        }, {
          clusterKC: 'autotutor.fixture-script.kc.e2',
          coverage: 0.1,
        }],
        bagMatchScores: [{
          kind: 'goodAnswer',
          score: 0.25,
          band: 'LOW',
          bagText: 'The first fixture idea matters.\nThe second fixture idea relates to the first.',
          metric: 'cosine_similarity_normalized_vectors',
        }, {
          kind: 'badAnswer',
          score: 0.05,
          band: 'NONE',
          bagText: 'A wrong fixture idea.\nRepair the fixture misconception.',
          metric: 'cosine_similarity_normalized_vectors',
        }],
        answerQuality: 'partial',
      },
      targetSelectionOptions: {
        anchorClusterKC: 'autotutor.fixture-script.kc.e1',
        excludeClusterKC: 'autotutor.fixture-script.kc.e1',
      },
      generateTutorUtterance: (turnRequest) => turnRequest.contentTexts[0],
    });
    assert.equal(controllerTurn.utteranceRequest.targetId, 'autotutor.fixture-script.kc.e2');
    assert.equal(controllerTurn.transition.writes.some((write) => (
      write.value
      && typeof write.value === 'object'
      && write.value.factType === 'controller.selectedAction'
    )), true);
    const replayState = sparcStateReplay.applySparcStateTransition(
      sparcStateReplay.createEmptySparcReplayState(),
      controllerTurn.transition,
    );
    const missingActionTransition = {
      ...controllerTurn.transition,
      writes: controllerTurn.transition.writes.filter((write) => (
        !write.value
        || typeof write.value !== 'object'
        || write.value.factType !== 'controller.selectedAction'
      )),
    };
    const missingActionReplayState = sparcStateReplay.applySparcStateTransition(
      sparcStateReplay.createEmptySparcReplayState(),
      missingActionTransition,
    );
    await assert.rejects(
      () => controllerDialogueTurn.evaluateSparcControllerDialogueTurn({
        document: {
          id: display.documentId,
          schemaVersion: 1,
          workingMemoryFacts: display.workingMemoryFacts,
          productionRules: display.productionRules,
          root: {
            id: 'root',
            kind: 'document',
            children: [],
          },
        },
        replayState: missingActionReplayState,
        event: {
          eventId: 'event-converter-controller-turn-missing-replay',
          type: 'response-submitted',
          source: {
            documentId: display.documentId,
            nodeId: 'learner-response-input',
          },
          time: 1350,
          payload: {
            input: 'another learner answer',
          },
        },
        learnerResponseScore: {
          learningTargetScores: [{
            clusterKC: 'autotutor.fixture-script.kc.e2',
            coverage: 0.4,
          }],
          answerQuality: 'partial',
        },
        generateTutorUtterance: () => {
          throw new Error('utterance generator should not run with incomplete replay state');
        },
      }),
      /missing required controller\.selectedAction state/,
    );
    const missingTutorTransition = {
      ...controllerTurn.transition,
      writes: controllerTurn.transition.writes.filter((write) => (
        !write.value
        || typeof write.value !== 'object'
        || write.value.factType !== 'dialogue.utterance'
        || write.value.slots?.speaker !== 'tutor'
      )),
    };
    const missingTutorReplayState = sparcStateReplay.applySparcStateTransition(
      sparcStateReplay.createEmptySparcReplayState(),
      missingTutorTransition,
    );
    await assert.rejects(
      () => controllerDialogueTurn.evaluateSparcControllerDialogueTurn({
        document: {
          id: display.documentId,
          schemaVersion: 1,
          workingMemoryFacts: display.workingMemoryFacts,
          productionRules: display.productionRules,
          root: {
            id: 'root',
            kind: 'document',
            children: [],
          },
        },
        replayState: missingTutorReplayState,
        event: {
          eventId: 'event-converter-controller-turn-missing-tutor',
          type: 'response-submitted',
          source: {
            documentId: display.documentId,
            nodeId: 'learner-response-input',
          },
          time: 1360,
          payload: {
            input: 'another learner answer',
          },
        },
        learnerResponseScore: {
          learningTargetScores: [{
            clusterKC: 'autotutor.fixture-script.kc.e2',
            coverage: 0.4,
          }],
          answerQuality: 'partial',
        },
        generateTutorUtterance: () => {
          throw new Error('utterance generator should not run with incomplete replay state');
        },
      }),
      /missing generated tutor utterance state/,
    );
    let resumedUtteranceCalls = 0;
    const resumedTurn = await controllerDialogueTurn.evaluateSparcControllerDialogueTurn({
      document: {
        id: display.documentId,
        schemaVersion: 1,
        workingMemoryFacts: display.workingMemoryFacts,
        productionRules: display.productionRules,
        root: {
          id: 'root',
          kind: 'document',
          children: [],
        },
      },
      replayState,
      event: {
        eventId: 'event-converter-controller-turn-2',
        type: 'response-submitted',
        source: {
          documentId: display.documentId,
          nodeId: 'learner-response-input',
        },
        time: 1400,
        payload: {
          input: 'four more learner words',
        },
      },
      learnerResponseScore: {
        learningTargetScores: [{
          clusterKC: 'autotutor.fixture-script.kc.e2',
          coverage: 0.85,
        }],
        answerQuality: 'partial',
      },
      targetSelectionOptions: {
        anchorClusterKC: 'autotutor.fixture-script.kc.e2',
      },
      generateTutorUtterance: (turnRequest) => {
        resumedUtteranceCalls += 1;
        assert.equal(turnRequest.targetId, 'autotutor.fixture-script.kc.e1');
        return turnRequest.contentTexts[0];
      },
    });
    assert.equal(resumedUtteranceCalls, 1);
    assert.equal(resumedTurn.utteranceRequest.targetId, 'autotutor.fixture-script.kc.e1');
    assert.ok(resumedTurn.planning.targetSelection.facts.some((fact) => (
      fact.factType === 'learningTarget.selected'
      && fact.slots.clusterKC === 'autotutor.fixture-script.kc.e1'
      && fact.slots.focusActive === true
      && fact.slots.focusTurnCount === 0
      && fact.slots.moveCycleIndex === 1
    )));
  });
}

async function assertConverterDefersGraphGenerationToUpload() {
  await withFixtureConfig({ withRelationships: false }, async (configDir) => {
    const result = await converter.translatePackage(configDir, 'AutoTutor Fixture');
    assert.equal(result.relationshipValidation.sourceShape, 'generated-at-upload');
    assert.equal(result.relationshipValidation.generatedRelationships, false);
    assert.equal(result.relationshipValidation.relationshipGenerationRequired, true);
    assert.equal(result.relationshipValidation.resolvedRelationshipCount, 0);
    const display = result.generated.stimulus.setspec.sparcPages[0].display;
    const graphRelationships = display.workingMemoryFacts.filter((fact) => fact.factType === 'kcGraph.relationship');
    assert.equal(graphRelationships.length, 0);
    const sourceFacts = display.workingMemoryFacts.filter((fact) => fact.factType === 'learningTarget.source');
    assert.equal(sourceFacts.length, 2);
    assert.deepEqual(sourceFacts.map((fact) => fact.slots.clusterKC), [
      'autotutor.fixture-script.kc.e1',
      'autotutor.fixture-script.kc.e2',
    ]);

    const report = await converter.buildConversionReport(configDir);
    assert.equal(report.convertedCount, 1);
    assert.equal(report.converted[0].relationshipProvenance, null);
    assert.equal(report.converted[0].relationshipValidation.relationshipGenerationRequired, true);
  });
}

async function assertConversionReportFileOutput() {
  await withFixtureConfig({}, async (configDir) => {
    const reportFile = path.join(configDir, 'reports', 'autotutor-sparc-report.json');
    const report = await converter.buildConversionReport(configDir, {
      reportFile,
    });
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.reportFile, path.resolve(reportFile));
    assert.equal(report.packageCount, 1);
    assert.equal(report.convertedCount, 1);
    assert.equal(report.skippedCount, 1);
    assert.equal(report.warningCount, 0);
    assert.equal(report.failureCount, 0);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.converted[0].sourcePackageName, 'AutoTutor Fixture');
    assert.equal(report.converted[0].wroteFiles, false);
    assert.equal(report.converted[0].convertedTdfPath, report.converted[0].sourceTdfPath);
    assert.equal(report.converted[0].convertedStimulusPath, report.converted[0].sourceStimulusPath);
    assert.equal(fs.existsSync(report.converted[0].convertedTdfPath), true);
    assert.equal(fs.existsSync(report.converted[0].convertedStimulusPath), true);
    assert.deepEqual(report.converted[0].sourceProvenance, {
      sourcePackageName: 'AutoTutor Fixture',
      sourceTdfPath: report.converted[0].sourceTdfPath,
      sourceStimulusPath: report.converted[0].sourceStimulusPath,
      sourceScriptId: 'fixture_script',
    });
    assert.equal(path.basename(report.converted[0].sourceProvenance.sourceTdfPath), 'AutoTutor_Fixture_TDF.json');
    assert.equal(path.basename(report.converted[0].sourceProvenance.sourceStimulusPath), 'AutoTutor_Fixture_stims.json');
    assert.deepEqual(report.converted[0].warnings, []);
    assert.equal(report.converted[0].relationshipValidation.valid, true);
    assert.equal(report.converted[0].relationshipProvenance, null);
    assert.equal(report.converted[0].expectationClusterMappings.length, 2);
    assert.equal(report.skipped[0].sourcePackageName, 'Plain SPARC Fixture');
    assert.match(report.skipped[0].reason, /autotutorsession/i);
    const persisted = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    assert.equal(persisted.reportFile, path.resolve(reportFile));
    assert.deepEqual(persisted.converted.map((item) => item.sourcePackageName), ['AutoTutor Fixture']);
    assert.equal(persisted.converted[0].sourceProvenance.sourceScriptId, 'fixture_script');
    assert.deepEqual(persisted.warnings, []);
    assert.deepEqual(persisted.failures, []);
    await assert.rejects(
      () => converter.buildConversionReport(configDir, { reportFile }),
      /Conversion report already exists/,
    );
    const overwritten = await converter.buildConversionReport(configDir, {
      reportFile,
      overwriteReport: true,
    });
    assert.equal(overwritten.reportFile, path.resolve(reportFile));
  });

  await withFixtureConfig({ withRelationships: false }, async (configDir) => {
    const reportFile = path.join(configDir, 'reports', 'autotutor-sparc-upload-generation-report.json');
    const report = await converter.buildConversionReport(configDir, {
      reportFile,
    });
    assert.equal(report.convertedCount, 1);
    assert.equal(report.warningCount, 0);
    assert.equal(report.failureCount, 0);
    assert.equal(report.converted[0].relationshipValidation.relationshipGenerationRequired, true);
    const persisted = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    assert.equal(persisted.failureCount, 0);
    assert.equal(persisted.converted[0].relationshipValidation.relationshipGenerationRequired, true);
  });
}

async function assertConverterWriteModeOutput() {
  await withFixtureConfig({}, async (configDir) => {
    const report = await converter.buildConversionReport(configDir, {
      packageFilter: 'AutoTutor Fixture',
      write: true,
    });
    assert.equal(report.mode, 'write');
    assert.equal(report.convertedCount, 1);
    assert.equal(report.failureCount, 0);
    assert.equal(report.converted[0].wroteFiles, true);
    const convertedTdfPath = report.converted[0].convertedTdfPath;
    const convertedStimulusPath = report.converted[0].convertedStimulusPath;
    assert.equal(fs.existsSync(convertedTdfPath), true);
    assert.equal(fs.existsSync(convertedStimulusPath), true);
    assert.equal(convertedTdfPath, path.join(
      configDir,
      'AutoTutor Fixture',
      'AutoTutor_Fixture_TDF.json',
    ));
    assert.equal(convertedStimulusPath, path.join(
      configDir,
      'AutoTutor Fixture',
      'AutoTutor_Fixture_stims.json',
    ));
    const generatedTdf = JSON.parse(fs.readFileSync(convertedTdfPath, 'utf8'));
    const generatedStimulus = JSON.parse(fs.readFileSync(convertedStimulusPath, 'utf8'));
    const generatedUnit = generatedTdf.tutor.unit[0];
    assert.equal(generatedUnit.autotutorsession, undefined);
    assert.equal(generatedUnit.sparcsession.pageId, report.converted[0].generatedSparcPageId);
    assert.equal(
      generatedStimulus.setspec.sparcPages.filter((page) => page.pageId === generatedUnit.sparcsession.pageId).length,
      1,
    );
    assert.equal(generatedStimulus.setspec.sparcPages[0].display.documentId, report.converted[0].generatedSparcDocumentId);
    assert.equal(generatedStimulus.setspec.clusters.every((cluster) => (
      typeof cluster.clusterKC === 'string'
      && typeof cluster.stims?.[0]?.stimulusKC === 'string'
    )), true);
    const referencedClusterIndices = new Set(generatedStimulus.setspec.sparcPages[0].display.clusterTargets.map((target) => target.clusterIndex));
    assert.equal(referencedClusterIndices.size, generatedStimulus.setspec.clusters.length);
    assert.ok(generatedStimulus.setspec.sparcPages[0].display.workingMemoryFacts.some((fact) => (
      fact.factType === 'kcGraph.node'
      && fact.slots.clusterKC === 'autotutor.fixture-script.kc.e1'
    )));

    await assert.rejects(() => converter.buildConversionReport(configDir, {
      packageFilter: 'AutoTutor Fixture',
      write: true,
    }), /Expected exactly one autotutorsession unit; found 0/);

    await assert.rejects(() => converter.buildConversionReport(configDir, {
      packageFilter: 'AutoTutor Fixture',
      write: true,
      overwriteGenerated: true,
    }), /Expected exactly one autotutorsession unit; found 0/);
  });
}

async function assertNeutralSparcDialogueOpenRouterProvider() {
  const calls = [];
  const provider = dialogueOpenRouter.createSparcDialogueOpenRouterProvider({
    tdfId: 'tdf-provider-fixture',
    async callResolvedOpenRouterJson(params) {
      calls.push(params);
      if (params.intent.schemaName === 'mofacts_sparc_dialogue_score') {
        return {
          parsedContent: {
            learningTargetScores: [{
              clusterKC: 'kc-a',
              coverage: 0.65,
              evidence: 'mentions A',
            }],
            answerQuality: 'partial',
            learnerContribution: {
              type: 'assertion',
              confidence: 0.8,
            },
          },
        };
      }
      assert.match(params.messages[0].content, /Prompt contract: autotutor\.hint v1/);
      assert.match(params.messages[0].content, /Move-specific prompt policy:/);
      assert.match(params.messages[1].content, /Latest student answer:/);
      assert.match(params.messages[1].content, /App-selected plan\. Echo targetType, targetId, and selectedMove exactly/);
      assert.match(params.messages[1].content, /Registered move definition:/);
      return {
        parsedContent: {
          targetType: 'learningTarget',
          targetId: 'kc-a',
          selectedMove: 'hint',
          tutorMessage: 'Use the authored hint.',
        },
      };
    },
  });
  const display = {
    type: 'sparc',
    nodes: [],
    clusterTargets: [{
      clusterKC: 'kc-a',
      label: 'Cluster A',
    }],
    workingMemoryFacts: [{
      factType: 'learningTarget.source',
      slots: {
        clusterKC: 'kc-a',
        label: 'Expectation A',
        proposition: 'A proposition',
      },
    }],
  };
  const score = await provider.scoreLearnerResponse({
    display,
    learnerText: 'A matters.',
  });
  assert.deepEqual(score.learningTargetScores, [{
    clusterKC: 'kc-a',
    coverage: 0.65,
    evidence: 'mentions A',
  }]);
  assert.equal(score.learnerContribution.type, 'assertion');
  assert.equal(score.learnerQuestion, undefined);
  const questionProvider = dialogueOpenRouter.createSparcDialogueOpenRouterProvider({
    async callResolvedOpenRouterJson() {
      return {
        parsedContent: {
          learningTargetScores: [],
          answerQuality: 'low',
          learnerContribution: {
            type: 'question',
          },
        },
      };
    },
  });
  await assert.rejects(
    () => questionProvider.scoreLearnerResponse({
      display,
      learnerText: 'Can you explain A?',
    }),
    /learnerQuestion is required when learnerContribution\.type is question/,
  );
  const utterance = await provider.generateTutorUtterance({
    targetType: 'learningTarget',
    targetId: 'kc-a',
    action: 'hint',
    contentTexts: ['Use the authored hint.'],
    moveDefinition: moveDefinitions.requireActiveSparcMoveDefinition('hint'),
    selectedAction: {
      targetType: 'learningTarget',
      clusterKC: 'kc-a',
      action: 'hint',
    },
    learnerText: 'A matters.',
    learnerContribution: {
      type: 'assertion',
      confidence: 0.8,
    },
    pedagogicalState: {
      targetType: 'learningTarget',
      targetId: 'kc-a',
      selectedMove: 'hint',
    },
    transitionMetadata: {
      previousTargetType: null,
      previousTargetId: null,
      currentTargetType: 'learningTarget',
      currentTargetId: 'kc-a',
      targetChanged: true,
    },
    targetContent: {
      clusterKC: 'kc-a',
      label: 'Expectation A',
      proposition: 'A proposition',
    },
    plannerState: {
      expectations: [{ clusterKC: 'kc-a', coverage: 0.65 }],
    },
    dialogueHistory: [],
  });
  assert.equal(utterance, 'Use the authored hint.');
  assert.deepEqual(calls.map((call) => call.intent.schemaName), [
    'mofacts_sparc_dialogue_score',
    'mofacts_sparc_dialogue_utterance',
  ]);

  const metadataAgnosticProvider = dialogueOpenRouter.createSparcDialogueOpenRouterProvider({
    async callResolvedOpenRouterJson() {
      return {
        parsedContent: {
          targetType: 'learningTarget',
          targetId: 'kc-b',
          selectedMove: 'hint',
          tutorMessage: 'Changed target.',
        },
      };
    },
  });
  await assert.rejects(
    () => metadataAgnosticProvider.generateTutorUtterance({
      targetType: 'learningTarget',
      targetId: 'kc-a',
      action: 'hint',
      contentTexts: ['Use the authored hint.'],
      moveDefinition: moveDefinitions.requireActiveSparcMoveDefinition('hint'),
      selectedAction: {
        targetType: 'learningTarget',
        clusterKC: 'kc-a',
        action: 'hint',
      },
    }),
    /targetId "kc-b" did not match selected targetId "kc-a"/,
  );
}

function assertSparcAutoTutorProgressMatchesOriginalCredit() {
  const snapshot = sparcAutoTutorProgress.buildSparcAutoTutorProgressSnapshot({
    display: {
      type: 'sparc',
      workingMemoryFacts: [
        { factType: 'dialogue.thresholds', slots: { coverageThreshold: 0.8 } },
        { factType: 'dialogue.graduation', slots: { requiredTargetCount: 2, maxActiveMisconceptions: 0 } },
        { factType: 'learningTarget.source', slots: { clusterKC: 'kc-a', label: 'A' } },
        { factType: 'learningTarget.source', slots: { clusterKC: 'kc-b', label: 'B' } },
        { factType: 'learningTarget.source', slots: { clusterKC: 'kc-c', label: 'C' } },
        { factType: 'learningTarget.source', slots: { clusterKC: 'kc-d', label: 'D' } },
        { factType: 'diagnostic.misconceptionSource', slots: { id: 'm-low', label: 'Low misconception' } },
        { factType: 'diagnostic.misconceptionSource', slots: { id: 'm-high', label: 'High misconception' } },
      ],
    },
    runtimeNodeValues: {
      [sparcAutoTutorProgress.SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY]: [
        { factType: 'learningTarget.score', slots: { clusterKC: 'kc-a', coverage: 0.6 } },
        { factType: 'learningTarget.score', slots: { clusterKC: 'kc-b', coverage: 0.82 } },
        { factType: 'diagnostic.misconceptionScore', slots: { id: 'm-low', current: true, confidence: 0.4 } },
        { factType: 'diagnostic.misconceptionScore', slots: { id: 'm-high', current: true, confidence: 0.7 } },
        { factType: 'session.turnState', slots: { turnCount: 1 } },
      ],
    },
  });
  assert.equal(snapshot.coveredExpectations, 1.6);
  assert.equal(snapshot.requiredExpectations, 4);
  assert.equal(snapshot.activeMisconceptions, 2);
  assert.equal(snapshot.turnCount, 1);
}

async function main() {
  const rules = template.buildAutoTutorSparcMoveProductionRules();
  assertNoOriginalAutoTutorRuntimeImports();
  assertRuleTemplateShape(rules);
  assertGeneratedRulesCompile();
  assertGeneratedRulesSelectMoves();
  assertProductionRuleContractRegressions();
  assertTargetSelectionMatchesOriginalAutoTutorPlanner();
  assertMoveSelectionCounterfactualAudit();
  await assertControllerCompletionPlanning();
  await assertConverterFixtureOutput();
  await assertConverterDefersGraphGenerationToUpload();
  await assertConversionReportFileOutput();
  await assertConverterWriteModeOutput();
  await assertNeutralSparcDialogueOpenRouterProvider();
  assertSparcAutoTutorProgressMatchesOriginalCredit();
  await assertExistingCanonicalSparcPackageLoad();
  await assertCanonicalAutoTutorConfigInventory();

  console.log(JSON.stringify({
    autoTutorSparcConverterCheck: true,
    originalAutoTutorRuntimeDependencyCheck: true,
    moveRuleTemplateVersion: template.AUTOTUTOR_SPARC_MOVE_RULE_TEMPLATE_VERSION,
    emittedMoveRules: rules.length,
    productionRuleContractRegressions: true,
    targetSelectionEquivalenceFixture: true,
    moveSelectionCounterfactualFixture: true,
    converterFixture: true,
    converterUploadRelationshipGenerationFixture: true,
    conversionReportFileFixture: true,
    converterWriteModeFixture: true,
    dialogueOpenRouterProviderFixture: true,
    existingCanonicalSparcPackageLoad: true,
    canonicalAutoTutorConfigInventory: true,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
