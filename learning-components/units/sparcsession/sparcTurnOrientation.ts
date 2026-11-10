import type { SparcInstructionalCandidateProjection } from './sparcInstructionalCandidates';
import type { SparcStateTransition, SparcWorkingMemoryFact, SparcProductionRule } from './sparcSessionContracts';
import { runSparcProductionRules } from './sparcProductionRuleEvaluator';
import { progressiveDialogueFacts } from './sparcWorkingMemoryFacts';

export type SparcOrientationTarget = { readonly kind: 'expectation' | 'misconception'; readonly id: string; readonly text: string };
export type SparcOrientationReason = 'introduction' | 'continue' | 'advance' | 'switch' | 'repair' | 'return' | 'completion';
export type SparcOrientationRequest = {
  readonly reason: SparcOrientationReason;
  readonly current?: SparcOrientationTarget;
  readonly previous?: SparcOrientationTarget;
  readonly progress: { readonly total: number; readonly met: number; readonly remaining: number };
  readonly achieved: readonly { readonly id: string; readonly text: string }[];
  readonly mentionRemaining: boolean;
  readonly lessonContext: unknown;
  readonly recentBridges: readonly string[];
  readonly adjacentFeedback: readonly string[];
  readonly selectionReason: string;
};
export type SparcSavedOrientation = {
  readonly request: SparcOrientationRequest;
  readonly bridge: string | null;
  readonly metTargetIds: readonly string[];
};
export type SparcOrientationGenerator = (request: SparcOrientationRequest) => string | Promise<string>;

/** A stable target can still have newly earned incidental milestones. */
export function sparcOrientationNeedsBridge(request: Pick<SparcOrientationRequest, 'reason' | 'achieved'>): boolean {
  return request.reason !== 'continue' || request.achieved.length > 0;
}

const literal = (value: unknown) => ({ type: 'literal' as const, value });
/** This phase never sees instructional alternatives and cannot alter selection or scores. */
const cases: readonly [SparcOrientationReason, Record<string, unknown>][] = [
  ['completion', { completed: true }],
  ['introduction', { completed: false, hasPrevious: false }],
  ['continue', { completed: false, hasPrevious: true, sameTarget: true }],
  ['repair', { completed: false, hasPrevious: true, sameTarget: false, currentKind: 'misconception' }],
  ['return', { completed: false, hasPrevious: true, sameTarget: false, currentKind: 'expectation', previousKind: 'misconception', returning: true }],
  ['switch', { completed: false, hasPrevious: true, sameTarget: false, currentKind: 'expectation', previousKind: 'misconception', returning: false }],
  ['advance', { completed: false, hasPrevious: true, sameTarget: false, currentKind: 'expectation', previousKind: 'expectation', previousMet: true }],
  ['switch', { completed: false, hasPrevious: true, sameTarget: false, currentKind: 'expectation', previousKind: 'expectation', previousMet: false }],
];
export const SPARC_ORIENTATION_RULES: readonly SparcProductionRule[] = cases.map(([reason, slots]) => ({
  id: `orientation.${reason}${reason === 'switch' ? `.from-${String(slots.previousKind)}` : ''}`, module: 'instruction.orientation',
  when: [{ factType: 'orientation.context', slots: Object.fromEntries(Object.entries(slots).map(([key, value]) => [key, literal(value)])) }],
  then: [{ type: 'assert-fact', fact: { factType: 'orientation.decision', slots: { reason: literal(reason) } } }],
}));

export function savedSparcOrientations(transitions: readonly SparcStateTransition[]): SparcSavedOrientation[] {
  return transitions.flatMap(entry => entry.writes.filter(write => write.key === 'instructionalOrientation')
    .map(write => write.value as SparcSavedOrientation));
}

