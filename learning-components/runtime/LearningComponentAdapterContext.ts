import type { LearningComponentContext } from './LearningComponentContext';
import type {
  UnitEngineSessionReadKey,
  UnitEngineSessionWriteKey,
} from '../units/UnitEngineSessionKeys';

export interface LearningComponentContextAdapters {
  readonly getSessionValue: (key: UnitEngineSessionReadKey) => any;
  readonly setSessionValue: (key: UnitEngineSessionWriteKey, value: any) => void;
  readonly getDeliverySettings: () => Record<string, unknown>;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export function createLearningComponentAdapterContext(
  adapters: LearningComponentContextAdapters,
): LearningComponentContext {
  return {
    getSessionValue: adapters.getSessionValue,
    setSessionValue: adapters.setSessionValue,
    getDeliverySettings: adapters.getDeliverySettings,
    log: adapters.log,
  };
}
