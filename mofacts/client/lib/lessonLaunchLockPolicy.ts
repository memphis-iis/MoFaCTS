import { MODEL_UNIT, SCHEDULE_UNIT, VIDEO_UNIT } from '../../common/Definitions';
import { resolveUnitEngineTypeForUnit } from '../views/experiment/engineConstructors';

type LaunchUnitLike = {
  assessmentsession?: unknown;
  learningsession?: unknown;
  videosession?: unknown;
  autotutorsession?: unknown;
  unitinstructions?: unknown;
  picture?: unknown;
  unitinstructionsquestion?: unknown;
  deliverySettings?: Record<string, unknown>;
  displayMinSeconds?: unknown;
  displayMaxSeconds?: unknown;
};

function hasDisplayTimingLock(unit: LaunchUnitLike): boolean {
  const deliverySettings = unit.deliverySettings || {};
  return Boolean(
    deliverySettings.displayMinSeconds ||
    deliverySettings.displayMaxSeconds ||
    unit.displayMinSeconds ||
    unit.displayMaxSeconds
  );
}

export function shouldLockMultiTdfLaunchToCurrentUnit(unit: LaunchUnitLike | null | undefined): boolean {
  if (!unit) {
    return false;
  }

  const unitType = resolveUnitEngineTypeForUnit(unit, 'lessonLaunch.shouldLockMultiTdfLaunchToCurrentUnit');
  if (unitType === SCHEDULE_UNIT) {
    return true;
  }

  if (unitType === MODEL_UNIT || unitType === VIDEO_UNIT) {
    return hasDisplayTimingLock(unit);
  }

  return false;
}
