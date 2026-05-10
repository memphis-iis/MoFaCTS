/**
 * Unit Progression Service
 *
 * Handles unit advancement during active play.
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { getEngine } from '../../../../lib/engineManager';
import { meteorCallAsync } from '../../../../index';
import { clientConsole } from '../../../../lib/userSessionHelpers';
import { getCurrentDeliveryParams, setStudentPerformance } from '../../../../lib/currentTestingHelpers';
import { DeliveryParamsStore } from '../../../../lib/state/deliveryParamsStore';
import { UiSettingsStore } from '../../../../lib/state/uiSettingsStore';
import { CardStore } from '../../modules/cardStore';
import { getExperimentState, createExperimentState } from './experimentState';
import { sanitizeUiSettings } from '../utils/uiSettingsValidator';
import '../../../../../common/Collections';
import type { ExperimentState } from '../../../../../common/types/experiment';
import type { UnitCompletionEngine } from '../../../../../common/types/svelteServices';
import { COMPLETED_LESSON_REDIRECT } from '../../../../lib/cardEntryIntent';
import { assertIdInvariants, logIdInvariantBreachOnce } from '../../../../lib/idContext';

const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

type TdfFileState = Record<string, unknown> & {
  tdfs: {
    tutor: {
      title?: string;
      unit: TdfUnitState[];
      setspec: Record<string, unknown> & { unitTemplate?: unknown[] };
    };
  };
  fileName?: string;
};

type TdfUnitState = Record<string, unknown> & {
  adaptive?: Record<string, string>;
  adaptiveLogic?: Record<string, unknown[]>;
  adaptiveUnitTemplate?: unknown[];
  countcompletion?: unknown;
  learningsession?: unknown;
};

type AdaptiveLogicOutput = {
  conditionResult?: boolean;
  when?: unknown;
  questions?: unknown[];
  checkpoints?: unknown[];
};

type AdaptiveQuestionLogic = {
  curUnit?: { adaptiveLogic?: unknown };
  evaluate: (rule: unknown) => Promise<AdaptiveLogicOutput | undefined>;
  unitBuilder: (template: unknown, adaptiveQuestionTimes: unknown[], adaptiveQuestions: unknown[], adaptiveCheckpoints?: unknown[]) => unknown;
  modifyUnit: (logic: unknown, unit: unknown) => Promise<unknown>;
  when?: unknown;
};

type UnitProgressionEngine = {
  adaptiveQuestionLogic?: AdaptiveQuestionLogic;
};

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

const Tdfs = (window as Window & {
  Tdfs?: {
    findOne: (query: { _id: unknown }) => RootTdfBoxed | null;
  };
}).Tdfs ?? null;

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

export async function unitIsFinished(_reason: string): Promise<void> {
  assertIdInvariants('unitProgression.unitIsFinished.start', { requireCurrentTdfId: true, requireStimuliSetId: false });
  const curTdf = Session.get('currentTdfFile') as TdfFileState | null;
  if (!curTdf) {
    clientConsole(1, 'ERROR: currentTdfFile not found in session');
    return;
  }

  const currentUnitNumber = Session.get('currentUnitNumber') as number;
  const adaptive = curTdf.tdfs.tutor.unit[currentUnitNumber]?.adaptive;
  const adaptiveLogic = curTdf.tdfs.tutor.unit[currentUnitNumber]?.adaptiveLogic;
  const curUnitNum = currentUnitNumber;
  const prevUnit = curTdf.tdfs.tutor.unit[curUnitNum] || ({} as TdfUnitState);
  const newUnitNum = curUnitNum + 1;
  let countCompletion = prevUnit.countcompletion;
  const curExperimentState = await getExperimentState();

  if (adaptive) {
    const engine = getEngine() as UnitProgressionEngine;
    if (engine.adaptiveQuestionLogic) {
      const logic = engine.adaptiveQuestionLogic.curUnit?.adaptiveLogic;
      if (logic !== '' && logic !== undefined) {
        clientConsole(2, 'adaptive schedule');
        for (const adaptiveUnitIndex in adaptive) {
          const adaptiveEntry = String(adaptive[adaptiveUnitIndex]);
          const newUnitIndex = Number(adaptiveEntry.split(',')[0]);
          const targetUnitIndex = newUnitIndex - 1;
          const isTemplate = adaptiveEntry.split(',')[1] === 't';
          const adaptiveQuestionTimes: unknown[] = [];
          const adaptiveQuestions: unknown[] = [];
          const adaptiveCheckpoints: unknown[] = [];

          for (const logicRule of (adaptiveLogic?.[newUnitIndex] || [])) {
            const logicOutput = await engine.adaptiveQuestionLogic.evaluate(logicRule);
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
            const adaptiveTemplates = curTdf.tdfs.tutor.setspec.unitTemplate || [];
            const templateIndex = Number(prevUnit.adaptiveUnitTemplate?.[Number(adaptiveUnitIndex)] ?? adaptiveUnitIndex);
            const adaptiveTemplate = adaptiveTemplates[templateIndex];
            if (!adaptiveTemplate) {
              throw new Error(`Adaptive template index ${templateIndex} not found for adaptive target ${adaptiveEntry}.`);
            }
            const unit = engine.adaptiveQuestionLogic.unitBuilder(
              adaptiveTemplate,
              adaptiveQuestionTimes,
              adaptiveQuestions,
              adaptiveCheckpoints
            );
            countCompletion = prevUnit.countcompletion;
            curTdf.tdfs.tutor.unit.splice(newUnitIndex - 1, 0, unit as TdfUnitState);
          } else {
            const unit = await engine.adaptiveQuestionLogic.modifyUnit(
              adaptiveLogic?.[newUnitIndex],
              curTdf.tdfs.tutor.unit[targetUnitIndex]
            );
            curTdf.tdfs.tutor.unit[targetUnitIndex] = unit as TdfUnitState;
          }
        }
      }

      if (engine.adaptiveQuestionLogic.when === Session.get('currentUnitNumber')) {
        // playerController.addStimToSchedule(curTdfUnit);
      }
    }

    Session.set('currentTdfFile', curTdf);
    curExperimentState.currentTdfFile = curTdf;
    await createExperimentState(curExperimentState);
  }

  const currentTdfFileState = Session.get('currentTdfFile') as TdfFileState | null | undefined;
  const curTdfUnit = curTdf.tdfs.tutor.unit[newUnitNum];

  CardStore.setQuestionIndex(0);
  Session.set('clusterIndex', undefined);
  Session.set('schedule', undefined);
  Session.set('currentUnitNumber', newUnitNum);
  Session.set('currentTdfUnit', curTdfUnit);
  Session.set('resetSchedule', true);
  DeliveryParamsStore.set(getCurrentDeliveryParams());
  const tdfSettings = (curTdf.tdfs?.tutor?.setspec?.uiSettings || {}) as Record<string, unknown>;
  const unitSettings = (curTdfUnit?.uiSettings || {}) as Record<string, unknown>;
  const lessonName = curTdf.tdfs?.tutor?.setspec?.lessonname;
  const tdfName = (
    (typeof lessonName === 'string' && lessonName) ||
    curTdf.tdfs?.tutor?.title ||
    curTdf.fileName ||
    ''
  ) as string;
  UiSettingsStore.set(sanitizeUiSettings({ ...tdfSettings, ...unitSettings }, { tdfName }));
  Session.set('currentUnitStartTime', Date.now());
  CardStore.setFeedbackUnset(true);
  CardStore.setFeedbackTypeFromHistory(undefined);
  Session.set('curUnitInstructionsSeen', false);

  const resetStudentPerformance = Boolean(
    (DeliveryParamsStore.get() as Record<string, unknown>).resetStudentPerformance
  );
  let leaveTarget: string;

  if (newUnitNum < curTdf.tdfs.tutor.unit.length) {
    clientConsole(2, 'UNIT FINISHED: show instructions for next unit', newUnitNum);

    const rootTdfId = Session.get('currentRootTdfId');
    if (!rootTdfId) {
      logIdInvariantBreachOnce('unitProgression:missing-currentRootTdfId-before-condition-count-update');
    }
    let rootTDFBoxed = Tdfs ? Tdfs.findOne({ _id: rootTdfId }) : null;
    if (!rootTDFBoxed) {
      clientConsole(1, 'Root TDF not found in client collection, fetching from server:', rootTdfId);
      rootTDFBoxed = (await meteorCallAsync('getTdfById', rootTdfId)) as RootTdfBoxed | null;
      if (!rootTDFBoxed) {
        clientConsole(1, 'Could not find root TDF:', rootTdfId);
        alert('Unfortunately, the root TDF could not be loaded. Please contact your administrator.');
        FlowRouter.go('/home');
        return;
      }
    }

    const rootTDF = rootTDFBoxed.content;
    const setspec = rootTDF.tdfs.tutor.setspec;

    if (
      (setspec.loadbalancing && setspec.countcompletion == newUnitNum) ||
      (setspec.loadbalancing && countCompletion && !setspec.countcompletion)
    ) {
      const curConditionFileName = currentTdfFileState?.fileName || '';
      validateConditionCounts(
        rootTDFBoxed.conditionCounts,
        setspec.condition,
        'unitProgression.count-midflow'
      );
      const curConditionNumber = getConditionIndexOrThrow(setspec.condition, curConditionFileName, 'unitProgression.count-midflow');
      await meteorCallAsync('incrementTdfConditionCount', rootTdfId, curConditionNumber);
    }

    leaveTarget = curTdfUnit?.videosession ? '/card' : '/instructions';
  } else {
    clientConsole(2, 'UNIT FINISHED: No More Units');

    const rootTdfId = Session.get('currentRootTdfId');
    const rootTDFBoxed = Tdfs ? Tdfs.findOne({ _id: rootTdfId }) : null;
    if (rootTDFBoxed) {
      const rootTDF = rootTDFBoxed.content;
      const setspec = rootTDF.tdfs.tutor.setspec;
      if (
        (setspec.countcompletion == 'end' && setspec.loadbalancing) ||
        (setspec.loadbalancing && countCompletion && !setspec.countcompletion)
      ) {
        const curConditionFileName = currentTdfFileState?.fileName || '';
        validateConditionCounts(
          rootTDFBoxed.conditionCounts,
          setspec.condition,
          'unitProgression.count-end'
        );
        const curConditionNumber = getConditionIndexOrThrow(setspec.condition, curConditionFileName, 'unitProgression.count-end');
        await meteorCallAsync('incrementTdfConditionCount', rootTdfId, curConditionNumber);
      }
    }

    leaveTarget = COMPLETED_LESSON_REDIRECT;
  }

  const newExperimentState: ExperimentState = {
    currentUnitNumber: newUnitNum,
    lastUnitCompleted: curUnitNum,
    clusterMapping: Session.get('clusterMapping'),
    mappingSignature: Session.get('mappingSignature'),
    conditionTdfId: curExperimentState.conditionTdfId,
    schedule: null, // Reset schedule for next unit
  };

  if (resetStudentPerformance) {
    const studentUsername = (Session.get('studentUsername') as string) || Meteor.user()?.username || '';
    const userId = Meteor.userId();
    const currentTdfId = Session.get('currentTdfId');
    if (userId && typeof currentTdfId === 'string') {
      await setStudentPerformance(userId, studentUsername, currentTdfId, newUnitNum, true);
    } else {
      logIdInvariantBreachOnce('unitProgression:resetStudentPerformance-missing-context', {
        hasUserId: !!userId,
        currentTdfId: currentTdfId || null,
      });
    }
  }

  await createExperimentState(newExperimentState);
  const { leavePage } = await import('./navigationCleanup');
  await leavePage(leaveTarget);
}

export async function checkUnitCompletion(engine: UnitCompletionEngine | null | undefined): Promise<boolean> {
  if (!engine) {
    clientConsole(1, '[Unit Progression] No engine provided to checkUnitCompletion');
    return false;
  }

  try {
    const isFinished = await engine.unitFinished();
    if (isFinished) {
      await unitIsFinished('Unit Engine');
      return true;
    }
    return false;
  } catch (error) {
    clientConsole(1, '[Unit Progression] Error checking unit completion:', error);
    return false;
  }
}
