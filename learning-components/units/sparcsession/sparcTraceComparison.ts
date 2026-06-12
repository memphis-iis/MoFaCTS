import type {
  SparcModelTraceComparison,
  SparcReferenceTraceStep,
  SparcTraceStep,
} from './sparcSessionContracts';

export type SparcTraceMismatchKind =
  | 'length'
  | 'production-rule'
  | 'production-rule-name'
  | 'production-set'
  | 'action'
  | 'outcome'
  | 'stimulus-kc'
  | 'response-kc';

export type SparcTraceMismatch = {
  readonly kind: SparcTraceMismatchKind;
  readonly index: number;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly message: string;
};

export type SparcTraceComparisonResult = {
  readonly equivalent: boolean;
  readonly mismatches: readonly SparcTraceMismatch[];
};

function valuesMatch(expected: unknown, actual: unknown): boolean {
  return expected === undefined || String(expected) === String(actual);
}

function compareStep(
  referenceStep: SparcReferenceTraceStep,
  sparcStep: SparcTraceStep,
  index: number,
): SparcTraceMismatch[] {
  const mismatches: SparcTraceMismatch[] = [];
  if (referenceStep.productionRuleId !== sparcStep.productionRuleId) {
    mismatches.push({
      kind: 'production-rule',
      index,
      expected: referenceStep.productionRuleId,
      actual: sparcStep.productionRuleId,
      message: `Trace step ${index} production rule differs`,
    });
  }
  if (!valuesMatch(referenceStep.productionRuleName, sparcStep.details?.productionRuleName)) {
    mismatches.push({
      kind: 'production-rule-name',
      index,
      expected: referenceStep.productionRuleName,
      actual: sparcStep.details?.productionRuleName,
      message: `Trace step ${index} production rule name differs`,
    });
  }
  if (!valuesMatch(referenceStep.productionSet, sparcStep.details?.productionSet)) {
    mismatches.push({
      kind: 'production-set',
      index,
      expected: referenceStep.productionSet,
      actual: sparcStep.details?.productionSet,
      message: `Trace step ${index} production set differs`,
    });
  }
  if (referenceStep.actionId !== sparcStep.actionId) {
    mismatches.push({
      kind: 'action',
      index,
      expected: referenceStep.actionId,
      actual: sparcStep.actionId,
      message: `Trace step ${index} action differs`,
    });
  }
  if (referenceStep.outcome !== sparcStep.outcome) {
    mismatches.push({
      kind: 'outcome',
      index,
      expected: referenceStep.outcome,
      actual: sparcStep.outcome,
      message: `Trace step ${index} outcome differs`,
    });
  }
  if (!valuesMatch(referenceStep.stimulusKC, sparcStep.details?.stimulusKC)) {
    mismatches.push({
      kind: 'stimulus-kc',
      index,
      expected: referenceStep.stimulusKC,
      actual: sparcStep.details?.stimulusKC,
      message: `Trace step ${index} stimulus KC differs`,
    });
  }
  if (!valuesMatch(referenceStep.responseKC, sparcStep.details?.responseKC)) {
    mismatches.push({
      kind: 'response-kc',
      index,
      expected: referenceStep.responseKC,
      actual: sparcStep.details?.responseKC,
      message: `Trace step ${index} response KC differs`,
    });
  }
  return mismatches;
}

export function compareSparcModelTrace(
  comparison: SparcModelTraceComparison,
): SparcTraceComparisonResult {
  const mismatches: SparcTraceMismatch[] = [];
  const expectedLength = comparison.referenceTrace.length;
  const actualLength = comparison.sparcTrace.length;
  if (expectedLength !== actualLength) {
    mismatches.push({
      kind: 'length',
      index: Math.min(expectedLength, actualLength),
      expected: expectedLength,
      actual: actualLength,
      message: 'SPARC trace length differs from reference trace length',
    });
  }

  const comparableLength = Math.min(expectedLength, actualLength);
  for (let index = 0; index < comparableLength; index += 1) {
    const referenceStep = comparison.referenceTrace[index];
    const sparcStep = comparison.sparcTrace[index];
    if (!referenceStep || !sparcStep) {
      throw new Error(`Trace comparison missing step ${index}`);
    }
    mismatches.push(...compareStep(referenceStep, sparcStep, index));
  }

  return {
    equivalent: mismatches.length === 0,
    mismatches,
  };
}

export function assertSparcModelTraceEquivalent(
  comparison: SparcModelTraceComparison,
): void {
  const result = compareSparcModelTrace(comparison);
  if (result.equivalent) {
    return;
  }
  throw new Error(result.mismatches.map((mismatch) => mismatch.message).join('; '));
}
