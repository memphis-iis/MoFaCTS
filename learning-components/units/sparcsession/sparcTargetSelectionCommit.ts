import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import { createSparcWorkingMemoryFactStateWrite } from './sparcWorkingMemoryState';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import {
  selectSparcLearningTargetFromFacts,
  type SparcLearningTargetSelection,
  type SparcLearningTargetSelectionOptions,
} from './sparcTargetSelection';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type { SparcReplayState } from './sparcStateReplay';
import type {
  SparcAuthoredDocument,
  SparcCanonicalHistoryRecord,
  SparcInterfaceEvent,
  SparcStateTransition,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcCommittedTargetSelection = {
  readonly selection: SparcLearningTargetSelection;
  readonly transition: SparcStateTransition;
  readonly historyRecord?: SparcCanonicalHistoryRecord;
};

export type SparcTargetSelectionRuntime = {
  readonly history?: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

function createTargetSelectionTransition(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly selection: SparcLearningTargetSelection;
}): SparcStateTransition {
  const workingMemoryTarget = {
    documentId: params.event.source.documentId,
    nodeId: params.document.root.id,
  };
  return {
    transitionId: `${params.event.eventId}:target-selection`,
    event: params.event,
    writes: params.selection.facts.map((fact) => createSparcWorkingMemoryFactStateWrite({
      target: workingMemoryTarget,
      fact,
    })),
  };
}

export function evaluateSparcTargetSelection(params: {
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly options?: SparcLearningTargetSelectionOptions;
}): SparcCommittedTargetSelection {
  const facts = buildSparcWorkingMemoryFacts({
    document: params.document,
    event: params.event,
    ...(params.replayState ? { replayState: params.replayState } : {}),
    ...(params.extraFacts ? { extraFacts: params.extraFacts } : {}),
  });
  const selection = selectSparcLearningTargetFromFacts(facts, params.options);
  return {
    selection,
    transition: createTargetSelectionTransition({
      document: params.document,
      event: params.event,
      selection,
    }),
  };
}

export async function commitSparcTargetSelection(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly options?: SparcLearningTargetSelectionOptions;
  readonly runtime: SparcTargetSelectionRuntime;
}): Promise<SparcCommittedTargetSelection> {
  const evaluated = evaluateSparcTargetSelection(params);
  const historyRecord = createSparcStateTransitionHistoryRecord({
    core: params.core,
    transition: evaluated.transition,
    action: 'sparc-target-selection',
    outcome: 'selected',
    responseValue: evaluated.selection.selectedMisconceptionId ?? evaluated.selection.selectedClusterKC,
  });
  if (params.runtime.history) {
    await params.runtime.history.writeCanonicalHistory(historyRecord);
  }
  return {
    ...evaluated,
    historyRecord,
  };
}
