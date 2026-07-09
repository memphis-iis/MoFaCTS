type JsonRecord = Record<string, unknown>;

const literal = (value: unknown): JsonRecord => ({ type: 'literal', value });
const bind = (variable: string): JsonRecord => ({ type: 'bind', variable });
const bound = (variable: string): JsonRecord => ({ type: 'bound', variable });
const variable = (name: string): JsonRecord => ({ type: 'variable', name });

const targetClusterKC = 'targetClusterKC';
const misconceptionId = 'misconceptionId';

function any(conditions: JsonRecord[]): JsonRecord {
  return { type: 'any', conditions };
}

function selectedLearningTarget(): JsonRecord {
  return {
    factType: 'learningTarget.selected',
    slots: {
      clusterKC: bind(targetClusterKC),
    },
  };
}

function studentAbility(...bands: string[]): JsonRecord {
  return any(bands.map((band) => ({
    factType: 'selector.studentAbility',
    slots: {
      band: literal(band),
    },
  })));
}

function studentVerbosity(...bands: string[]): JsonRecord {
  return bands.length === 1
    ? {
        factType: 'selector.studentVerbosity',
        slots: {
          band: literal(bands[0]),
        },
      }
    : any(bands.map((band) => ({
        factType: 'selector.studentVerbosity',
        slots: {
          band: literal(band),
        },
      })));
}

function expectationCoverage(...bands: string[]): JsonRecord {
  const conditions = bands.map((band) => ({
    factType: 'selector.currentExpectationCoverage',
    slots: {
      clusterKC: bound(targetClusterKC),
      band: literal(band),
    },
  }));
  return conditions.length === 1 ? conditions[0]! : any(conditions);
}

function learnerAnswerContribution(streakCount?: number): JsonRecord {
  return {
    factType: 'learnerResponse.contribution',
    slots: {
      type: literal('answer'),
      ...(streakCount === undefined ? {} : { streakCount: literal(streakCount) }),
    },
  };
}

function selectedMisconception(): JsonRecord {
  return {
    factType: 'diagnostic.misconceptionSelected',
    slots: {
      id: bind(misconceptionId),
    },
  };
}

function misconceptionScore(min: number): JsonRecord {
  return {
    factType: 'diagnostic.misconceptionScore',
    slots: {
      id: bound(misconceptionId),
      confidence: {
        type: 'range',
        min,
        max: 1,
        maxInclusive: true,
      },
    },
  };
}

function assertSelectedAction(slots: JsonRecord): JsonRecord {
  return {
    type: 'assert-fact',
    persist: true,
    fact: {
      factType: 'controller.selectedAction',
      slots,
    },
  };
}

function terminateMoveSelection(): JsonRecord {
  return {
    type: 'terminate-production-phase',
    reason: 'move-selected',
  };
}

function learningTargetAction(action: string, sourceRuleId: string): JsonRecord {
  return assertSelectedAction({
    targetType: literal('learningTarget'),
    clusterKC: variable(targetClusterKC),
    action: literal(action),
    sourceRuleId: literal(sourceRuleId),
  });
}

function misconceptionAction(action: string, sourceRuleId: string): JsonRecord {
  return assertSelectedAction({
    targetType: literal('misconception'),
    id: variable(misconceptionId),
    action: literal(action),
    sourceRuleId: literal(sourceRuleId),
  });
}

function completionAction(action: string, sourceRuleId: string): JsonRecord {
  return assertSelectedAction({
    targetType: literal('completion'),
    action: literal(action),
    sourceRuleId: literal(sourceRuleId),
  });
}

function moveRule(id: string, salience: number, when: JsonRecord[], actionEffect: JsonRecord): JsonRecord {
  return {
    id,
    module: 'dialogue.move-selection',
    salience,
    when,
    then: [
      actionEffect,
      terminateMoveSelection(),
    ],
  };
}

