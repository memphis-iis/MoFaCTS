import { Session } from 'meteor/session';
import { meteorCallAsync } from '../../../../lib/meteorAsync';
import { getCourseAssignmentLaunchContext } from '../../../../lib/courseAssignmentLaunchContext';
import { getStimCluster } from '../../../../lib/runtimeStimuli';
import { resolveSparcPageDisplay } from '../../../../../../learning-components/units/sparcsession/SparcSessionUnitEngine';
import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';

export async function loadWorksheetHistory(userId: string, tdfId: string, levelUnit: number, pageKey: string, checkpointIndex: number) {
  return await meteorCallAsync<CanonicalHistoryRecord[]>('getSparcHistoryForUnit', userId, tdfId, levelUnit, {
    courseAssignment: getCourseAssignmentLaunchContext(), worksheetPageKey: pageKey, worksheetCheckpointIndex: checkpointIndex,
  });
}
export function resolveVideoWorksheetDisplay(pageId: string) {
  return resolveSparcPageDisplay({
    getSessionValue: (key) => Session.get(key),
    findTdfById: (id) => {
      if (id !== Session.get('currentTdfId')) throw new Error('Worksheet requested outside active lesson');
      const tdf = Session.get('currentTdfDoc');
      if (!tdf) throw new Error('Worksheet active lesson is unavailable');
      return tdf;
    },
    getStimCluster,
  }, { sparcsession: { pageId } });
}
