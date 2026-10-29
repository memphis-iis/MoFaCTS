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

import { serverConsole } from './serverComposition';

import { writeHistoryExport } from './lib/historyExport';

export async function writeExperimentExportFromHistoryIterable(
  histories: Iterable<any> | AsyncIterable<any>,
  writeRecord: (chunk: string) => void | Promise<void>
) {
  await writeHistoryExport(histories, writeRecord, (error) => {
    serverConsole('There was an error populating the record - it will be skipped', error);
  }, async userIds => ProlificParticipations.find({ userId: { $in: userIds } }, { fields: { userId: 1, participantId: 1, studyId: 1, submissionId: 1 } }).fetchAsync());
}
