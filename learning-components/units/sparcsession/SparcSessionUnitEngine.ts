import {
  createAdaptiveLogisticUnitEngine,
  type CreateAdaptiveLogisticUnitEngineDeps,
} from '../../models/adaptive-logistic/AdaptiveLogisticUnitEngine';
import { SPARC_SESSION_UNIT_TYPE } from '../unitTypes';
import {
  resolveSparcSessionClusterListSource,
  resolveSparcSessionModelPreparationClusterListSource,
  resolveSparcSessionProbabilitySource,
  resolveSparcSessionRuntimeConfig,
  resolveSparcSessionUnitMode,
} from './sparcSessionRuntimeConfig';

export { SPARC_SESSION_UNIT_TYPE };

export type CreateSparcSessionUnitEngineDeps = CreateAdaptiveLogisticUnitEngineDeps;

export async function createSparcSessionUnitEngine(
  deps: CreateSparcSessionUnitEngineDeps,
): Promise<any> {
  return await createAdaptiveLogisticUnitEngine(deps, {
    unitType: SPARC_SESSION_UNIT_TYPE,
    unitLabel: 'SPARC session',
    resolveRuntimeConfig: resolveSparcSessionRuntimeConfig,
    resolveUnitMode: resolveSparcSessionUnitMode,
    resolveProbabilitySource: resolveSparcSessionProbabilitySource,
    resolveUnitClusterListSource: (unit) => resolveSparcSessionClusterListSource(unit),
    resolveModelPreparationClusterListSource: resolveSparcSessionModelPreparationClusterListSource,
  });
}
