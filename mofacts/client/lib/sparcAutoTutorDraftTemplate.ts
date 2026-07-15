import { createSparcProgressiveScaffoldingRules } from '../../../learning-components/units/sparcsession/sparcProgressiveScaffoldingRules';

type JsonRecord = Record<string, unknown>;

export function buildCanonicalSparcAutoTutorProductionRules(): JsonRecord[] {
  return JSON.parse(JSON.stringify(createSparcProgressiveScaffoldingRules())) as JsonRecord[];
}

export const SPARC_AUTOTUTOR_INSTRUCTIONAL_CONTROLLER = Object.freeze({
  adapterId: 'sparc-autotutor-v1',
  policyId: 'progressive-scaffolding-v1',
  policyVersion: 1,
  parameters: {
    minimumProgress: 0.3,
    progressResponse: 'deescalate',
    nonAddressingResponse: 'hold',
    postAssertionResponse: 'cycle-to-pump',
  },
});

export const SPARC_AUTOTUTOR_CALCULATE_PROBABILITY =
  'p.y = -0.77 + .665 * pFunc.logitdec( p.overallOutcomeHistory.slice( Math.max(p.overallOutcomeHistory.length-60, 0),  p.overallOutcomeHistory.length),  .966)+ .51* (p.stimSuccessCount) + 11.1 * pFunc.recency(p.stimSecsSinceLastShown, .443) ; p.probability = 1.0 / (1.0 + Math.exp(-p.y)); return p';
