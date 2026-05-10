import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { getEngine } from '../../lib/engineManager';
import { DeliveryParamsStore } from '../../lib/state/deliveryParamsStore';
import { CardStore } from './modules/cardStore';
import { getCurrentDeliveryParams, setStudentPerformance } from '../../lib/currentTestingHelpers';
import { clientConsole } from '../../lib/userSessionHelpers';
import { meteorCallAsync } from '../../index';
import { getExperimentState, createExperimentState } from './svelte/services/experimentState';
import { playerController, destroyPlyr } from '../../lib/plyrHelper';
import '../../../common/Collections';

type RootTdfBoxed = {
  content: {
    tdfs: {
      tutor: {
        setspec: {
          loadbalancing?: unknown;
          countcompletion?: unknown;
          condition: string[];
        };
      };
    };
  };
  conditionCounts: number[];
};

type AdaptiveLogicEngine = {
  adaptiveQuestionLogic?: {
    curUnit?: { adaptiveLogic?: unknown };
    evaluate: (rule: unknown) => Promise<{ conditionResult?: boolean; when?: unknown; questions?: unknown[]; checkpoints?: unknown[] } | undefined>;
    unitBuilder: (template: unknown, adaptiveQuestionTimes: unknown[], adaptiveQuestions: unknown[], adaptiveCheckpoints?: unknown[]) => unknown;
    modifyUnit: (logic: unknown, unit: unknown) => Promise<unknown>;
    when?: unknown;
  };
};

declare const Tdfs: {
  findOne: (query: { _id: unknown }) => RootTdfBoxed | null;
};
const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

function validateConditionCounts(
  conditionCounts: unknown,
  conditions: string[],
  source: string
): number[] {
  if (!Array.isArray(conditionCounts)) {
    throw new Error(`${source}: root TDF conditionCounts must be an array when loadbalancing is enabled.`);
  }
  if (conditionCounts.length !== conditions.length) {
    throw new Error(
      `${source}: root TDF conditionCounts length ${conditionCounts.length} does not match condition length ${conditions.length}.`
    );
  }
  return conditionCounts.map((count, index) => {
    if (!Number.isFinite(Number(count)) || Number(count) < 0) {
      throw new Error(`${source}: invalid condition count at index ${index}.`);
    }
    return Number(count);
  });
}

function getConditionIndexOrThrow(conditions: string[], conditionFileName: unknown, source: string) {
  const normalizedConditionFileName = typeof conditionFileName === 'string' ? conditionFileName.trim() : '';
  if (!normalizedConditionFileName) {
    throw new Error(`${source}: current condition TDF fileName is missing.`);
  }
  const conditionIndex = conditions.indexOf(normalizedConditionFileName);
  if (conditionIndex < 0) {
    throw new Error(`${source}: condition "${normalizedConditionFileName}" is not listed in the root TDF condition array.`);
  }
  return conditionIndex;
}

