import { createBaseUnitEngine } from './createBaseUnitEngine';
import {
  createRegisteredUnitEngine,
  getRegisteredUnitEngineTypes,
  hasRegisteredUnitEngine,
  registerUnitEngine,
  registerUnitEngineWithDeps,
} from './UnitEngineRegistry';
import { registerLearningComponents } from '../runtime/registerLearningComponents';
import { registerTrialDisplayAdapter } from '../runtime/TrialDisplayAdapterRegistry';
import { defaultUnitComponentManifestsFromCatalog } from '../defaultLearningComponentCatalog';
import type { LearningComponentCapability } from '../runtime/ComponentManifest';
import type { AiProviderRuntime } from '../runtime/LearningComponentContext';
import {
  getUnitEngineServerMethodNames,
  type UnitEngineServerMethods,
} from './UnitEngineServerMethods';
import type {
  UnitEngineSessionReadKey,
  UnitEngineSessionWriteKey,
} from './UnitEngineSessionKeys';
import {
  ASSESSMENT_SESSION_UNIT_TYPE,
  AUTO_TUTOR_SESSION_UNIT_TYPE,
  INSTRUCTION_UNIT_TYPE,
  LEARNING_SESSION_UNIT_TYPE,
  VIDEO_SESSION_UNIT_TYPE,
} from './defaultUnitComponents';

export interface UnitEngineAppRuntime {
  readonly extend: (target: any, source: any) => any;
}

export interface UnitEngineSessionRuntime {
  readonly getSessionValue: (key: UnitEngineSessionReadKey) => any;
  readonly setSessionValue: (key: UnitEngineSessionWriteKey, value: any) => void;
}

export interface UnitEngineDeliverySettingsRuntime {
  readonly getDeliverySettings: () => Record<string, any>;
}

export interface UnitEngineStimuliRuntime {
  readonly getStimCount: () => number;
  readonly getStimCluster: (clusterIndex: any) => any;
  readonly getTestType: () => string;
  readonly getDisplayAnswerText: (answer: any) => string;
  readonly extractDelimFields: (source: any, target: any[]) => void;
  readonly rangeVal: (source: any) => any[];
  readonly legacyFloat: (source: any) => number;
  readonly legacyInt: (source: any) => number;
  readonly displayify: (value: any) => any;
  readonly findTdfById: (tdfId: any) => any;
}

export interface UnitEngineAdaptiveModelRuntime {
  readonly createAdaptiveCoordinator: (currentUnit: unknown) => any;
  readonly getHiddenItems: () => unknown[];
  readonly setNumVisibleCards: (numVisibleCards: number) => void;
  readonly updateCurStudentPerformance: (wasCorrect: any, practiceTime: any, testType: any) => void;
  readonly updateCurStudedentPracticeTime: (practiceTime: any) => void;
}

export interface UnitEngineHistoryRuntime {
  readonly reconstructLearningStateFromHistory: (
    historyRows: any[],
    options?: { allowResponseLessSparcModelPractice?: boolean },
  ) => any;
}

export interface UnitEngineCardStateRuntime {
  readonly setQuestionIndex: (questionIndex: number) => void;
  readonly setCurrentAnswer: (value: string | undefined) => void;
  readonly setAlternateDisplayIndex: (value: number | undefined) => void;
  readonly setOriginalQuestion: (value: unknown) => void;
}

export interface UnitEngineUserRuntime {
  readonly getCurrentUserId: () => any;
}

export interface UnitEngineAuthorizationRuntime {
  readonly currentUserHasRole: (roles: string) => boolean;
}

export interface UnitEngineProgressionRuntime {
  readonly unitIsFinished: (reason: string) => void;
}

export interface UnitEngineAssessmentStateRuntime {
  readonly getExperimentState: () => any;
  readonly hasScheduleArtifactForUnit: (experimentState: any, unitNumber: any) => boolean;
  readonly createExperimentState: (newExperimentState: any) => Promise<any>;
}

export interface UnitEngineUserAlertsRuntime {
  readonly alertUser: (message: string) => void;
}

