import {
  resolveSparcDocumentAddress,
} from './sparcDocumentAddressing';
import type {
  SparcAuthoredDocument,
  SparcStateWrite,
} from './sparcSessionContracts';
import {
  createEmptySparcReplayState,
  createSparcStateCellKey,
  type SparcReplayCell,
  type SparcReplayState,
} from './sparcStateReplay';

const AUTHORED_INITIAL_STATE_EVENT_ID = 'authored-initial-state';
const AUTHORED_INITIAL_STATE_TRANSITION_ID = 'authored-initial-state';

function assertAuthoredInitialStateWrite(
  document: SparcAuthoredDocument,
  write: SparcStateWrite,
  index: number,
): void {
  resolveSparcDocumentAddress(document, write.target);
  if (typeof write.key !== 'string' || write.key.trim().length === 0) {
    throw new Error(`SPARC authored initialState[${index}].key is required`);
  }
}

export function createSparcAuthoredInitialReplayState(
  document: SparcAuthoredDocument,
): SparcReplayState {
  const cells: Record<string, SparcReplayCell> = {};

  for (const [index, write] of (document.initialState ?? []).entries()) {
    assertAuthoredInitialStateWrite(document, write, index);
    cells[createSparcStateCellKey(write.target, write.key)] = {
      address: write.target,
      key: write.key,
      value: write.value,
      transitionId: AUTHORED_INITIAL_STATE_TRANSITION_ID,
      eventId: AUTHORED_INITIAL_STATE_EVENT_ID,
      time: 0,
    };
  }

  if (Object.keys(cells).length === 0) {
    return createEmptySparcReplayState();
  }

  return {
    cells,
    observations: [],
    traceSteps: [],
    transitions: [],
  };
}
