import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import { SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY } from '../../trial-displays/sparc/sparcProgressiveNodes';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import { createSparcLearnerResponseScoreFacts, type SparcLearnerResponseScoringResult } from './sparcLearnerResponseScoring';
import { auditSparcMoveSelection, type SparcMoveSelectionAudit } from './sparcMoveSelectionAudit';
import { createSparcDialogueTurnTransition, requireBoundedSparcDialogueMessage, type SparcDialogueTurnNodeOptions } from './sparcDialogueTurnNodes';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import type { SparcReplayState } from './sparcStateReplay';
import type { SparcInstructionalCandidateOptions } from './sparcInstructionalCandidates';
import type { SparcAutoTutorInstructionalProjection } from './sparcInstructionalControl';
import { requireSparcInstructionalAdapter } from './sparcInstructionalAdapterRegistry';
import { createSparcUtteranceRequestFromFacts, type SparcUtteranceRequest } from './sparcUtteranceRequest';
import { buildSparcWorkingMemoryFacts, progressiveDialogueFacts } from './sparcWorkingMemoryFacts';
import { runSparcProductionRulesWithActions } from './sparcProductionRuleEvaluator';
import { createProductionRuleTransition } from './sparcProductionRuleCommit';
import { SPARC_AUTOTUTOR_EVALUATE_ACTION, SPARC_AUTOTUTOR_GENERATE_ACTION } from './sparcProgressiveScaffoldingRules';
import type {
  SparcAuthoredDocument, SparcCanonicalHistoryRecord, SparcInterfaceEvent,
  SparcStateTransition, SparcWorkingMemoryFact, SparcProductionRuleExecution,
  SparcProductionActionResult,
} from './sparcSessionContracts';

export type SparcGeneratedUtterance = string | { readonly text: string };
export type SparcUtteranceGenerator = (request: SparcUtteranceRequest) => Promise<SparcGeneratedUtterance> | SparcGeneratedUtterance;

export type SparcAutoTutorRuleTurnParams = {
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly problemStatement: string;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly scoreLearnerResponse: () => SparcLearnerResponseScoringResult | Promise<SparcLearnerResponseScoringResult>;
  readonly candidateOptions?: SparcInstructionalCandidateOptions;
  readonly maxProductionRuleCycles?: number;
  readonly generateTutorUtterance: SparcUtteranceGenerator;
  readonly dialogueNodeOptions?: SparcDialogueTurnNodeOptions;
};

type Assessment = {
  readonly instructionalProjection: SparcAutoTutorInstructionalProjection;
  readonly derivedFacts: readonly SparcWorkingMemoryFact[];
};

export type SparcAutoTutorRuleTurnResult = {
  readonly execution: SparcProductionRuleExecution;
  readonly assessment: Assessment;
  readonly learnerResponseScoreFacts: readonly SparcWorkingMemoryFact[];
  readonly moveSelectionAudit: SparcMoveSelectionAudit;
  readonly utteranceRequest: SparcUtteranceRequest;
  readonly tutorText: string;
  readonly transition: SparcStateTransition;
  readonly historyRecord?: SparcCanonicalHistoryRecord;
};

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function learnerTextFromEvent(event: SparcInterfaceEvent): string {
  if (isRecord(event.payload)) {
    const input = event.payload.input;
    if (typeof input === 'string' && input.trim()) {
      return requireBoundedSparcDialogueMessage(input, 'SPARC learner dialogue text');
    }
    const responseValue = event.payload.responseValue;
    if (typeof responseValue === 'string' && responseValue.trim()) {
      return requireBoundedSparcDialogueMessage(responseValue, 'SPARC learner dialogue text');
    }
  }
  throw new Error('SPARC dialogue turn requires event.payload.input or event.payload.responseValue');
}

function tutorTextFromGeneratedUtterance(value: SparcGeneratedUtterance): string {
  if (typeof value === 'string') {
    return requireBoundedSparcDialogueMessage(value, 'SPARC generated tutor utterance text');
  }
  if (isRecord(value)) {
    return requireBoundedSparcDialogueMessage(value.text, 'SPARC generated tutor utterance text');
  }
  throw new Error('SPARC utterance generator must return text or { text }');
}

function transitionFactTypes(transition: SparcStateTransition): Set<string> {
  return new Set(transition.writes.flatMap((write) => {
    const value = write.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [];
    }
    const factType = (value as { factType?: unknown }).factType;
    return typeof factType === 'string' ? [factType] : [];
  }));
}

function hasTutorUtterance(transition: SparcStateTransition): boolean {
  return transition.writes.some((write) => {
    if (write.key !== SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY) {
      return false;
    }
    const value = write.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const operation = value as { node?: unknown };
    const node = operation.node;
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return false;
    }
    const utterance = node as { atomType?: unknown; speaker?: unknown; turnEventId?: unknown };
    return (
      utterance.atomType === 'dialogue-utterance'
      && utterance.speaker === 'tutor'
      && utterance.turnEventId === transition.event.eventId
    );
  });
}

