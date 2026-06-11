import { defaultProbFunction } from './probabilityFunctions';

export type ProbabilityFunction = (p: any, pFunc: any) => any;

export function createTdfProbabilityFunction(probFunctionSource: string | undefined): ProbabilityFunction {
  if (probFunctionSource) {
    return new Function('p', 'pFunc', '\'use strict\';\n' + probFunctionSource) as ProbabilityFunction; // jshint ignore:line
  }

  return defaultProbFunction;
}