export async function unitIsFinished(reason: string, options: { engine?: unknown } = {}) {
  const engine = (options.engine || getEngine()) as AdaptiveLogicEngine;

  const curTdf = Session.get('currentTdfFile');
  if (!curTdf) {
    clientConsole(1, 'ERROR: currentTdfFile not found in session');
    return;
  }

  const curUnitNum = Session.get('currentUnitNumber');
  const prevUnit = curTdf.tdfs.tutor.unit[curUnitNum];
  const adaptive = prevUnit?.adaptive;
  const adaptiveLogic = prevUnit?.adaptiveLogic;
  const curUnitForAdaptive = prevUnit;
  let newUnitNum = curUnitNum + 1;
  let countCompletion = prevUnit?.countcompletion;
  let adaptiveTemplate;
  let unit;

  const curExperimentState = await getExperimentState();

  // If the last unit was adaptive, we may need to update future units.
  if (adaptive && engine?.adaptiveQuestionLogic) {
    const logic = engine.adaptiveQuestionLogic.curUnit?.adaptiveLogic;
    if (logic !== '' && logic !== undefined) {
      clientConsole(2, 'adaptive schedule');
      for (let adaptiveUnitIndex in adaptive) {
        let newUnitIndex = adaptive[adaptiveUnitIndex].split(',')[0];
        const targetUnitIndex = Number(newUnitIndex) - 1;
        let isTemplate = adaptive[adaptiveUnitIndex].split(',')[1] == 't';
        let adaptiveQuestionTimes = [];
        let adaptiveQuestions = [];
        let adaptiveCheckpoints = [];
        for (let rule of adaptiveLogic[newUnitIndex]) {
          let logicOutput = await engine.adaptiveQuestionLogic.evaluate(rule);
          if (logicOutput?.conditionResult) {
            if (logicOutput.questions) {
              for (const adaptiveQuestion of logicOutput.questions) {
                adaptiveQuestions.push(adaptiveQuestion);
                adaptiveQuestionTimes.push(logicOutput.when);
              }
            }
            if (logicOutput.checkpoints) {
              adaptiveCheckpoints.push(...logicOutput.checkpoints);
            }
          }
        }
        if (isTemplate) {
          const templateIndex = prevUnit?.adaptiveUnitTemplate?.[Number(adaptiveUnitIndex)] ?? Number(adaptiveUnitIndex);
          adaptiveTemplate = curTdf.tdfs.tutor.setspec.unitTemplate?.[templateIndex];
          if (!adaptiveTemplate) {
            throw new Error(`Adaptive template index ${templateIndex} not found for adaptive target ${adaptive[adaptiveUnitIndex]}.`);
          }
          unit = engine.adaptiveQuestionLogic.unitBuilder(adaptiveTemplate, adaptiveQuestionTimes, adaptiveQuestions, adaptiveCheckpoints);
          countCompletion = prevUnit?.countcompletion;
          curTdf.tdfs.tutor.unit.splice(newUnitIndex - 1, 0, unit);
        } else {
          unit = await engine.adaptiveQuestionLogic.modifyUnit(adaptiveLogic[newUnitIndex], curTdf.tdfs.tutor.unit[targetUnitIndex]);
          curTdf.tdfs.tutor.unit[targetUnitIndex] = unit;
        }
      }
    }
    // Add new question to current unit
    if (engine.adaptiveQuestionLogic.when == curUnitNum && playerController) {
      playerController.addStimToSchedule(curUnitForAdaptive);
    }
    Session.set('currentTdfFile', curTdf);
    curExperimentState.currentTdfFile = curTdf;
    await createExperimentState(curExperimentState);
  }

  let curTdfUnit = curTdf.tdfs.tutor.unit[newUnitNum];

  CardStore.setQuestionIndex(0);
  Session.set('clusterIndex', undefined);
  Session.set('currentUnitNumber', newUnitNum);
  Session.set('currentTdfUnit', curTdfUnit);
  Session.set('resetSchedule', true);
  DeliveryParamsStore.set(getCurrentDeliveryParams());
  Session.set('currentUnitStartTime', Date.now());
  CardStore.setFeedbackUnset(true);
  CardStore.setFeedbackTypeFromHistory(undefined);
  Session.set('curUnitInstructionsSeen', false);

  const resetStudentPerformance = DeliveryParamsStore.get().resetStudentPerformance;
  let leaveTarget;
  if (newUnitNum < curTdf.tdfs.tutor.unit.length) {
    // Just hit a new unit - we need to restart with instructions
    clientConsole(2, 'UNIT FINISHED: show instructions for next unit', newUnitNum);
    let rootTDFBoxed = Tdfs.findOne({ _id: Session.get('currentRootTdfId') });
    if (!rootTDFBoxed) {
      clientConsole(1, 'Root TDF not found in client collection, fetching from server:', Session.get('currentRootTdfId'));
      rootTDFBoxed = (await meteorCallAsync('getTdfById', Session.get('currentRootTdfId'))) as RootTdfBoxed | null;
      if (!rootTDFBoxed) {
        clientConsole(1, 'Could not find root TDF:', Session.get('currentRootTdfId'));
        alert('Unfortunately, the root TDF could not be loaded. Please contact your administrator.');
        FlowRouter.go('/home');
        return;
      }
    }
    const rootTDF = rootTDFBoxed.content;
    const setspec = rootTDF.tdfs.tutor.setspec;
    if ((setspec.loadbalancing && setspec.countcompletion == newUnitNum) ||
        (setspec.loadbalancing && countCompletion && !setspec.countcompletion)) {
      const curConditionFileName = (Session.get('currentTdfFile') as { fileName?: string } | null)?.fileName || '';
      // Get the condition number from the rootTDF
      validateConditionCounts(
        rootTDFBoxed.conditionCounts,
        setspec.condition,
        'legacyUnitProgression.count-midflow'
      );
      const curConditionNumber = getConditionIndexOrThrow(setspec.condition, curConditionFileName, 'legacyUnitProgression.count-midflow');
      // Increment the completion count for the current condition
      // Update the rootTDF
      if (!Session.get('ownerDashboardLaunch')) {
        await meteorCallAsync('incrementTdfConditionCount', Session.get('currentRootTdfId'), curConditionNumber);
      }
    }
    leaveTarget = curTdfUnit?.videosession ? '/card' : '/instructions';
  } else {
    // We have run out of units - return home for now
    clientConsole(2, 'UNIT FINISHED: No More Units');
    // If loadbalancing is enabled and countcompletion is "end" then increment completion count of the current condition in the root tdf
    const rootTDFBoxed = Tdfs.findOne({ _id: Session.get('currentRootTdfId') });
    if (!rootTDFBoxed) {
      leaveTarget = '/profile';
    } else {
    const rootTDF = rootTDFBoxed.content;
    const setspec = rootTDF.tdfs.tutor.setspec;
    if ((setspec.countcompletion == 'end' && setspec.loadbalancing) ||
        (setspec.loadbalancing && countCompletion && !setspec.countcompletion)) {
      const curConditionFileName = (Session.get('currentTdfFile') as { fileName?: string } | null)?.fileName || '';
      // Get the condition number from the rootTDF
      validateConditionCounts(
        rootTDFBoxed.conditionCounts,
        setspec.condition,
        'legacyUnitProgression.count-end'
      );
      const curConditionNumber = getConditionIndexOrThrow(setspec.condition, curConditionFileName, 'legacyUnitProgression.count-end');
      // Update the rootTDF
      if (!Session.get('ownerDashboardLaunch')) {
        await meteorCallAsync('incrementTdfConditionCount', Session.get('currentRootTdfId'), curConditionNumber);
      }
    }

    leaveTarget = '/profile';
    }
  }

  const newExperimentState: Record<string, unknown> = {
    questionIndex: 0,
    clusterIndex: 0,
    shufIndex: 0,
    whichStim: 0,
    lastUnitCompleted: curUnitNum,
    lastUnitStarted: newUnitNum,
    currentUnitNumber: newUnitNum,
    currentTdfUnit: curTdfUnit,
    schedule: null,
    scheduleUnitNumber: null,
    videoCheckpointAnchorIndex: null,
    videoCheckpointAnchorTime: null,
    videoPendingQuestionIndex: null,
  };

  if (resetStudentPerformance) {
    const studentUsername = (Session.get('studentUsername') as string) || Meteor.user()?.username || '';
    const userId = Meteor.userId();
    const currentTdfId = Session.get('currentTdfId');
    if (userId && typeof currentTdfId === 'string') {
      await setStudentPerformance(userId, studentUsername, currentTdfId, newUnitNum, true);
    }
  }

  const res = await createExperimentState(newExperimentState as any);
  clientConsole(2, 'unitIsFinished,createExperimentState', res);
  FlowRouter.go(leaveTarget);
}