export interface UnitEngineLoggerRuntime {
  readonly log: (level: number, ...args: unknown[]) => void;
}

export interface CreateUnitEngineDeps {
  readonly app: UnitEngineAppRuntime;
  readonly session: UnitEngineSessionRuntime;
  readonly deliverySettings: UnitEngineDeliverySettingsRuntime;
  readonly stimuli: UnitEngineStimuliRuntime;
  readonly adaptiveModel: UnitEngineAdaptiveModelRuntime;
  readonly history: UnitEngineHistoryRuntime;
  readonly cardState: UnitEngineCardStateRuntime;
  readonly serverMethods: UnitEngineServerMethods;
  readonly user: UnitEngineUserRuntime;
  readonly authz: UnitEngineAuthorizationRuntime;
  readonly progression: UnitEngineProgressionRuntime;
  readonly assessmentState: UnitEngineAssessmentStateRuntime;
  readonly uiAlerts: UnitEngineUserAlertsRuntime;
  readonly aiProvider: AiProviderRuntime;
  readonly logging: UnitEngineLoggerRuntime;
}

async function createWithBase(
  deps: CreateUnitEngineDeps,
  curExperimentData: any,
  unitType: string,
) {
  const baseEngine = createDefaultUnitEngine(deps, curExperimentData);
  const engineExtension = await createRegisteredUnitEngine(unitType, deps);
  const engine = deps.app.extend(baseEngine, engineExtension);
  await engine.init();
  return engine;
}

function getStimAnswer(deps: CreateUnitEngineDeps, clusterIndex: any, whichAnswer: any) {
  const cluster = deps.stimuli.getStimCluster(clusterIndex);
  const stim = cluster.stims[whichAnswer];
  if (!stim) {
    throw new Error(`Stim not found for cluster ${clusterIndex}, stim ${whichAnswer}`);
  }
  return stim.correctResponse;
}

function hasNamedServerMethods(deps: Partial<CreateUnitEngineDeps>): boolean {
  if (!deps.serverMethods || typeof deps.serverMethods !== 'object') {
    return false;
  }
  return [...getUnitEngineServerMethodNames()].every((methodName) =>
    typeof deps.serverMethods?.[methodName] === 'function'
  );
}

function hasRuntimeFunctions(value: unknown, ...names: string[]): boolean {
  return Boolean(value && typeof value === 'object') &&
    names.every((name) => typeof (value as Record<string, unknown>)[name] === 'function');
}

export function getCreateUnitEngineServerMethodSet(
  deps: Partial<CreateUnitEngineDeps>,
): Set<string> {
  if (!hasNamedServerMethods(deps)) {
    return new Set();
  }
  return new Set([...getUnitEngineServerMethodNames()]);
}

export function getCreateUnitEngineCapabilitySet(
  deps: Partial<CreateUnitEngineDeps>,
): Set<LearningComponentCapability> {
  const capabilities = new Set<LearningComponentCapability>();
  if (hasRuntimeFunctions(deps.session, 'getSessionValue', 'setSessionValue')) {
    capabilities.add('session');
  }
  if (hasRuntimeFunctions(deps.deliverySettings, 'getDeliverySettings')) {
    capabilities.add('delivery-settings');
  }
  if (hasRuntimeFunctions(deps.stimuli, 'getStimCount', 'getStimCluster')) {
    capabilities.add('stimuli');
  }
  if (hasRuntimeFunctions(deps.cardState, 'setQuestionIndex', 'setCurrentAnswer')) {
    capabilities.add('card-state');
  }
  if (hasRuntimeFunctions(
    deps.adaptiveModel,
    'createAdaptiveCoordinator',
    'getHiddenItems',
    'setNumVisibleCards',
    'updateCurStudentPerformance',
    'updateCurStudedentPracticeTime',
  )) {
    capabilities.add('adaptive-card-model');
  }
  if (hasRuntimeFunctions(
    deps.assessmentState,
    'getExperimentState',
    'hasScheduleArtifactForUnit',
    'createExperimentState',
  )) {
    capabilities.add('assessment-state');
  }
  if (hasRuntimeFunctions(deps.history, 'reconstructLearningStateFromHistory')) {
    capabilities.add('history');
  }
  if (hasNamedServerMethods(deps)) {
    capabilities.add('server-methods');
  }
  if (hasRuntimeFunctions(deps.authz, 'currentUserHasRole')) {
    capabilities.add('authz');
  }
  if (hasRuntimeFunctions(deps.logging, 'log')) {
    capabilities.add('logging');
  }
  if (hasRuntimeFunctions(deps.uiAlerts, 'alertUser')) {
    capabilities.add('ui-alerts');
  }
  if (hasRuntimeFunctions(deps.aiProvider, 'callOpenRouterJson')) {
    capabilities.add('ai-provider');
  }
  return capabilities;
}

