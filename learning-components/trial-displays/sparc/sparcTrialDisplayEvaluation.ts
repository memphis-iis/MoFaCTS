import type {
  SparcTrialResult,
} from './SparcTrialDisplayAdapter';

type SparcEvaluationOptions = {
  trimWhitespace?: boolean;
  caseNormalize?: boolean;
  mathNormalize?: boolean;
  allowScientificNotation?: boolean;
};

type SparcNodeIntentEvaluation = {
  readonly nodeId: string;
  readonly correct: boolean;
};

type SparcFeedbackMatch = {
  readonly sparcFeedbackId: string;
  readonly sparcFeedbackMessage?: string;
};

type SparcIntentExpectationLike = {
  readonly node?: string;
  readonly expected?: unknown;
  readonly acceptedValues?: readonly unknown[];
  readonly type?: string;
};

type SparcPathIntentExpectationLike = {
  readonly path?: string;
  readonly intentByNode?: readonly SparcIntentExpectationLike[];
};

export type SparcTrialDisplayEvaluationDisplay = {
  readonly response?: {
    readonly gradingMode?: string;
    readonly scoredNodes?: readonly string[];
    readonly intentByNode?: readonly SparcIntentExpectationLike[];
    readonly intentByPath?: readonly SparcPathIntentExpectationLike[];
    readonly evaluation?: {
      readonly trimWhitespace?: unknown;
      readonly caseNormalize?: unknown;
      readonly mathNormalize?: unknown;
      readonly allowScientificNotation?: unknown;
    };
  };
  readonly behaviorRefs?: Record<string, string>;
  readonly behavior?: {
    readonly feedback?: readonly Record<string, unknown>[];
  };
};

export type SparcTrialDisplayResponseEvaluation = {
  readonly isCorrect: boolean;
  readonly matchText: string;
  readonly sparcPath?: string;
  readonly sparcFeedbackId?: string;
  readonly sparcFeedbackMessage?: string;
};

export type SparcTrialDisplayResponseEvaluationParams = {
  readonly display: SparcTrialDisplayEvaluationDisplay;
  readonly result: SparcTrialResult;
};