function assertCompletedDialogueReplayState(replayState: SparcReplayState | undefined): void {
  if (!replayState) {
    return;
  }
  for (const transition of replayState.transitions) {
    if (!transition.transitionId.endsWith(':dialogue-turn')) {
      continue;
    }
    const factTypes = transitionFactTypes(transition);
    const requiredFacts = [
      'learningTarget.score',
      'controller.selectedAction',
      'controller.completionState',
    ];
    if (!hasTutorUtterance(transition)) {
      throw new Error(`SPARC dialogue replay state for transition "${transition.transitionId}" is missing generated tutor utterance state`);
    }
    for (const factType of requiredFacts) {
      if (!factTypes.has(factType)) {
        throw new Error(`SPARC dialogue replay state for transition "${transition.transitionId}" is missing required ${factType} state`);
      }
    }
    // Scope refusal can precede the first instructional target; it does not start a cycle.
    const scopeRefusal = transition.writes.some((write) => {
      if (!isRecord(write.value) || write.value.factType !== 'controller.selectedAction') return false;
      const slots = write.value.slots;
      return isRecord(slots) && slots.targetType === 'learnerQuestion' && slots.action === 'question-scope-refusal';
    });
    const hasCanonicalControl = (factTypes.has('instructional.activeCycle') || scopeRefusal) && factTypes.has('instructional.decision');
    const hasPreCanonicalControl = factTypes.has('instructionalTarget.active')
      && factTypes.has('instructionalFocus.episode')
      && factTypes.has('scaffold.state')
      && (factTypes.has('learningTarget.selected') || factTypes.has('diagnostic.misconceptionSelected'));
    if (!hasCanonicalControl && !hasPreCanonicalControl) {
      throw new Error(`SPARC dialogue replay state for transition "${transition.transitionId}" is missing canonical or migratable instructional control state`);
    }
  }
}

// These are response-local projections, never inputs from an earlier response.
const RESPONSE_LOCAL_FACT_TYPES = new Set([
  'learningTarget.selected', 'learningTarget.candidate', 'diagnostic.misconceptionSelected',
  'dialogue.completionSelected', 'controller.completionState', 'controller.selectedAction',
  'controller.moveSelectionAudit', 'learningObservation.targetProgress',
  'instructional.assessmentSnapshot', 'instructional.thresholds', 'instructional.candidate',
  'instructional.progress', 'instructional.cycleStatus', 'instructional.decision',
  'learnerResponse.contribution', 'dialogue.learnerQuestion', 'dialogue.responseModifier',
]);

function identitySlots(fact: SparcWorkingMemoryFact): Readonly<Record<string, unknown>> {
  if (fact.factType === 'learningTarget.score') return { clusterKC: fact.slots?.clusterKC };
  if (fact.factType === 'diagnostic.misconceptionScore') return { id: fact.slots?.id };
  if (fact.factType === 'learningTarget.coverageMean') return { scope: fact.slots?.scope };
  if (fact.factType === 'instructional.candidate') return { snapshotId: fact.slots?.snapshotId, targetKey: fact.slots?.targetKey };
  return {};
}

function assertion(fact: SparcWorkingMemoryFact, persist: boolean): SparcProductionActionResult['assertions'][number] {
  return { fact, persist, identitySlots: identitySlots(fact) };
}

