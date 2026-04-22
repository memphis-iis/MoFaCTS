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
  getTdfByFileName,
  getTdfById,
  getStimuliSetById,
  getHistoryByTDFID,
  serverConsole} from './serverComposition';
import {outputFields} from '../common/Definitions';
import {getHistory} from '../server/orm';
import _ from 'underscore';

import { legacyTrim } from '../common/underscoreCompat';

export {createExperimentExport, createExperimentExportByTdfIds};

let FIELDSDS = JSON.parse(JSON.stringify(outputFields));

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

// Helper to transform our output record into a delimited record
// Need to adhere to these data limittions: https://datashop.memphis.edu/help?page=importFormatTd
async function delimitedRecord(rec: any, listOfDynamicStimTags: any[], isHeader = false) {
  let vals: any = new Array(FIELDSDS.length);
  for (let i = 0; i < FIELDSDS.length; ++i) {
    let charLimit = 255;
    if(FIELDSDS[i] == 'Feedback Text' || FIELDSDS[i].slice(0,2) == "KC"){
      charLimit = 65535;
    }
    else if(FIELDSDS[i].slice(0,2) == "CF"){
      charLimit = 65000;
    }
    vals[i] = legacyTrim(rec[FIELDSDS[i]])
        .replace(/\s+/gm, ' ') // Norm ws and remove non-space ws
        .slice(0, charLimit) // Respect len limits for data shop
        .replace(/\s+$/gm, ''); // Might have revealed embedded space at end
  }
  for(let i = 0; i < listOfDynamicStimTags.length; i++){
    let record = isHeader ? `CF (${listOfDynamicStimTags[i]})` : rec[`CF (${listOfDynamicStimTags[i]})`];
    vals.push(legacyTrim(record)
      .replace(/\s+/gm, ' ') // Norm ws and remove non-space ws
      .slice(0, 65000) // CF fields are limited too 65000 characters
      .replace(/\s+$/gm, '')); // Might have revealed embedded space at end
  }
  vals = vals.join('\t') + "\n"
  return vals;
}


// Exported main function: call recordAcceptor with each record generated
// for expName in datashop format. We do NOT terminate our records.
// We return the number of records written
async function createExperimentExport(expName: any, _requestingUserId: any) {
  let record = '';
  const header: Record<string, string> = {};
  let expNames = [];  
  const allHistories = [];

  if (_.isString(expName)) {
    expNames.push(expName);
  } else {
    expNames = expName;
  }

  const listOfDynamicStimTags: any[] = [];

  FIELDSDS.forEach(function(f: string) {
    const prefix = f.substr(0, 14);

    let t;
    if (prefix === 'Condition Name') {
      t = 'Condition Name';
    } else if (prefix === 'Condition Type') {
      t = 'Condition Type';
    } else {
      t = f;
    }

    header[f] = t;
  });

  record += await delimitedRecord(header, listOfDynamicStimTags, true);

  for (expName of expNames) {
    const tdf = await getTdfByFileName(expName) || await getTdfById(expName);
    if (!tdf) {
      continue;
    }
    const stimuliSetId = tdf.stimuliSetId;
    await getStimuliSetById(stimuliSetId);
    const histories = await getHistoryByTDFID(tdf._id);
    allHistories.push(...histories);
  }

  for (let history of sortHistoriesByStudentThenTime(allHistories)) {
    try {
      history = getHistory(history);
      // Authorization is already handled by TDF selection in routes
      record += await delimitedRecord(history, listOfDynamicStimTags, false);
    } catch (e: any) {
      serverConsole('There was an error populating the record - it will be skipped', e, e.stack);
    }
  }
  return record;
}

// Export experiment data by TDF IDs (fallback when fileName is missing)
async function createExperimentExportByTdfIds(tdfIds: any[], _requestingUserId: any) {
  let record = '';
  const header: Record<string, string> = {};
  const allHistories = [];

  const listOfDynamicStimTags: any[] = [];

  FIELDSDS.forEach(function(f: string) {
    const prefix = f.substr(0, 14);

    let t;
    if (prefix === 'Condition Name') {
      t = 'Condition Name';
    } else if (prefix === 'Condition Type') {
      t = 'Condition Type';
    } else {
      t = f;
    }

    header[f] = t;
  });

  record += await delimitedRecord(header, listOfDynamicStimTags, true);

  for (const tdfId of tdfIds) {
    const tdf = await getTdfById(tdfId);
    if (!tdf) {
      continue;
    }
    const histories = await getHistoryByTDFID(tdf._id);
    allHistories.push(...histories);
  }

  for (let history of sortHistoriesByStudentThenTime(allHistories)) {
      try {
        history = getHistory(history);
        record += await delimitedRecord(history, listOfDynamicStimTags, false);
      } catch (e: any) {
        serverConsole('There was an error populating the record - it will be skipped', e, e.stack);
      }
  }

  return record;
}