export function createDefaultUnitEngine(deps: CreateUnitEngineDeps, curExperimentData: any): any {
  const stimClusters: any[] = [];
  const numQuestions = deps.stimuli.getStimCount();
  for (let i = 0; i < numQuestions; ++i) {
    stimClusters.push(deps.stimuli.getStimCluster(i));
  }
  const engine = createBaseUnitEngine({
    experimentState: curExperimentData.experimentState,
    adaptiveCoordinator: deps.adaptiveModel.createAdaptiveCoordinator(deps.session.getSessionValue('currentTdfUnit')),
    stimClusters,
    getCurrentTestType: () => deps.session.getSessionValue('testType'),
    getDeliverySettings: deps.deliverySettings.getDeliverySettings,
    getStimAnswer: (clusterIndex, whichAnswer) => getStimAnswer(deps, clusterIndex, whichAnswer),
    setSessionValue: deps.session.setSessionValue,
    setCurrentAnswer: deps.cardState.setCurrentAnswer,
    setAlternateDisplayIndex: deps.cardState.setAlternateDisplayIndex,
    setOriginalQuestion: deps.cardState.setOriginalQuestion,
    log: deps.logging.log,
  });
  deps.logging.log(1, 'curExperimentData:', curExperimentData);
  return engine;
}

function registerDefaultUnitEngines(_deps: CreateUnitEngineDeps): void {
  const capabilities = getCreateUnitEngineCapabilitySet(_deps);

  registerLearningComponents(defaultUnitComponentManifestsFromCatalog, {
    capabilities,
    serverMethods: getCreateUnitEngineServerMethodSet(_deps),
    registerUnitEngine,
    registerUnitEngineWithDeps,
    registerTrialDisplayAdapter,
  }, {
    alreadyRegistered(manifest) {
      const unitTypes = manifest.unitTypes ?? [];
      return unitTypes.every((unitType) => hasRegisteredUnitEngine(unitType));
    },
  });
}

export async function createEmptyUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  return await createUnitEngineByType(deps, curExperimentData, INSTRUCTION_UNIT_TYPE);
}

export async function createModelUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  return await createUnitEngineByType(deps, curExperimentData, LEARNING_SESSION_UNIT_TYPE);
}

export async function createScheduleUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  return await createUnitEngineByType(deps, curExperimentData, ASSESSMENT_SESSION_UNIT_TYPE);
}

export async function createVideoUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  return await createUnitEngineByType(deps, curExperimentData, VIDEO_SESSION_UNIT_TYPE);
}

export async function createAutoTutorUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  return await createUnitEngineByType(deps, curExperimentData, AUTO_TUTOR_SESSION_UNIT_TYPE);
}

export async function createUnitEngineByType(
  deps: CreateUnitEngineDeps,
  curExperimentData: any,
  unitType: string,
) {
  registerDefaultUnitEngines(deps);
  return await createWithBase(deps, curExperimentData, unitType);
}

export function getCreatableUnitEngineTypes(deps: CreateUnitEngineDeps): string[] {
  registerDefaultUnitEngines(deps);
  return getRegisteredUnitEngineTypes();
}
