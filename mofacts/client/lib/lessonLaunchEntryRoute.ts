import { resolveUnitEngineTypeForUnit } from '../views/experiment/engineConstructors';
import { CARD_ENTRY_INTENT, type CardEntryIntent } from './cardEntryIntent';
import type { UnitType } from '../../common/types';

type TdfUnitLike = Record<string, unknown>;

type TdfContentLike = {
  tdfs?: {
    tutor?: {
      unit?: TdfUnitLike[];
    };
  };
};

export type LessonLaunchEntryRoute =
  | { route: '/card' }
  | {
      route: '/instructions';
      currentUnitNumber: number;
      currentTdfUnit: TdfUnitLike;
      curUnitInstructionsSeen: boolean;
    };

type UnitEntrySurface = 'instructions' | 'card';

function resolveUnitEntrySurface(unit: TdfUnitLike, unitType: UnitType): UnitEntrySurface {
  const instructionSurfaceIsPresent = Boolean(
    unit.unitinstructions ||
    unit.picture ||
    unit.unitinstructionsquestion
  );

  return unitType === 'instruction-only' || instructionSurfaceIsPresent
    ? 'instructions'
    : 'card';
}

export function resolveLessonLaunchEntryRoute(params: {
  content: TdfContentLike;
  intent: CardEntryIntent;
}): LessonLaunchEntryRoute {
  if (params.intent !== CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY) {
    return { route: '/card' };
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
  const entrySurface = resolveUnitEntrySurface(firstUnit, unitType);

  return entrySurface === 'instructions'
    ? {
        route: '/instructions',
        currentUnitNumber: 0,
        currentTdfUnit: firstUnit,
        curUnitInstructionsSeen: false,
      }
    : { route: '/card' };
}
