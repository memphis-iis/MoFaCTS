import {
  createAdaptiveLogisticUnitEngine,
  type AdaptiveLogisticServerMethods,
  type CreateAdaptiveLogisticUnitEngineDeps,
} from '../../models/adaptive-logistic/AdaptiveLogisticUnitEngine';
import { LEARNING_SESSION_UNIT_TYPE } from '../unitTypes';
import {
  resolveLearningSessionClusterListSource,
  resolveLearningSessionModelPreparationClusterListSource,
  resolveLearningSessionProbabilitySource,
  resolveLearningSessionRuntimeConfig,
  resolveLearningSessionUnitMode,
} from './learningSessionRuntimeConfig';

export type LearningSessionServerMethods = AdaptiveLogisticServerMethods;
export type CreateLearningSessionUnitEngineDeps = CreateAdaptiveLogisticUnitEngineDeps;

export async function createLearningSessionUnitEngine(
  deps: CreateLearningSessionUnitEngineDeps,
): Promise<any> {
  return await createAdaptiveLogisticUnitEngine(deps, {
    unitType: LEARNING_SESSION_UNIT_TYPE,
    unitLabel: 'Learning/video session',
    resolveRuntimeConfig: resolveLearningSessionRuntimeConfig,
    resolveUnitMode: resolveLearningSessionUnitMode,
    resolveProbabilitySource: resolveLearningSessionProbabilitySource,
    resolveUnitClusterListSource: resolveLearningSessionClusterListSource,
    resolveModelPreparationClusterListSource: resolveLearningSessionModelPreparationClusterListSource,
  });
}
