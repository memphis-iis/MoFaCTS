import { outputFields } from '../../common/Definitions';
import { getHistory } from '../orm';
import { legacyTrim } from '../../common/underscoreCompat';
import { isOperationalHistoryRecord } from '../../common/historyEnvelope';

const PROLIFIC_COLUMNS = ['Prolific Participant ID', 'Prolific Study ID', 'Prolific Submission ID'];
const FIELDSDS: string[] = [...outputFields, ...PROLIFIC_COLUMNS];

/** Source contract shared by cursor exports and the formatter/order adapter. */
export const HISTORY_EXPORT_SOURCE_PROJECTION: Record<string, 0 | 1> = {
  _id: 0,
  TDFId: 1, userId: 1, anonStudentId: 1, userIdTDFId: 1, eventId: 1, recordedServerTime: 1,
  time: 1, problemStartTime: 1, CFStartLatency: 1, outcome: 1,
  selection: 1, action: 1, levelUnitType: 1, CFVideoAction: 1, CFButtonOrder: 1,
  CFNote: 1, itemId: 1, KCId: 1, responseDuration: 1, probabilityEstimate: 1,
  typeOfResponse: 1, responseValue: 1, displayedStimulus: 1, sessionID: 1,
  conditionNameA: 1, conditionTypeA: 1, conditionNameB: 1, conditionTypeB: 1,
  conditionNameC: 1, conditionTypeC: 1, conditionNameD: 1, conditionTypeD: 1,
  conditionNameE: 1, conditionTypeE: 1,
  levelUnit: 1, levelUnitName: 1, problemName: 1, stepName: 1, input: 1,
  studentResponseType: 1, studentResponseSubtype: 1, tutorResponseType: 1,
  KCDefault: 1, KCCluster: 1, CFAudioInputEnabled: 1, CFAudioOutputEnabled: 1,
  CFDisplayOrder: 1, CFStimFileIndex: 1, CFSetShuffledIndex: 1,
  CFAlternateDisplayIndex: 1, CFStimulusVersion: 1, CFCorrectAnswer: 1,
  CFEndLatency: 1, CFFeedbackLatency: 1, CFReviewEntry: 1, CFItemRemoved: 1,
  entryPoint: 1, CFVideoTimeStamp: 1, CFVideoSeekStart: 1, CFVideoSeekEnd: 1,
  CFVideoCurrentSpeed: 1, CFVideoCurrentVolume: 1, CFVideoPreviousSpeed: 1,
  CFVideoPreviousVolume: 1, CFVideoIsPlaying: 1, historySchemaVersion: 1,
  feedbackText: 1, feedbackType: 1, eventType: 1, dynamicTagFields: 1,
  tdfDeletedAt: 1, modelEvidenceSource: 1,
};

// Helper to transform our output record into a delimited record
// Need to adhere to these data limittions: https://datashop.memphis.edu/help?page=importFormatTd
async function delimitedRecord(rec: any, listOfDynamicStimTags: any[], isHeader = false) {
  let vals: any = new Array(FIELDSDS.length);
  for (let i = 0; i < FIELDSDS.length; ++i) {
    const field = FIELDSDS[i]!;
    let charLimit = 255;
    if(field == 'Feedback Text' || field.slice(0,2) == "KC"){
      charLimit = 65535;
    }
    else if(field.slice(0,2) == "CF"){
      charLimit = 65000;
    }
    vals[i] = legacyTrim(rec[field])
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


export async function writeHistoryExport(
  histories: Iterable<any> | AsyncIterable<any>,
  writeRecord: (chunk: string) => void | Promise<void>,
  onRecordError: (error: unknown) => void,
  loadParticipationIdentities?: (userIds: string[]) => Promise<Array<{ userId: string; participantId: string; studyId: string; submissionId: string }>>,
) {
  const header: Record<string, string> = {};
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

  await writeRecord(await delimitedRecord(header, listOfDynamicStimTags, true));

  let batch: any[] = [];
  async function flush() {
    const userIds = [...new Set(batch.map(h => h.userId).filter(id => typeof id === 'string'))] as string[];
    const identities = new Map((loadParticipationIdentities ? await loadParticipationIdentities(userIds) : []).map(p => [p.userId, p]));
    for (const raw of batch) {
      if (!isOperationalHistoryRecord(raw)) continue;
      let record: string;
      try {
        const history = getHistory(raw);
        const p = identities.get(raw.userId);
        record = await delimitedRecord({ ...history,
          [PROLIFIC_COLUMNS[0]!]: p?.participantId || '',
          [PROLIFIC_COLUMNS[1]!]: p?.studyId || '',
          [PROLIFIC_COLUMNS[2]!]: p?.submissionId || '',
        }, listOfDynamicStimTags, false);
      } catch (error) { onRecordError(error); continue; }
      // Transport failures must terminate the stream, not be treated as malformed rows.
      await writeRecord(record);
    }
    batch = [];
  }
  for await (const history of histories) {
    batch.push(history);
    if (batch.length === 100) await flush();
  }
  if (batch.length) await flush();
}
