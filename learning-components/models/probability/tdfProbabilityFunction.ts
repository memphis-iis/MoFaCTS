import { defaultProbFunction } from './probabilityFunctions';

export type ProbabilityFunction = (p: any, pFunc: any) => any;

export function createTdfProbabilityFunction(unit: any): ProbabilityFunction {
  let probFunctionSource = undefined;
  if (unit.learningsession)
    probFunctionSource = unit.learningsession.calculateProbability ? unit.learningsession.calculateProbability.trim() : undefined;
  else if (unit.videosession)
    probFunctionSource = unit.videosession.calculateProbability ? unit.videosession.calculateProbability.trim() : undefined;

  if (probFunctionSource) {
    return new Function('p', 'pFunc', '\'use strict\';\n' + probFunctionSource) as ProbabilityFunction; // jshint ignore:line
  }

  return defaultProbFunction;
}
