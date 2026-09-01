import { defaultProbFunction } from './probabilityFunctions';
import {
  compileProbabilityExpression,
  interpretProbabilityExpression,
} from '../../safe-expression/safeExpressionEngine';

export type ProbabilityFunction = (p: any, pFunc: any) => any;

export function createTdfProbabilityFunction(probFunctionSource: string | undefined): ProbabilityFunction {
  if (probFunctionSource) {
    const program = compileProbabilityExpression(probFunctionSource);
    return (p: any, pFunc: any) => interpretProbabilityExpression(program, p, pFunc);
  }

  return defaultProbFunction;
}
