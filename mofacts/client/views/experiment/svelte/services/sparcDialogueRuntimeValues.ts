import type {
  SparcAuthoredDocument,
  SparcWorkingMemoryFact,
} from '../../../../../../learning-components/units/sparcsession/sparcSessionContracts';
import type {
  SparcReplayState,
} from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';
import {
  buildSparcWorkingMemoryFacts,
} from '../../../../../../learning-components/units/sparcsession/sparcWorkingMemoryFacts';

export const SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY = '__sparcDialogueProgressFacts';

const SPARC_DIALOGUE_PROGRESS_FACT_TYPES = new Set([
  'learningTarget.score',
  'diagnostic.misconceptionScore',
  'session.turnState',
  'controller.completionState',
  'learningTarget.selected',
  'diagnostic.misconceptionSelected',
]);

export function buildSparcDialogueProgressFacts(params: {
  readonly document: SparcAuthoredDocument;
  readonly replayState: SparcReplayState;
}): readonly SparcWorkingMemoryFact[] {
  return buildSparcWorkingMemoryFacts(params).filter((fact) => (
    SPARC_DIALOGUE_PROGRESS_FACT_TYPES.has(fact.factType)
  ));
}
