import { expect } from 'chai';
import {
  mapPostprocessMetricsToProbabilityEstimate,
  sanitizePsynaptixPostprocessResult,
} from './psynaptixPostprocessMetrics';

describe('psynaptixPostprocessMetrics (#589)', function() {
  it('keeps allowlisted metric markers and drops answer-shaped blobs', function() {
    const sanitized = sanitizePsynaptixPostprocessResult({
      source: 'psynaptix-postprocess',
      signalId: 'eeg',
      formula: "mean(ch('Fz'))",
      metrics: {
        raw: { trials: 4, powerMethod: 'fft', secretDump: 'nope' },
        postprocessed: {
          aggregate: { mean: 0.72, se: 0.1, n: 4 },
          peaks: [{ label: 'P1', latencyMs: 100, amplitude: 3.2 }, { label: 'bad' }],
          userAnswer: 'Paris',
        },
      },
      userAnswer: 'drop-me',
      trialsDetail: [{ answer: 'x' }],
      modelInput: 'performance',
      modelMapping: { path: 'aggregate.mean', clamp01: true },
    });
    expect(sanitized).to.deep.equal({
      source: 'psynaptix-postprocess',
      signalId: 'eeg',
      formula: "mean(ch('Fz'))",
      metrics: {
        raw: { trials: 4, powerMethod: 'fft' },
        postprocessed: {
          aggregate: { mean: 0.72, se: 0.1, n: 4 },
          peaks: [{ label: 'P1', latencyMs: 100, amplitude: 3.2 }],
        },
      },
      modelInput: 'performance',
      modelMapping: { path: 'aggregate.mean', clamp01: true },
    });
    expect(JSON.stringify(sanitized)).to.not.include('Paris');
    expect(JSON.stringify(sanitized)).to.not.include('secretDump');
  });

  it('returns null for non-postprocess payloads', function() {
    expect(sanitizePsynaptixPostprocessResult({ trials: 3 })).to.equal(null);
    expect(sanitizePsynaptixPostprocessResult(null)).to.equal(null);
  });

  it('maps aggregate.mean to a probability estimate (pass-through + clamp)', function() {
    const metrics = {
      postprocessed: { aggregate: { mean: 1.5, se: 0.2, n: 3 } },
    };
    expect(mapPostprocessMetricsToProbabilityEstimate(metrics)).to.equal(1.5);
    expect(mapPostprocessMetricsToProbabilityEstimate(metrics, { clamp01: true })).to.equal(1);
    expect(mapPostprocessMetricsToProbabilityEstimate(
      { raw: { trials: 9 } },
      { path: 'raw.trials' },
    )).to.equal(9);
  });
});
