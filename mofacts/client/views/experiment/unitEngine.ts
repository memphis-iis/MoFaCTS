import {
  createEmptyUnit as createEmptyUnitWithDeps,
  createAutoTutorUnit as createAutoTutorUnitWithDeps,
  createUnitEngineByType as createUnitEngineByTypeWithDeps,
  createModelUnit as createModelUnitWithDeps,
  createScheduleUnit as createScheduleUnitWithDeps,
  createVideoUnit as createVideoUnitWithDeps,
  getCreatableUnitEngineTypes as getCreatableUnitEngineTypesWithDeps,
} from '../../../../learning-components/units/createUnitEngine';
import { createAppUnitEngineRuntimeContext } from './unitEngineRuntimeContext';

export {createScheduleUnit, createModelUnit, createEmptyUnit, createVideoUnit, createAutoTutorUnit};

async function createEmptyUnit(curExperimentData: any) {
  return await createEmptyUnitWithDeps(createAppUnitEngineRuntimeContext(), curExperimentData);
}

async function createModelUnit(curExperimentData: any) {
  return await createModelUnitWithDeps(createAppUnitEngineRuntimeContext(), curExperimentData);
}

async function createScheduleUnit(curExperimentData: any) {
  return await createScheduleUnitWithDeps(createAppUnitEngineRuntimeContext(), curExperimentData);
}

async function createVideoUnit(curExperimentData: any) {
  return await createVideoUnitWithDeps(createAppUnitEngineRuntimeContext(), curExperimentData);
}

async function createAutoTutorUnit(curExperimentData: any) {
  return await createAutoTutorUnitWithDeps(createAppUnitEngineRuntimeContext(), curExperimentData);
}

async function createUnitEngineByType(unitType: string, curExperimentData: any) {
  return await createUnitEngineByTypeWithDeps(createAppUnitEngineRuntimeContext(), curExperimentData, unitType);
}

function getCreatableUnitEngineTypes(): string[] {
  return getCreatableUnitEngineTypesWithDeps(createAppUnitEngineRuntimeContext());
}

export { createUnitEngineByType, getCreatableUnitEngineTypes };
