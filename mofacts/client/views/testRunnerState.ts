export type TdfExpressionFailure = Readonly<{
  tdfId: string;
  fieldPath: string;
}>;

export type TdfExpressionReadinessDetails = Readonly<{
  tdfCount: number;
  expressionCount: number;
  probabilityExpressionCount: number;
  adaptiveRuleCount: number;
  failureCount: number;
  failures: readonly TdfExpressionFailure[];
  omittedFailureCount: number;
}>;

export type ReadinessCheck = Readonly<{
  name: string;
  status: 'pass' | 'fail';
  message: string;
  details?: TdfExpressionReadinessDetails;
}>;

export type DeploymentReadinessResult = Readonly<{
  ok: boolean;
  generatedAt: string;
  checks: readonly ReadinessCheck[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function normalizeTdfExpressionDetails(value: unknown): TdfExpressionReadinessDetails {
  if (!isRecord(value)) {
    throw new Error('Deployment readiness returned invalid TDF expression details.');
  }
  const countFields = [
    'tdfCount',
    'expressionCount',
    'probabilityExpressionCount',
    'adaptiveRuleCount',
    'failureCount',
    'omittedFailureCount',
  ] as const;
  if (countFields.some((field) => !isNonNegativeSafeInteger(value[field]))) {
    throw new Error('Deployment readiness returned invalid TDF expression details.');
  }
  if (!Array.isArray(value.failures) || value.failures.length > 50) {
    throw new Error('Deployment readiness returned invalid TDF expression details.');
  }
  const boundedIdentifierPattern = /^[-A-Za-z0-9_.:[\]?]+$/;
  const failures = value.failures.map((failure) => {
    if (!isRecord(failure)) {
      throw new Error('Deployment readiness returned invalid TDF expression details.');
    }
    const { tdfId, fieldPath } = failure;
    if (
      typeof tdfId !== 'string'
      || tdfId.length === 0
      || tdfId.length > 120
      || !boundedIdentifierPattern.test(tdfId)
      || typeof fieldPath !== 'string'
      || fieldPath.length === 0
      || fieldPath.length > 120
      || !boundedIdentifierPattern.test(fieldPath)
    ) {
      throw new Error('Deployment readiness returned invalid TDF expression details.');
    }
    return { tdfId, fieldPath };
  });
  const failureCount = value.failureCount as number;
  const omittedFailureCount = value.omittedFailureCount as number;
  if (
    failureCount < failures.length
    || omittedFailureCount !== failureCount - failures.length
  ) {
    throw new Error('Deployment readiness returned invalid TDF expression details.');
  }
  return {
    tdfCount: value.tdfCount as number,
    expressionCount: value.expressionCount as number,
    probabilityExpressionCount: value.probabilityExpressionCount as number,
    adaptiveRuleCount: value.adaptiveRuleCount as number,
    failureCount,
    failures,
    omittedFailureCount,
  };
}

export function normalizeDeploymentReadinessResult(value: unknown): DeploymentReadinessResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new Error('Deployment readiness returned an invalid result envelope.');
  }
  const generatedAt = value.generatedAt instanceof Date
    ? value.generatedAt.toISOString()
    : value.generatedAt;
  if (typeof generatedAt !== 'string' || !generatedAt.trim()) {
    throw new Error('Deployment readiness returned an invalid result envelope.');
  }
  if (!Array.isArray(value.checks)) {
    throw new Error('Deployment readiness did not return a checks array.');
  }

  const checks = value.checks.map((check, index): ReadinessCheck => {
    if (
      !isRecord(check)
      || typeof check.name !== 'string'
      || (check.status !== 'pass' && check.status !== 'fail')
      || typeof check.message !== 'string'
    ) {
      throw new Error(`Deployment readiness check ${index + 1} is invalid.`);
    }
    const details = check.name === 'tdf.expressions' && check.details !== undefined
      ? normalizeTdfExpressionDetails(check.details)
      : undefined;
    return {
      name: check.name,
      status: check.status,
      message: check.message,
      ...(details === undefined ? {} : { details }),
    };
  });

  return {
    ok: value.ok,
    generatedAt,
    checks,
  };
}
