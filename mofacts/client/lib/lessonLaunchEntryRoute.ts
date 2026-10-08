import { resolveUnitEngineTypeForUnit } from '../views/experiment/engineConstructors';
import { CARD_ENTRY_INTENT, type CardEntryIntent } from './cardEntryIntent';
import { isConditionRootWithoutUnitArray } from './tdfUtils';
import type { UnitType } from '../../common/types';

type TdfUnitLike = Record<string, unknown>;

type TdfContentLike = {
  tdfs?: {
    tutor?: {
      setspec?: {
        condition?: unknown[];
      };
      unit?: TdfUnitLike[];
    };
  };
};

export type LessonLaunchEntryRoute =
  | { route: '/content'; currentUnitNumber?: number; currentTdfUnit?: TdfUnitLike; curUnitInstructionsSeen?: boolean }
  | {
      route: '/instructions';
      currentUnitNumber: number;
      currentTdfUnit: TdfUnitLike;
      curUnitInstructionsSeen: boolean;
    };

type UnitEntrySurface = 'instructions' | 'content';

export function initializeLessonLaunchEntry(
  entry: LessonLaunchEntryRoute,
  setSession: (key: string, value: unknown) => void,
): LessonLaunchEntryRoute {
  if (entry.route === '/instructions' || entry.currentUnitNumber !== undefined) {
    setSession('currentUnitNumber', entry.currentUnitNumber);
    setSession('currentTdfUnit', entry.currentTdfUnit);
    setSession('curUnitInstructionsSeen', entry.curUnitInstructionsSeen);
  }
  return entry;
}

function resolveUnitEntrySurface(unit: TdfUnitLike, unitType: UnitType): UnitEntrySurface {
  const instructionSurfaceIsPresent = Boolean(
    unit.unitinstructions ||
    unit.picture
  );

  if (unitType === 'gaze-calibration') return 'content';
  return unitType === 'instruction-only' || instructionSurfaceIsPresent
    ? 'instructions'
    : 'content';
}

export function resolveLessonLaunchEntryRoute(params: {
  content: TdfContentLike;
  intent: CardEntryIntent;
}): LessonLaunchEntryRoute {
  if (params.intent !== CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY) {
    return { route: '/content' };
  }

  if (isConditionRootWithoutUnitArray(params.content)) {
    return { route: '/content' };
  }

  const unitList = params.content?.tdfs?.tutor?.unit;
  if (!Array.isArray(unitList) || unitList.length === 0) {
    throw new Error('lessonLaunch.entryRoute: initial launch requires a populated tutor.unit array');
  }

  const firstUnit = unitList[0];
  if (!firstUnit) {
    throw new Error('lessonLaunch.entryRoute: initial launch cannot resolve unit 0');
  }

  const unitType = resolveUnitEngineTypeForUnit(firstUnit, 'lessonLaunch.entryRoute');
  if (unitType === 'gaze-calibration') return { route: '/content', currentUnitNumber: 0, currentTdfUnit: firstUnit, curUnitInstructionsSeen: true };
  const entrySurface = resolveUnitEntrySurface(firstUnit, unitType);

  return entrySurface === 'instructions'
    ? {
        route: '/instructions',
        currentUnitNumber: 0,
        currentTdfUnit: firstUnit,
        curUnitInstructionsSeen: false,
      }
    : { route: '/content' };
}
