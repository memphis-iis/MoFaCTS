import {
  compileSafeBooleanExpression,
  type CompiledSafeBooleanExpression,
  type SafeExpressionLimits,
} from '../safe-expression/safeExpressionEngine';

export const ADAPTIVE_RULE_LIMITS: SafeExpressionLimits = Object.freeze({
  maxSourceBytes: 4 * 1024,
  maxAstNodes: 256,
  maxDepth: 32,
  maxSteps: 2_048,
  maxArrayElements: 256,
});

export type ParsedAdaptiveRuleAction = { clusterIndex: number; stimIndex: number };

export type CompiledAdaptiveRule = {
  readonly source: string;
  readonly fieldPath: string;
  readonly condition: string;
  readonly conditionExpression: string;
  readonly conditionProgram: CompiledSafeBooleanExpression;
  readonly outcomeNames: ReadonlySet<string>;
  readonly actionsText: string;
  readonly actions: readonly ParsedAdaptiveRuleAction[];
  readonly isCheckpoint: boolean;
  readonly when: number | null;
};

function parseActionToken(token: string, fieldPath: string): ParsedAdaptiveRuleAction {
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
  return Object.freeze({
    source: logicString,
    fieldPath,
    condition,
    conditionExpression: expression,
    conditionProgram,
    outcomeNames,
    actionsText,
    actions,
    isCheckpoint,
    when,
  });
}
