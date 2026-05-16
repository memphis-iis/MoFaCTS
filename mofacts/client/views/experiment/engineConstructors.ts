import { MODEL_UNIT, SCHEDULE_UNIT, VIDEO_UNIT } from '../../../common/Definitions';
import type { UnitEngineLike, UnitType } from '../../../common/types';
import { createEmptyUnit, createModelUnit, createScheduleUnit, createVideoUnit } from './unitEngine';

type CurExperimentData = Record<string, unknown>;

interface EngineUnitLike {
  unitname?: unknown;
  assessmentsession?: unknown;
  learningsession?: unknown;
  videosession?: unknown;
  unitinstructions?: unknown;
  picture?: unknown;
  unitinstructionsquestion?: unknown;
}

interface EngineCreationContext {
  source: string;
  unit?: EngineUnitLike | null | undefined;
  unitNumber?: number | undefined;
}

function getAvailableUnitShapes(unit: EngineUnitLike | null | undefined): string[] {
  if (!unit) {
    return [];
  }

  const shapes: string[] = [];
  if (unit.assessmentsession) shapes.push('assessmentsession');
  if (unit.learningsession) shapes.push('learningsession');
  if (unit.videosession) shapes.push('videosession');
  if (unit.unitinstructions) shapes.push('unitinstructions');
  if (unit.picture) shapes.push('picture');
  if (unit.unitinstructionsquestion) shapes.push('unitinstructionsquestion');
  return shapes;
}

function hasInstructionContent(unit: EngineUnitLike): boolean {
  return Boolean(unit.unitinstructions || unit.picture || unit.unitinstructionsquestion);
}

function deriveEngineUnitType(unit: EngineUnitLike | null | undefined, source: string): UnitType {
  if (!unit) {
    throw new Error(`${source}: Cannot create unit engine without currentTdfUnit`);
  }

  if (unit.assessmentsession) return SCHEDULE_UNIT;
  if (unit.videosession) return VIDEO_UNIT;
  if (unit.learningsession) return MODEL_UNIT;
  if (hasInstructionContent(unit)) return 'instruction-only';

  const unitName = typeof unit.unitname === 'string' ? unit.unitname : '<unnamed>';
  const shapes = getAvailableUnitShapes(unit);
  throw new Error(
    `${source}: Cannot determine unit type for unit "${unitName}". ` +
    `Expected assessmentsession, learningsession, videosession, or instruction-only content. ` +
    `Unit has: ${shapes.length ? shapes.join(', ') : 'no runnable unit shape'}`
  );
}

export async function createUnitEngine(
  unitType: string,
  curExperimentData: CurExperimentData,
  context: EngineCreationContext,
): Promise<UnitEngineLike> {
  switch (unitType) {
    case SCHEDULE_UNIT:
      return await createScheduleUnit(curExperimentData);
    case MODEL_UNIT:
      return await createModelUnit(curExperimentData);
    case VIDEO_UNIT:
      return await createVideoUnit(curExperimentData);
    case 'instruction-only':
      return await createEmptyUnit(curExperimentData);
    default: {
      const unitName = typeof context.unit?.unitname === 'string' ? context.unit.unitname : '<unnamed>';
      const unitPart = typeof context.unitNumber === 'number' ? ` at index ${context.unitNumber}` : '';
      const shapes = getAvailableUnitShapes(context.unit);
      throw new Error(
        `${context.source}: Unknown unit type "${unitType}" for unit "${unitName}"${unitPart}. ` +
        `Expected '${SCHEDULE_UNIT}', '${MODEL_UNIT}', '${VIDEO_UNIT}', or 'instruction-only'. ` +
        `Unit has: ${shapes.length ? shapes.join(', ') : 'no runnable unit shape'}`
      );
    }
  }
}

export async function createUnitEngineForUnit(
  unit: EngineUnitLike | null | undefined,
  curExperimentData: CurExperimentData,
  context: EngineCreationContext,
): Promise<UnitEngineLike> {
  return await createUnitEngine(
    deriveEngineUnitType(unit, context.source),
    curExperimentData,
    { ...context, unit },
  );
}
