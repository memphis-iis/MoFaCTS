import { compileAdaptiveRule, type ParsedAdaptiveRuleAction } from '../../content/adaptiveRuleCompilation';
import { interpretSafeBooleanExpression } from '../../safe-expression/safeExpressionEngine';

export type AdaptiveOutcomes = Record<string, boolean>;
export type AdaptiveOutcomeRow = { stimulusKC?: number | string; outcome?: string };
export type AdaptiveStimulusClusterRef = { clusterKC?: unknown; stimulusKC?: unknown };
export type AdaptiveRuleScheduleItem = { readonly clusterIndex: number; readonly stimIndex: number; readonly isCheckpoint: boolean };
export type AdaptiveRuleCheckpoint = { readonly clusterIndex: number; readonly stimIndex: number; readonly time: number };
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

function parseActions(actions: readonly ParsedAdaptiveRuleAction[], isCheckpoint: boolean, when: number | null) {
  const schedule: AdaptiveRuleScheduleItem[] = [];
  const questions: number[] = [];
  const checkpoints: AdaptiveRuleCheckpoint[] = [];
  for (const action of actions) {
    schedule.push({ ...action, isCheckpoint });
    questions.push(action.clusterIndex);
    if (isCheckpoint && when !== null) checkpoints.push({ ...action, time: when });
  }
  return { schedule, questions, checkpoints };
}

export function evaluateAdaptiveRule(
  logicString: string,
  adaptiveOutcomes: AdaptiveOutcomes,
): AdaptiveRuleEvaluationResult {
  const compiled = compileAdaptiveRule(logicString);
  const outcomeValues = Object.create(null) as Record<string, boolean>;
  for (const outcomeName of compiled.outcomeNames) {
    const match = /^C(\d+)S(\d+)$/.exec(outcomeName);
    if (!match) throw new Error(`${compiled.fieldPath}: invalid compiled outcome reference "${outcomeName}"`);
    outcomeValues[outcomeName] = adaptiveOutcomes[`${match[1]}:${match[2]}`] ?? false;
  }
  const conditionExpression = compiled.conditionExpression
    .replace(/\bC\d+S\d+\b/g, (name) => String(outcomeValues[name] ?? false))
    .replace(/\s+/g, '');
  const conditionResult = interpretSafeBooleanExpression(compiled.conditionProgram, outcomeValues);
  if (!conditionResult) {
    return {
      condition: compiled.condition,
      conditionExpression,
      actions: compiled.actionsText,
      conditionResult: false,
    };
  }
  const parsed = parseActions(compiled.actions, compiled.isCheckpoint, compiled.when);
  return {
    condition: compiled.condition,
    conditionExpression,
    actions: compiled.actionsText,
    conditionResult: true,
    ...parsed,
    when: compiled.when,
  };
}

export function getAdaptiveScheduleQuestions(schedule: Array<{ clusterIndex?: unknown }>): number[] {
  return (schedule || []).map((item) => {
    const clusterIndex = Number(item?.clusterIndex);
    if (!Number.isInteger(clusterIndex)) throw new Error('Adaptive rule produced a scheduled question without a valid clusterIndex');
    return clusterIndex;
  });
}

export function buildAdaptiveOutcomes(options: {
  rows: AdaptiveOutcomeRow[];
  currentStimuliSet: AdaptiveStimulusClusterRef[] | null | undefined;
  kcMultiple: number;
}): AdaptiveOutcomes {
  const outcomes: AdaptiveOutcomes = {};
  const adaptiveKeyByStimulusKC = new Map<string, string>();
  const seenStimCountByClusterIndex = new Map<string, number>();
  if (Array.isArray(options.currentStimuliSet)) {
    for (const stim of options.currentStimuliSet) {
      const clusterKC = Number(stim?.clusterKC);
      const stimulusKC = stim?.stimulusKC;
      if (!Number.isFinite(clusterKC) || stimulusKC === undefined || stimulusKC === null || stimulusKC === '') continue;
      const clusterKey = String(clusterKC % options.kcMultiple);
      const stimIndex = seenStimCountByClusterIndex.get(clusterKey) || 0;
      const adaptiveKey = `${clusterKey}:${stimIndex}`;
      seenStimCountByClusterIndex.set(clusterKey, stimIndex + 1);
      adaptiveKeyByStimulusKC.set(String(stimulusKC), adaptiveKey);
      outcomes[adaptiveKey] = false;
    }
  }
  for (const historyRow of options.rows) {
    const stimulusKC = historyRow?.stimulusKC;
    if (stimulusKC === undefined || stimulusKC === null || stimulusKC === '') continue;
    const adaptiveKey = adaptiveKeyByStimulusKC.get(String(stimulusKC));
    if (adaptiveKey) outcomes[adaptiveKey] = historyRow.outcome === 'correct';
  }
  return outcomes;
}
