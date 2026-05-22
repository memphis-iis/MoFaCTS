export interface LearningComponentContext {
  getSessionValue(key: string): any;
  setSessionValue(key: string, value: any): void;
  getDeliverySettings(): Record<string, unknown>;
  log(level: number, ...args: unknown[]): void;
}
