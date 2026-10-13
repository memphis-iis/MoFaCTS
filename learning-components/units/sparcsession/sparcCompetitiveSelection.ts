import { probabilityLogit as boundedLogit } from '../../models/adaptive-logistic/probabilityCalculation';
export { probabilityLogit as boundedLogit } from '../../models/adaptive-logistic/probabilityCalculation';
import type { SparcProductionRule, SparcProductionRuleFiring, SparcWorkingMemoryFact } from './sparcSessionContracts';
import { requireActiveSparcMoveDefinition } from './sparcMoveDefinitions';
import { createSparcProgressiveScaffoldingRules, decisionEffects, instructionalTargetConditions, SPARC_AUTOTUTOR_GENERATE_ACTION } from './sparcProgressiveScaffoldingRules';

/** Probability-authored defaults. Initial expectancy is also its minimum. Selection uses natural logits. */
export const SPARC_COMPETITIVE_DEFAULTS = Object.freeze({
  initialExpectation: 0.2, initialOet: 0.2, maximumOet: 0.8, temperature: 0.1,
});
export const SPARC_ADVANCE_OET_ACTION = 'instruction.advance-oet';
export const SPARC_COMPETITIVE_STOP_ACTION = 'instruction.stop';
export const SPARC_INSTRUCTIONAL_COMPETITION_MODULE = 'dialogue.instructional-competition';
const MODULE = SPARC_INSTRUCTIONAL_COMPETITION_MODULE;
const MODEL = 'instructional.modelObservation';
const OET = 'instructional.oet';
const COMPETITIVE_MOVES = ['pump', 'prompt', 'prompt-supported', 'hint', 'assertion'] as const;
const literal = (value: unknown) => ({ type: 'literal' as const, value });
const variable = (name: string) => ({ type: 'variable' as const, name });
const bind = (variable: string) => ({ type: 'bind' as const, variable });
const bound = (variable: string) => ({ type: 'bound' as const, variable });

export function logistic(logit: number): number {
  if (!Number.isFinite(logit)) throw new Error('SPARC model logit must be finite');
  return 1 / (1 + Math.exp(-logit));
}
export function advanceOet(logit: number, increment: number): number {
  if (!Number.isFinite(increment) || increment < 0) throw new Error('OET increment must be a nonnegative probability increment');
  return boundedLogit(Math.min(SPARC_COMPETITIVE_DEFAULTS.maximumOet, logistic(logit) + increment));
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
export function targetOet(facts: readonly SparcWorkingMemoryFact[], targetKey: string): number {
  const fact = facts.find((entry) => entry.factType === OET && entry.slots?.targetKey === targetKey);
  return fact ? finite(fact.slots?.logit, 'OET') : boundedLogit(SPARC_COMPETITIVE_DEFAULTS.initialOet);
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
    const completed = expectation ? raw >= params.coverageThreshold : 1 - raw >= params.coverageThreshold;
    if (completed) output.push({ factType: OET, factId: targetKey,
      slots: { targetKey, logit: boundedLogit(SPARC_COMPETITIVE_DEFAULTS.initialOet) } });
  }
  return output;
}