export function buildCanonicalSparcAutoTutorProductionRules(): JsonRecord[] {
  return [
    moveRule(
      'dialogue.move.paper-rule-08-summary',
      100,
      [
        selectedLearningTarget(),
        any([
          {
            factType: 'selector.studentAbility',
            slots: { band: literal('HIGH') },
          },
          {
            factType: 'session.turnState',
            slots: {
              turnCount: {
                type: 'range',
                min: 8,
              },
            },
          },
        ]),
      ],
      learningTargetAction('summary', 'paper-rule-08-summary'),
    ),
    moveRule(
      'dialogue.move.paper-rule-04-splice',
      95,
      [
        selectedLearningTarget(),
        selectedMisconception(),
        expectationCoverage('LOW', 'MEDIUM'),
        studentAbility('VERY_LOW', 'LOW', 'MEDIUM'),
        studentVerbosity('LOW', 'MEDIUM'),
        misconceptionScore(0.67),
      ],
      learningTargetAction('splice', 'paper-rule-04-splice'),
    ),
    moveRule(
      'dialogue.move.misconception-repair-splice',
      94,
      [
        selectedMisconception(),
        misconceptionScore(0.2),
      ],
      misconceptionAction('splice', 'dialogue.move.misconception-repair-splice'),
    ),
    moveRule(
      'dialogue.move.paper-rule-06-hint',
      90,
      [
        selectedLearningTarget(),
        studentAbility('MEDIUM', 'HIGH'),
        expectationCoverage('LOW'),
      ],
      learningTargetAction('hint', 'paper-rule-06-hint'),
    ),
    moveRule(
      'dialogue.move.paper-rule-07-hint',
      88,
      [
        selectedLearningTarget(),
        studentAbility('VERY_LOW', 'LOW'),
        studentVerbosity('HIGH'),
        expectationCoverage('LOW'),
      ],
      learningTargetAction('hint', 'paper-rule-07-hint'),
    ),
    moveRule(
      'dialogue.move.paper-rule-09-elaborate',
      70,
      [
        selectedLearningTarget(),
        expectationCoverage('MEDIUM'),
      ],
      learningTargetAction('elaborate', 'paper-rule-09-elaborate'),
    ),
    moveRule(
      'dialogue.move.paper-rule-03-positive-pump',
      68,
      [
        selectedLearningTarget(),
        learnerAnswerContribution(1),
        expectationCoverage('MEDIUM', 'HIGH'),
      ],
      learningTargetAction('positive_pump', 'paper-rule-03-positive-pump'),
    ),
    moveRule(
      'dialogue.move.paper-rule-05-prompt',
      66,
      [
        selectedLearningTarget(),
        studentVerbosity('LOW'),
        expectationCoverage('LOW', 'MEDIUM'),
      ],
      learningTargetAction('prompt', 'paper-rule-05-prompt'),
    ),
    moveRule(
      'dialogue.move.paper-rule-01-pump',
      64,
      [
        selectedLearningTarget(),
        learnerAnswerContribution(1),
        expectationCoverage('LOW', 'MEDIUM'),
      ],
      learningTargetAction('pump', 'paper-rule-01-pump'),
    ),
    moveRule(
      'dialogue.move.paper-rule-02-pump',
      62,
      [
        selectedLearningTarget(),
        learnerAnswerContribution(),
        expectationCoverage('LOW', 'MEDIUM'),
      ],
      learningTargetAction('pump', 'paper-rule-02-pump'),
    ),
    moveRule(
      'dialogue.move.generated-completion-summary',
      110,
      [
        { factType: 'dialogue.completionSelected' },
        {
          factType: 'controller.completionState',
          slots: {
            completed: literal(true),
          },
        },
      ],
      completionAction('summary', 'generated-completion-summary'),
    ),
  ];
}

export const SPARC_AUTOTUTOR_CALCULATE_PROBABILITY =
  'p.y = -0.77 + .665 * pFunc.logitdec( p.overallOutcomeHistory.slice( Math.max(p.overallOutcomeHistory.length-60, 0),  p.overallOutcomeHistory.length),  .966)+ .51* (p.stimSuccessCount) + 11.1 * pFunc.recency(p.stimSecsSinceLastShown, .443) ; p.probability = 1.0 / (1.0 + Math.exp(-p.y)); return p';
