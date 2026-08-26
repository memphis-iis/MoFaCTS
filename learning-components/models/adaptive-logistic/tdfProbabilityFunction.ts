import { defaultProbFunction } from './probabilityFunctions';
import { compileProbabilityExpression } from '../../safe-expression/safeExpressionEngine';

export type ProbabilityFunction = (p: any, pFunc: any) => any;

export function createTdfProbabilityFunction(probFunctionSource: string | undefined): ProbabilityFunction {
  if (probFunctionSource) {
    // Stage 1 keeps the established execution path for compatibility discovery,
    // but every runtime-loaded expression must first satisfy the same contract
    // used by authoring, imports, and deployment readiness.
    compileProbabilityExpression(probFunctionSource);
    return new Function('p', 'pFunc', '\'use strict\';\n' + probFunctionSource) as ProbabilityFunction; // jshint ignore:line
  }

  return defaultProbFunction;
}