export function competitiveCandidateFacts(facts: readonly SparcWorkingMemoryFact[], fixedTargetLogit?: number): SparcWorkingMemoryFact[] {
  return facts.map((fact) => {
    if (fact.factType !== 'instructional.candidate') return fact;
    const key = String(fact.slots?.targetKey);
    const theta = targetExpectancy(facts, key);
    // Eligibility, ranking and cycle status belong to the common target projection.
    return { ...fact, slots: { ...fact.slots, expectancyLogit: theta, oetLogit: fixedTargetLogit ?? targetOet(facts, key) } };
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

export function createSparcCompetitiveRules(): readonly SparcProductionRule[] {
  const original = createSparcProgressiveScaffoldingRules();
  const response = { factType: 'interface-event', slots: { eventType: literal('response-submitted'), eventId: bind('snapshotId') } };
  const assessed = { factType: 'instructional.assessmentSnapshot', slots: { snapshotId: bound('snapshotId') } };
  const undecided = { type: 'not' as const, pattern: { factType: 'instructional.decision', slots: { snapshotId: bound('snapshotId') } } };
  const contentQuestion = { factType: 'dialogue.learnerQuestion', slots: { contentFocused: literal(true) } };
  const outOfScope = { factType: 'dialogue.learnerQuestion', slots: { contentFocused: literal(false) } };
  const modifier = { factType: 'dialogue.responseModifier' };
  const ready = [{ type: 'not' as const, pattern: outOfScope }, { type: 'any' as const, conditions: [
    { type: 'not' as const, pattern: contentQuestion }, modifier,
  ] }];
  const control = original.filter((rule) => ['dialogue.response.evaluate', 'dialogue.question.defer', 'dialogue.question.scope-refusal'].includes(rule.id))
    .map(({ salience: _salience, ...rule }) => rule.id === 'dialogue.question.defer'
      ? { ...rule, when: [...rule.when, { type: 'not' as const, pattern: modifier }] } : rule);
  const instruction = COMPETITIVE_MOVES.flatMap((move) => (['expectation', 'misconception'] as const).flatMap((kind) => {
    const transitions = kind === 'expectation' ? ['start', 'continue'] as const : ['start', 'continue', 'interrupt'] as const;
    return transitions.map((transition): SparcProductionRule => {
    // Retain the existing start IDs so already accepted decisions can finish replay.
    const id = `instruction.competitive.${kind}.${transition === 'start' ? '' : `${transition}.`}${move}`;
    const effects = decisionEffects({ targetKind: kind, action: move, stage: move === 'prompt-supported' ? 'PROMPT' : move.toUpperCase(), transition, sourceRuleId: id, reason: 'oet-distance', startsCycle: transition !== 'continue' });
    return { id, module: MODULE, when: [response, assessed, undecided, ...ready,
      ...instructionalTargetConditions(kind, transition),
      { factType: 'instructional.candidate', slots: { snapshotId: bound('snapshotId'), targetKind: literal(kind), eligible: literal(true),
        targetId: bound('targetId'), targetKey: bound('targetKey'), expectancyLogit: bind('expectancyLogit'), oetLogit: bind('oetLogit') } },
      { factType: 'instructional.move', slots: { action: literal(move), assistance: bind('assistance') } },
      { factType: 'session.turnState', slots: { turnCount: bind('turnNumber') } },
    ], then: [...effects.slice(0, -1).map((effect) => effect.type === 'assert-fact' && effect.fact.factType === 'instructional.decision'
      ? { ...effect, fact: { ...effect.fact, slots: { ...effect.fact.slots, expectancyLogit: variable('expectancyLogit'), assistance: variable('assistance'), oetLogit: variable('oetLogit'), utility: variable('utility'), selectionProbability: variable('selectionProbability'), temperature: variable('temperature') } } } : effect),
      { type: 'invoke-action', actionId: SPARC_ADVANCE_OET_ACTION, args: { targetKey: variable('targetKey'), increment: literal(0.2) } },
      { type: 'invoke-action', actionId: SPARC_AUTOTUTOR_GENERATE_ACTION },
    ] };
    });
  }));
  return [...control, ...instruction, { id: 'instruction.competitive.stop', when: [response, assessed, undecided, ...ready,
    { type: 'not', pattern: { factType: 'instructional.candidate', slots: { snapshotId: bound('snapshotId'), eligible: literal(true) } } },
  ], then: [{ type: 'invoke-action', actionId: SPARC_COMPETITIVE_STOP_ACTION }] }];
}

export function competitiveMoveFacts(): SparcWorkingMemoryFact[] {
  return COMPETITIVE_MOVES
    .map((action) => ({ factType: 'instructional.move', slots: { action, assistance: requireActiveSparcMoveDefinition(action).assistance } }));
}
