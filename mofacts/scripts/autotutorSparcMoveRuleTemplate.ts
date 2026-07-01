import type {
  SparcFactSlotPattern,
  SparcProductionRule,
  SparcProductionRuleCondition,
  SparcProductionRuleEffect,
  SparcWorkingMemoryFactTemplate,
} from '../../learning-components/units/sparcsession/sparcSessionContracts.ts';

export const AUTOTUTOR_SPARC_MOVE_RULE_TEMPLATE_VERSION = 'paper-dialogue-move-v1' as const;

export const AUTOTUTOR_SPARC_MOVE_ACTIONS = [
  'pump',
  'positive_pump',
  'hint',
  'splice',
  'prompt',
  'elaborate',
  'summary',
  'positive_feedback',
  'negative_feedback',
  'positive_neutral_feedback',
  'negative_neutral_feedback',
  'neutral_feedback',
] as const;

export type AutoTutorSparcMoveAction = typeof AUTOTUTOR_SPARC_MOVE_ACTIONS[number];

const LEGACY_FEEDBACK_MOVE_ACTIONS = new Set<AutoTutorSparcMoveAction>([
  'positive_feedback',
  'negative_feedback',
  'positive_neutral_feedback',
  'negative_neutral_feedback',
  'neutral_feedback',
]);

const LOW = { min: 0, max: 0.33 } as const;
const LOW_OR_MEDIUM = { min: 0, max: 0.67 } as const;
const MEDIUM = { min: 0.33, max: 0.67 } as const;
const SOMEWHAT_HIGH = { min: 0.6, max: 0.8 } as const;
const HIGH = { min: 0.67, max: 0.9 } as const;
const HIGH_OR_VERY_HIGH = { min: 0.67, max: 1, maxInclusive: true } as const;

type BagMatchBand = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
type CoverageBand = 'LOW' | 'MEDIUM' | 'HIGH';
type StudentAbilityBand = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH';
type VerbosityBand = 'LOW' | 'MEDIUM' | 'HIGH';

function literal(value: unknown) {
  return { type: 'literal' as const, value };
}

function variable(name: string) {
  return { type: 'variable' as const, name };
}

function range(bounds: {
  readonly min?: number;
  readonly max?: number;
  readonly minInclusive?: boolean;
  readonly maxInclusive?: boolean;
}): SparcFactSlotPattern {
  return {
    type: 'range',
    ...bounds,
  };
}

function selectedLearningTarget(): SparcProductionRuleCondition {
  return {
    factType: 'learningTarget.selected',
    slots: {
      clusterKC: { type: 'bind', variable: 'targetClusterKC' },
    },
  };
}

function selectedTargetCoverage(bounds: Parameters<typeof range>[0]): SparcProductionRuleCondition {
  return {
    factType: 'learningTarget.score',
    slots: {
      clusterKC: { type: 'bound', variable: 'targetClusterKC' },
      coverage: range(bounds),
    },
  };
}

function currentExpectationCoverageBand(band: CoverageBand): SparcProductionRuleCondition {
  return {
    factType: 'selector.currentExpectationCoverage',
    slots: {
      clusterKC: { type: 'bound', variable: 'targetClusterKC' },
      band: literal(band),
    },
  };
}

function currentExpectationCoverageAny(bands: readonly CoverageBand[]): SparcProductionRuleCondition {
  return {
    type: 'any',
    conditions: bands.map(currentExpectationCoverageBand),
  };
}

function goodAnswerMatchBand(band: BagMatchBand): SparcProductionRuleCondition {
  return {
    factType: 'selector.goodAnswerMatch',
    slots: {
      band: literal(band),
    },
  };
}

function goodAnswerMatchAny(bands: readonly BagMatchBand[]): SparcProductionRuleCondition {
  return {
    type: 'any',
    conditions: bands.map(goodAnswerMatchBand),
  };
}

function badAnswerMatchBand(band: BagMatchBand): SparcProductionRuleCondition {
  return {
    factType: 'selector.badAnswerMatch',
    slots: {
      band: literal(band),
    },
  };
}

function badAnswerMatchAny(bands: readonly BagMatchBand[]): SparcProductionRuleCondition {
  return {
    type: 'any',
    conditions: bands.map(badAnswerMatchBand),
  };
}

function studentAbilityBand(band: StudentAbilityBand): SparcProductionRuleCondition {
  return {
    factType: 'selector.studentAbility',
    slots: {
      band: literal(band),
    },
  };
}

function studentAbilityAny(bands: readonly StudentAbilityBand[]): SparcProductionRuleCondition {
  return {
    type: 'any',
    conditions: bands.map(studentAbilityBand),
  };
}

function studentVerbosityBand(band: VerbosityBand): SparcProductionRuleCondition {
  return {
    factType: 'selector.studentVerbosity',
    slots: {
      band: literal(band),
    },
  };
}

function studentVerbosityAny(bands: readonly VerbosityBand[]): SparcProductionRuleCondition {
  return {
    type: 'any',
    conditions: bands.map(studentVerbosityBand),
  };
}

