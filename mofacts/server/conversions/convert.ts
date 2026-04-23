export { getNewItemFormat };
import {STIM_PARAMETER, KC_MULTIPLE} from '../../common/Definitions';
import { removeInvisibleUnicode } from '../../common/lib/stimuliResponseRepair';
import { getResponseKCAnswerKey } from '../../common/lib/responseKCAnswerKey';

const fs = require('fs');

// stimIdMap = {
//   fileName: stimId
// }
const stimIdMap: Record<string, any> = {};
let stimuliSetId = 1;
function generateStims(stimsJson: any[]) {
  const jsonItems: any[] = [];
  stimsJson.forEach((stimFile) => {
    const items = getNewItemFormat(stimFile, stimFile.fileName, stimuliSetId, localResponseKCMap);
    stimIdMap[stimFile.fileName] = stimuliSetId;
    jsonItems.push(items);

    stimuliSetId++;
  });
  fs.writeFileSync(__dirname + '/outfiles/items.json', JSON.stringify(jsonItems, null, 4));
}

let tdfId = 1;
function generateTdfs(tdfsJson: any[]) {
  const jsonTdfs: any[] = [];
  const rootTdfNames: string[] = [];
  tdfsJson.forEach((tdfFile) => {
    if (tdfFile.tdfs.tutor.setspec.stimulusfile) {
      const stimuliSetId = stimIdMap[tdfFile.tdfs.tutor.setspec.stimulusfile];
      const tdfs = getNewTdfFormat(tdfFile, tdfId, stimuliSetId);
      jsonTdfs.push(tdfs);

      tdfId++;
    } else {
      rootTdfNames.push(tdfFile.fileName);
    }
  });
  fs.writeFileSync(__dirname + '/outfiles/tdfs.json', JSON.stringify(jsonTdfs, null, 4));
  fs.writeFileSync(__dirname + '/outfiles/roots.json', JSON.stringify(rootTdfNames, null, 4));
}

if (process.env.RUN_CONVERT_SCRIPT === '1') {
  const rawTdfs = fs.readFileSync(__dirname + '/infiles/tdfs.json');
  const rawStims = fs.readFileSync(__dirname + '/infiles/stimuli.json');

  const tdfsJson = JSON.parse(rawTdfs);
  const stimsJson = JSON.parse(rawStims);

  generateStims(stimsJson);
  generateTdfs(tdfsJson);
}

const localResponseKCMap: Record<string, any> = {};
let curResponseKCCtr = 1;

function cloneDisplayObject(display: unknown) {
  if (!display || typeof display !== 'object' || Array.isArray(display)) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(display));
}

function getNewItemFormat(stimFile: any, stimulusFileName: string, stimuliSetId: number, responseKCMap: Record<string, any>) {
  const items: any[] = [];
  const responseKCs = Object.values(responseKCMap);
  for (const mapResponseKC of responseKCs) {
    if (mapResponseKC > curResponseKCCtr) {
      curResponseKCCtr = mapResponseKC;
    }
  }

  const baseKC = stimuliSetId * KC_MULTIPLE;
  let clusterKC = baseKC;
  let stimKC = baseKC;

  if (
    !stimFile ||
    !stimFile.stimuli ||
    !stimFile.stimuli.setspec ||
    !Array.isArray(stimFile.stimuli.setspec.clusters)
  ) {
    throw new Error(`Stimulus file "${stimulusFileName}" is missing or malformed (no clusters array).`);
  }

  stimFile.stimuli.setspec.clusters.forEach((cluster: any, clusterIdx: number) => {
    if (!cluster || !Array.isArray(cluster.stims)) {
      throw new Error(`Cluster ${clusterIdx} in "${stimulusFileName}" is missing or has no stims array.`);
    }
    cluster.stims.forEach((stim: any, stimIdx: number) => {
      if (!stim || typeof stim !== 'object') {
        throw new Error(`Stim ${stimIdx} in cluster ${clusterIdx} of "${stimulusFileName}" is undefined or not an object.`);
      }
      if (!stim.response || typeof stim.response !== 'object') {
        throw new Error(`Stim ${stimIdx} in cluster ${clusterIdx} of "${stimulusFileName}" missing 'response' property.`);
      }
      if (!Object.prototype.hasOwnProperty.call(stim.response, 'correctResponse')) {
        throw new Error(`Stim ${stimIdx} in cluster ${clusterIdx} of "${stimulusFileName}" missing 'correctResponse' property in 'response'.`);
      }

      let incorrectResponses = stim.response.incorrectResponses;
      if (incorrectResponses){
        if (typeof incorrectResponses === 'string') {
          incorrectResponses = incorrectResponses.split(',');
        }
        incorrectResponses = incorrectResponses.map((ir: any) => removeInvisibleUnicode(ir));
      }
      
      let responseKC;
      const answerText = getResponseKCAnswerKey(stim.response.correctResponse);

      if (responseKCMap[answerText] || responseKCMap[answerText] == 0) {
        responseKC = responseKCMap[answerText];
      } else {
        responseKC = curResponseKCCtr;
        responseKCMap[answerText] = JSON.parse(JSON.stringify(curResponseKCCtr));
        curResponseKCCtr += 1;
      }
      const item = {
        stimuliSetId: stimuliSetId,
        stimulusFileName: stimulusFileName,
        stimulusKC: stimKC,
        clusterKC: clusterKC,
        responseKC: responseKC,
        params: stim.parameter || STIM_PARAMETER,
        optimalProb: stim.optimalProb,
        correctResponse: removeInvisibleUnicode(stim.response.correctResponse),
        incorrectResponses: incorrectResponses,
        // NOTE: itemResponseType removed - image detection now automatic via isImagePath()
        speechHintExclusionList: stim.speechHintExclusionList,
        clozeStimulus: stim.display?.clozeText || stim.display?.clozeStimulus,
        textStimulus: stim.display?.text || stim.display?.textStimulus || "",
        audioStimulus: stim.display?.audioSrc,
        imageStimulus: stim.display?.imgSrc,
        videoStimulus: stim.display?.videoSrc,
        display: cloneDisplayObject(stim.display),
        alternateDisplays: stim.alternateDisplays,
      };

      items.push(item);
      stimKC++;
    });
    clusterKC++;
  });
  return items;
}

function getNewTdfFormat(oldTdf: any, stimuliSetId: number, tdfId?: string | number) {
  const tdfObj: any = {
    ownerId: oldTdf.owner || oldTdf.ownerId,
    stimuliSetId: stimuliSetId,
    content: {
      tdfs: oldTdf.tdfs,
    },
    visibility: oldTdf.visibility || 'profileOnly',
  };
  if (tdfId) tdfObj._id = tdfId;

  return tdfObj;
}
