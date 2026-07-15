import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import { SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY } from '../../trial-displays/sparc/sparcProgressiveNodes';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import {
  createSparcLearnerResponseScoreFacts,
  createSparcLearnerResponseScoreStateWrites,
  type SparcLearnerResponseScoringResult,
} from './sparcLearnerResponseScoring';
import {
  auditSparcMoveSelection,
  type SparcMoveSelectionAudit,
} from './sparcMoveSelectionAudit';
import {
  evaluateSparcControllerTurnPlanning,
  type SparcControllerTurnPlanningResult,
} from './sparcControllerTurnPlanning';
import {
  createSparcDialogueTurnTransition,
  type SparcDialogueTurnNodeOptions,
} from './sparcDialogueTurnNodes';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import type { SparcReplayState } from './sparcStateReplay';
import type { SparcLearningTargetSelectionOptions } from './sparcTargetSelection';
import {
  createSparcUtteranceRequestFromFacts,
  type SparcUtteranceRequest,
} from './sparcUtteranceRequest';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import { createSparcStableWorkingMemoryFactStateWrite } from './sparcWorkingMemoryState';
import type {
  SparcAuthoredDocument,
  SparcCanonicalHistoryRecord,
  SparcInterfaceEvent,
  SparcStateWrite,
  SparcStateTransition,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcGeneratedUtterance = string | {
  readonly text: string;
};

export type SparcUtteranceGenerator = (
  request: SparcUtteranceRequest,
) => Promise<SparcGeneratedUtterance> | SparcGeneratedUtterance;

export type SparcControllerDialogueTurnResult = {
  readonly planning: SparcControllerTurnPlanningResult;
  readonly learnerResponseScoreFacts: readonly SparcWorkingMemoryFact[];
  readonly moveSelectionAudit: SparcMoveSelectionAudit;
  readonly utteranceRequest: SparcUtteranceRequest;
  readonly tutorText: string;
  readonly transition: SparcStateTransition;
  readonly historyRecord?: SparcCanonicalHistoryRecord;
};

export type SparcControllerDialogueTurnRuntime = {
  readonly history?: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

const SPARC_DIALOGUE_INPUT_NODE_ID = 'learner-response-input';
const SPARC_DIALOGUE_SUBMIT_NODE_ID = 'learner-response-submit';

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
      return input.trim();
    }
    const responseValue = event.payload.responseValue;
    if (typeof responseValue === 'string' && responseValue.trim()) {
      return responseValue.trim();
    }
  }
  throw new Error('SPARC dialogue turn requires event.payload.input or event.payload.responseValue');
}

function tutorTextFromGeneratedUtterance(value: SparcGeneratedUtterance): string {
  if (typeof value === 'string') {
    return requireNonBlank(value, 'SPARC generated tutor utterance text');
  }
  if (isRecord(value)) {
    return requireNonBlank(value.text, 'SPARC generated tutor utterance text');
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
    const value = write.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const fact = value as { factType?: unknown; slots?: Record<string, unknown> };
    return (
      fact.factType === 'dialogue.utterance'
      && fact.slots?.speaker === 'tutor'
      && fact.slots?.eventId === transition.event.eventId
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
      'instructionalTarget.active',
      'instructionalFocus.episode',
      'scaffold.state',
    ];
    if (!hasTutorUtterance(transition)) {
      throw new Error(`SPARC dialogue replay state for transition "${transition.transitionId}" is missing generated tutor utterance state`);
    }
    for (const factType of requiredFacts) {
      if (!factTypes.has(factType)) {
        throw new Error(`SPARC dialogue replay state for transition "${transition.transitionId}" is missing required ${factType} state`);
      }
    }
    if (!factTypes.has('learningTarget.selected') && !factTypes.has('diagnostic.misconceptionSelected')) {
      throw new Error(`SPARC dialogue replay state for transition "${transition.transitionId}" is missing required selected instructional target state`);
    }
  }
}

