import type {
  SparcFactPattern,
  SparcProductionRule,
  SparcProductionRuleCondition,
  SparcWorkingMemoryFactTemplate,
} from './sparcSessionContracts';

const literal = (value: unknown) => ({ type: 'literal' as const, value });
const variable = (name: string) => ({ type: 'variable' as const, name });
const literalPattern = (value: unknown) => ({ type: 'literal' as const, value });
const bind = (name: string) => ({ type: 'bind' as const, variable: name });
const bound = (name: string) => ({ type: 'bound' as const, variable: name });

function assessmentPattern(): SparcFactPattern {
  return {
    factType: 'instructional.assessmentSnapshot',
    slots: { snapshotId: bind('snapshotId') },
  };
}

function completionPattern(completed: boolean): SparcFactPattern {
  return {
    factType: 'controller.completionState',
    slots: { completed: literalPattern(completed) },
  };
}

function noDecisionPattern(): SparcProductionRuleCondition {
  return {
    type: 'not',
    pattern: {
      factType: 'instructional.decision',
      slots: { snapshotId: bound('snapshotId') },
    },
  };
}

function noEligibleMisconceptionPattern(): SparcProductionRuleCondition {
  return {
    type: 'not',
    pattern: {
      factType: 'instructional.candidate',
      slots: {
        snapshotId: bound('snapshotId'),
        targetKind: literalPattern('misconception'),
        eligible: literalPattern(true),
      },
    },
  };
}

function cycleStatusPattern(continuable: boolean): SparcFactPattern {
  return {
    factType: 'instructional.cycleStatus',
    slots: {
      snapshotId: bound('snapshotId'),
      continuable: literalPattern(continuable),
    },
  };
}

function activeCyclePattern(params: {
  readonly targetKind: 'expectation' | 'misconception';
  readonly stage?: string;
}): SparcFactPattern {
  return {
    factType: 'instructional.activeCycle',
    slots: {
      cycleId: bind('cycleId'),
      targetKind: literalPattern(params.targetKind),
      targetId: bind('targetId'),
      targetKey: bind('targetKey'),
      stage: params.stage ? literalPattern(params.stage) : bind('currentStage'),
      startedAtTurn: bind('startedAtTurn'),
      cycleTurnCount: bind('cycleTurnCount'),
      status: literalPattern('active'),
    },
  };
}

function interruptedExpectationPattern(): SparcFactPattern {
  return {
    factType: 'instructional.activeCycle',
    slots: {
      cycleId: bind('previousCycleId'),
      targetKind: literalPattern('expectation'),
      targetId: bind('previousTargetId'),
      targetKey: bind('previousTargetKey'),
      stage: bind('previousStage'),
      startedAtTurn: bind('previousStartedAtTurn'),
      cycleTurnCount: bind('previousCycleTurnCount'),
      status: literalPattern('active'),
    },
  };
}

function activeCandidatePattern(params: {
  readonly targetKind: 'expectation' | 'misconception';
}): SparcFactPattern {
  return {
    factType: 'instructional.candidate',
    slots: {
      snapshotId: bound('snapshotId'),
      targetKind: literalPattern(params.targetKind),
      targetId: bound('targetId'),
      targetKey: bound('targetKey'),
      currentValue: bind('currentValue'),
      eligible: literalPattern(true),
    },
  };
}

function maximumCandidatePattern(params: {
  readonly targetKind: 'expectation' | 'misconception';
}): SparcFactPattern {
  return {
    factType: 'instructional.candidate',
    slots: {
      snapshotId: bound('snapshotId'),
      targetKind: literalPattern(params.targetKind),
      targetId: bind('targetId'),
      targetKey: bind('targetKey'),
      currentValue: bind('currentValue'),
      eligible: literalPattern(true),
      isMaximumWithinKind: literalPattern(true),
    },
  };
}

function progressPattern(meaningfulGain: boolean): SparcFactPattern {
  return {
    factType: 'instructional.progress',
    slots: {
      snapshotId: bound('snapshotId'),
      cycleId: bound('cycleId'),
      targetKey: bound('targetKey'),
      meaningfulGain: literalPattern(meaningfulGain),
      goalReached: literalPattern(false),
    },
  };
}

