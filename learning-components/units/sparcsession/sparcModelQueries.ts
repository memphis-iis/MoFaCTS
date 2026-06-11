import type {
  ModelPracticeStateProvider,
  ModelPracticeStateQuery,
} from '../../runtime/modelPracticeStateQueries';
import type { SparcModelQuery } from './sparcSessionContracts';

export type SparcModelQueryCapability = ModelPracticeStateProvider;

export function toModelPracticeStateQuery(
  query: SparcModelQuery,
): ModelPracticeStateQuery {
  return {
    target: query.target,
    metric: query.metric,
  };
}

export function evaluateSparcModelQuery(
  capability: SparcModelQueryCapability,
  query: SparcModelQuery,
): unknown {
  return capability.queryModelPracticeState(toModelPracticeStateQuery(query));
}
