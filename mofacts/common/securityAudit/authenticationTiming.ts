import { AUTHENTICATION_COMPARISON_POLICY as policy } from './verificationCatalog.ts';

export type AuthenticationTimingMetric = Readonly<{
  existingMedianMs: number; missingMedianMs: number; differentialMs: number;
  approvedBoundMs: number; dominantDirectionCount: number; requiredDirectionCount: number;
}>;
export type AuthenticationTimingStatus = 'PASS' | 'FAIL' | 'ERROR';
const invalid = (): never => { throw new Error('Invalid authentication timing proof'); };

export function authenticationTimingMetricStatus(metric: AuthenticationTimingMetric, family: 'login' | 'reset', sampleCount: number): AuthenticationTimingStatus {
  const definition = policy[family];
  if (!definition || !Number.isSafeInteger(sampleCount) || sampleCount < definition.sampleCount
      || Object.values(metric).some(value => !Number.isFinite(value) || value < 0)
      || !Number.isSafeInteger(metric.dominantDirectionCount) || metric.dominantDirectionCount > sampleCount
      || metric.requiredDirectionCount !== Math.ceil(sampleCount * policy.directionFraction)
      || metric.differentialMs !== Math.abs(metric.existingMedianMs - metric.missingMedianMs)
      || metric.approvedBoundMs !== Math.max(definition.minimumBoundMs,
        Math.min(metric.existingMedianMs, metric.missingMedianMs) * definition.relativeBound)) invalid();
  return metric.differentialMs <= metric.approvedBoundMs ? 'PASS'
    : metric.dominantDirectionCount >= metric.requiredDirectionCount ? 'FAIL' : 'ERROR';
}

export function authenticationTimingStatus(login: AuthenticationTimingStatus, reset: AuthenticationTimingStatus): AuthenticationTimingStatus {
  return login === 'FAIL' || reset === 'FAIL' ? 'FAIL' : login === 'ERROR' || reset === 'ERROR' ? 'ERROR' : 'PASS';
}

export function authenticationTimingMetric(existing: readonly number[], missing: readonly number[], family: 'login' | 'reset') {
  if (!Object.hasOwn(policy, family) || !['login', 'reset'].includes(family)
      || !Array.isArray(existing) || !Array.isArray(missing) || existing.length !== missing.length
      || existing.length < policy[family].sampleCount
      || [...existing, ...missing].some(value => !Number.isFinite(value) || value < 0)) invalid();
  const median = (values: readonly number[]) => {
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  };
  const existingMedianMs = median(existing), missingMedianMs = median(missing);
  const directions = existing.map((value, index) => Math.sign(value - missing[index]!));
  const metric = { existingMedianMs, missingMedianMs,
    differentialMs: Math.abs(existingMedianMs - missingMedianMs),
    approvedBoundMs: Math.max(policy[family].minimumBoundMs,
      Math.min(existingMedianMs, missingMedianMs) * policy[family].relativeBound),
    dominantDirectionCount: Math.max(directions.filter(value => value > 0).length, directions.filter(value => value < 0).length),
    requiredDirectionCount: Math.ceil(existing.length * policy.directionFraction) };
  return { ...metric, status: authenticationTimingMetricStatus(metric, family, existing.length) };
}
