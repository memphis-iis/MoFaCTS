import type { LearningComponentContext } from './LearningComponentContext';

export interface LearningComponentContextAdapters {
  readonly getSessionValue: (key: string) => any;
  readonly setSessionValue: (key: string, value: any) => void;
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
