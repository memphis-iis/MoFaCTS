import type {
  LearningComponentCapability,
  LearningComponentRuntimeContext,
} from './ComponentManifest';
import type { CanonicalHistoryRecord } from './historyEnvelope';
import type { ModelPracticeRuntime } from './modelPracticeRuntime';
import type {
  UnitEngineSessionReadKey,
  UnitEngineSessionWriteKey,
} from '../units/UnitEngineSessionKeys';

export interface LearningComponentContext {
  getSessionValue(key: UnitEngineSessionReadKey): any;
  setSessionValue(key: UnitEngineSessionWriteKey, value: any): void;
  getDeliverySettings(): Record<string, unknown>;
  log(level: number, ...args: unknown[]): void;
}

export interface SessionRuntime {
  getSessionValue(key: UnitEngineSessionReadKey): unknown;
  setSessionValue(key: UnitEngineSessionWriteKey, value: unknown): void;
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
  writeCanonicalHistory(record: CanonicalHistoryRecord): Promise<void>;
}

export type ServerMethodRuntime = Record<string, (...args: any[]) => Promise<unknown>>;

export interface AuthorizationRuntime {
  currentUserHasRole(role: string): boolean;
}

export interface ComponentLogger {
  log(level: number, ...args: unknown[]): void;
}

export interface UserAlertRuntime {
  alertUser(message: string): void;
}

export type AiProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AiProviderJsonSchema = Record<string, unknown>;

export type AiProviderCallOptions<T> = {
  intent: {
    title: string;
    schemaName?: string;
    schema?: AiProviderJsonSchema;
    strictSchema?: boolean;
    parse: (value: unknown) => T;
    missingContentMessage?: string;
  };
  messages: AiProviderMessage[];
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  requireUsageCost?: boolean;
  telemetry?: {
    surface?: string;
    operation?: string;
    componentId?: string;
    unitType?: string;
    requestId?: string;
  };
};

export type AiProviderResult<T> = {
  value: T;
  rawContent: string;
  responseBody: unknown;
  costUsd?: number;
};

export interface AiProviderRuntime {
  callOpenRouterJson<T>(options: AiProviderCallOptions<T>): Promise<AiProviderResult<T>>;
}

export interface LearningComponentCapabilities {
  session?: SessionRuntime;
  deliverySettings?: DeliverySettingsRuntime;
  stimuli?: unknown;
  cardState?: unknown;
  adaptiveModel?: ModelPracticeRuntime;
  assessmentState?: unknown;
  media?: MediaRuntime;
  history?: HistoryRuntime;
  serverMethods?: ServerMethodRuntime;
  authorization?: AuthorizationRuntime;
  logger?: ComponentLogger;
  userAlerts?: UserAlertRuntime;
  aiProvider?: AiProviderRuntime;
}

const runtimeCapabilityEntries: readonly [
  keyof LearningComponentCapabilities,
  LearningComponentCapability,
][] = [
  ['session', 'session'],
  ['deliverySettings', 'delivery-settings'],
  ['stimuli', 'stimuli'],
  ['cardState', 'card-state'],
  ['adaptiveModel', 'adaptive-model'],
  ['assessmentState', 'assessment-state'],
  ['media', 'media'],
  ['history', 'history'],
  ['serverMethods', 'server-methods'],
  ['authorization', 'authz'],
  ['logger', 'logging'],
  ['userAlerts', 'ui-alerts'],
  ['aiProvider', 'ai-provider'],
];

const runtimeCapabilityFunctionRequirements: Partial<Record<
  keyof LearningComponentCapabilities,
  readonly string[]
>> = {
  session: ['getSessionValue', 'setSessionValue'],
  deliverySettings: ['getDeliverySettings'],
  cardState: ['setQuestionIndex', 'setCurrentAnswer'],
  adaptiveModel: ['applyModelPracticeUpdate', 'queryModelPracticeState'],
  media: ['resolveMediaUrl'],
  history: ['normalizeResult', 'writeResult', 'writeCanonicalHistory'],
  authorization: ['currentUserHasRole'],
  logger: ['log'],
  userAlerts: ['alertUser'],
  aiProvider: ['callOpenRouterJson'],
};

function assertRuntimeCapabilityShape(
  runtimeKey: keyof LearningComponentCapabilities,
  value: unknown,
): void {
  const requiredFunctions = runtimeCapabilityFunctionRequirements[runtimeKey];
  if (!requiredFunctions) {
    if (runtimeKey === 'serverMethods') {
      if (!value || typeof value !== 'object') {
        throw new Error('Runtime capability "serverMethods" must be an object');
      }
      const methodNames = Object.keys(value as Record<string, unknown>);
      const nonFunctionNames = methodNames.filter((methodName) =>
        typeof (value as Record<string, unknown>)[methodName] !== 'function'
      );
      if (methodNames.length === 0) {
        throw new Error('Runtime capability "serverMethods" must expose named method functions');
      }
      if (nonFunctionNames.length > 0) {
        throw new Error(`Runtime capability "serverMethods" has non-function entries: ${nonFunctionNames.join(', ')}`);
      }
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    throw new Error(`Runtime capability "${runtimeKey}" must be an object`);
  }
  const missingFunctions = requiredFunctions.filter((functionName) =>
    typeof (value as Record<string, unknown>)[functionName] !== 'function'
  );
  if (missingFunctions.length > 0) {
    throw new Error(
      `Runtime capability "${runtimeKey}" is missing required functions: ${missingFunctions.join(', ')}`,
    );
  }
}

export function getLearningComponentCapabilitySet(
  capabilities: LearningComponentCapabilities,
): ReadonlySet<LearningComponentCapability> {
  const declared = new Set<LearningComponentCapability>();
  for (const [runtimeKey, manifestCapability] of runtimeCapabilityEntries) {
    if (capabilities[runtimeKey] !== undefined) {
      assertRuntimeCapabilityShape(runtimeKey, capabilities[runtimeKey]);
      declared.add(manifestCapability);
    }
  }
  return declared;
}

export function createLearningComponentRuntimeContext(
  capabilities: LearningComponentCapabilities,
): Pick<LearningComponentRuntimeContext, 'capabilities' | 'serverMethods'> {
  const context: Pick<LearningComponentRuntimeContext, 'capabilities' | 'serverMethods'> = {
    capabilities: getLearningComponentCapabilitySet(capabilities),
  };
  if (capabilities.serverMethods) {
    return Object.assign(context, {
      serverMethods: new Set(Object.keys(capabilities.serverMethods)),
    });
  }
  return context;
}
