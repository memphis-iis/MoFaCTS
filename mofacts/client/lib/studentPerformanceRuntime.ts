import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { clientConsole } from './userSessionHelpers';
import { meteorCallAsync } from './meteorAsync';
import { deliverySettingsStore } from './state/deliverySettingsStore';
import { legacyInt } from '../../common/underscoreCompat';
import { resolveLearningSessionClusterListSource } from '../../../learning-components/units/learning-session/learningSessionRuntimeConfig';
import { resolveSparcSessionPageId } from '../../../learning-components/units/sparcsession/sparcSessionRuntimeConfig';
import { getNestedStimulusClustersFromTdfFile } from './runtimeStimuli';
import { extractDelimFields, rangeVal } from './runtimeValueHelpers';
import {
  applyAnswerToStudentPerformance,
  applyPracticeTimeToStudentPerformance,
} from '../../../learning-components/models/adaptive-logistic/studentPerformance';

declare const UserDashboardCache: {
  findOne: (query: { userId: string }) =>
    | { tdfStats?: Record<string, { totalTimeMs?: unknown; totalTimeMinutes?: unknown }> }
    | undefined;
};
type CurrentStudentPerformance = {
  count: number;
  numCorrect: number;
  numIncorrect: number;
  percentCorrect: string;
  stimsSeen: number | string;
  totalStimCount: number | string;
  totalTime: number | string;
  totalTimeDisplay: string | number;
};


type StudentPerformanceAccumulator = {
  username: string;
  numCorrect: number;
  numIncorrect: number;
  stimsSeen: number;
  lastSeen: number;
  totalStimCount: number;
  totalTime: number;
  count: number;
  allTimeNumCorrect: number;
  allTimeNumIncorrect: number;
  allTimePracticeDuration: number;
  percentCorrect: string;
  totalTimeDisplay: string;
  stimsIntroduced: number;
};
export function updateCurStudentPerformance(isCorrect: boolean, practiceTime: number, testType: string) {
  // Update running user metrics total,
  // note this assumes curStudentPerformance has already been initialized on initial page entry
  const curUserPerformance = Session.get('curStudentPerformance') as CurrentStudentPerformance;
  clientConsole(2, 'updateCurStudentPerformance', isCorrect, practiceTime,
      'count:', curUserPerformance.count + 1);
  const updated = applyAnswerToStudentPerformance(curUserPerformance, isCorrect, practiceTime, testType);
  Session.set('constantTotalTime', updated.totalTimeDisplay);
  Session.set('curStudentPerformance', updated);
}

export function updateCurStudedentPracticeTime(practiceTime: number) {
  // Update running user metrics total,
  // note this assumes curStudentPerformance has already been initialized on initial page entry
  const curUserPerformance = Session.get('curStudentPerformance') as CurrentStudentPerformance;
  clientConsole(2, 'updateCurStudentPerformance', practiceTime,
      'totalTime:', curUserPerformance.totalTime);
  const updated = applyPracticeTimeToStudentPerformance(curUserPerformance, practiceTime);
  Session.set('constantTotalTime', updated.totalTimeDisplay);
  Session.set('curStudentPerformance', updated);
}

function getDashboardCacheTotalTimeMs(tdfId: string | null | undefined) {
  if (typeof UserDashboardCache === 'undefined') {
    return null;
  }
  const userId = Meteor.userId();
  if (!userId || !tdfId) {
    return null;
  }
  const cache = UserDashboardCache.findOne({ userId });
  const stats = cache?.tdfStats?.[tdfId];
  if (!stats) {
    return null;
  }
  const totalTimeMs = Number(stats.totalTimeMs);
  if (Number.isFinite(totalTimeMs)) {
    return totalTimeMs;
  }
  const totalTimeMinutes = Number(stats.totalTimeMinutes);
  if (Number.isFinite(totalTimeMinutes)) {
    return totalTimeMinutes * 60000;
  }
  return null;
}

function addActiveClusterIndex(value: unknown, activeClusterIndexes: Set<number>) {
  const clusterIndex = Number(value);
  if (Number.isInteger(clusterIndex) && clusterIndex >= 0) {
    activeClusterIndexes.add(clusterIndex);
  }
}

function collectSparcPageClusterReferences(source: unknown, activeClusterIndexes: Set<number>) {
  if (!source || typeof source !== 'object') {
    return;
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      collectSparcPageClusterReferences(item, activeClusterIndexes);
    }
    return;
  }
  const record = source as Record<string, unknown>;
  if (record.clusterIndex !== undefined && typeof record.clusterIndex !== 'object') {
    addActiveClusterIndex(record.clusterIndex, activeClusterIndexes);
  }
  if (Array.isArray(record.clusterIndices)) {
    for (const clusterIndex of record.clusterIndices) {
      addActiveClusterIndex(clusterIndex, activeClusterIndexes);
    }
  }
  for (const value of Object.values(record)) {
    collectSparcPageClusterReferences(value, activeClusterIndexes);
  }
}

function getActiveClusterIndexesFromClusterList(clusterListSource: unknown) {
  const activeClusterIndexes = new Set<number>();
  if (!clusterListSource) {
    return activeClusterIndexes;
  }
  const clusterFields: string[] = [];
  extractDelimFields(clusterListSource, clusterFields);
  for (const field of clusterFields) {
    if (field.includes('-')) {
      for (const value of rangeVal(field)) {
        addActiveClusterIndex(value, activeClusterIndexes);
      }
    } else {
      addActiveClusterIndex(legacyInt(field, Number.NaN), activeClusterIndexes);
    }
  }
  return activeClusterIndexes;
}

