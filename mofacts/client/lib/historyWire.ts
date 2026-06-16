import {
  compressHistoryRecord,
  normalizeHistoryValueForWire,
  type HistoryWireRecord,
} from '../../common/historyCompression';
import {
  assertCanonicalHistoryEnvelope,
  validateHistoryWirePayload,
  withCanonicalHistorySchemaVersion,
} from '../../common/historyEnvelope';
import { meteorCallAsync } from './meteorAsync';
import { applyCourseAssignmentLaunchContext } from './courseAssignmentLaunchContext';

async function insertCompressedHistory(historyRecord: HistoryWireRecord): Promise<void> {
  const versionedHistoryRecord = withCanonicalHistorySchemaVersion(applyCourseAssignmentLaunchContext(historyRecord));
  assertCanonicalHistoryEnvelope(versionedHistoryRecord);
  const compressedRecord = compressHistoryRecord(versionedHistoryRecord);
  validateHistoryWirePayload(compressedRecord);
  await meteorCallAsync('insertHistory', compressedRecord);
}

export { compressHistoryRecord, insertCompressedHistory, normalizeHistoryValueForWire };
