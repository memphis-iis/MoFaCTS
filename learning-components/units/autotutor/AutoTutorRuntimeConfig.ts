import type { AutoTutorRuntimeCapabilities } from './AutoTutorRuntimeCapabilities';
import {
  AUTO_TUTOR_DEFAULT_UTTERANCE_TEMPERATURE,
  parseAutoTutorTemperature,
} from './AutoTutorGenerationConfig';

export type AutoTutorExpectation = {
  id: string;
  label?: string;
  proposition: string;
  acceptableVariants?: string[];
  commonPartialAnswers?: string[];
  hints?: string[];
  prompts?: Array<{ stem?: string; target?: string }>;
  assertion: string;
};

export type AutoTutorMisconception = {
  id: string;
  label?: string;
  misconception: string;
  detectionCues?: string[];
  contrastWithExpectations?: string[];
  correction: string;
  repairQuestion: string;
  repairCriteria?: string;
  acceptableRepairAnswers?: string[];
};

export type AutoTutorScript = {
  id: string;
  topic: string;
  learningGoal: string;
  idealAnswer: string;
  expectations: AutoTutorExpectation[];
  misconceptions?: AutoTutorMisconception[];
  dialogPolicy: Record<string, unknown>;
  summary: string;
};

export type AutoTutorGraduation = {
  requiredExpectationCount: number;
  maxActiveMisconceptions: number;
};

export type AutoTutorTurnLimit = {
  maxTurns: number;
};

export type AutoTutorConfig = {
  apiKey: string;
  model: string;
  utteranceTemperature: number;
  graduation: AutoTutorGraduation;
  turnLimit: AutoTutorTurnLimit;
  requireFinalAnswerPrompt: boolean;
  prompt: string;
  script: AutoTutorScript;
  unitName: string;
  clusterIndex: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`AutoTutor runtime requires ${field}`);
  }
  return value.trim();
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`AutoTutor runtime requires numeric ${field}`);
  }
  return parsed;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function getTutorFromSession(capabilities: AutoTutorRuntimeCapabilities): Record<string, unknown> {
  const currentTdfFile = capabilities.session.getAutoTutorSessionSnapshot().currentTdfFile as {
    tdfs?: { tutor?: unknown };
  } | null | undefined;
  const tutor = currentTdfFile?.tdfs?.tutor;
  if (!isRecord(tutor)) {
    throw new Error('AutoTutor runtime requires currentTdfFile.tdfs.tutor in session capabilities');
  }
  return tutor;
}

function getCurrentUnit(capabilities: AutoTutorRuntimeCapabilities): Record<string, unknown> {
  const unit = capabilities.session.getAutoTutorSessionSnapshot().currentTdfUnit;
  if (!isRecord(unit)) {
    throw new Error('AutoTutor runtime requires currentTdfUnit in session capabilities');
  }
  if (!isRecord(unit.autotutorsession)) {
    throw new Error(`Unit "${String(unit.unitname || '<unnamed>')}" is not an AutoTutor session`);
  }
  return unit;
}

function readGraduation(session: Record<string, unknown>): AutoTutorGraduation {
  const graduation = session.graduation;
  if (!isRecord(graduation)) {
    throw new Error('AutoTutor runtime requires autotutorsession.graduation');
  }
  const requiredExpectationCount = requiredNumber(
    graduation.requiredExpectationCount,
    'autotutorsession.graduation.requiredExpectationCount',
  );
  if (!Number.isInteger(requiredExpectationCount) || requiredExpectationCount < 0) {
    throw new Error('AutoTutor runtime requires graduation.requiredExpectationCount to be a non-negative integer');
  }
  const maxActiveMisconceptions = requiredNumber(
    graduation.maxActiveMisconceptions,
    'autotutorsession.graduation.maxActiveMisconceptions',
  );
  if (!Number.isInteger(maxActiveMisconceptions) || maxActiveMisconceptions < 0) {
    throw new Error('AutoTutor runtime requires graduation.maxActiveMisconceptions to be a non-negative integer');
  }
  return {
    requiredExpectationCount,
    maxActiveMisconceptions,
  };
}

function readTurnLimit(session: Record<string, unknown>): AutoTutorTurnLimit {
  const maxTurns = requiredNumber(session.maxTurns, 'autotutorsession.maxTurns');
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new Error('AutoTutor runtime requires autotutorsession.maxTurns to be a positive integer');
  }
  return {
    maxTurns,
  };
}

export function readAutoTutorConfig(capabilities: AutoTutorRuntimeCapabilities): AutoTutorConfig {
  const tutor = getTutorFromSession(capabilities);
  const setspec = isRecord(tutor.setspec) ? tutor.setspec : {};
  const unit = getCurrentUnit(capabilities);
  const session = unit.autotutorsession as Record<string, unknown>;
  const clusterIndex = requiredNumber(session.cluster, 'autotutorsession.cluster');
  if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
    throw new Error('AutoTutor runtime requires autotutorsession.cluster to be a non-negative integer');
  }

  const cluster = capabilities.stimuli.getStimCluster(clusterIndex);
  const stim = cluster?.stims?.[0];
  if (!isRecord(stim)) {
    throw new Error(`AutoTutor runtime could not find first stim for cluster ${clusterIndex}`);
  }
  const script = stim.autoTutor;
  if (!isRecord(script)) {
    throw new Error(`AutoTutor cluster ${clusterIndex} first stim is missing autoTutor`);
  }
  const display = isRecord(stim.display) ? stim.display : {};

  return {
    apiKey: requiredString(capabilities.aiProvider.getOpenRouterApiKey(), 'client OpenRouter API key'),
    model: requiredString(session.openRouterModel || setspec.openRouterModel, 'openRouterModel'),
    utteranceTemperature: parseAutoTutorTemperature(
      session.utteranceTemperature,
      'autotutorsession.utteranceTemperature',
      AUTO_TUTOR_DEFAULT_UTTERANCE_TEMPERATURE,
    ),
    graduation: readGraduation(session),
    turnLimit: readTurnLimit(session),
    requireFinalAnswerPrompt: session.requireFinalAnswerPrompt === true,
    prompt: requiredString(display.text, `cluster ${clusterIndex} display.text`),
    script: cloneJson(script as AutoTutorScript),
    unitName: typeof unit.unitname === 'string' ? unit.unitname : 'AutoTutor',
    clusterIndex,
  };
}

export function getRequiredExpectationIds(script: AutoTutorScript): string[] {
  const required = script.dialogPolicy.requiredExpectations;
  if (!Array.isArray(required) || required.length === 0) {
    throw new Error('AutoTutor runtime requires autoTutor.dialogPolicy.requiredExpectations');
  }
  const authoredIds = new Set(script.expectations.map((expectation) => expectation.id));
  return required.map((id) => {
    if (typeof id !== 'string' || !authoredIds.has(id)) {
      throw new Error(`AutoTutor runtime required expectation references unknown ID "${String(id)}"`);
    }
    return id;
  });
}

export function validateGraduationAgainstScript(config: AutoTutorConfig): void {
  const requiredExpectationCount = getRequiredExpectationIds(config.script).length;
  if (config.graduation.requiredExpectationCount > requiredExpectationCount) {
    throw new Error(
      `AutoTutor graduation.requiredExpectationCount cannot exceed ${requiredExpectationCount} required expectations`
    );
  }
  const misconceptionCount = config.script.misconceptions?.length || 0;
  if (config.graduation.maxActiveMisconceptions > misconceptionCount) {
    throw new Error(
      `AutoTutor graduation.maxActiveMisconceptions cannot exceed ${misconceptionCount} authored misconceptions`
    );
  }
}
