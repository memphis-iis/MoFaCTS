import type { UnitEngineSessionReadKey } from '../UnitEngineSessionKeys';

export interface AssessmentScheduleDependencies {
  readonly getSessionValue: (key: UnitEngineSessionReadKey) => any;
  readonly getStimCount: () => number;
}

export interface AssessmentSettings {
  specType: string;
  groupNames: string[];
  templateSizes: string[];
  numTemplatesList: string[];
  initialPositions: string[];
  groups: string[][];
  randomClusters: boolean;
  randomConditions: boolean;
  scheduleSize: number;
  finalSwap: string;
  finalPermute: string;
  clusterNumbers: number[];
  ranChoices: number[];
  isButtonTrial: boolean;
  adaptiveLogic: Record<string, unknown>;
}

export function legacyTrim(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

export function legacyInt(value: unknown, defaultVal = 0): number {
  const parsed = parseInt(legacyTrim(value), 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

export function legacyDisplay(value: unknown): string {
  if (!value && value !== false && value !== 0) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((item) => legacyDisplay(item)).join(',');
  }
  return legacyTrim(value);
}

export function extractDelimFields(src: unknown): string[] {
  if (!src) {
    return [];
  }
  return legacyTrim(src)
    .split(/\s/)
    .map((field) => legacyTrim(field))
    .filter(Boolean);
}

export function rangeVal(src: unknown): number[] {
  const srcText = legacyTrim(src);
  const idx = srcText.indexOf('-');
  if (idx < 1) {
    return [];
  }

  const first = legacyInt(srcText.substring(0, idx));
  const last = legacyInt(srcText.substring(idx + 1));
  if (last < first) {
    return [];
  }

  const range: number[] = [];
  for (let r = first; r <= last; ++r) {
    range.push(r);
  }
  return range;
}

export function shuffle<T>(array: T[]): T[] {
  if (!array.length) {
    return array;
  }

  let currentIndex = array.length;
  while (currentIndex > 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    const tmp = array[currentIndex];
    const randomValue = array[randomIndex];
    if (tmp !== undefined && randomValue !== undefined) {
      array[currentIndex] = randomValue;
      array[randomIndex] = tmp;
    }
  }
  return array;
}

export function randomChoice<T>(array: T[]): T {
  if (array.length < 1) {
    throw new Error('Cannot choose a random assessment value from an empty list');
  }
  const choice = array[Math.floor(Math.random() * array.length)];
  if (choice === undefined) {
    throw new Error('Random assessment choice resolved to undefined');
  }
  return choice;
}

export function createStimClusterMapping(
  stimCount: number,
  shuffleclusters: unknown[],
  swapclusters: unknown[],
  startMapping: number[],
): number[] {
  let mapping = startMapping.slice();
  while (mapping.length < stimCount) {
    mapping.push(mapping.length);
  }

  for (const shuffleSpec of shuffleclusters) {
    mapping = performClusterShuffle(stimCount, shuffleSpec, mapping);
  }
  return performClusterSwap(swapclusters, mapping);
}

function performClusterShuffle(stimCount: number, shuffleclusters: unknown, mapping: number[]): number[] {
  if (stimCount < 1 || !shuffleclusters) {
    return mapping;
  }

  const shuffled = mapping.slice();
  for (const rng of extractDelimFields(shuffleclusters)) {
    const targetIndexes = rangeVal(rng);
    const randPerm = shuffle(targetIndexes.slice());

    for (let j = 0; j < targetIndexes.length; ++j) {
      const targetIndex = targetIndexes[j];
      const randomIndex = randPerm[j];
      const mappedValue = randomIndex !== undefined ? mapping[randomIndex] : undefined;
      if (targetIndex !== undefined && mappedValue !== undefined) {
        shuffled[targetIndex] = mappedValue;
      }
    }
  }

  return shuffled.slice();
}

function performClusterSwap(swapclusters: unknown[], mapping: number[]): number[] {
  if (!swapclusters.length) {
    return mapping;
  }

  const swapChunks = swapclusters.map((item) => rangeVal(item));
  const sortChunks = swapclusters.map((item) => rangeVal(item));

  sortChunks.sort((lhs, rhs) => {
    const lv = lhs[0] ?? -1;
    const rv = rhs[0] ?? -1;
    if (lv < rv) return -1;
    if (lv > rv) return 1;
    return 0;
  });

  shuffle(swapChunks);

  const swapped: number[] = [];
  let i = 0;
  while (i < mapping.length) {
    const firstSortChunk = sortChunks[0];
    if (firstSortChunk && i === firstSortChunk[0]) {
      const chunk = swapChunks.shift();
      const sortedChunk = sortChunks.shift() || [];
      if (!chunk) {
        i += sortedChunk.length;
        continue;
      }
      for (const mappedIndex of chunk) {
        const mappedValue = mapping[mappedIndex];
        if (mappedValue !== undefined) {
          swapped.push(mappedValue);
        }
      }
      i += sortedChunk.length;
    } else {
      const currentValue = mapping[i];
      if (currentValue !== undefined) {
        swapped.push(currentValue);
      }
      i++;
    }
  }

  return swapped.slice();
}

export function loadAssessmentSettings(
  setspec: any,
  unit: any,
  dependencies: AssessmentScheduleDependencies,
): AssessmentSettings {
  const settings: AssessmentSettings = {
    specType: 'unspecified',
    groupNames: [],
    templateSizes: [],
    numTemplatesList: [],
    initialPositions: [],
    groups: [],
    randomClusters: false,
    randomConditions: false,
    scheduleSize: 0,
    finalSwap: '',
    finalPermute: '',
    clusterNumbers: [],
    ranChoices: [],
    isButtonTrial: false,
    adaptiveLogic: {},
  };

  if (!unit || !unit.assessmentsession) {
    return settings;
  }

  const assess = unit.assessmentsession;
  const boolVal = (src: unknown) => legacyDisplay(src).toLowerCase() === 'true';

  settings.finalSwap = String(assess.swapfinalresult || '');
  settings.finalPermute = String(assess.permutefinalresult || '');
  settings.initialPositions.push(...extractDelimFields(assess.initialpositions));
  settings.randomClusters = boolVal(assess.assignrandomclusters);
  settings.randomConditions = boolVal(assess.randomizegroups);
  settings.isButtonTrial = boolVal(unit.buttontrial);
  settings.ranChoices.push(...parseRandomChoices(assess.randomchoices));

  const byGroup = normalizeConditionTemplatesByGroup(assess.conditiontemplatesbygroup);
  if (byGroup) {
    settings.groupNames.push(...extractDelimFields(byGroup.groupnames));
    settings.templateSizes.push(...extractDelimFields(byGroup.clustersrepeated));
    settings.numTemplatesList.push(...extractDelimFields(byGroup.templatesrepeated));
    settings.initialPositions.push(...extractDelimFields(byGroup.initialpositions));
    settings.groups.push(...parseTemplateGroups(byGroup.group, settings.groupNames.length));
    assertAssessmentGroupTemplateShape(settings);
  }

  settings.scheduleSize = settings.initialPositions.length;
  settings.clusterNumbers.push(...parseAssessmentClusterNumbers(assess, dependencies));
  settings.adaptiveLogic = assess.adaptiveLogic || {};

  return settings;
}

function parseRandomChoices(randomchoices: unknown): number[] {
  const randomChoices: number[] = [];
  for (let item of extractDelimFields(randomchoices)) {
    if (item.indexOf('-') < 0) {
      const val = legacyInt(item);
      if (!val) {
        throw new Error(`Invalid randomchoices parameter: ${String(randomchoices)}`);
      }
      item = `0-${val - 1}`;
    }

    randomChoices.push(...rangeVal(item));
  }
  return randomChoices;
}

function normalizeConditionTemplatesByGroup(conditiontemplatesbygroup: any): any | null {
  if (!conditiontemplatesbygroup) {
    return null;
  }

  const byGroup: Record<string, unknown> = {};
  for (const [name, val] of Object.entries(conditiontemplatesbygroup)) {
    byGroup[name] = val;
  }
  return byGroup;
}

function parseTemplateGroups(groupConfig: unknown, groupNameCount: number): string[][] {
  if (groupNameCount > 1) {
    const groupValues = Array.isArray(groupConfig)
      ? groupConfig
      : Object.values(groupConfig || {});
    return groupValues
      .map((tdfGroup) => extractDelimFields(tdfGroup))
      .filter((group) => group.length > 0);
  }

  const group = extractDelimFields(groupConfig);
  return group.length > 0 ? [group] : [];
}

function assertAssessmentGroupTemplateShape(settings: AssessmentSettings): void {
  assertSameLength('conditiontemplatesbygroup.groupnames', settings.groupNames, 'conditiontemplatesbygroup.group', settings.groups);
  assertSameLength('conditiontemplatesbygroup.groupnames', settings.groupNames, 'conditiontemplatesbygroup.clustersrepeated', settings.templateSizes);
  assertSameLength('conditiontemplatesbygroup.groupnames', settings.groupNames, 'conditiontemplatesbygroup.templatesrepeated', settings.numTemplatesList);

  for (let i = 0; i < settings.groupNames.length; i++) {
    const groupName = settings.groupNames[i] || `#${i}`;
    const group = settings.groups[i] || [];
    const templateSize = legacyInt(settings.templateSizes[i]);
    const numTemplates = legacyInt(settings.numTemplatesList[i]);
    if (templateSize < 1) {
      throw new Error(`Assessment group "${groupName}" has invalid clustersrepeated value "${String(settings.templateSizes[i])}"`);
    }
    if (numTemplates < 1) {
      throw new Error(`Assessment group "${groupName}" has invalid templatesrepeated value "${String(settings.numTemplatesList[i])}"`);
    }

    const expectedEntries = templateSize * numTemplates;
    if (group.length !== expectedEntries) {
      throw new Error(
        `Assessment group "${groupName}" has ${group.length} template entries but expected ${expectedEntries} ` +
        `(${numTemplates} templates * ${templateSize} clusters repeated)`,
      );
    }
  }
}

function assertSameLength(lhsName: string, lhs: unknown[], rhsName: string, rhs: unknown[]): void {
  if (lhs.length !== rhs.length) {
    throw new Error(`${lhsName} has ${lhs.length} entries but ${rhsName} has ${rhs.length}`);
  }
}

function parseAssessmentClusterNumbers(assess: any, dependencies: AssessmentScheduleDependencies): number[] {
  const currentTdfFile = dependencies.getSessionValue('currentTdfFile');
  if (!currentTdfFile) {
    throw new Error('Assessment schedule parsing requires currentTdfFile session state');
  }

  let unitClusterList: unknown;
  if (currentTdfFile.isMultiTdf) {
    const curUnitNumber = dependencies.getSessionValue('currentUnitNumber');

    if (curUnitNumber == 1) {
      const lastClusterIndex = dependencies.getStimCount() - 1;
      unitClusterList = `${lastClusterIndex}-${lastClusterIndex}`;
    } else {
      const subTdfIndex = dependencies.getSessionValue('subTdfIndex');
      unitClusterList = currentTdfFile.subTdfs?.[subTdfIndex]?.clusterList;
    }
  } else {
    unitClusterList = assess.clusterlist;
  }

  const clusterNumbers: number[] = [];
  for (const clusterRange of extractDelimFields(unitClusterList)) {
    clusterNumbers.push(...rangeVal(clusterRange).map((value) => legacyInt(value)));
  }
  return clusterNumbers;
}
