import type {
  LearningComponentCapability,
  LearningComponentRuntimeContext,
} from './ComponentManifest';

export interface LearningComponentContext {
  getSessionValue(key: string): any;
  setSessionValue(key: string, value: any): void;
  getDeliverySettings(): Record<string, unknown>;
  log(level: number, ...args: unknown[]): void;
}

export interface SessionRuntime {
  getSessionValue(key: string): unknown;
  setSessionValue(key: string, value: unknown): void;
}

export interface DeliverySettingsRuntime {
  getDeliverySettings(): Record<string, unknown>;
}

export interface MediaRuntime {
  resolveMediaUrl(reference: unknown): string | null;
}

export interface HistoryRuntime<TResult = unknown> {
  normalizeResult(result: unknown, context: unknown): TResult;
  writeResult(result: TResult): Promise<void>;
}

export interface ServerMethodRuntime {
  callMethod<T = unknown>(name: string, ...args: unknown[]): Promise<T>;
}

export interface AuthorizationRuntime {
  currentUserHasRole(role: string): boolean;
}

export interface ComponentLogger {
  log(level: number, ...args: unknown[]): void;
}

export interface UserAlertRuntime {
  alertUser(message: string): void;
}

export interface LearningComponentCapabilities {
  session?: SessionRuntime;
  deliverySettings?: DeliverySettingsRuntime;
  stimuli?: unknown;
  adaptiveModel?: unknown;
  assessmentState?: unknown;
  media?: MediaRuntime;
  history?: HistoryRuntime;
  serverMethods?: ServerMethodRuntime;
  authorization?: AuthorizationRuntime;
  logger?: ComponentLogger;
  userAlerts?: UserAlertRuntime;
}

const runtimeCapabilityEntries: readonly [
  keyof LearningComponentCapabilities,
  LearningComponentCapability,
][] = [
  ['session', 'session'],
  ['deliverySettings', 'delivery-settings'],
  ['stimuli', 'stimuli'],
  ['adaptiveModel', 'adaptive-model'],
  ['assessmentState', 'assessment-state'],
  ['media', 'media'],
  ['history', 'history'],
  ['serverMethods', 'server-methods'],
  ['authorization', 'authz'],
  ['logger', 'logging'],
  ['userAlerts', 'ui-alerts'],
];

export function getLearningComponentCapabilitySet(
  capabilities: LearningComponentCapabilities,
): ReadonlySet<LearningComponentCapability> {
  const declared = new Set<LearningComponentCapability>();
  for (const [runtimeKey, manifestCapability] of runtimeCapabilityEntries) {
    if (capabilities[runtimeKey] !== undefined) {
      declared.add(manifestCapability);
    }
  }
  return declared;
}

export function createLearningComponentRuntimeContext(
  capabilities: LearningComponentCapabilities,
): Pick<LearningComponentRuntimeContext, 'capabilities'> {
  return {
    capabilities: getLearningComponentCapabilitySet(capabilities),
  };
}
