export type ReadinessCheck = Readonly<{
  name: string;
  status: 'pass' | 'fail';
  message: string;
}>;

export type DeploymentReadinessResult = Readonly<{
  ok: boolean;
  generatedAt: string;
  checks: readonly ReadinessCheck[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    return {
      name: check.name,
      status: check.status,
      message: check.message,
    };
  });

  return {
    ok: value.ok,
    generatedAt,
    checks,
  };
}