/** Registers capabilities and runs productions; all instructional sequencing is in the rules. */
export async function executeSparcAutoTutorRules(params: SparcAutoTutorRuleTurnParams): Promise<SparcAutoTutorRuleTurnResult> {
  assertCompletedDialogueReplayState(params.replayState);
  const problemStatement = requireNonBlank(params.problemStatement, 'SPARC dialogue problem statement');
  const learnerText = learnerTextFromEvent(params.event);
  const adapter = requireSparcInstructionalAdapter(params.document.instructionalController);
  const facts = buildSparcWorkingMemoryFacts(params).filter((fact) => !RESPONSE_LOCAL_FACT_TYPES.has(fact.factType));
  const outcome: {
    assessment?: Assessment;
    scoreFacts?: readonly SparcWorkingMemoryFact[];
    utteranceRequest?: SparcUtteranceRequest;
    tutorText?: string;
  } = {};
  const execution = await runSparcProductionRulesWithActions({
    facts: [...facts, { factType: 'dialogue.problemStatement', slots: { text: problemStatement } }],
    rules: params.document.productionRules ?? [],
    ...(params.maxProductionRuleCycles !== undefined ? { maxCycles: params.maxProductionRuleCycles } : {}),
    actions: {
      [SPARC_AUTOTUTOR_EVALUATE_ACTION]: async ({ facts: currentFacts }) => {
        const score = await params.scoreLearnerResponse();
        const scoreFacts = createSparcLearnerResponseScoreFacts({ facts: currentFacts, score });
        const scoreTypes = new Set(scoreFacts.map((fact) => fact.factType));
        const scoredFacts = [...currentFacts.filter((fact) => !scoreTypes.has(fact.factType)), ...scoreFacts];
        const derivedFacts = adapter.deriveControllerFacts(scoredFacts);
        const derivedTypes = new Set(derivedFacts.map((fact) => fact.factType));
        const instructionalProjection = adapter.projectInstructionalFacts({
          snapshotId: params.event.eventId,
          facts: [...scoredFacts.filter((fact) => !derivedTypes.has(fact.factType)), ...derivedFacts],
          config: params.document.instructionalController!,
          ...(params.candidateOptions ? { candidateOptions: params.candidateOptions } : {}),
        });
        outcome.assessment = { derivedFacts, instructionalProjection };
        outcome.scoreFacts = scoreFacts;
        return {
          assertions: [
            ...scoreFacts.map((fact) => assertion(fact, fact.factType !== 'dialogue.learnerQuestion')),
            ...derivedFacts.map((fact) => assertion(fact, true)),
            ...instructionalProjection.facts.map((fact) => assertion(fact, false)),
          ],
          writes: [],
        };
      },
      [SPARC_AUTOTUTOR_GENERATE_ACTION]: async ({ facts: currentFacts, ruleId }) => {
        const request = { ...createSparcUtteranceRequestFromFacts(currentFacts), learnerText };
        const decisions = currentFacts.filter((fact) => fact.factType === 'instructional.decision' && fact.slots?.snapshotId === params.event.eventId);
        const decision = decisions[0]?.slots;
        if (decisions.length !== 1 || request.sourceRuleId !== ruleId
          || request.selectedAction.snapshotId !== params.event.eventId
          || decision?.action !== request.action || decision?.targetId !== request.targetId
          || decision?.targetKind !== request.selectedAction.targetType) {
          throw new Error("SPARC generation requires the firing production's current instructional decision");
        }
        const tutorText = tutorTextFromGeneratedUtterance(await params.generateTutorUtterance(request));
        outcome.utteranceRequest = request;
        outcome.tutorText = tutorText;
        const transition = createSparcDialogueTurnTransition({
          document: params.document, event: params.event, learnerText, utteranceRequest: request, tutorText,
          ...(params.dialogueNodeOptions ? { options: params.dialogueNodeOptions } : {}),
        });
        return {
          assertions: progressiveDialogueFacts({ transitions: [transition] }).map((fact) => ({ fact, persist: false })),
          writes: transition.writes,
        };
      },
    },
  });
  if (!outcome.assessment || !outcome.scoreFacts || !outcome.utteranceRequest || !outcome.tutorText) {
    throw new Error('SPARC AutoTutor productions did not complete evaluation and move generation for this response');
  }
  const actions = execution.firings.flatMap((firing) => firing.executedActions ?? []);
  if (actions.filter((action) => action === SPARC_AUTOTUTOR_EVALUATE_ACTION).length !== 1
    || actions.filter((action) => action === SPARC_AUTOTUTOR_GENERATE_ACTION).length !== 1) {
    throw new Error('SPARC AutoTutor productions must evaluate and generate exactly once per response');
  }
  const ruleTransition = createProductionRuleTransition({ document: params.document, event: params.event, execution });
  if (!ruleTransition) throw new Error('SPARC AutoTutor productions produced no state transition');
  return {
    execution,
    assessment: outcome.assessment,
    learnerResponseScoreFacts: outcome.scoreFacts,
    moveSelectionAudit: auditSparcMoveSelection({ rules: params.document.productionRules ?? [], execution }),
    utteranceRequest: outcome.utteranceRequest,
    tutorText: outcome.tutorText,
    transition: {
      transitionId: `${params.event.eventId}:dialogue-turn`,
      event: {
        ...params.event,
        payload: {
          ...params.event.payload,
          productionRuleFirings: execution.firings.map((firing) => ({ ruleId: firing.ruleId, actions: firing.executedActions ?? [] })),
        },
      },
      writes: ruleTransition.writes,
    },
  };
}

export async function commitSparcAutoTutorRules(params: SparcAutoTutorRuleTurnParams & {
  readonly core: SparcPracticeHistoryCore;
  readonly runtime: { readonly history?: Pick<HistoryRuntime, 'writeCanonicalHistory'> };
}): Promise<SparcAutoTutorRuleTurnResult> {
  const evaluated = await executeSparcAutoTutorRules(params);
  const historyRecord = createSparcStateTransitionHistoryRecord({
    core: params.core, transition: evaluated.transition, action: 'sparc-dialogue-turn',
    outcome: 'unknown', responseValue: learnerTextFromEvent(params.event),
  });
  if (params.runtime.history) await params.runtime.history.writeCanonicalHistory(historyRecord);
  return { ...evaluated, historyRecord };
}
