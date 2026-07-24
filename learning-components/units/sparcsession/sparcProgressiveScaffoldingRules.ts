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

function targetPattern(): SparcFactPattern {
  return {
    factType: 'instructionalTarget.active',
    slots: {
      targetKey: bind('targetKey'),
      targetKind: bind('targetKind'),
      targetId: bind('targetId'),
      focusEpisodeId: bind('focusEpisodeId'),
      status: literalPattern('active'),
    },
  };
}

function statePattern(stage?: string): SparcFactPattern {
  return {
    factType: 'scaffold.state',
    slots: {
      targetKey: bound('targetKey'),
      focusEpisodeId: bound('focusEpisodeId'),
      ...(stage ? { stage: literalPattern(stage) } : {}),
    },
  };
}

function preservedQuestionStatePattern(): SparcFactPattern {
  return {
    factType: 'scaffold.state',
    slots: {
      targetKey: bound('targetKey'),
      focusEpisodeId: bound('focusEpisodeId'),
      stage: bind('questionStage'),
      lastAction: bind('questionLastAction'),
    },
  };
}

function observationPattern(params: {
  readonly madeProgress: boolean;
}): SparcFactPattern {
  return {
    factType: 'learningObservation.targetProgress',
    slots: {
      targetKey: bound('targetKey'),
      madeProgress: literalPattern(params.madeProgress),
      newlyResolved: literalPattern(false),
    },
  };
}

function all(...conditions: readonly SparcProductionRuleCondition[]): SparcProductionRuleCondition {
  return { type: 'all', conditions };
}

function any(...conditions: readonly SparcProductionRuleCondition[]): SparcProductionRuleCondition {
  return { type: 'any', conditions };
}

function selectedAction(action: string, sourceRuleId: string): SparcWorkingMemoryFactTemplate {
  return {
    factType: 'controller.selectedAction',
    slots: {
      targetType: variable('targetKind'),
      targetId: variable('targetId'),
      targetKey: variable('targetKey'),
      focusEpisodeId: variable('focusEpisodeId'),
      action: literal(action),
      sourceRuleId: literal(sourceRuleId),
    },
  };
}

function scaffoldState(stage: string, action: string): SparcWorkingMemoryFactTemplate {
  return {
    factType: 'scaffold.state',
    slots: {
      focusEpisodeId: variable('focusEpisodeId'),
      targetKey: variable('targetKey'),
      stage: literal(stage),
      lastAction: literal(action),
      policyId: literal('progressive-scaffolding-v1'),
      policyVersion: literal(1),
    },
  };
}

function moveRule(params: {
  readonly id: string;
  readonly action: string;
  readonly stage: string;
  readonly eligible: SparcProductionRuleCondition;
}): SparcProductionRule {
  return {
    id: params.id,
    module: 'dialogue.move-selection',
    salience: 0,
    when: [targetPattern(), params.eligible],
    then: [{
      type: 'assert-fact',
      persist: true,
      fact: selectedAction(params.action, params.id),
    }, {
      type: 'assert-fact',
      persist: true,
      identitySlots: ['focusEpisodeId'],
      fact: scaffoldState(params.stage, params.action),
    }, {
      type: 'terminate-production-phase',
      reason: 'move-selected',
    }],
  };
}

function terminalLearnerQuestionRule(params: {
  readonly id: string;
  readonly action: string;
  readonly contentFocused: boolean;
}): SparcProductionRule {
  return {
    id: params.id,
    module: 'dialogue.move-selection',
    salience: 90,
    when: [targetPattern(), preservedQuestionStatePattern(), {
      factType: 'dialogue.learnerQuestion',
      slots: {
        contentFocused: literalPattern(params.contentFocused),
      },
    }],
    then: [{
      type: 'assert-fact',
      persist: true,
      fact: {
        factType: 'controller.selectedAction',
        slots: {
          targetType: literal('learnerQuestion'),
          targetId: literal('learner-question'),
          action: literal(params.action),
          sourceRuleId: literal(params.id),
        },
      },
    }, {
      type: 'assert-fact',
      persist: true,
      identitySlots: ['focusEpisodeId'],
      fact: {
        factType: 'scaffold.state',
        slots: {
          focusEpisodeId: variable('focusEpisodeId'),
          targetKey: variable('targetKey'),
          stage: variable('questionStage'),
          lastAction: variable('questionLastAction'),
          policyId: literal('progressive-scaffolding-v1'),
          policyVersion: literal(1),
        },
      },
    }, {
      type: 'terminate-production-phase',
      reason: 'move-selected',
    }],
  };
}

export function createSparcProgressiveScaffoldingRules(): readonly SparcProductionRule[] {
  return [{
    id: 'dialogue.completion.summary',
    module: 'dialogue.move-selection',
    salience: 100,
    when: [{ factType: 'dialogue.completionSelected' }, {
      factType: 'controller.completionState',
      slots: { completed: literalPattern(true) },
    }],
    then: [{
      type: 'assert-fact',
      persist: true,
      fact: {
        factType: 'controller.selectedAction',
        slots: {
          targetType: literal('completion'),
          targetId: literal('completion'),
          action: literal('summary'),
          sourceRuleId: literal('dialogue.completion.summary'),
        },
      },
    }, {
      type: 'terminate-production-phase',
      reason: 'move-selected',
    }],
  }, {
    id: 'dialogue.question.defer',
    module: 'dialogue.move-selection',
    salience: 90,
    when: [targetPattern(), preservedQuestionStatePattern(), {
      factType: 'dialogue.learnerQuestion',
      slots: {
        contentFocused: literalPattern(true),
      },
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
  }, terminalLearnerQuestionRule({
    id: 'dialogue.question.scope-refusal',
    action: 'question-scope-refusal',
    contentFocused: false,
  }), moveRule({
    id: 'dialogue.scaffold.pump',
    action: 'pump',
    stage: 'PUMP',
    eligible: any(
      statePattern('ELICIT'),
      all(statePattern(), observationPattern({ madeProgress: true })),
      all(statePattern('ASSERTION'), observationPattern({ madeProgress: false })),
    ),
  }), moveRule({
    id: 'dialogue.scaffold.prompt',
    action: 'prompt',
    stage: 'PROMPT',
    eligible: any(
      all(statePattern('PUMP'), observationPattern({ madeProgress: false })),
    ),
  }), moveRule({
    id: 'dialogue.scaffold.hint',
    action: 'hint',
    stage: 'HINT',
    eligible: any(
      all(statePattern('PROMPT'), observationPattern({ madeProgress: false })),
    ),
  }), moveRule({
    id: 'dialogue.scaffold.assertion',
    action: 'assertion',
    stage: 'ASSERTION',
    eligible: any(
      all(statePattern('HINT'), observationPattern({ madeProgress: false })),
    ),
  })];
}

export const SPARC_PROGRESSIVE_SCAFFOLDING_RULE_IDS = Object.freeze([
  'dialogue.completion.summary',
  'dialogue.question.defer',
  'dialogue.question.scope-refusal',
  'dialogue.scaffold.pump',
  'dialogue.scaffold.prompt',
  'dialogue.scaffold.hint',
  'dialogue.scaffold.assertion',
] as const);

export function assertCanonicalSparcProgressiveScaffoldingRules(
  rules: readonly SparcProductionRule[],
): void {
  if (JSON.stringify(rules) !== JSON.stringify(createSparcProgressiveScaffoldingRules())) {
    throw new Error('SPARC AutoTutor productionRules must exactly match progressive-scaffolding-v1');
  }
}
