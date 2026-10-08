import { outputFields } from '../../common/Definitions';
import { getHistory } from '../orm';
import { legacyTrim } from '../../common/underscoreCompat';
import { isAssessmentHistoryCopy } from '../../common/historyEnvelope';

const FIELDSDS: string[] = [...outputFields];

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

  for await (let history of histories) {
      if (isAssessmentHistoryCopy(history)) continue;
      try {
        history = getHistory(history);
        await writeRecord(await delimitedRecord(history, listOfDynamicStimTags, false));
      } catch (e: any) {
        onRecordError(e);
      }
  }
}
