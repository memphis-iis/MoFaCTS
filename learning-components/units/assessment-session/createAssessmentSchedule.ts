import {
  createStimClusterMapping,
  legacyInt,
  loadAssessmentSettings,
  randomChoice,
  shuffle,
  type AssessmentScheduleDependencies,
} from './assessmentSettings';

export function createAssessmentSchedule(
  setspec: any,
  unitNumber: any,
  unit: any,
  dependencies: AssessmentScheduleDependencies,
): any {
  const settings = loadAssessmentSettings(setspec, unit, dependencies);

  if (settings.randomClusters) {
    shuffle(settings.clusterNumbers);
  }

  const quests: any = [];
  quests[settings.scheduleSize - 1] = {};

  const setQuest = function(qidx: any, type: any, clusterIndex: any, condition: any, whichStim: any, forceButtonTrial: any) {
    quests[qidx] = {
      testType: type.toLowerCase(),
      clusterIndex: clusterIndex,
      condition: condition,
      whichStim: whichStim,
      forceButtonTrial: forceButtonTrial,
    };
  };

  let i; let j; let k; let z;

  for (i = 0; i < settings.groupNames.length; ++i) {
    const groupName = settings.groupNames[i];
    const group = settings.groups[i];
    const numTemplates = legacyInt(settings.numTemplatesList[i]);
    const templateSize = legacyInt(settings.templateSizes[i]);
    if (!groupName || !group) {
      throw new Error(`Assessment schedule group at index ${i} is missing its name or template body`);
    }

    const indices: any = [];
    for (z = 0; z < numTemplates; ++z) {
      indices.push(z);
    }
    if (settings.randomConditions) {
      shuffle(indices);
    }

    for (j = 0; j < indices.length; ++j) {
      const index = indices[j];

      let firstPos;
      for (firstPos = 0; firstPos < settings.initialPositions.length; ++firstPos) {
        const entry: any = settings.initialPositions[firstPos];
        if (groupName === entry[0] && legacyInt(entry.substring(2)) == index + 1) {
          break;
        }
      }

      if (firstPos >= settings.initialPositions.length) {
        break;
      }

      const clusterNum = settings.clusterNumbers.shift();
      if (!Number.isFinite(clusterNum)) {
        throw new Error(`Assessment group "${groupName}" template ${index + 1} requires a cluster number, but clusterlist is exhausted`);
      }

      for (k = 0; k < templateSize; ++k) {
        const groupEntry: any = group[index * templateSize + k];
        const parts = groupEntry.split(",");
        const inputMethod = String(parts[1] || "").trim().toLowerCase()[0] || "";
        const trialTypeMarker = String(parts[2] || "").trim().toLowerCase()[0] || "";

        const forceButtonTrial = inputMethod === "b";

        let type = trialTypeMarker === "h" ? "H" : trialTypeMarker.toUpperCase();
        if (type === "Z") {
          const stud = Math.floor(Math.random() * 10);
          if (stud === 0) {
            type = "S";
          } else {
            type = "D";
          }
        }

        const location = legacyInt(parts[3]);

        const offStr = parts[0].toLowerCase();
        if (offStr === "m") {
          setQuest(firstPos + location, type, 0, "select_" + type, offStr, forceButtonTrial);
        } else {
          let offset;
          if (offStr === "r") {
            if (settings.ranChoices.length < 1) {
              throw new Error("Random offset, but randomcchoices isn't set");
            }
            offset = randomChoice(settings.ranChoices);
          } else {
            offset = legacyInt(offStr);
          }
          const condition = groupName + "-" + index;

          const pairNum = clusterNum;
          setQuest(firstPos + location, type, pairNum, condition, offset, forceButtonTrial);
        }
      }
    }
  }

  const finalQuests: any = [];
  quests.forEach(function(obj: any) {
    finalQuests.push(obj);
  });

  if (finalQuests.length > 0) {
    const shuffles = String(settings.finalPermute).split(" ");
    const swaps = String(settings.finalSwap).split(" ");
    let mapping = Array.from({ length: finalQuests.length }, (_unused, index) => index);
    mapping = createStimClusterMapping(finalQuests.length, shuffles || [], swaps || [], mapping);

    for (j = 0; j < mapping.length; ++j) {
      const mappedIndex = mapping[j];
      if (mappedIndex === undefined) {
        throw new Error(`Assessment final question mapping missing entry at index ${j}`);
      }
      finalQuests[j] = quests[mappedIndex];
    }
  }

  const schedule = {
    unitNumber: unitNumber,
    created: new Date(),
    permute: null,
    q: finalQuests,
    isButtonTrial: settings.isButtonTrial,
  };

  return schedule;
}