function turnCount(bounds: Parameters<typeof range>[0]): SparcProductionRuleCondition {
  return {
    factType: 'session.turnState',
    slots: {
      turnCount: range(bounds),
    },
  };
}

function learnerContribution(slots: Record<string, SparcFactSlotPattern>): SparcProductionRuleCondition {
  return {
    factType: 'learnerResponse.contribution',
    slots,
  };
}

function selectedMisconception(): SparcProductionRuleCondition {
  return {
    factType: 'diagnostic.misconceptionSelected',
    slots: {
      id: { type: 'bind', variable: 'misconceptionId' },
    },
  };
}

function misconceptionConfidence(bounds: Parameters<typeof range>[0]): SparcProductionRuleCondition {
  return {
    factType: 'diagnostic.misconceptionScore',
    slots: {
      id: { type: 'bound', variable: 'misconceptionId' },
      confidence: range(bounds),
    },
  };
}

function actionFact(params: {
  readonly action: AutoTutorSparcMoveAction;
  readonly sourceRuleId: string;
  readonly targetType: 'learningTarget' | 'misconception';
}): SparcWorkingMemoryFactTemplate {
  const targetSlots = params.targetType === 'learningTarget'
    ? { clusterKC: variable('targetClusterKC') }
    : { id: variable('misconceptionId') };
  return {
    factType: 'controller.selectedAction',
    slots: {
      targetType: literal(params.targetType),
      ...targetSlots,
      action: literal(params.action),
      sourceRuleId: literal(params.sourceRuleId),
      templateVersion: literal(AUTOTUTOR_SPARC_MOVE_RULE_TEMPLATE_VERSION),
    },
  };
}

function selectedActionEffects(params: {
  readonly action: AutoTutorSparcMoveAction;
  readonly sourceRuleId: string;
  readonly targetType?: 'learningTarget' | 'misconception';
}): readonly SparcProductionRuleEffect[] {
  return [{
    type: 'assert-fact',
    persist: true,
    fact: actionFact({
      action: params.action,
      sourceRuleId: params.sourceRuleId,
      targetType: params.targetType ?? 'learningTarget',
    }),
  }, {
    type: 'terminate-production-phase',
    reason: 'move-selected',
  }];
}

function rule(params: {
  readonly paperRule: string;
  readonly action: AutoTutorSparcMoveAction;
  readonly salience: number;
  readonly when: readonly SparcProductionRuleCondition[];
  readonly targetType?: 'learningTarget' | 'misconception';
}): SparcProductionRule {
  return {
    id: `dialogue.move.paper-rule-${params.paperRule}`,
    module: 'dialogue.move-selection',
    salience: params.salience,
    when: params.when,
    then: selectedActionEffects({
      action: params.action,
      sourceRuleId: `paper-rule-${params.paperRule}`,
      targetType: params.targetType,
    }),
  };
}

function selectedActionMoveId(rule: SparcProductionRule): AutoTutorSparcMoveAction | undefined {
  const selectedAction = rule.then.find((effect) => (
    effect.type === 'assert-fact'
    && effect.fact.factType === 'controller.selectedAction'
  ));
  if (!selectedAction || selectedAction.type !== 'assert-fact') {
    return undefined;
  }
  const action = selectedAction.fact.slots?.action;
  if (!action || action.type !== 'literal' || typeof action.value !== 'string') {
    return undefined;
  }
  return AUTOTUTOR_SPARC_MOVE_ACTIONS.includes(action.value as AutoTutorSparcMoveAction)
    ? action.value as AutoTutorSparcMoveAction
    : undefined;
}

function isLegacyFeedbackRule(rule: SparcProductionRule): boolean {
  const moveId = selectedActionMoveId(rule);
  return !!moveId && LEGACY_FEEDBACK_MOVE_ACTIONS.has(moveId);
}

