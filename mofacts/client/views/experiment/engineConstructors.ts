import { AUTO_TUTOR_UNIT, MODEL_UNIT, SPARC_UNIT, SCHEDULE_UNIT, VIDEO_UNIT } from '../../../common/Definitions';
import type { UnitEngineLike, UnitType } from '../../../common/types';
import { createUnitEngineByType, getCreatableUnitEngineTypes } from './unitEngine';

type CurExperimentData = Record<string, unknown>;

interface EngineUnitLike {
  unitname?: unknown;
  assessmentsession?: unknown;
  learningsession?: unknown;
  sparcsession?: unknown;
  videosession?: unknown;
  autotutorsession?: unknown;
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
  if (unit.sparcsession) shapes.push('sparcsession');
  if (unit.videosession) shapes.push('videosession');
  if (unit.autotutorsession) shapes.push('autotutorsession');
  if (unit.unitinstructions) shapes.push('unitinstructions');
  if (unit.picture) shapes.push('picture');
  if (unit.unitinstructionsquestion) shapes.push('unitinstructionsquestion');
  return shapes;
}

function hasInstructionContent(unit: EngineUnitLike): boolean {
  return Boolean(unit.unitinstructions || unit.picture || unit.unitinstructionsquestion);
}

export function resolveUnitEngineTypeForUnit(unit: EngineUnitLike | null | undefined, source: string): UnitType {
  if (!unit) {
    throw new Error(`${source}: Cannot create unit engine without currentTdfUnit`);
  }

  if (unit.assessmentsession) return SCHEDULE_UNIT;
  if (unit.videosession) return VIDEO_UNIT;
  if (unit.sparcsession) return SPARC_UNIT;
  if (unit.learningsession) return MODEL_UNIT;
  if (unit.autotutorsession) return AUTO_TUTOR_UNIT;
  if (hasInstructionContent(unit)) return 'instruction-only';

  const unitName = typeof unit.unitname === 'string' ? unit.unitname : '<unnamed>';
  const shapes = getAvailableUnitShapes(unit);
  throw new Error(
    `${source}: Cannot determine unit type for unit "${unitName}". ` +
    `Expected assessmentsession, learningsession, sparcsession, videosession, autotutorsession, or instruction-only content. ` +
    `Unit has: ${shapes.length ? shapes.join(', ') : 'no runnable unit shape'}`
  );
}

export async function createUnitEngine(
  unitType: string,
  curExperimentData: CurExperimentData,
  context: EngineCreationContext,
): Promise<UnitEngineLike> {
  try {
    return await createUnitEngineByType(unitType, curExperimentData);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('No unit engine registered for ')) {
      const unitName = typeof context.unit?.unitname === 'string' ? context.unit.unitname : '<unnamed>';
      const unitPart = typeof context.unitNumber === 'number' ? ` at index ${context.unitNumber}` : '';
      const shapes = getAvailableUnitShapes(context.unit);
      const registeredTypes = getCreatableUnitEngineTypes();
      throw new Error(
        `${context.source}: Unknown unit type "${unitType}" for unit "${unitName}"${unitPart}. ` +
        `Registered unit engine types: ${registeredTypes.length ? registeredTypes.map((type) => `'${type}'`).join(', ') : 'none'}. ` +
        `Unit has: ${shapes.length ? shapes.join(', ') : 'no runnable unit shape'}`
      );
    }
    throw error;
  }
}

export async function createUnitEngineForUnit(
  unit: EngineUnitLike | null | undefined,
  curExperimentData: CurExperimentData,
  context: EngineCreationContext,
): Promise<UnitEngineLike> {
  return await createUnitEngine(
    resolveUnitEngineTypeForUnit(unit, context.source),
    curExperimentData,
    { ...context, unit },
  );
}