export async function revisitUnit(unitNumber: string | number) {
  clientConsole(2, 'REVIST UNIT:', unitNumber);
  await destroyPlyr();

  const curTdf = Session.get('currentTdfFile');
  if (!curTdf || !curTdf.tdfs?.tutor?.unit) {
    return;
  }

  const curUnitNum = Session.get('currentUnitNumber') || 0;
  let furthestUnit = Session.get('furthestUnit') || 0;
  if (curUnitNum > furthestUnit) {
    furthestUnit = curUnitNum;
  }
  Session.set('furthestUnit', furthestUnit);

  const newUnitNum = parseInt(String(unitNumber), 10);
  const curTdfUnit = curTdf.tdfs.tutor.unit[newUnitNum];
  if (!curTdfUnit) {
    return;
  }

  CardStore.setQuestionIndex(0);
  Session.set('clusterIndex', undefined);
  Session.set('currentUnitNumber', newUnitNum);
  Session.set('currentTdfUnit', curTdfUnit);
  Session.set('resetSchedule', true);
  DeliveryParamsStore.set(getCurrentDeliveryParams());
  Session.set('currentUnitStartTime', Date.now());
  CardStore.setFeedbackUnset(true);
  CardStore.setFeedbackTypeFromHistory(undefined);
  Session.set('curUnitInstructionsSeen', false);

  const oldExperimentState = await getExperimentState();
  const newExperimentState: Record<string, unknown> = {
    questionIndex: 0,
    clusterIndex: 0,
    shufIndex: 0,
    whichStim: 0,
    lastUnitCompleted: oldExperimentState.lastUnitCompleted,
    lastUnitStarted: oldExperimentState.lastUnitStarted,
    currentUnitNumber: newUnitNum,
    currentTdfUnit: curTdfUnit,
    schedule: null,
    scheduleUnitNumber: null,
    videoCheckpointAnchorIndex: null,
    videoCheckpointAnchorTime: null,
    videoPendingQuestionIndex: null,
  };

  await createExperimentState(newExperimentState as any);

  if (newUnitNum < curTdf.tdfs.tutor.unit.length || curTdf.tdfs.tutor.unit[newUnitNum] > 0) {
    clientConsole(2, 'REVISIT UNIT: show instructions for unit', newUnitNum);
    FlowRouter.go('/instructions');
  }
}