function buildAllRules(): readonly SparcProductionRule[] {
  return [
    rule({
      paperRule: '08-summary',
      action: 'summary',
      salience: 100,
      when: [
        selectedLearningTarget(),
        {
          type: 'any',
          conditions: [
            studentAbilityBand('HIGH'),
            turnCount({ min: 8 }),
          ],
        },
      ],
    }),
    rule({
      paperRule: '04-splice',
      action: 'splice',
      salience: 95,
      when: [
        selectedLearningTarget(),
        selectedMisconception(),
        currentExpectationCoverageAny(['LOW', 'MEDIUM']),
        studentAbilityAny(['VERY_LOW', 'LOW', 'MEDIUM']),
        studentVerbosityAny(['LOW', 'MEDIUM']),
        badAnswerMatchAny(['HIGH', 'VERY_HIGH']),
      ],
    }),
    rule({
      paperRule: '06-hint',
      action: 'hint',
      salience: 90,
      when: [
        selectedLearningTarget(),
        studentAbilityAny(['MEDIUM', 'HIGH']),
        currentExpectationCoverageBand('LOW'),
        goodAnswerMatchAny(['LOW', 'MEDIUM']),
      ],
    }),
    rule({
      paperRule: '07-hint',
      action: 'hint',
      salience: 88,
      when: [
        selectedLearningTarget(),
        studentAbilityAny(['VERY_LOW', 'LOW']),
        studentVerbosityBand('HIGH'),
        currentExpectationCoverageBand('LOW'),
        goodAnswerMatchAny(['LOW', 'MEDIUM']),
      ],
    }),
    rule({
      paperRule: '14-negative-neutral-feedback',
      action: 'negative_neutral_feedback',
      salience: 87,
      targetType: 'misconception',
      when: [
        selectedLearningTarget(),
        selectedMisconception(),
        selectedTargetCoverage(LOW),
        misconceptionConfidence(HIGH),
      ],
    }),
    rule({
      paperRule: '11-negative-feedback',
      action: 'negative_feedback',
      salience: 86,
      targetType: 'misconception',
      when: [
        selectedMisconception(),
        misconceptionConfidence(HIGH),
      ],
    }),
    rule({
      paperRule: '10-positive-feedback',
      action: 'positive_feedback',
      salience: 82,
      when: [
        selectedLearningTarget(),
        selectedTargetCoverage(HIGH_OR_VERY_HIGH),
      ],
    }),
    rule({
      paperRule: '12-positive-neutral-feedback',
      action: 'positive_neutral_feedback',
      salience: 80,
      when: [
        selectedLearningTarget(),
        {
          type: 'any',
          conditions: [
            selectedTargetCoverage(MEDIUM),
            selectedTargetCoverage(SOMEWHAT_HIGH),
          ],
        },
      ],
    }),
    rule({
      paperRule: '13-negative-neutral-feedback',
      action: 'negative_neutral_feedback',
      salience: 78,
      targetType: 'misconception',
      when: [
        selectedMisconception(),
        misconceptionConfidence(MEDIUM),
      ],
    }),
    rule({
      paperRule: '15-neutral-feedback',
      action: 'neutral_feedback',
      salience: 76,
      when: [
        selectedLearningTarget(),
        selectedTargetCoverage(LOW_OR_MEDIUM),
      ],
    }),
    rule({
      paperRule: '09-elaborate',
      action: 'elaborate',
      salience: 70,
      when: [
        selectedLearningTarget(),
        {
          type: 'any',
          conditions: [
            currentExpectationCoverageBand('MEDIUM'),
            goodAnswerMatchAny(['HIGH', 'VERY_HIGH']),
          ],
        },
      ],
    }),
    rule({
      paperRule: '03-positive-pump',
      action: 'positive_pump',
      salience: 68,
      when: [
        selectedLearningTarget(),
        learnerContribution({
          type: { type: 'literal', value: 'assertion' },
          streakCount: { type: 'literal', value: 1 },
        }),
        goodAnswerMatchAny(['HIGH', 'VERY_HIGH']),
        currentExpectationCoverageAny(['MEDIUM', 'HIGH']),
      ],
    }),
    rule({
      paperRule: '05-prompt',
      action: 'prompt',
      salience: 66,
      when: [
        selectedLearningTarget(),
        studentVerbosityBand('LOW'),
        currentExpectationCoverageAny(['LOW', 'MEDIUM']),
        goodAnswerMatchAny(['NONE', 'LOW']),
      ],
    }),
    rule({
      paperRule: '01-pump',
      action: 'pump',
      salience: 64,
      when: [
        selectedLearningTarget(),
        learnerContribution({
          type: { type: 'literal', value: 'assertion' },
          streakCount: { type: 'literal', value: 1 },
        }),
        currentExpectationCoverageAny(['LOW', 'MEDIUM']),
        goodAnswerMatchAny(['NONE', 'LOW', 'MEDIUM']),
      ],
    }),
    rule({
      paperRule: '02-pump',
      action: 'pump',
      salience: 62,
      when: [
        selectedLearningTarget(),
        learnerContribution({
          type: { type: 'literal', value: 'assertion' },
        }),
        currentExpectationCoverageAny(['LOW', 'MEDIUM']),
        goodAnswerMatchAny(['NONE', 'LOW', 'MEDIUM']),
      ],
    }),
  ] as const;
}

function buildActiveRules(): readonly SparcProductionRule[] {
  return buildAllRules().filter((rule) => !isLegacyFeedbackRule(rule));
}

function buildLegacyFeedbackRules(): readonly SparcProductionRule[] {
  return buildAllRules().filter(isLegacyFeedbackRule);
}

function cloneRules(rules: readonly SparcProductionRule[]): SparcProductionRule[] {
  return JSON.parse(JSON.stringify(rules)) as SparcProductionRule[];
}

export function buildAutoTutorSparcMoveProductionRules(): SparcProductionRule[] {
  return cloneRules(buildActiveRules());
}

export function buildAutoTutorSparcLegacyFeedbackMoveProductionRules(): SparcProductionRule[] {
  return cloneRules(buildLegacyFeedbackRules());
}
