/**
 * Psynaptix postprocess metrics → MoFaCTS history (#589).
 *
 * Allowlisted metric markers only (no answer text / raw event dumps).
 * Optional pass-through into probabilityEstimate for the adaptive model /
 * analytics CF column.
 */

export type PostprocessModelInput = 'performance' | 'none';

export type PostprocessModelMapping = {
  /** Dot-path into metrics; v1 default aggregate.mean */
  path?: 'aggregate.mean' | 'aggregate.se' | 'raw.trials';
  /** Clamp the mapped scalar into [0, 1] for probabilityEstimate. */
  clamp01?: boolean;
};

export type SanitizedPostprocessMetrics = {
  raw?: { trials?: number; powerMethod?: string };
  postprocessed?: {
    aggregate?: { mean?: number; se?: number; n?: number };
    peaks?: Array<{ label: string; latencyMs: number; amplitude: number }>;
    tracePoints?: number;
  };
};

export type PsynaptixPostprocessResult = {
  source: 'psynaptix-postprocess';
  signalId: string;
  formula: string;
  metrics: SanitizedPostprocessMetrics;
  modelInput?: PostprocessModelInput;
  modelMapping?: PostprocessModelMapping;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPsynaptixPostprocessResult(raw: unknown): raw is Record<string, unknown> {
  return isPlainObject(raw) && raw.source === 'psynaptix-postprocess';
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizePeaks(raw: unknown): Array<{ label: string; latencyMs: number; amplitude: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; latencyMs: number; amplitude: number }> = [];
  for (const entry of raw.slice(0, 32)) {
    if (!isPlainObject(entry)) continue;
    const label = typeof entry.label === 'string' ? entry.label.slice(0, 64) : '';
    const latencyMs = finiteNumber(entry.latencyMs);
    const amplitude = finiteNumber(entry.amplitude);
    if (!label || latencyMs === undefined || amplitude === undefined) continue;
    out.push({ label, latencyMs, amplitude });
  }
  return out;
}

function sanitizeRawBlock(raw: unknown): SanitizedPostprocessMetrics['raw'] | undefined {
  if (!isPlainObject(raw)) return undefined;
  const trials = finiteNumber(raw.trials);
  const powerMethod = typeof raw.powerMethod === 'string' ? raw.powerMethod.slice(0, 32) : undefined;
  if (trials === undefined && !powerMethod) return undefined;
  return {
    ...(trials !== undefined ? { trials } : {}),
    ...(powerMethod ? { powerMethod } : {}),
  };
}

function sanitizePostprocessedBlock(raw: unknown): SanitizedPostprocessMetrics['postprocessed'] | undefined {
  if (!isPlainObject(raw)) return undefined;
  const aggIn = isPlainObject(raw.aggregate) ? raw.aggregate : {};
  const mean = finiteNumber(aggIn.mean);
  const se = finiteNumber(aggIn.se);
  const n = finiteNumber(aggIn.n);
  const tracePoints = finiteNumber(raw.tracePoints);
  const peaks = sanitizePeaks(raw.peaks);
  if (mean === undefined && se === undefined && n === undefined && !peaks.length && tracePoints === undefined) {
    return undefined;
  }
  return {
    aggregate: {
      ...(mean !== undefined ? { mean } : {}),
      ...(se !== undefined ? { se } : {}),
      ...(n !== undefined ? { n } : {}),
    },
    peaks,
    ...(tracePoints !== undefined ? { tracePoints } : {}),
  };
}

/** Allowlist postprocess metrics; drop anything answer-/blob-shaped. */
export function sanitizePsynaptixPostprocessResult(raw: unknown): PsynaptixPostprocessResult | null {
  if (!isPsynaptixPostprocessResult(raw)) return null;
  const signalId = typeof raw.signalId === 'string' ? raw.signalId.trim().slice(0, 64) : '';
  const formula = typeof raw.formula === 'string' ? raw.formula.trim().slice(0, 512) : '';
  if (!signalId || !formula) return null;

  const metricsIn = isPlainObject(raw.metrics) ? raw.metrics : {};
  const metrics: SanitizedPostprocessMetrics = {};

  if (isPlainObject(metricsIn.raw) || isPlainObject(metricsIn.postprocessed)) {
    const rawBlock = sanitizeRawBlock(metricsIn.raw);
    const postBlock = sanitizePostprocessedBlock(metricsIn.postprocessed);
    if (rawBlock) metrics.raw = rawBlock;
    if (postBlock) metrics.postprocessed = postBlock;
  } else if (finiteNumber(metricsIn.trials) !== undefined || typeof metricsIn.powerMethod === 'string') {
    const rawBlock = sanitizeRawBlock(metricsIn);
    if (rawBlock) metrics.raw = rawBlock;
  } else {
    const postBlock = sanitizePostprocessedBlock(metricsIn);
    if (postBlock) metrics.postprocessed = postBlock;
  }

  const modelInput: PostprocessModelInput =
    raw.modelInput === 'performance' ? 'performance' : 'none';
  const mappingIn = isPlainObject(raw.modelMapping) ? raw.modelMapping : {};
  const path = mappingIn.path === 'aggregate.se' || mappingIn.path === 'raw.trials'
    ? mappingIn.path
    : 'aggregate.mean';
  const modelMapping: PostprocessModelMapping = {
    path,
    clamp01: mappingIn.clamp01 === true,
  };

  return {
    source: 'psynaptix-postprocess',
    signalId,
    formula,
    metrics,
    modelInput,
    modelMapping,
  };
}

/** Resolve a scalar from sanitized metrics for the probability / CF column. */
export function mapPostprocessMetricsToProbabilityEstimate(
  metrics: SanitizedPostprocessMetrics,
  mapping: PostprocessModelMapping = {},
): number | undefined {
  const path = mapping.path ?? 'aggregate.mean';
  let value: number | undefined;
  if (path === 'raw.trials') {
    value = finiteNumber(metrics.raw?.trials);
  } else if (path === 'aggregate.se') {
    value = finiteNumber(metrics.postprocessed?.aggregate?.se);
  } else {
    value = finiteNumber(metrics.postprocessed?.aggregate?.mean);
  }
  if (value === undefined) return undefined;
  if (mapping.clamp01) {
    return Math.min(1, Math.max(0, value));
  }
  return value;
}
