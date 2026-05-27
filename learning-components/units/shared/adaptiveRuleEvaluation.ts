export type AdaptiveOutcomes = Record<string, boolean>;

export type AdaptiveOutcomeRow = {
  KCId?: number | string;
  outcome?: string;
};

export type AdaptiveStimulusClusterRef = {
  clusterKC?: unknown;
};

export type AdaptiveRuleScheduleItem = {
  readonly clusterIndex: number;
  readonly stimIndex: number;
  readonly isCheckpoint: boolean;
};

export type AdaptiveRuleCheckpoint = {
  readonly clusterIndex: number;
  readonly stimIndex: number;
  readonly time: number;
};

export type AdaptiveRuleEvaluationResult = {
  readonly condition: string;
  readonly action?: string;
  readonly actions?: string;
  readonly conditionExpression?: string;
  readonly conditionResult: boolean;
  readonly questions?: number[];
  readonly schedule?: AdaptiveRuleScheduleItem[];
  readonly when?: number | null;
  readonly checkpoints?: AdaptiveRuleCheckpoint[];
};

const ADAPTIVE_RULE_OPERATORS: Record<string, string> = {
  NOT: '!',
  AND: '&&',
  OR: '||',
};

const ADAPTIVE_RULE_MATH_OPERATORS = '+-*/%()=';

function parseClusterStimToken(token: string, fieldName: string): { clusterIndex: number; stimIndex: number } {
  if (!token.startsWith('C')) {
    throw new Error(`Invalid ${fieldName}: ${token}`);
  }
  const [, tokenBody = ''] = token.split('C');
  const [clusterPart = '', stimulusPart = ''] = tokenBody.split('S');
  const clusterIndex = parseInt(clusterPart);
  const stimIndex = parseInt(stimulusPart);
  if (!Number.isInteger(clusterIndex) || !Number.isInteger(stimIndex)) {
    throw new Error(`Invalid ${fieldName}: ${token}`);
  }
  return { clusterIndex, stimIndex };
}

function translateConditionToken(token: string, adaptiveOutcomes: AdaptiveOutcomes): string {
  if (ADAPTIVE_RULE_OPERATORS[token]) {
    return ADAPTIVE_RULE_OPERATORS[token];
  }
  if (token.toLowerCase() === 'true') {
    return 'true';
  }
  if (token.toLowerCase() === 'false') {
    return 'false';
  }
  if (token.startsWith('C')) {
    const { clusterIndex } = parseClusterStimToken(token, 'token');
    return String(adaptiveOutcomes[String(clusterIndex)] ?? false);
  }
  if (Number.isInteger(parseInt(token))) {
    return token;
  }

  let conditionExpression = '';
  for (const char of token) {
    if (ADAPTIVE_RULE_MATH_OPERATORS.includes(char)) {
      conditionExpression += char;
    } else if (Number.isInteger(parseInt(char))) {
      conditionExpression += char;
    } else {
      throw new Error(`Invalid token: ${token}`);
    }
  }
  return conditionExpression;
}

function parseActions(actions: string, isCheckpoint: boolean, when: number | null): {
  schedule: AdaptiveRuleScheduleItem[];
  questions: number[];
  checkpoints: AdaptiveRuleCheckpoint[];
} {
  const schedule: AdaptiveRuleScheduleItem[] = [];
  const questions: number[] = [];
  const checkpoints: AdaptiveRuleCheckpoint[] = [];
  const actionTokens = actions.includes('(')
    ? actions.substring(actions.indexOf('(') + 1, actions.indexOf(')')).split(',')
    : [actions];

  for (const action of actionTokens) {
    const { clusterIndex, stimIndex } = parseClusterStimToken(action, 'action');
    schedule.push({
      clusterIndex,
      stimIndex,
      isCheckpoint,
    });
    questions.push(clusterIndex);
    if (isCheckpoint && when !== null) {
      checkpoints.push({
        clusterIndex,
        stimIndex,
        time: when,
      });
    }
  }

  return { schedule, questions, checkpoints };
}

export function evaluateAdaptiveRule(
  logicString: string,
  adaptiveOutcomes: AdaptiveOutcomes,
): AdaptiveRuleEvaluationResult {
  const [, whenSegment = ''] = logicString.split('AT');
  const when = logicString.includes('AT') ? parseInt(whenSegment.trim()) : null;
  const isCheckpoint = logicString.includes('CHECKPOINT');
  const parts = logicString.replace('IF', '').replace('AT', '').replace('CHECKPOINT', '').split('THEN');
  const condition = (parts[0] ?? '').trim();
  const actions = (parts[1] ?? '').trim();

  if (!condition || !actions) {
    return { condition, action: actions, conditionResult: false };
  }

  const conditionExpression = condition
    .split(' ')
    .map((token) => translateConditionToken(token, adaptiveOutcomes))
    .join('');

  const conditionFunction: Function = new Function(`return ${conditionExpression}`);
  const conditionResult = Boolean(conditionFunction());
  if (!conditionResult) {
    return {
      condition,
      conditionExpression,
      actions,
      conditionResult,
    };
  }

  const { schedule, questions, checkpoints } = parseActions(actions, isCheckpoint, when);
  return {
    condition,
    conditionExpression,
    actions,
    conditionResult,
    questions,
    schedule,
    when,
    checkpoints,
  };
}

export function getAdaptiveScheduleQuestions(schedule: Array<{ clusterIndex?: unknown }>): number[] {
  return (schedule || []).map((item) => {
    const clusterIndex = Number(item?.clusterIndex);
    if (!Number.isInteger(clusterIndex)) {
      throw new Error('Adaptive rule produced a scheduled question without a valid clusterIndex');
    }
    return clusterIndex;
  });
}

export function buildAdaptiveOutcomes(options: {
  rows: AdaptiveOutcomeRow[];
  currentStimuliSet: AdaptiveStimulusClusterRef[] | null | undefined;
  kcMultiple: number;
}): AdaptiveOutcomes {
  const outcomes: AdaptiveOutcomes = {};
  for (const historyRow of options.rows) {
    const kcId = Number(historyRow?.KCId);
    if (Number.isFinite(kcId)) {
      outcomes[String(kcId % options.kcMultiple)] = historyRow.outcome === 'correct';
    }
  }

  if (Array.isArray(options.currentStimuliSet)) {
    for (const stim of options.currentStimuliSet) {
      const clusterKC = Number(stim?.clusterKC);
      if (!Number.isFinite(clusterKC)) {
        continue;
      }
      const clusterKey = String(clusterKC % options.kcMultiple);
      if (!Object.prototype.hasOwnProperty.call(outcomes, clusterKey)) {
        outcomes[clusterKey] = false;
      }
    }
  }

  return outcomes;
}