function turnPattern(): SparcFactPattern {
  return {
    factType: 'session.turnState',
    slots: { turnCount: bind('turnNumber') },
  };
}

function selectedAction(
  targetKind: 'expectation' | 'misconception',
  action: string,
  sourceRuleId: string,
): SparcWorkingMemoryFactTemplate {
  return {
    factType: 'controller.selectedAction',
    slots: {
      targetType: literal(targetKind),
      targetId: variable('targetId'),
      targetKey: variable('targetKey'),
      action: literal(action),
      sourceRuleId: literal(sourceRuleId),
      snapshotId: variable('snapshotId'),
    },
  };
}

function instructionalDecision(params: {
  readonly targetKind: 'expectation' | 'misconception';
  readonly action: string;
  readonly transition: string;
  readonly sourceRuleId: string;
  readonly reason: string;
}): SparcWorkingMemoryFactTemplate {
  return {
    factType: 'instructional.decision',
    slots: {
      snapshotId: variable('snapshotId'),
      targetKind: literal(params.targetKind),
      targetId: variable('targetId'),
      targetKey: variable('targetKey'),
      action: literal(params.action),
      transition: literal(params.transition),
      sourceRuleId: literal(params.sourceRuleId),
      reason: literal(params.reason),
    },
  };
}

function startedCycle(
  targetKind: 'expectation' | 'misconception',
  stage: string,
): SparcWorkingMemoryFactTemplate {
  return {
    factType: 'instructional.activeCycle',
    slots: {
      cycleId: variable('snapshotId'),
      targetKind: literal(targetKind),
      targetId: variable('targetId'),
      targetKey: variable('targetKey'),
      stage: literal(stage),
      priorValue: variable('currentValue'),
      startedAtTurn: variable('turnNumber'),
      cycleTurnCount: literal(0),
      status: literal('active'),
    },
  };
}

function continuedCycle(
  targetKind: 'expectation' | 'misconception',
  stage: string,
): SparcWorkingMemoryFactTemplate {
  return {
    factType: 'instructional.activeCycle',
    slots: {
      cycleId: variable('cycleId'),
      targetKind: literal(targetKind),
      targetId: variable('targetId'),
      targetKey: variable('targetKey'),
      stage: literal(stage),
      priorValue: variable('currentValue'),
      startedAtTurn: variable('startedAtTurn'),
      cycleTurnCount: {
        type: 'function',
        name: 'add',
        args: [variable('cycleTurnCount'), literal(1)],
      },
      status: literal('active'),
    },
  };
}

function decisionEffects(params: {
  readonly targetKind: 'expectation' | 'misconception';
  readonly action: string;
  readonly stage: string;
  readonly transition: string;
  readonly sourceRuleId: string;
  readonly reason: string;
  readonly startsCycle: boolean;
}): SparcProductionRule['then'] {
  return [{
    type: 'assert-fact',
    persist: true,
    identitySlots: ['snapshotId'],
    fact: instructionalDecision(params),
  }, {
    type: 'assert-fact',
    persist: true,
    identitySlots: [],
    fact: selectedAction(params.targetKind, params.action, params.sourceRuleId),
  }, {
    type: 'assert-fact',
    persist: true,
    identitySlots: [],
    fact: params.startsCycle
      ? startedCycle(params.targetKind, params.stage)
      : continuedCycle(params.targetKind, params.stage),
  }, {
    type: 'terminate-production-phase',
    reason: 'instructional-decision-selected',
  }];
}

function continuationRule(params: {
  readonly id: string;
  readonly targetKind: 'expectation' | 'misconception';
  readonly currentStage: string;
  readonly meaningfulGain?: boolean;
  readonly action: string;
  readonly nextStage: string;
}): SparcProductionRule {
  const targetSpecificConditions: SparcProductionRuleCondition[] = params.targetKind === 'expectation'
    ? [noEligibleMisconceptionPattern()]
    : [];
  return {
    id: params.id,
    module: 'dialogue.instructional-control',
    salience: 60,
    when: [
      assessmentPattern(),
      completionPattern(false),
      activeCyclePattern({ targetKind: params.targetKind, stage: params.currentStage }),
      activeCandidatePattern({ targetKind: params.targetKind }),
      ...(params.meaningfulGain === undefined ? [] : [progressPattern(params.meaningfulGain)]),
      ...targetSpecificConditions,
      noDecisionPattern(),
    ],
    then: decisionEffects({
      targetKind: params.targetKind,
      action: params.action,
      stage: params.nextStage,
      transition: params.currentStage === params.nextStage ? 'continue' : 'advance',
      sourceRuleId: params.id,
      reason: params.meaningfulGain === true
        ? 'meaningful-gain'
        : (params.meaningfulGain === false ? 'insufficient-gain' : 'bottomed-out'),
      startsCycle: false,
    }),
  };
}

