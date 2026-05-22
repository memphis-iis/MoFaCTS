import {
  createStimClusterMapping,
  extractDelimFields,
  randomChoice,
  rangeVal,
  shuffle,
} from "../../../mofacts/client/lib/currentTestingHelpers";
import { clientConsole } from "../../../mofacts/client/lib/userSessionHelpers";
import { displayify } from "../../../mofacts/common/globalHelpers";
import { legacyDisplay, legacyInt } from "../../../mofacts/common/underscoreCompat";

const _ = (globalThis as any)._;

export interface AssessmentScheduleDependencies {
  readonly getSessionValue: (key: string) => any;
  readonly getStimCount: () => number;
}

export function createAssessmentSchedule(
  setspec: any,
  unitNumber: any,
  unit: any,
  dependencies: AssessmentScheduleDependencies,
): any {
  const settings = loadAssessmentSettings(setspec, unit, dependencies);
  clientConsole(2, "ASSESSMENT SESSION LOADED FOR SCHEDULE CREATION");
  clientConsole(1, "Assessment settings:", settings);

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

      const clusterNum = settings.clusterNumbers.shift();

      if (firstPos >= settings.initialPositions.length) {
        break;
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
  _.each(quests, function(obj: any) {
    finalQuests.push(obj);
  });

  if (finalQuests.length > 0) {
    const shuffles = String(settings.finalPermute).split(" ");
    const swaps = String(settings.finalSwap).split(" ");
    let mapping = _.range(finalQuests.length);
    mapping = createStimClusterMapping(finalQuests.length, shuffles || [], swaps || [], mapping);

    clientConsole(2, "Question swap/shuffle mapping:", displayify(
      _.map(mapping, function(val: any, idx: any) {
        return "q[" + idx + "].cluster==" + quests[idx].clusterIndex +
          " ==> q[" + val + "].cluster==" + quests[val].clusterIndex;
      }),
    ));
    for (j = 0; j < mapping.length; ++j) {
      finalQuests[j] = quests[mapping[j]];
    }
  }

  const schedule = {
    unitNumber: unitNumber,
    created: new Date(),
    permute: null,
    q: finalQuests,
    isButtonTrial: settings.isButtonTrial,
  };

  clientConsole(1, "Created schedule for current unit:");
  clientConsole(2, schedule);

  return schedule;
}

export function loadAssessmentSettings(
  setspec: any,
  unit: any,
  dependencies: AssessmentScheduleDependencies,
): any {
  const settings: any = {
    specType: "unspecified",
    groupNames: [],
    templateSizes: [],
    numTemplatesList: [],
    initialPositions: [],
    groups: [],
    randomClusters: false,
    randomConditions: false,
    scheduleSize: 0,
    finalSwap: [""],
    finalPermute: [""],
    clusterNumbers: [],
    ranChoices: [],
    isButtonTrial: false,
    adaptiveLogic: {},
  };

  if (!unit || !unit.assessmentsession) {
    return settings;
  }

  const assess = unit.assessmentsession;

  const boolVal = function(src: any) {
    return legacyDisplay(src).toLowerCase() === "true";
  };

  settings.finalSwap = assess.swapfinalresult || "";
  settings.finalPermute = assess.permutefinalresult || "";

  extractDelimFields(assess.initialpositions, settings.initialPositions);
  settings.randomClusters = boolVal(assess.assignrandomclusters);
  settings.randomConditions = boolVal(assess.randomizegroups);
  settings.isButtonTrial = boolVal(unit.buttontrial);

  const randomChoicesParts: any = [];
  extractDelimFields(assess.randomchoices, randomChoicesParts);
  _.each(randomChoicesParts, function(item: any) {
    if (item.indexOf("-") < 0) {
      const val = legacyInt(item);
      if (!val) {
        throw new Error("Invalid randomchoices paramter: " + assess.randomchoices);
      }
      item = "0-" + (val - 1).toString();
    }

    _.each(rangeVal(item), function(subitem: any) {
      settings.ranChoices.push(subitem);
    });
  });

  const byGroup: any = {};
  _.each(assess.conditiontemplatesbygroup, function(val: any, name: any) {
    byGroup[name] = val;
  });

  if (byGroup) {
    extractDelimFields(byGroup.groupnames, settings.groupNames);
    extractDelimFields(byGroup.clustersrepeated, settings.templateSizes);
    extractDelimFields(byGroup.templatesrepeated, settings.numTemplatesList);
    extractDelimFields(byGroup.initialpositions, settings.initialPositions);

    if (settings.groupNames.length > 1) {
      _.each(byGroup.group, function(tdfGroup: any) {
        const newGroup: any = [];
        extractDelimFields(tdfGroup, newGroup);
        if (newGroup.length > 0) {
          settings.groups.push(newGroup);
        }
      });
    } else {
      const newGroup: any[] = [];
      extractDelimFields(byGroup.group, newGroup);
      if (newGroup.length > 0) {
        settings.groups.push(newGroup);
      }
    }

    if (settings.groups.length != settings.groupNames.length) {
      clientConsole(1, "WARNING! Num group names doesn't match num groups", settings.groupNames, settings.groups);
    }
  }

  settings.scheduleSize = settings.initialPositions.length;

  const currentTdfFile = dependencies.getSessionValue("currentTdfFile");
  const isMultiTdf = currentTdfFile.isMultiTdf;
  let unitClusterList: any;

  if (isMultiTdf) {
    const curUnitNumber = dependencies.getSessionValue("currentUnitNumber");

    if (curUnitNumber == 1) {
      const lastClusterIndex = dependencies.getStimCount() - 1;
      unitClusterList = lastClusterIndex + "-" + lastClusterIndex;
    } else {
      const subTdfIndex = dependencies.getSessionValue("subTdfIndex");
      unitClusterList = currentTdfFile.subTdfs[subTdfIndex].clusterList;
    }
  } else {
    unitClusterList = assess.clusterlist;
  }

  const clusterList: any = [];
  extractDelimFields(unitClusterList, clusterList);
  for (let i = 0; i < clusterList.length; ++i) {
    const nums = rangeVal(clusterList[i]);
    for (let j = 0; j < nums.length; ++j) {
      settings.clusterNumbers.push(legacyInt(nums[j]));
    }
  }

  settings.adaptiveLogic = assess.adaptiveLogic || {};

  return settings;
}
