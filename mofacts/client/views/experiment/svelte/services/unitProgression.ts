/**
 * Unit Progression Service
 *
 * Handles unit advancement during active play.
 */

import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { meteorCallAsync } from '../../../../index';
import { clientConsole } from '../../../../lib/userSessionHelpers';
import { setStudentPerformance } from '../../../../lib/studentPerformanceRuntime';
import { refreshCurrentDeliverySettingsStore } from '../../../../lib/currentDeliverySettings';
import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
import { getExperimentState, createExperimentState } from './experimentState';
import { setFeedbackTypeFromHistory, setFeedbackUnset } from './feedbackRuntimeState';
import {
  resolveSessionContentSurface,
  resolveSessionSurfaceState,
  resolveSessionSurfaceUnitEntryRoute,
} from './sessionSurfaceMode';
import '../../../../../common/Collections';
import type { ExperimentState } from '../../../../../common/types/experiment';
import type { UnitCompletionEngine } from '../../../../../common/types/svelteServices';
import { COMPLETED_LESSON_REDIRECT } from '../../../../lib/cardEntryIntent';
import { getCourseAssignmentLaunchContext } from '../../../../lib/courseAssignmentLaunchContext';
import { assertIdInvariants, logIdInvariantBreachOnce } from '../../../../lib/idContext';
import { translatePlatformString } from '../../../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
import { resolveRuntimeEngine } from './cardRuntimeState';
import { resetQuestionIndex } from './trialProgressionState';

const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

type TdfFileState = Record<string, unknown> & {
  tdfs: {
    tutor: {
      title?: string;
      deliverySettings?: Record<string, unknown>;
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
  autotutorsession?: unknown;
  deliverySettings?: Record<string, unknown>;
};

type UnitProgressionEngine = {
  adaptiveCoordinator?: {
    applyUnitTransitions: (
      tdfFile: TdfFileState,
      currentUnitNumber: number,
    ) => Promise<{ tdfFile: TdfFileState; countCompletion?: unknown }>;
  };
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
  const curUnitNum = currentUnitNumber;
  const prevUnit = curTdf.tdfs.tutor.unit[curUnitNum] || ({} as TdfUnitState);
  const newUnitNum = curUnitNum + 1;
  let countCompletion = prevUnit.countcompletion;
  const curExperimentState = await getExperimentState();

  if (adaptive) {
    const engine = resolveRuntimeEngine() as unknown as UnitProgressionEngine;
    if (!engine.adaptiveCoordinator) {
      throw new Error('Adaptive unit progression requires an adaptive coordinator');
    }
    const transition = await engine.adaptiveCoordinator.applyUnitTransitions(curTdf, currentUnitNumber);
    countCompletion = transition.countCompletion;
    Session.set('currentTdfFile', transition.tdfFile);
  }

  const currentTdfFileState = Session.get('currentTdfFile') as TdfFileState | null | undefined;
  const curTdfUnit = curTdf.tdfs.tutor.unit[newUnitNum];

  resetQuestionIndex();
  Session.set('clusterIndex', undefined);
  Session.set('schedule', undefined);
  Session.set('currentUnitNumber', newUnitNum);
  Session.set('currentTdfUnit', curTdfUnit);
  Session.set('resetSchedule', true);
  refreshCurrentDeliverySettingsStore();
  Session.set('currentUnitStartTime', Date.now());
  setFeedbackUnset(true);
  setFeedbackTypeFromHistory(undefined);
  Session.set('curUnitInstructionsSeen', false);

  const resetStudentPerformance = Boolean(
    (deliverySettingsStore.get() as Record<string, unknown>).resetStudentPerformance
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
      rootTDFBoxed = (await meteorCallAsync('getTdfById', rootTdfId, {
        courseAssignment: getCourseAssignmentLaunchContext(),
      })) as RootTdfBoxed | null;
      if (!rootTDFBoxed) {
        clientConsole(1, 'Could not find root TDF:', rootTdfId);
        alert(translatePlatformString(getActiveUiLocale(), 'lesson.rootTdfLoadFailed'));
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

    leaveTarget = resolveSessionSurfaceUnitEntryRoute(resolveSessionContentSurface(resolveSessionSurfaceState({
      currentTdfUnit: curTdfUnit,
    })));
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

export async function revisitUnit(unitNumber: string | number): Promise<void> {
  const curTdf = Session.get('currentTdfFile') as TdfFileState | null;
  if (!curTdf?.tdfs?.tutor?.unit) {
    throw new Error('Cannot revisit a unit without an active TDF unit list');
  }

  const currentUnitNumber = Number(Session.get('currentUnitNumber') || 0);
  const furthestUnit = Math.max(currentUnitNumber, Number(Session.get('furthestUnit') || 0));
  Session.set('furthestUnit', furthestUnit);

  const newUnitNumber = Number.parseInt(String(unitNumber), 10);
  if (!Number.isInteger(newUnitNumber) || newUnitNumber < 0) {
    throw new Error(`Cannot revisit invalid unit index ${String(unitNumber)}`);
  }
  const revisitedUnit = curTdf.tdfs.tutor.unit[newUnitNumber];
  if (!revisitedUnit) {
    throw new Error(`Cannot revisit missing unit ${newUnitNumber}`);
  }

  resetQuestionIndex();
  Session.set('clusterIndex', undefined);
  Session.set('currentUnitNumber', newUnitNumber);
  Session.set('currentTdfUnit', revisitedUnit);
  Session.set('resetSchedule', true);
  refreshCurrentDeliverySettingsStore();
  Session.set('currentUnitStartTime', Date.now());
  setFeedbackUnset(true);
  setFeedbackTypeFromHistory(undefined);
  Session.set('curUnitInstructionsSeen', false);

  const previousExperimentState = await getExperimentState();
  await createExperimentState({
    ...previousExperimentState,
    questionIndex: 0,
    clusterIndex: 0,
    shufIndex: 0,
    whichStim: 0,
    currentUnitNumber: newUnitNumber,
    schedule: null,
    scheduleUnitNumber: null,
    videoCheckpointAnchorIndex: null,
    videoCheckpointAnchorTime: null,
    videoPendingQuestionIndex: null,
  });

  FlowRouter.go('/instructions');
}