function stableFactIdentitySlots(fact: SparcWorkingMemoryFact): Readonly<Record<string, unknown>> {
  const slots = fact.slots ?? {};
  if (fact.factType === 'learningTarget.candidate') {
    return { clusterKC: slots.clusterKC };
  }
  if (fact.factType === 'learningTarget.score') {
    return { clusterKC: slots.clusterKC };
  }
  if (fact.factType === 'diagnostic.misconceptionScore') {
    return { id: slots.id };
  }
  if (fact.factType === 'dialogue.learnerWordCount') {
    return {};
  }
  if (fact.factType === 'learningTarget.coverageMean') {
    return { scope: slots.scope };
  }
  if (fact.factType === 'session.turnState') {
    return {};
  }
  if (fact.factType === 'controller.completionState') {
    return {};
  }
  if (fact.factType === 'controller.selectedAction') {
    return {};
  }
  if (fact.factType === 'learningTarget.selected') {
    return {};
  }
  if (fact.factType === 'diagnostic.misconceptionSelected') {
    return {};
  }
  if (fact.factType === 'dialogue.completionSelected') {
    return {};
  }
  if (fact.factType === 'instructionalTarget.active') {
    return {};
  }
  if (fact.factType === 'instructionalFocus.episode') {
    return {};
  }
  if (fact.factType === 'scaffold.state') {
    return { focusEpisodeId: slots.focusEpisodeId };
  }
  return {};
}

function createStableControllerStateWrites(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly planning: SparcControllerTurnPlanningResult;
}): readonly SparcStateWrite[] {
  const target = {
    pageKey: params.event.source.pageKey,
    nodeId: params.document.root.id,
  };
  const assertedControllerFacts = params.planning.productionRuleEvaluation.execution.firings
    .flatMap((firing) => firing.persistentAssertedFacts)
    .filter((fact) => fact.factType === 'controller.selectedAction' || fact.factType === 'scaffold.state');
  const instructionalFacts = params.planning.productionRuleFacts.filter((fact) => (
    fact.factType === 'instructionalTarget.active'
    || fact.factType === 'instructionalFocus.episode'
  ));
  const facts = [
    ...params.planning.targetSelection.facts,
    ...params.planning.derivedFacts,
    ...instructionalFacts,
    ...assertedControllerFacts,
  ];
  return facts.map((fact) => createSparcStableWorkingMemoryFactStateWrite({
    target,
    fact,
    identitySlots: stableFactIdentitySlots(fact),
  }));
}

function terminalSummarySelected(request: SparcUtteranceRequest): boolean {
  return request.targetType === 'completion' && request.action === 'summary';
}

function createCompletedDialogueControlWrites(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
}): readonly SparcStateWrite[] {
  const target = {
    pageKey: params.event.source.pageKey,
    nodeId: params.document.root.id,
  };
  return [{
    target,
    key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
    value: {
      type: 'insert-node',
      node: {
        id: SPARC_DIALOGUE_INPUT_NODE_ID,
        nodeType: 'atomic',
        atomType: 'text-input',
        label: 'Response',
        readOnly: true,
      },
    },
  }, {
    target,
    key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
    value: {
      type: 'insert-node',
      node: {
        id: SPARC_DIALOGUE_SUBMIT_NODE_ID,
        nodeType: 'atomic',
        atomType: 'button',
        label: 'Submit',
        value: 'submit',
        readOnly: true,
      },
    },
  }];
}

function createLearnerResponseScoreFacts(params: {
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly learnerResponseScore?: SparcLearnerResponseScoringResult;
}): readonly SparcWorkingMemoryFact[] {
  if (!params.learnerResponseScore) {
    return [];
  }
  const facts = buildSparcWorkingMemoryFacts({
    document: params.document,
    event: params.event,
    ...(params.replayState ? { replayState: params.replayState } : {}),
    ...(params.extraFacts ? { extraFacts: params.extraFacts } : {}),
  });
  return createSparcLearnerResponseScoreFacts({
    facts,
    score: params.learnerResponseScore,
  });
}

