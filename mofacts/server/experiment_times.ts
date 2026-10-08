import { ProlificParticipations } from './lib/prolificCollections';
/* experiment_times.js
 *
 * This script exports all user trial information in the DataShop tab-delimited
 * format a given experiment in.
 *
 * A note concerning indexes
 * ***************************
 *
 * It can be confusing to keep track of what is 0-indexed and what is
 * 1-indexed in this system. The two main things to watch out for are
 * questionIndex and schedule item (question condition).
 *
 * questionIndex refers to the 0-based array of questions in the schedule
 * and is treated as a zero-based index while trials are being conducted
 * (see card.js). However, when it is written to the userTimes log
 * as a field (for question/action/[timeout] actions) it is written as a
 * 1-based field.
 *
 * When a schedule is created from an assessment session, there is a condition
 * field written which corresponds the entry in the "initialpositions" section
 * of the assessment session. In the TDF, these positions are given by group
 * name and 1-based index (e.g. A_1, A_2, B_1). However, the condition in the
 * schedule item is written 0-based (e.g. A-0).
 * */

import {
  getTdfById,
  getStimuliSetById,
  getHistoryByTDFID,
  serverConsole} from './serverComposition';
import _ from 'underscore';

import { writeHistoryExport } from './lib/historyExport';

export {
  createExperimentExport,
  createExperimentExportByTdfIds,
  createExperimentExportFromHistories,
  writeExperimentExportFromHistoryIterable,
};


function toSortableNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function getStudentSortKey(history: Record<string, unknown>): string {
  const key = history.userId ?? history.anonStudentId ?? history.userIdTDFId ?? '';
  return String(key);
}

function getSortableTransactionTime(history: Record<string, unknown>): number {
  const mappedStartTime = history.problemStartTime ?? history.time;
  if (history.problemStartTime !== undefined && history.problemStartTime !== null) {
    return toSortableNumber(history.time);
  }

  const outcome = typeof history.outcome === 'string' ? history.outcome.trim().toLowerCase() : '';
  if (outcome === 'study') {
    return toSortableNumber(mappedStartTime);
  }

  const problemStartTime = toSortableNumber(mappedStartTime);
  const startLatency = toSortableNumber(history.CFStartLatency);
  if (Number.isFinite(problemStartTime) && Number.isFinite(startLatency) && startLatency >= 0) {
    return problemStartTime + startLatency;
  }

  return toSortableNumber(history.time);
}

function sortHistoriesByStudentThenTime(histories: any[]): any[] {
  return histories.sort((a, b) => {
    const studentCompare = getStudentSortKey(a).localeCompare(getStudentSortKey(b));
    if (studentCompare !== 0) {
      return studentCompare;
    }

    const eventTimeCompare = getSortableTransactionTime(a) - getSortableTransactionTime(b);
    if (eventTimeCompare !== 0) {
      return eventTimeCompare;
    }

    const serverTimeCompare = toSortableNumber(a.recordedServerTime) - toSortableNumber(b.recordedServerTime);
    if (serverTimeCompare !== 0) {
      return serverTimeCompare;
    }

    return toSortableNumber(a.eventId) - toSortableNumber(b.eventId);
  });
}

// Exported main function: call recordAcceptor with each record generated
// for expName in datashop format. We do NOT terminate our records.
// We return the number of records written
async function createExperimentExport(expName: any, _requestingUserId: any) {
  let expNames = [];  
  const allHistories = [];

  if (_.isString(expName)) {
    expNames.push(expName);
  } else {
    expNames = expName;
  }

  for (expName of expNames) {
    const tdf = await getTdfById(expName);
    if (!tdf) {
      continue;
    }
    const stimuliSetId = tdf.stimuliSetId;
    await getStimuliSetById(stimuliSetId);
    const histories = await getHistoryByTDFID(tdf._id);
    allHistories.push(...histories);
  }

  return await createExperimentExportFromHistories(allHistories);
}

// Export experiment data by TDF IDs when fileName is unavailable.
async function createExperimentExportByTdfIds(tdfIds: any[], _requestingUserId: any) {
  const allHistories = [];

  for (const tdfId of tdfIds) {
    const tdf = await getTdfById(tdfId);
    if (!tdf) {
      continue;
    }
    const histories = await getHistoryByTDFID(tdf._id);
    allHistories.push(...histories);
  }

  return await createExperimentExportFromHistories(allHistories);
}

async function createExperimentExportFromHistories(histories: any[]) {
  let record = '';
  await writeExperimentExportFromHistoryIterable(sortHistoriesByStudentThenTime(histories), (chunk) => {
    record += chunk;
  });

  return record;
}

async function writeExperimentExportFromHistoryIterable(
  histories: Iterable<any> | AsyncIterable<any>,
  writeRecord: (chunk: string) => void | Promise<void>
) {
  await writeHistoryExport(histories, writeRecord, (error) => {
    serverConsole('There was an error populating the record - it will be skipped', error);
  }, async userIds => ProlificParticipations.find({ userId: { $in: userIds } }, { fields: { userId: 1, participantId: 1, studyId: 1, submissionId: 1 } }).fetchAsync());
}
