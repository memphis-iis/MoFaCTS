import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import { createSparcAuthoredInitialReplayState } from './sparcAuthoredInitialState';
import type { SparcAuthoredDocument } from './sparcSessionContracts';
import {
  replaySparcHistory,
  type SparcReplayState,
} from './sparcStateReplay';

export function replaySparcDocumentHistory(
  document: SparcAuthoredDocument,
  records: Iterable<CanonicalHistoryRecord>,
): SparcReplayState {
  return replaySparcHistory(
    records,
    createSparcAuthoredInitialReplayState(document),
  );
}
