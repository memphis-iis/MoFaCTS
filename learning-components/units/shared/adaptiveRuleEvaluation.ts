import {
  compileSafeBooleanExpression,
  type CompiledSafeBooleanExpression,
  type SafeExpressionLimits,
} from '../../safe-expression/safeExpressionEngine';

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

export const ADAPTIVE_RULE_LIMITS: SafeExpressionLimits = Object.freeze({
  maxSourceBytes: 4 * 1024,
  maxAstNodes: 256,
  maxDepth: 32,
  maxSteps: 2_048,
  maxArrayElements: 256,
});

type ParsedAction = { clusterIndex: number; stimIndex: number };
export type CompiledAdaptiveRule = {
  readonly source: string;
  readonly fieldPath: string;
  readonly condition: string;
  readonly conditionExpression: string;
  readonly conditionProgram: CompiledSafeBooleanExpression;
  readonly outcomeNames: ReadonlySet<string>;
  readonly actionsText: string;
  readonly actions: readonly ParsedAction[];
  readonly isCheckpoint: boolean;
  readonly when: number | null;
};

function parseActionToken(token: string, fieldPath: string): ParsedAction {
  const match = /^C(\d+)S(\d+)$/.exec(token.trim());
  if (!match) throw new Error(`${fieldPath}: invalid adaptive action "${token.trim()}"; expected C<cluster>S<stimulus>`);
  const clusterIndex = Number(match[1]);
  const stimIndex = Number(match[2]);
  if (!Number.isSafeInteger(clusterIndex) || !Number.isSafeInteger(stimIndex)) {
    throw new Error(`${fieldPath}: adaptive action indices must be safe non-negative integers`);
  }
  return { clusterIndex, stimIndex };
}

function normalizeCondition(condition: string): { expression: string; outcomeNames: Set<string> } {
  const outcomeNames = new Set(condition.match(/\bC\d+S\d+\b/g) || []);
  const expression = condition
    .replace(/\bNOT\b/gi, '!')
    .replace(/\bAND\b/gi, '&&')
    .replace(/\bOR\b/gi, '||');
  return { expression, outcomeNames };
}

export function compileAdaptiveRule(logicString: string, fieldPath = 'adaptiveLogic'): CompiledAdaptiveRule {
  if (typeof logicString !== 'string' || !logicString.trim()) throw new Error(`${fieldPath}: adaptive rule must be a non-empty string`);
  if (new TextEncoder().encode(logicString).length > ADAPTIVE_RULE_LIMITS.maxSourceBytes) {
    throw new Error(`${fieldPath}: adaptive rule exceeds ${ADAPTIVE_RULE_LIMITS.maxSourceBytes} bytes`);
  }
  const outerMatch = /^\s*IF\s+([\s\S]+?)\s+THEN\s+([\s\S]+?)\s*$/i.exec(logicString);
  if (!outerMatch) throw new Error(`${fieldPath}: expected IF <condition> THEN [AT <seconds>] [CHECKPOINT] <action>`);
  const condition = outerMatch[1]!.trim();
  const tail = outerMatch[2]!.trim();
  const actionPattern = '(\\(?C\\d+S\\d+(?:\\s*,\\s*C\\d+S\\d+)*\\)?)';
  const prefixPattern = new RegExp(`^AT\\s+(\\d+(?:\\.\\d+)?)\\s+(?:(CHECKPOINT)\\s+)?${actionPattern}$`, 'i');
  const suffixPattern = new RegExp(`^(?:(CHECKPOINT)\\s+)?${actionPattern}(?:\\s+AT\\s+(\\d+(?:\\.\\d+)?))?$`, 'i');
  const prefixMatch = prefixPattern.exec(tail);
  const suffixMatch = prefixMatch ? null : suffixPattern.exec(tail);
  if (!prefixMatch && !suffixMatch) throw new Error(`${fieldPath}: invalid action; expected [AT <seconds>] [CHECKPOINT] C<cluster>S<stimulus> list`);
  const whenText = prefixMatch?.[1] ?? suffixMatch?.[3];
  const when = whenText === undefined ? null : Number(whenText);
  const isCheckpoint = Boolean(prefixMatch?.[2] ?? suffixMatch?.[1]);
  const actionsText = (prefixMatch?.[3] ?? suffixMatch?.[2] ?? '').trim();
  if (isCheckpoint && when === null) throw new Error(`${fieldPath}: CHECKPOINT requires an AT time`);
  if (when !== null && (!Number.isFinite(when) || when < 0)) throw new Error(`${fieldPath}: AT time must be a finite non-negative number`);

  let actionBody = actionsText;
  if (actionsText.startsWith('(') || actionsText.endsWith(')')) {
    if (!/^\([^()]+\)$/.test(actionsText)) throw new Error(`${fieldPath}: action list must contain one balanced parenthesized list`);
    actionBody = actionsText.slice(1, -1);
  }
  const actionTokens = actionBody.split(',').map((token) => token.trim());
  if (actionTokens.some((token) => !token)) throw new Error(`${fieldPath}: adaptive action list contains an empty action`);
  if (actionTokens.length > ADAPTIVE_RULE_LIMITS.maxArrayElements) {
    throw new Error(`${fieldPath}: adaptive rule exceeds ${ADAPTIVE_RULE_LIMITS.maxArrayElements} scheduled actions`);
  }
  const actions = actionTokens.map((token) => parseActionToken(token, fieldPath));
  const { expression, outcomeNames } = normalizeCondition(condition);
  const conditionProgram = compileSafeBooleanExpression(expression, outcomeNames, `${fieldPath}.condition`, ADAPTIVE_RULE_LIMITS);
  return Object.freeze({ source: logicString, fieldPath, condition, conditionExpression: expression,
    conditionProgram, outcomeNames, actionsText, actions, isCheckpoint, when });
}

