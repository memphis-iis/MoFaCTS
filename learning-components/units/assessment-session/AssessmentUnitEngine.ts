import { ASSESSMENT_SESSION_UNIT_TYPE } from '../unitTypes';
import { createAssessmentSchedule } from './createAssessmentSchedule';

import type { UnitEngineSessionReadKey, UnitEngineSessionWriteKey } from '../UnitEngineSessionKeys';
import type { UnitEngineExtension } from '../UnitEngine';

export interface CreateAssessmentUnitEngineDeps {
  readonly getSessionValue: (key: UnitEngineSessionReadKey) => any;
  readonly setSessionValue: (key: UnitEngineSessionWriteKey, value: any) => void;
  readonly getExperimentState: () => any;
  readonly hasScheduleArtifactForUnit: (experimentState: any, unitNumber: any) => boolean;
  readonly createExperimentState: (newExperimentState: any) => Promise<any>;
  readonly getStimCount: () => number;
  readonly setQuestionIndex: (questionIndex: number) => void;
  readonly alertUser: (message: string) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export function createAssessmentUnitEngine(deps: CreateAssessmentUnitEngineDeps): UnitEngineExtension {
  let schedule: any;
  let scheduleCursor = 0;
  const engine: any = {
    unitType: ASSESSMENT_SESSION_UNIT_TYPE,

    initImpl: async function() {
      deps.setSessionValue('unitType', ASSESSMENT_SESSION_UNIT_TYPE);

      const curUnitNum = deps.getSessionValue('currentUnitNumber');
      const file = deps.getSessionValue('currentTdfFile');

      if (curUnitNum === null || curUnitNum === undefined) {
        throw new Error(`Schedule engine initImpl: currentUnitNumber is ${curUnitNum}. Session state is broken.`);
      }

      if (!file) {
        throw new Error('Schedule engine initImpl: currentTdfFile is null/undefined. Session state is broken.');
      }

      if (!file.tdfs) {
        throw new Error(`Schedule engine initImpl: currentTdfFile has no tdfs property. File structure: ${JSON.stringify(Object.keys(file))}`);
      }

      if (!file.tdfs.tutor) {
        throw new Error(`Schedule engine initImpl: currentTdfFile.tdfs has no tutor property. File structure: ${JSON.stringify(Object.keys(file.tdfs))}`);
      }

      if (!file.tdfs.tutor.setspec) {
        throw new Error('Schedule engine initImpl: currentTdfFile.tdfs.tutor has no setspec property.');
      }

      if (!file.tdfs.tutor.unit) {
        throw new Error('Schedule engine initImpl: currentTdfFile.tdfs.tutor has no unit array.');
      }

      if (curUnitNum < 0 || curUnitNum >= file.tdfs.tutor.unit.length) {
        throw new Error(`Schedule engine initImpl: currentUnitNumber ${curUnitNum} is out of bounds (0-${file.tdfs.tutor.unit.length - 1})`);
      }

      const setSpec = file.tdfs.tutor.setspec;
      const currUnit = file.tdfs.tutor.unit[curUnitNum];

      if (!currUnit) {
        throw new Error(`Schedule engine initImpl: unit at index ${curUnitNum} is null/undefined`);
      }

      deps.log(2, 'creating schedule with params:', setSpec, curUnitNum, currUnit);
      const existingExperimentState = deps.getExperimentState();
      const hasPersistedSchedule = deps.hasScheduleArtifactForUnit(existingExperimentState, curUnitNum);
      const shouldReusePersistedSchedule = hasPersistedSchedule && !deps.getSessionValue('resetSchedule');

      if (shouldReusePersistedSchedule) {
        schedule = existingExperimentState.schedule;
      } else {
        schedule = createAssessmentSchedule(setSpec, curUnitNum, currUnit, {
          getSessionValue: deps.getSessionValue,
          getStimCount: deps.getStimCount,
        });
      }
      scheduleCursor = 0;
      if (!schedule) {
        deps.alertUser('There is an issue with the TDF - experiment cannot continue');
        throw new Error('There is an issue with the TDF - experiment cannot continue');
      }

      if (!schedule.q || schedule.q.length === 0) {
        const errorMsg = `Assessment session in unit "${currUnit.unitname}" (unit ${curUnitNum}) has no cards/questions. ` +
          `Check clusterlist configuration in assessmentsession. ` +
          `Schedule structure: ${JSON.stringify(schedule, null, 2)}`;
        deps.log(1, '[Unit Engine] EMPTY SCHEDULE ERROR:', errorMsg);
        deps.alertUser('Assessment session has no questions - check TDF configuration');
        throw new Error(errorMsg);
      }

      deps.setSessionValue('schedule', schedule);

      if (!shouldReusePersistedSchedule) {
        const newExperimentState = {
          schedule,
          scheduleUnitNumber: curUnitNum,
        };
        await deps.createExperimentState(newExperimentState);
      }
    },

    loadResumeState: async function() {
      // Assessment resume state is derived from schedule artifact + history.
    },

    getSchedule: function() {
      return schedule;
    },

    getScheduleCursor: function() {
      return scheduleCursor;
    },

    setScheduleCursor: function(cursor: any) {
      const nextCursor = Number(cursor);
      if (!Number.isFinite(nextCursor) || nextCursor < 0) {
        throw new Error(`Schedule cursor must be a non-negative finite number; received ${String(cursor)}`);
      }

      const boundedCursor = Math.floor(nextCursor);
      const scheduleLength = Array.isArray(schedule?.q) ? schedule.q.length : 0;
      if (boundedCursor > scheduleLength) {
        throw new Error(`Schedule cursor ${boundedCursor} is out of bounds for schedule length ${scheduleLength}`);
      }

      scheduleCursor = boundedCursor;
    },

    prepareNextScheduledCard: async function() {
      const scheduleIndex = scheduleCursor;
      const sched = this.getSchedule();
      const questInfo = sched.q[scheduleIndex];
      if (!questInfo) {
        return null;
      }

      const curClusterIndex = questInfo.clusterIndex;
      const curStimIndex = questInfo.whichStim;
      const preparedState = await this.buildPreparedCardQuestionAndAnswerGlobals(
        curClusterIndex,
        curStimIndex,
        0,
        { testType: questInfo.testType },
      );

      return {
        scheduleIndex,
        clusterIndex: curClusterIndex,
        stimIndex: curStimIndex,
        whichStim: curStimIndex,
        testType: questInfo.testType,
        preparedState,
      };
    },

    commitPreparedScheduledCard: function(selection: any) {
      if (!selection) {
        return false;
      }

      const scheduleIndex = Number.isFinite(selection.scheduleIndex)
        ? Number(selection.scheduleIndex)
        : scheduleCursor;
      const curClusterIndex = selection.clusterIndex;
      const curStimIndex = selection.stimIndex ?? selection.whichStim;
      if (!Number.isFinite(curClusterIndex) || !Number.isFinite(curStimIndex)) {
        throw new Error('Prepared schedule commit requires clusterIndex and stimIndex');
      }

      const preparedState = selection.preparedState;
      if (!preparedState) {
        throw new Error('Prepared schedule commit requires preparedState');
      }

      deps.setSessionValue('clusterIndex', curClusterIndex);
      this.applyPreparedCardQuestionAndAnswerGlobals(preparedState);
      deps.setSessionValue('testType', selection.testType);
      scheduleCursor = scheduleIndex + 1;
      deps.setQuestionIndex(scheduleCursor);
      deps.log(2, 'SCHEDULE UNIT prepared card => ',
          'cluster-idx-unmapped:', curClusterIndex,
          'whichStim:', curStimIndex,
      );
      return true;
    },

    selectNextCard: async function(_indices: any, _curExperimentState: any) {
      const selection = await this.prepareNextScheduledCard();
      deps.log(1, 'schedule selectNextCard', scheduleCursor, selection);
      if (!selection) {
        return;
      }
      this.commitPreparedScheduledCard(selection);
      return selection;
    },

    findCurrentCardInfo: function() {
      const questionIndex = Math.max(scheduleCursor - 1, 0);
      return this.getSchedule().q[questionIndex];
    },

    cardAnswered: async function() {
      // Nothing currently
    },

    unitFinished: function() {
      const curUnitNum = deps.getSessionValue('currentUnitNumber');
      let currentSchedule: any = null;
      if (curUnitNum < deps.getSessionValue('currentTdfFile').tdfs.tutor.unit.length) {
        currentSchedule = this.getSchedule();
      }

      if (currentSchedule && scheduleCursor < currentSchedule.q.length) {
        return false;
      } else {
        return true;
      }
    },
    async prepareNextTrial() {
      const selection = await this.prepareNextScheduledCard();
      return {
        selection,
        preparedAdvanceMode: selection ? 'direct' : 'none',
        ...(selection ? { questionIndex: Number(selection.scheduleIndex) + 1 } : {}),
      };
    },
    commitPreparedTrial(selection: Record<string, unknown> | null) {
      return this.commitPreparedScheduledCard(selection);
    },
    async advanceAfterAnswer() {
      await this.cardAnswered();
    },
    isFinished() { return this.unitFinished(); },
    getDisplayQuestionIndex() { return scheduleCursor; },
    clearPreparedTrial() { },
  };
  return engine as UnitEngineExtension;
}
