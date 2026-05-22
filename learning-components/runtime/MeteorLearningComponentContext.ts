import type { LearningComponentContext } from './LearningComponentContext';

export interface MeteorLearningComponentContextAdapters {
  readonly getSessionValue: (key: string) => any;
  readonly setSessionValue: (key: string, value: any) => void;
  readonly getDeliverySettings: () => Record<string, unknown>;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export function createMeteorLearningComponentContext(
  adapters: MeteorLearningComponentContextAdapters,
): LearningComponentContext {
  return {
    getSessionValue: adapters.getSessionValue,
    setSessionValue: adapters.setSessionValue,
    getDeliverySettings: adapters.getDeliverySettings,
    log: adapters.log,
  };
}
