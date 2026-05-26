import { defaultProbFunction } from './probabilityFunctions';
import { resolveLearningSessionProbabilitySource } from '../learningSessionRuntimeConfig';

export type ProbabilityFunction = (p: any, pFunc: any) => any;

export function createTdfProbabilityFunction(unit: any): ProbabilityFunction {
  const probFunctionSource = resolveLearningSessionProbabilitySource(unit);

  if (probFunctionSource) {
    return new Function('p', 'pFunc', '\'use strict\';\n' + probFunctionSource) as ProbabilityFunction; // jshint ignore:line
  }

  return defaultProbFunction;
}