export function createSparcOrientation(params: {
  facts: readonly SparcWorkingMemoryFact[];
  candidates: SparcInstructionalCandidateProjection;
  previous: readonly SparcStateTransition[];
  target?: { kind: SparcOrientationTarget['kind']; id: string };
  completed?: boolean;
  startup?: boolean;
  eventId?: string;
  selectionReason: string;
}): Omit<SparcSavedOrientation, 'bridge'> {
  const { facts, candidates } = params;
  const target = (kind: SparcOrientationTarget['kind'], id: string): SparcOrientationTarget => {
    const matches = facts.filter(fact => fact.factType === (kind === 'expectation' ? 'autotutor.expectation' : 'autotutor.misconception')
      && fact.slots?.[kind === 'expectation' ? 'clusterKC' : 'id'] === id);
    const text = matches[0]?.slots?.text;
    if (matches.length !== 1 || typeof text !== 'string' || !text.trim()) throw new Error('Orientation requires a unique authored target with text');
    return { kind, id, text: text.trim() };
  };
  const saved = savedSparcOrientations(params.previous);
  const last = saved.at(-1);
  const dialogue = progressiveDialogueFacts({ transitions: params.previous });
  const priorInstructions = [...(params.startup ? [] : facts), ...dialogue].filter(fact => fact.factType === 'dialogue.utterance' && fact.slots?.speaker === 'tutor'
    && ['learningTarget', 'misconception'].includes(String(fact.slots?.targetType))
    && fact.slots?.action !== 'instruction.feedback');
  const priorInstruction = priorInstructions.at(-1);
  // Off turns have no orientation snapshot. The actual last instruction still
  // owns the previous target and baseline when orientation is enabled again.
  const lastSnapshot = params.previous.filter(entry => entry.writes.some(write => write.key === 'instructionalOrientation')).at(-1);
  const priorSnapshot = !priorInstruction || lastSnapshot?.event.eventId === priorInstruction.slots?.eventId ? last : undefined;
  const previous = priorInstruction
    ? target(priorInstruction.slots?.targetType === 'learningTarget' ? 'expectation' : 'misconception', String(priorInstruction.slots?.targetId))
    : last?.request.current;
  const current = params.target ? target(params.target.kind, params.target.id) : undefined;
  if (!current && !params.completed) throw new Error('Orientation requires an accepted target or completion');
  const metTargetIds = [...new Set(candidates.expectations.filter(candidate => candidate.coverage >= candidate.goalValue).map(candidate => candidate.targetId))];
  // The previous instruction's snapshot spans menus and the current assessment.
  // Reconstruct it from score history when that instruction used off mode.
  let priorInstructionIndex = -1;
  for (const [index, entry] of params.previous.entries()) {
    if (entry.event.eventId === priorInstruction?.slots?.eventId) priorInstructionIndex = index;
  }
  const baseline = priorInstructionIndex >= 0 ? params.previous.slice(0, priorInstructionIndex + 1)
    : params.previous.filter(entry => entry.event.eventId !== params.eventId);
  const priorScores = new Map(baseline.flatMap(entry => entry.writes).map(write => write.value as SparcWorkingMemoryFact)
    .filter(fact => fact?.factType === 'learningTarget.score').map(fact => [String(fact.slots?.clusterKC), Number(fact.slots?.coverage)]));
  const priorMet = new Set(priorSnapshot?.metTargetIds ?? [...priorScores].filter(([, value]) => value >= candidates.coverageThreshold).map(([id]) => id));
  const achieved = metTargetIds.filter(id => !priorMet.has(id)).map(id => ({ id, text: target('expectation', id).text }));
  const priorExpectation = priorInstructions.filter(entry => entry.slots?.targetType === 'learningTarget').at(-1);
  const interrupted = priorExpectation ? target('expectation', String(priorExpectation.slots?.targetId))
    : saved.flatMap(entry => [entry.request.previous, entry.request.current]).filter(entry => entry?.kind === 'expectation').at(-1);
  const context: SparcWorkingMemoryFact = { factType: 'orientation.context', slots: {
    completed: params.completed === true, hasPrevious: Boolean(previous),
    sameTarget: Boolean(previous && current && previous.kind === current.kind && previous.id === current.id),
    currentKind: current?.kind, previousKind: previous?.kind,
    returning: Boolean(current && interrupted && current.id === interrupted.id),
    previousMet: Boolean(previous?.kind === 'expectation' && metTargetIds.includes(previous.id)),
  } };
  const execution = runSparcProductionRules({ facts: [context], rules: SPARC_ORIENTATION_RULES });
  const decisions = execution.facts.filter(fact => fact.factType === 'orientation.decision');
  if (decisions.length !== 1 || execution.firings.length !== 1) throw new Error('Orientation productions must select exactly one transition');
  const reason = decisions[0]!.slots!.reason as SparcOrientationReason;
  const total = new Set(candidates.expectations.map(candidate => candidate.targetId)).size;
  const progress = { total, met: metTargetIds.length, remaining: total - metTargetIds.length };
  return { metTargetIds, request: { reason, ...(current ? { current } : {}), ...(previous ? { previous } : {}), progress, achieved,
    mentionRemaining: reason === 'introduction' || reason === 'completion' || progress.met > priorMet.size,
    lessonContext: facts.find(fact => fact.factType === 'dialogue.source')?.slots,
    recentBridges: saved.flatMap(entry => entry.bridge ? [entry.bridge] : []).slice(-5),
    adjacentFeedback: facts.filter(fact => fact.factType === 'dialogue.utterance' && fact.slots?.action === 'instruction.feedback')
      .slice(-2).map(fact => String(fact.slots?.text)),
    selectionReason: params.selectionReason,
  } };
}