const LEGACY_ADAPTIVE_OPERATORS: Record<string, string> = { NOT: '!', AND: '&&', OR: '||' };
const LEGACY_ADAPTIVE_MATH_OPERATORS = '+-*/%()=';

function parseLegacyClusterStimToken(token: string, fieldName: string): ParsedAction {
  if (!token.startsWith('C')) throw new Error(`Invalid ${fieldName}: ${token}`);
  const [, tokenBody = ''] = token.split('C');
  const [clusterPart = '', stimulusPart = ''] = tokenBody.split('S');
  const clusterIndex = parseInt(clusterPart);
  const stimIndex = parseInt(stimulusPart);
  if (!Number.isInteger(clusterIndex) || !Number.isInteger(stimIndex)) throw new Error(`Invalid ${fieldName}: ${token}`);
  return { clusterIndex, stimIndex };
}

function translateLegacyConditionToken(token: string, adaptiveOutcomes: AdaptiveOutcomes): string {
  if (LEGACY_ADAPTIVE_OPERATORS[token]) return LEGACY_ADAPTIVE_OPERATORS[token];
  if (token.toLowerCase() === 'true') return 'true';
  if (token.toLowerCase() === 'false') return 'false';
  if (token.startsWith('C')) {
    const { clusterIndex, stimIndex } = parseLegacyClusterStimToken(token, 'token');
    return String(adaptiveOutcomes[`${clusterIndex}:${stimIndex}`] ?? false);
  }
  if (Number.isInteger(parseInt(token))) return token;
  let expression = '';
  for (const char of token) {
    if (LEGACY_ADAPTIVE_MATH_OPERATORS.includes(char) || Number.isInteger(parseInt(char))) expression += char;
    else throw new Error(`Invalid token: ${token}`);
  }
  return expression;
}

function parseLegacyActions(actions: string, isCheckpoint: boolean, when: number | null) {
  const schedule: AdaptiveRuleScheduleItem[] = [];
  const questions: number[] = [];
  const checkpoints: AdaptiveRuleCheckpoint[] = [];
  const tokens = actions.includes('(')
    ? actions.substring(actions.indexOf('(') + 1, actions.indexOf(')')).split(',')
    : [actions];
  for (const token of tokens) {
    const action = parseLegacyClusterStimToken(token, 'action');
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
  // Stage 1 validates at runtime loading while retaining the established
  // evaluator until the live compatibility inventory permits Stage 2.
  compileAdaptiveRule(logicString);
  const [, whenSegment = ''] = logicString.split('AT');
  const when = logicString.includes('AT') ? parseInt(whenSegment.trim()) : null;
  const isCheckpoint = logicString.includes('CHECKPOINT');
  const parts = logicString.replace('IF', '').replace('AT', '').replace('CHECKPOINT', '').split('THEN');
  const condition = (parts[0] ?? '').trim();
  const actions = (parts[1] ?? '').trim();
  if (!condition || !actions) return { condition, action: actions, conditionResult: false };
  const conditionExpression = condition.split(' ')
    .map((token) => translateLegacyConditionToken(token, adaptiveOutcomes)).join('');
  const conditionFunction: Function = new Function(`return ${conditionExpression}`);
  const conditionResult = Boolean(conditionFunction());
  if (!conditionResult) {
    return { condition, conditionExpression, actions, conditionResult: false };
  }
  const parsed = parseLegacyActions(actions, isCheckpoint, when);
  return { condition, conditionExpression, actions, conditionResult: true, ...parsed, when };
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