function getActiveClusterIndexesForCurrentUnit(currentUnit: any) {
  if (!currentUnit?.sparcsession) {
    return getActiveClusterIndexesFromClusterList(resolveLearningSessionClusterListSource(currentUnit, false));
  }
  const pageId = resolveSparcSessionPageId(currentUnit);
  const tdfDoc = Session.get('currentTdfDoc') as { rawStimuliFile?: { setspec?: { sparcPages?: unknown[] } } } | null | undefined;
  const sparcPages = tdfDoc?.rawStimuliFile?.setspec?.sparcPages;
  const page = Array.isArray(sparcPages) && pageId
    ? sparcPages.find((candidate) =>
      candidate && typeof candidate === 'object' && (candidate as Record<string, unknown>).pageId === pageId
    )
    : Array.isArray(sparcPages) && sparcPages.length === 1
      ? sparcPages[0]
    : null;
  const activeClusterIndexes = new Set<number>();
  collectSparcPageClusterReferences(page && typeof page === 'object'
    ? (page as Record<string, unknown>).display
    : null, activeClusterIndexes);
  return activeClusterIndexes;
}

function getCurrentUnitStimulusCount(): number {
  const currentUnit = Session.get('currentTdfUnit');
  const currentStimuliSet = Session.get('currentStimuliSet');
  if (!Array.isArray(currentStimuliSet)) {
    return 0;
  }
  const activeClusterIndexes = getActiveClusterIndexesForCurrentUnit(currentUnit);
  if (activeClusterIndexes.size === 0) return 0;

  const nestedClusters = getNestedStimulusClustersFromTdfFile({
    tdfFile: Session.get('currentTdfFile'),
    currentStimuliSet,
    currentStimuliSetId: Session.get('currentStimuliSetId'),
    currentTdfId: Session.get('currentTdfId'),
  });
  let totalStimCount = 0;
  for (const clusterIndex of activeClusterIndexes) {
    const cluster = nestedClusters[clusterIndex];
    if (cluster) {
      totalStimCount += cluster.stims.length;
    }
  }
  return totalStimCount;
}

export async function setStudentPerformance(
  studentID: string,
  studentUsername: string,
  tdfId: string,
  unitNumber = Number(Session.get('currentUnitNumber')),
  unitScopedOnly = Boolean((deliverySettingsStore.get() as Record<string, unknown>)?.resetStudentPerformance)
) {
  clientConsole(2, 'setStudentPerformance:', studentID, studentUsername, tdfId);
  const historyPerformance = await meteorCallAsync<Record<string, unknown> | null>(
    'getStudentPerformanceForUnitFromHistory',
    studentID,
    tdfId,
    unitNumber,
    unitScopedOnly
  );
  
  const studentPerformance: StudentPerformanceAccumulator = {
    username: studentUsername,
    numCorrect: 0,
    numIncorrect: 0,
    stimsSeen: 0,
    lastSeen: 0,
    totalStimCount: 0,
    totalTime: 0,
    count: 0,
    allTimeNumCorrect: 0,
    allTimeNumIncorrect: 0,
    allTimePracticeDuration: 0,
    percentCorrect: 'N/A',
    totalTimeDisplay: '0.0',
    stimsIntroduced: 0,
  };

  studentPerformance.totalStimCount = getCurrentUnitStimulusCount();

  if (historyPerformance) {
    studentPerformance.numCorrect = Number(historyPerformance.numCorrect) || 0;
    studentPerformance.numIncorrect = Number(historyPerformance.numIncorrect) || 0;
    studentPerformance.totalTime = Number(historyPerformance.totalPracticeDuration) || 0;
    studentPerformance.allTimeNumCorrect = Number(historyPerformance.allTimeNumCorrect) || studentPerformance.numCorrect;
    studentPerformance.allTimeNumIncorrect = Number(historyPerformance.allTimeNumIncorrect) || studentPerformance.numIncorrect;
    studentPerformance.allTimePracticeDuration = Number(historyPerformance.allTimePracticeDuration) || studentPerformance.totalTime;
    studentPerformance.stimsIntroduced = Number(historyPerformance.stimsIntroduced) || 0;
    studentPerformance.count = Number(historyPerformance.count) || 0;
  }
  const divisor = studentPerformance.numCorrect + studentPerformance.numIncorrect
  studentPerformance.percentCorrect = (divisor > 0) ? ((studentPerformance.numCorrect / divisor)*100).toFixed(2) + '%' : 'N/A';;
  const cachedTotalTimeMs = getDashboardCacheTotalTimeMs(tdfId);
  if (cachedTotalTimeMs !== null) {
    studentPerformance.totalTime = cachedTotalTimeMs;
  }
  studentPerformance.totalTimeDisplay = (studentPerformance.totalTime / (1000*60)).toFixed(1);
  Session.set('curStudentPerformance', studentPerformance);
  clientConsole(2, 'setStudentPerformance,output:', 'correct:', studentPerformance.numCorrect,
    'incorrect:', studentPerformance.numIncorrect, 'percent:', studentPerformance.percentCorrect);
}