export async function evaluateSparcControllerDialogueTurn(params: {
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly problemStatement: string;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly learnerResponseScore?: SparcLearnerResponseScoringResult;
  readonly targetSelectionOptions?: SparcLearningTargetSelectionOptions;
  readonly maxProductionRuleCycles?: number;
  readonly generateTutorUtterance: SparcUtteranceGenerator;
  readonly dialogueNodeOptions?: SparcDialogueTurnNodeOptions;
}): Promise<SparcControllerDialogueTurnResult> {
  assertCompletedDialogueReplayState(params.replayState);
  const problemStatement = requireNonBlank(params.problemStatement, 'SPARC dialogue problem statement');
  const turnFacts = [
    ...(params.extraFacts ?? []),
    {
      factType: 'dialogue.problemStatement',
      slots: { text: problemStatement },
    },
  ];
  const learnerResponseScoreFacts = createLearnerResponseScoreFacts({
    ...params,
    extraFacts: turnFacts,
  });
  const planning = evaluateSparcControllerTurnPlanning({
    document: params.document,
    ...(params.replayState ? { replayState: params.replayState } : {}),
    event: params.event,
    extraFacts: [
      ...turnFacts,
      ...learnerResponseScoreFacts,
    ],
    ...(params.targetSelectionOptions ? { targetSelectionOptions: params.targetSelectionOptions } : {}),
    ...(params.maxProductionRuleCycles !== undefined ? { maxProductionRuleCycles: params.maxProductionRuleCycles } : {}),
  });
  const moveSelectionAudit = auditSparcMoveSelection({
    facts: planning.productionRuleEvaluation.execution.initialFacts,
    rules: params.document.productionRules ?? [],
  });
  const selectedUtteranceRequest = moveSelectionAudit.utteranceRequest
    ?? createSparcUtteranceRequestFromFacts(
      planning.productionRuleEvaluation.execution.facts,
    );
  const utteranceRequest = {
    ...selectedUtteranceRequest,
    learnerText: learnerTextFromEvent(params.event),
  };
  const tutorText = tutorTextFromGeneratedUtterance(
    await params.generateTutorUtterance(utteranceRequest),
  );
  const dialogueTransition = createSparcDialogueTurnTransition({
    document: params.document,
    event: params.event,
    learnerText: learnerTextFromEvent(params.event),
    utteranceRequest,
    tutorText,
    ...(params.dialogueNodeOptions ? { options: params.dialogueNodeOptions } : {}),
  });
  const transition: SparcStateTransition = {
    ...dialogueTransition,
    writes: [
      ...dialogueTransition.writes,
      ...createSparcLearnerResponseScoreStateWrites({
        target: {
          pageKey: params.event.source.pageKey,
          nodeId: params.document.root.id,
        },
        facts: learnerResponseScoreFacts,
      }),
      ...createStableControllerStateWrites({
        document: params.document,
        event: params.event,
        planning,
      }),
      ...(terminalSummarySelected(utteranceRequest)
        ? createCompletedDialogueControlWrites({
            document: params.document,
            event: params.event,
          })
        : []),
    ],
  };

  return {
    planning,
    learnerResponseScoreFacts,
    moveSelectionAudit,
    utteranceRequest,
    tutorText,
    transition,
  };
}

export async function commitSparcControllerDialogueTurn(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly problemStatement: string;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly learnerResponseScore?: SparcLearnerResponseScoringResult;
  readonly targetSelectionOptions?: SparcLearningTargetSelectionOptions;
  readonly maxProductionRuleCycles?: number;
  readonly generateTutorUtterance: SparcUtteranceGenerator;
  readonly dialogueNodeOptions?: SparcDialogueTurnNodeOptions;
  readonly runtime: SparcControllerDialogueTurnRuntime;
}): Promise<SparcControllerDialogueTurnResult> {
  const evaluated = await evaluateSparcControllerDialogueTurn(params);
  const historyRecord = createSparcStateTransitionHistoryRecord({
    core: params.core,
    transition: evaluated.transition,
    action: 'sparc-dialogue-turn',
    outcome: 'unknown',
    responseValue: learnerTextFromEvent(params.event),
  });
  if (params.runtime.history) {
    await params.runtime.history.writeCanonicalHistory(historyRecord);
  }
  return {
    ...evaluated,
    historyRecord,
  };
}