function startRule(params: {
  readonly id: string;
  readonly targetKind: 'expectation' | 'misconception';
  readonly action: 'pump' | 'prompt';
  readonly stage: 'PUMP' | 'PROMPT';
}): SparcProductionRule {
  return {
    id: params.id,
    module: 'dialogue.instructional-control',
    salience: params.targetKind === 'misconception' ? 70 : 50,
    when: [
      assessmentPattern(),
      completionPattern(false),
      cycleStatusPattern(false),
      maximumCandidatePattern({ targetKind: params.targetKind }),
      ...(params.targetKind === 'expectation' ? [noEligibleMisconceptionPattern()] : []),
      turnPattern(),
      noDecisionPattern(),
    ],
    then: decisionEffects({
      targetKind: params.targetKind,
      action: params.action,
      stage: params.stage,
      transition: 'start',
      sourceRuleId: params.id,
      reason: params.targetKind === 'misconception' ? 'threshold-eligible-misconception' : 'maximum-eligible-expectation',
      startsCycle: true,
    }),
  };
}

function learnerQuestionDecision(params: {
  readonly id: string;
  readonly action: string;
}): SparcWorkingMemoryFactTemplate {
  return {
    factType: 'instructional.decision',
    slots: {
      snapshotId: variable('snapshotId'),
      targetKind: literal('learnerQuestion'),
      targetId: literal('learner-question'),
      targetKey: literal('learnerQuestion:learner-question'),
      action: literal(params.action),
      transition: literal('continue'),
      sourceRuleId: literal(params.id),
      reason: literal('learner-question'),
    },
  };
}