function normalizeSparcComparableValue(
  value: unknown,
  options: SparcEvaluationOptions,
  typeHint?: string,
): unknown {
  if (typeHint === 'boolean' || typeof value === 'boolean') {
    return value === true || value === 'true';
  }

  let normalized = typeof value === 'string' ? value : String(value ?? '');
  if (options.trimWhitespace) {
    normalized = normalized.trim();
  }
  if (options.caseNormalize) {
    normalized = normalized.toLowerCase();
  }
  if (options.mathNormalize || options.allowScientificNotation || typeHint === 'scientific') {
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return normalized;
}

function sparcComparableValuesEqual(
  actual: unknown,
  expected: unknown,
  options: SparcEvaluationOptions,
  typeHint?: string,
): boolean {
  return normalizeSparcComparableValue(actual, options, typeHint)
    === normalizeSparcComparableValue(expected, options, typeHint);
}

function evaluateSparcIntent(
  intent: SparcIntentExpectationLike,
  submittedNodes: Record<string, unknown>,
  evaluationOptions: SparcEvaluationOptions,
): SparcNodeIntentEvaluation {
  const nodeId = String(intent.node || '');
  const actual = submittedNodes[nodeId];
  const acceptedValues = Array.isArray(intent.acceptedValues) && intent.acceptedValues.length > 0
    ? intent.acceptedValues
    : [intent.expected];
  return {
    nodeId,
    correct: acceptedValues.some((expected) => sparcComparableValuesEqual(
      actual,
      expected,
      evaluationOptions,
      intent.type,
    )),
  };
}

function buildSparcEvaluationOptions(
  response: SparcTrialDisplayEvaluationDisplay['response'],
): SparcEvaluationOptions {
  return {
    trimWhitespace: response?.evaluation?.trimWhitespace !== false,
    caseNormalize: response?.evaluation?.caseNormalize === true,
    mathNormalize: response?.evaluation?.mathNormalize === true,
    allowScientificNotation: response?.evaluation?.allowScientificNotation === true,
  };
}

function selectSparcPathEvaluation(
  response: SparcTrialDisplayEvaluationDisplay['response'],
  submittedNodes: Record<string, unknown>,
  evaluationOptions: SparcEvaluationOptions,
): {
  readonly path: string;
  readonly evaluations: readonly SparcNodeIntentEvaluation[];
} | null {
  const paths: readonly SparcPathIntentExpectationLike[] = Array.isArray(response?.intentByPath)
    ? response.intentByPath
    : [];
  let bestPath: {
    readonly path: string;
    readonly evaluations: readonly SparcNodeIntentEvaluation[];
    readonly correctCount: number;
  } | null = null;

  for (const pathEntry of paths) {
    const intents: readonly SparcIntentExpectationLike[] = Array.isArray(pathEntry.intentByNode)
      ? pathEntry.intentByNode
      : [];
    if (intents.length === 0) {
      continue;
    }
    const evaluations = intents.map((intent) => evaluateSparcIntent(
      intent,
      submittedNodes,
      evaluationOptions,
    ));
    const correctCount = evaluations.filter((evaluation) => evaluation.correct).length;
    if (!bestPath || correctCount > bestPath.correctCount) {
      bestPath = {
        path: String(pathEntry.path || ''),
        evaluations,
        correctCount,
      };
    }
  }

  return bestPath;
}

function flattenSparcIntentEvaluations(
  response: SparcTrialDisplayEvaluationDisplay['response'],
  submittedNodes: Record<string, unknown>,
  evaluationOptions: SparcEvaluationOptions,
): readonly SparcNodeIntentEvaluation[] {
  const intentByNode: readonly SparcIntentExpectationLike[] = Array.isArray(response?.intentByNode)
    ? response.intentByNode
    : [];
  const scoredNodeOrder = Array.isArray(response?.scoredNodes) && response.scoredNodes.length > 0
    ? response.scoredNodes
    : intentByNode.map((entry) => String(entry.node || '')).filter(Boolean);
  const intentMap = new Map(intentByNode.map((entry) => [String(entry.node || ''), entry]));
  return scoredNodeOrder.map((nodeId) => {
    const intent = intentMap.get(nodeId);
    if (!intent) {
      return {
        nodeId,
        correct: false,
      };
    }
    return evaluateSparcIntent(intent, submittedNodes, evaluationOptions);
  });
}

function selectionToNodeId(
  selection: unknown,
  behaviorRefs: Record<string, string> | undefined,
): string {
  const normalizedSelection = typeof selection === 'string' ? selection : '';
  return behaviorRefs?.[normalizedSelection] || normalizedSelection;
}

function feedbackConditionMatches(
  condition: Record<string, unknown>,
  submittedNodes: Record<string, unknown>,
  behaviorRefs: Record<string, string> | undefined,
  evaluationOptions: SparcEvaluationOptions,
): boolean {
  const nodeId = selectionToNodeId(condition.selection, behaviorRefs);
  if (!nodeId) {
    return false;
  }
  if (!('input' in condition)) {
    return nodeId in submittedNodes;
  }
  return sparcComparableValuesEqual(
    submittedNodes[nodeId],
    condition.input,
    evaluationOptions,
  );
}

function resolveSparcFeedbackMatch(
  display: SparcTrialDisplayEvaluationDisplay,
  result: SparcTrialResult,
  evaluationOptions: SparcEvaluationOptions,
): SparcFeedbackMatch | null {
  const feedback = display.behavior?.feedback;
  const submittedNodes = result.submittedNodes;
  if (!Array.isArray(feedback) || !submittedNodes) {
    return null;
  }
  const behaviorRefs = display.behaviorRefs;
  for (const entry of feedback) {
    const conditions: readonly unknown[] = Array.isArray(entry.matches)
      ? entry.matches
      : (entry.when && typeof entry.when === 'object' && !Array.isArray(entry.when)
          ? [entry.when]
          : []);
    if (!conditions.some((condition) => (
      condition
      && typeof condition === 'object'
      && !Array.isArray(condition)
      && feedbackConditionMatches(condition as Record<string, unknown>, submittedNodes, behaviorRefs, evaluationOptions)
    ))) {
      continue;
    }
    return {
      sparcFeedbackId: String(entry.id || ''),
      ...(typeof entry.message === 'string' ? { sparcFeedbackMessage: entry.message } : {}),
    };
  }
  return null;
}

export function evaluateSparcTrialDisplayResponse(
  params: SparcTrialDisplayResponseEvaluationParams,
): SparcTrialDisplayResponseEvaluation {
  const { display, result } = params;
  const response = display.response;
  if (!['node-intent', 'sai-path-intent', 'sai-dependency-intent'].includes(String(response?.gradingMode || ''))) {
    throw new Error(`[SPARC] Unsupported grading mode: ${String(response?.gradingMode || '')}`);
  }

  const evaluationOptions = buildSparcEvaluationOptions(response);
  const pathEvaluation = response?.gradingMode === 'sai-path-intent'
    ? selectSparcPathEvaluation(response, result.submittedNodes, evaluationOptions)
    : null;
  const evaluations = pathEvaluation?.evaluations
    ?? flattenSparcIntentEvaluations(response, result.submittedNodes, evaluationOptions);
  const outcomeBits = evaluations.map((evaluation) => evaluation.correct ? '1' : '0');
  const feedbackMatch = resolveSparcFeedbackMatch(display, result, evaluationOptions);

  return {
    isCorrect: outcomeBits.every((bit) => bit === '1'),
    matchText: outcomeBits.join(''),
    ...(pathEvaluation?.path ? { sparcPath: pathEvaluation.path } : {}),
    ...(feedbackMatch ? feedbackMatch : {}),
  };
}
