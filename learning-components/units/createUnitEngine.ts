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
import {
  ASSESSMENT_SESSION_UNIT_TYPE,
  AUTO_TUTOR_SESSION_UNIT_TYPE,
  INSTRUCTION_UNIT_TYPE,
  LEARNING_SESSION_UNIT_TYPE,
  VIDEO_SESSION_UNIT_TYPE,
} from './defaultUnitComponents';

export interface CreateUnitEngineDeps {
  readonly extend: (target: any, source: any) => any;
  readonly createAdaptiveQuestionLogic: () => any;
  readonly getSessionValue: (key: string) => any;
  readonly setSessionValue: (key: string, value: any) => void;
  readonly getDeliverySettings: () => Record<string, any>;
  readonly getStimCount: () => number;
  readonly getStimCluster: (clusterIndex: any) => any;
  readonly getStimKCBaseForCurrentStimuliSet: () => any;
  readonly getTestType: () => string;
  readonly getHiddenItems: () => unknown[];
  readonly setNumVisibleCards: (numVisibleCards: number) => void;
  readonly setQuestionIndex: (questionIndex: number) => void;
  readonly getDisplayAnswerText: (answer: any) => string;
  readonly updateCurStudentPerformance: (wasCorrect: any, practiceTime: any, testType: any) => void;
  readonly updateCurStudedentPracticeTime: (practiceTime: any) => void;
  readonly serverMethods: UnitEngineServerMethods;
  readonly getCurrentUserId: () => any;
  readonly reconstructLearningStateFromHistory: (historyRows: any[]) => any;
  readonly extractDelimFields: (source: any, target: any[]) => void;
  readonly rangeVal: (source: any) => any[];
  readonly legacyFloat: (source: any) => number;
  readonly legacyInt: (source: any) => number;
  readonly currentUserHasRole: (roles: string) => boolean;
  readonly displayify: (value: any) => any;
  readonly unitIsFinished: (reason: string) => void;
  readonly findTdfById: (tdfId: any) => any;
  readonly getExperimentState: () => any;
  readonly hasScheduleArtifactForUnit: (experimentState: any, unitNumber: any) => boolean;
  readonly createExperimentState: (newExperimentState: any) => Promise<any>;
  readonly setCardValue: (key: string, value: unknown) => void;
  readonly setAlternateDisplayIndex: (value: number | undefined) => void;
  readonly setOriginalQuestion: (value: unknown) => void;
  readonly alertUser: (message: string) => void;
  readonly aiProvider: AiProviderRuntime;
  readonly log: (level: number, ...args: unknown[]) => void;
}

async function createWithBase(
  deps: CreateUnitEngineDeps,
  curExperimentData: any,
  unitType: string,
) {
  const baseEngine = createDefaultUnitEngine(deps, curExperimentData);
  const engineExtension = await createRegisteredUnitEngine(unitType, deps);
  const engine = deps.extend(baseEngine, engineExtension);
  await engine.init();
  return engine;
}

function getStimAnswer(deps: CreateUnitEngineDeps, clusterIndex: any, whichAnswer: any) {
  const cluster = deps.getStimCluster(clusterIndex);
  const stim = cluster.stims[whichAnswer];
  if (!stim) {
    throw new Error(`Stim not found for cluster ${clusterIndex}, stim ${whichAnswer}`);
  }
  return stim.correctResponse;
}

function hasFunctions(deps: Partial<CreateUnitEngineDeps>, ...names: Array<keyof CreateUnitEngineDeps>): boolean {
  return names.every((name) => typeof deps[name] === 'function');
}

function hasNamedServerMethods(deps: Partial<CreateUnitEngineDeps>): boolean {
  if (!deps.serverMethods || typeof deps.serverMethods !== 'object') {
    return false;
  }
  return [...getUnitEngineServerMethodNames()].every((methodName) =>
    typeof deps.serverMethods?.[methodName] === 'function'
  );
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
  if (hasFunctions(deps, 'getSessionValue', 'setSessionValue')) {
    capabilities.add('session');
  }
  if (hasFunctions(deps, 'getDeliverySettings')) {
    capabilities.add('delivery-settings');
  }
  if (hasFunctions(deps, 'getStimCount', 'getStimCluster', 'getStimKCBaseForCurrentStimuliSet')) {
    capabilities.add('stimuli');
  }
  if (hasFunctions(deps, 'createAdaptiveQuestionLogic')) {
    capabilities.add('adaptive-model');
  }
  if (hasFunctions(deps, 'getExperimentState', 'hasScheduleArtifactForUnit', 'createExperimentState')) {
    capabilities.add('assessment-state');
  }
  if (hasFunctions(deps, 'reconstructLearningStateFromHistory')) {
    capabilities.add('history');
  }
  if (hasNamedServerMethods(deps)) {
    capabilities.add('server-methods');
  }
  if (hasFunctions(deps, 'currentUserHasRole')) {
    capabilities.add('authz');
  }
  if (hasFunctions(deps, 'log')) {
    capabilities.add('logging');
  }
  if (hasFunctions(deps, 'alertUser')) {
    capabilities.add('ui-alerts');
  }
  if (deps.aiProvider && typeof deps.aiProvider.callOpenRouterJson === 'function') {
    capabilities.add('ai-provider');
  }
  return capabilities;
}

export function createDefaultUnitEngine(deps: CreateUnitEngineDeps, curExperimentData: any): any {
  const stimClusters: any[] = [];
  const numQuestions = deps.getStimCount();
  for (let i = 0; i < numQuestions; ++i) {
    stimClusters.push(deps.getStimCluster(i));
  }
  const engine = createBaseUnitEngine({
    experimentState: curExperimentData.experimentState,
    adaptiveQuestionLogic: deps.createAdaptiveQuestionLogic(),
    stimClusters,
    getCurrentTestType: () => deps.getSessionValue('testType'),
    getDeliverySettings: deps.getDeliverySettings,
    getStimAnswer: (clusterIndex, whichAnswer) => getStimAnswer(deps, clusterIndex, whichAnswer),
    setSessionValue: deps.setSessionValue,
    setCardValue: deps.setCardValue,
    setAlternateDisplayIndex: deps.setAlternateDisplayIndex,
    setOriginalQuestion: deps.setOriginalQuestion,
    log: deps.log,
  });
  deps.log(1, 'curExperimentData:', curExperimentData);
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