export function createSparcProgressiveScaffoldingRules(): readonly SparcProductionRule[] {
  return [{
    id: 'dialogue.completion.summary',
    module: 'dialogue.instructional-control',
    salience: 100,
    when: [assessmentPattern(), completionPattern(true), noDecisionPattern()],
    then: [{
      type: 'assert-fact',
      persist: true,
      identitySlots: ['snapshotId'],
      fact: {
        factType: 'instructional.decision',
        slots: {
          snapshotId: variable('snapshotId'),
          targetKind: literal('completion'),
          targetId: literal('completion'),
          targetKey: literal('completion:completion'),
          action: literal('summary'),
          transition: literal('complete'),
          sourceRuleId: literal('dialogue.completion.summary'),
          reason: literal('controller-completion'),
        },
      },
    }, {
      type: 'assert-fact',
      persist: true,
      identitySlots: [],
      fact: {
        factType: 'controller.selectedAction',
        slots: {
          targetType: literal('completion'),
          targetId: literal('completion'),
          action: literal('summary'),
          sourceRuleId: literal('dialogue.completion.summary'),
          snapshotId: variable('snapshotId'),
        },
      },
    }, {
      type: 'assert-fact',
      persist: true,
      identitySlots: [],
      fact: {
        factType: 'instructional.activeCycle',
        slots: {
          cycleId: variable('snapshotId'),
          targetKind: literal('completion'),
          targetId: literal('completion'),
          targetKey: literal('completion:completion'),
          stage: literal('SUMMARY'),
          priorValue: literal(1),
          startedAtTurn: literal(0),
          cycleTurnCount: literal(0),
          status: literal('closed'),
        },
      },
    }, {
      type: 'terminate-production-phase',
      reason: 'instructional-decision-selected',
    }],
  }, {
    id: 'dialogue.question.defer',
    module: 'dialogue.instructional-control',
    salience: 90,
    when: [assessmentPattern(), {
      factType: 'dialogue.learnerQuestion',
      slots: { contentFocused: literalPattern(true) },
    }],
    then: [{
      type: 'assert-fact',
      persist: false,
      fact: {
        factType: 'dialogue.responseModifier',
        slots: {
          action: literal('question-deferral'),
          sourceRuleId: literal('dialogue.question.defer'),
        },
      },
    }],
  }, {
    id: 'dialogue.question.scope-refusal',
    module: 'dialogue.instructional-control',
    salience: 90,
    when: [assessmentPattern(), {
      factType: 'dialogue.learnerQuestion',
      slots: { contentFocused: literalPattern(false) },
    }, noDecisionPattern()],
    then: [{
      type: 'assert-fact',
      persist: true,
      identitySlots: ['snapshotId'],
      fact: learnerQuestionDecision({
        id: 'dialogue.question.scope-refusal',
        action: 'question-scope-refusal',
      }),
    }, {
      type: 'assert-fact',
      persist: true,
      identitySlots: [],
      fact: {
        factType: 'controller.selectedAction',
        slots: {
          targetType: literal('learnerQuestion'),
          targetId: literal('learner-question'),
          action: literal('question-scope-refusal'),
          sourceRuleId: literal('dialogue.question.scope-refusal'),
          snapshotId: variable('snapshotId'),
        },
      },
    }, {
      type: 'terminate-production-phase',
      reason: 'instructional-decision-selected',
    }],
  }, {
    id: 'dialogue.target.misconception.interrupt',
    module: 'dialogue.instructional-control',
    salience: 80,
    when: [
      assessmentPattern(),
      completionPattern(false),
      interruptedExpectationPattern(),
      cycleStatusPattern(true),
      maximumCandidatePattern({ targetKind: 'misconception' }),
      turnPattern(),
      noDecisionPattern(),
    ],
    then: decisionEffects({
      targetKind: 'misconception',
      action: 'prompt',
      stage: 'PROMPT',
      transition: 'interrupt',
      sourceRuleId: 'dialogue.target.misconception.interrupt',
      reason: 'threshold-eligible-misconception',
      startsCycle: true,
    }),
  },
  startRule({
    id: 'dialogue.target.misconception.start',
    targetKind: 'misconception',
    action: 'prompt',
    stage: 'PROMPT',
  }),
  startRule({
    id: 'dialogue.target.expectation.start',
    targetKind: 'expectation',
    action: 'pump',
    stage: 'PUMP',
  }),
  ...(['expectation', 'misconception'] as const).flatMap((targetKind) => [
    continuationRule({
      id: `dialogue.scaffold.${targetKind}.pump-progress`,
      targetKind,
      currentStage: 'PUMP',
      meaningfulGain: true,
      action: 'pump',
      nextStage: 'PUMP',
    }),
    continuationRule({
      id: `dialogue.scaffold.${targetKind}.pump-no-progress`,
      targetKind,
      currentStage: 'PUMP',
      meaningfulGain: false,
      action: 'prompt',
      nextStage: 'PROMPT',
    }),
    continuationRule({
      id: `dialogue.scaffold.${targetKind}.prompt-progress`,
      targetKind,
      currentStage: 'PROMPT',
      meaningfulGain: true,
      action: 'pump',
      nextStage: 'PUMP',
    }),
    continuationRule({
      id: `dialogue.scaffold.${targetKind}.prompt-no-progress`,
      targetKind,
      currentStage: 'PROMPT',
      meaningfulGain: false,
      action: 'hint',
      nextStage: 'HINT',
    }),
    continuationRule({
      id: `dialogue.scaffold.${targetKind}.hint-progress`,
      targetKind,
      currentStage: 'HINT',
      meaningfulGain: true,
      action: 'pump',
      nextStage: 'PUMP',
    }),
    continuationRule({
      id: `dialogue.scaffold.${targetKind}.hint-no-progress`,
      targetKind,
      currentStage: 'HINT',
      meaningfulGain: false,
      action: 'assertion',
      nextStage: 'ASSERTION',
    }),
    continuationRule({
      id: `dialogue.scaffold.${targetKind}.assertion`,
      targetKind,
      currentStage: 'ASSERTION',
      action: 'assertion',
      nextStage: 'ASSERTION',
    }),
  ])];
}

export const SPARC_PROGRESSIVE_SCAFFOLDING_RULE_IDS = Object.freeze(
  createSparcProgressiveScaffoldingRules().map((rule) => rule.id),
);
