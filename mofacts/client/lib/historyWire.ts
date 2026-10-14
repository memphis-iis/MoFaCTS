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

/** One server transaction accepts all assessment changes and their completion row. */
async function insertCompressedHistoryBatch(records: readonly HistoryWireRecord[]): Promise<void> {
  const compressed = records.map(record => {
    const versioned = withCanonicalHistorySchemaVersion(applyCourseAssignmentLaunchContext(record));
    assertCanonicalHistoryEnvelope(versioned);
    const wire = compressHistoryRecord(versioned);
    validateHistoryWirePayload(wire);
    return wire;
  });
  await meteorCallAsync('insertHistory', compressed);
}

export { compressHistoryRecord, insertCompressedHistory, insertCompressedHistoryBatch, normalizeHistoryValueForWire };
