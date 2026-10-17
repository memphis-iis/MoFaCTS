import { probabilityLogit as boundedLogit } from '../../models/adaptive-logistic/probabilityCalculation';
export { probabilityLogit as boundedLogit } from '../../models/adaptive-logistic/probabilityCalculation';
import type { SparcProductionRule, SparcProductionRuleFiring, SparcWorkingMemoryFact } from './sparcSessionContracts';
/** Probability-authored defaults. Initial expectancy is also its minimum. Selection uses natural logits. */
export const SPARC_COMPETITIVE_DEFAULTS = Object.freeze({
  initialExpectation: 0.2, initialOet: 0.2, temperature: 0.1,
});
export const SPARC_INSTRUCTIONAL_COMPETITION_MODULE = 'dialogue.instructional-competition';
const MODULE = SPARC_INSTRUCTIONAL_COMPETITION_MODULE;
const MODEL = 'instructional.modelObservation';
const OET = 'instructional.oet';
export function logistic(logit: number): number {
  if (!Number.isFinite(logit)) throw new Error('SPARC model logit must be finite');
  return 1 / (1 + Math.exp(-logit));
}
function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`SPARC competition requires finite ${label}`);
  return value;
}
function targetLogitSum(facts: readonly SparcWorkingMemoryFact[], targetKey: string): number {
  const observations = facts.filter((fact) => fact.factType === MODEL && fact.slots?.targetKey === targetKey);
  if (!observations.length) return boundedLogit(SPARC_COMPETITIVE_DEFAULTS.initialExpectation);
  if (observations.filter((fact) => fact.slots?.kind === 'initial').length !== 1) throw new Error('SPARC target history requires exactly one initial expectancy');
  return observations.reduce((sum, fact) => sum + finite(fact.slots?.delta, 'model observation'), 0);
}
export function targetExpectancy(facts: readonly SparcWorkingMemoryFact[], targetKey: string): number {
  return Math.max(boundedLogit(SPARC_COMPETITIVE_DEFAULTS.initialExpectation), targetLogitSum(facts, targetKey));
}
/** Seed and gains are ordinary durable facts, never a separately maintained total. */
export function competitiveAssessmentFacts(params: {
  facts: readonly SparcWorkingMemoryFact[]; scoreFacts: readonly SparcWorkingMemoryFact[];
  snapshotId: string; coverageThreshold: number; misconceptionThreshold: number;
}): SparcWorkingMemoryFact[] {
  const output: SparcWorkingMemoryFact[] = [];
  for (const fact of params.scoreFacts) {
    const expectation = fact.factType === 'learningTarget.score';
    if (!expectation && fact.factType !== 'diagnostic.misconceptionScore') continue;
    const targetKind = expectation ? 'expectation' : 'misconception';
    const targetId = String(expectation ? fact.slots?.clusterKC : fact.slots?.id);
    const targetKey = `${targetKind}:${targetId}`;
    const raw = finite(expectation ? fact.slots?.coverage : fact.slots?.supportStrength, 'evaluated target');
    const prior = params.facts.filter((entry) => entry.factType === MODEL && entry.slots?.targetKey === targetKey);
    // An untriggered misconception is not a competing target or an observation.
    if (!expectation && !prior.length && raw < params.misconceptionThreshold) continue;
    const logit = boundedLogit(expectation ? raw : 1 - raw);
    if (!prior.length) output.push({ factType: MODEL, factId: `${targetKey}:initial`,
      slots: { targetKey, targetKind, targetId, kind: 'initial', delta: boundedLogit(SPARC_COMPETITIVE_DEFAULTS.initialExpectation) } });
    output.push({ factType: MODEL, factId: `${params.snapshotId}:${targetKey}`,
      slots: { targetKey, targetKind, targetId, kind: 'gain', snapshotId: params.snapshotId,
        // Keep literal assessment changes in history. Subtract the raw sum, not
        // its floored selection value, so low assessments cannot accumulate debt.
        delta: logit - targetLogitSum(params.facts, targetKey) } });

    // Preserve the categorized assessment history contract. Selection uses fixed OET.
    const completed = expectation ? raw >= params.coverageThreshold : 1 - raw >= params.coverageThreshold;
    if (completed) output.push({ factType: OET, factId: targetKey,
      slots: { targetKey, logit: boundedLogit(SPARC_COMPETITIVE_DEFAULTS.initialOet) } });
  }
  return output;
}

export function competitiveCandidateFacts(facts: readonly SparcWorkingMemoryFact[], fixedTargetLogit: number): SparcWorkingMemoryFact[] {
  return facts.map((fact) => {
    if (fact.factType !== 'instructional.candidate') return fact;
    const key = String(fact.slots?.targetKey);
    const theta = targetExpectancy(facts, key);
    // Eligibility, ranking and cycle status belong to the common target projection.
    return { ...fact, slots: { ...fact.slots, expectancyLogit: theta, oetLogit: fixedTargetLogit } };
  });
}

export function boltzmannProbabilities(utilities: readonly number[], temperature: number): number[] {
  if (!Number.isFinite(temperature) || temperature <= 0 || utilities.some((value) => !Number.isFinite(value))) throw new Error('Boltzmann selection requires finite utilities and positive temperature');
  if (!utilities.length) return [];
  const maximum = Math.max(...utilities);
  const weights = utilities.map((value) => Math.exp((value - maximum) / temperature));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / total);
}

/** Control dependencies must yield one activation; only instructional alternatives compete. */
export function selectCompetitiveActivation(
  activations: readonly SparcProductionRuleFiring[], rules: readonly SparcProductionRule[], random: () => number = Math.random,
): SparcProductionRuleFiring | undefined {
  if (!activations.length) return undefined;
  const alternatives = activations.filter((activation) => rules.find((rule) => rule.id === activation.ruleId)?.module === MODULE);
  if (alternatives.length !== activations.length) {
    if (activations.length !== 1) throw new Error('Competitive control productions require unambiguous prerequisites');
    return activations[0];
  }
  if (new Set(alternatives.map((activation) => activation.bindings.targetKey)).size !== 1) {
    throw new Error('Competitive moves must share one instructional target');
  }
  // Sorting makes a given random draw reproducible across candidate enumeration orders;
  // it contributes no preference or extra probability to any alternative.
  alternatives.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || String(a.bindings.targetKey).localeCompare(String(b.bindings.targetKey)));
  const utilities = alternatives.map((activation) => -Math.abs(
    finite(activation.bindings.expectancyLogit, 'expectancy') + finite(activation.bindings.assistance, 'assistance') - finite(activation.bindings.oetLogit, 'OET')));
  const probabilities = boltzmannProbabilities(utilities, SPARC_COMPETITIVE_DEFAULTS.temperature);
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('Selection random draw must be in [0, 1)');
  let cumulative = 0;
  let index = probabilities.length - 1;
  for (let i = 0; i < probabilities.length; i++) { cumulative += probabilities[i]!; if (draw < cumulative) { index = i; break; } }
  const selected = alternatives[index]!;
  // These bindings are consumed by the selected production, including its durable decision.
  return { ...selected, bindings: { ...selected.bindings, utility: utilities[index], selectionProbability: probabilities[index], temperature: SPARC_COMPETITIVE_DEFAULTS.temperature } };
}
