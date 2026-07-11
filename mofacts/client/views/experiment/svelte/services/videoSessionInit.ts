import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { meteorCallAsync } from '../../../../index';
import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
import { extractDelimFields, rangeVal } from '../../../../lib/runtimeValueHelpers';
import { resolveDynamicAssetPath } from './mediaResolver';
import { resolveVideoResumeAnchor } from './videoResume';
import {
  clearVideoSessionState,
  setVideoCheckpoints,
  setVideoResumeAnchor,
  setVideoSessionActive,
} from './cardRuntimeState';
import type {
  RewindCheckpointData,
  VideoCheckpointBehavior,
} from '../../../../../common/types';
import type { DeliverySettings } from '../../../../../common/types';

type UnknownRecord = Record<string, unknown>;

interface VideoCheckpointLike extends UnknownRecord {
  time?: unknown;
}

export interface VideoSessionLike extends UnknownRecord {
  videosource?: string;
  questions?: unknown;
  questiontimes?: unknown;
  checkpointQuestions?: unknown;
  checkpointBehavior?: unknown;
  checkpoints?: VideoCheckpointLike[];
  preventScrubbing?: unknown;
  repeatQuestionsSinceCheckpoint?: unknown;
  rewindOnIncorrect?: unknown;
}

export interface VideoTdfUnitLike extends UnknownRecord {
  videosession?: VideoSessionLike;
}

type RuntimeDeliverySettings = DeliverySettings & {
  isVideoSession?: boolean;
  videoUrl?: string;
};

const VIDEO_CHECKPOINT_BEHAVIORS = new Set(['none', 'pause', 'all', 'some', 'adaptive']);

export function normalizeVideoBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function resolveVideoPlaybackPolicy(videoSession: VideoSessionLike | null | undefined) {
  return {
    preventScrubbing: normalizeVideoBoolean(videoSession?.preventScrubbing),
    repeatQuestionsSinceCheckpoint: normalizeVideoBoolean(videoSession?.repeatQuestionsSinceCheckpoint),
    rewindOnIncorrect: normalizeVideoBoolean(videoSession?.rewindOnIncorrect),
  };
}

export function resolveVideoPlaybackPolicyForUnit(curTdfUnit: VideoTdfUnitLike | null | undefined) {
  return resolveVideoPlaybackPolicy(curTdfUnit?.videosession);
}

export function parseVideoCheckpointBehavior(value: unknown): VideoCheckpointBehavior {
  if (value == null || value === '') {
    return 'none';
  }
  if (typeof value !== 'string') {
    throw new Error('[Svelte Init] Video session checkpointBehavior must be a string');
  }
  const normalized = value.trim().toLowerCase();
  if (!VIDEO_CHECKPOINT_BEHAVIORS.has(normalized)) {
    throw new Error(`[Svelte Init] Unsupported checkpointBehavior "${value}"`);
  }
  return normalized as VideoCheckpointBehavior;
}

export function parseNumericArray(values: unknown, fieldName: string): number[] {
  if (!Array.isArray(values)) {
    throw new Error(`[Svelte Init] ${fieldName} must be an array`);
  }
  return values.map((value: unknown, index: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`[Svelte Init] ${fieldName}[${index}] is not numeric`);
    }
    return parsed;
  });
}

export function uniqueSortedNumeric(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function buildSelectiveCheckpointTimes(
  questionTimes: number[],
  videoSession: VideoSessionLike | null | undefined,
  currentStimuliSet: Array<{ checkpoint?: boolean }> | null | undefined,
): number[] {
  const checkpointQuestions = videoSession?.checkpointQuestions;
  if (Array.isArray(checkpointQuestions) && checkpointQuestions.length > 0) {
    const selected = checkpointQuestions.map((value: unknown, index: number) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        throw new Error(`[Svelte Init] checkpointQuestions[${index}] must be an integer`);
      }
      const timeIndex = parsed - 1;
      if (timeIndex < 0 || timeIndex >= questionTimes.length) {
        throw new Error(`[Svelte Init] checkpointQuestions[${index}] is out of range`);
      }
      return questionTimes[timeIndex]!;
    });
    return uniqueSortedNumeric(selected);
  }

  if (!Array.isArray(currentStimuliSet) || currentStimuliSet.length === 0) {
    throw new Error('[Svelte Init] checkpointBehavior "some" requires checkpointQuestions or currentStimuliSet checkpoint flags');
  }

  const selected: number[] = [];
  for (let i = 0; i < questionTimes.length; i++) {
    if (currentStimuliSet[i]?.checkpoint === true) {
      selected.push(questionTimes[i]!);
    }
  }

  if (selected.length === 0) {
    throw new Error('[Svelte Init] checkpointBehavior "some" resolved no checkpoint times');
  }

  return uniqueSortedNumeric(selected);
}

export function buildAdaptiveCheckpointTimes(videoSession: VideoSessionLike | null | undefined): number[] {
  if (!Array.isArray(videoSession?.checkpoints) || videoSession.checkpoints.length === 0) {
    throw new Error('[Svelte Init] checkpointBehavior "adaptive" requires videosession.checkpoints');
  }
  const selected = videoSession.checkpoints.map((checkpoint: VideoCheckpointLike, index: number) => {
    const parsed = Number(checkpoint?.time);
    if (!Number.isFinite(parsed)) {
      throw new Error(`[Svelte Init] checkpoints[${index}].time is not numeric`);
    }
    return parsed;
  });
  return uniqueSortedNumeric(selected);
}

export function buildRewindCheckpointData(
  videoSession: VideoSessionLike | null | undefined,
  questionTimes: number[],
  currentStimuliSet: Array<{ checkpoint?: boolean }> | null | undefined,
): RewindCheckpointData {
  const checkpointBehavior = parseVideoCheckpointBehavior(videoSession?.checkpointBehavior);

  if (!normalizeVideoBoolean(videoSession?.rewindOnIncorrect)) {
    return {
      checkpointBehavior,
      rewindCheckpoints: [],
    };
  }

  if (checkpointBehavior === 'pause' || checkpointBehavior === 'all') {
    return {
      checkpointBehavior,
      rewindCheckpoints: uniqueSortedNumeric(questionTimes),
    };
  }
  if (checkpointBehavior === 'some') {
    return {
      checkpointBehavior,
      rewindCheckpoints: buildSelectiveCheckpointTimes(questionTimes, videoSession, currentStimuliSet),
    };
  }
  if (checkpointBehavior === 'adaptive') {
    return {
      checkpointBehavior,
      rewindCheckpoints: buildAdaptiveCheckpointTimes(videoSession),
    };
  }

  return {
    checkpointBehavior,
    rewindCheckpoints: [],
  };
}

function resolveVideoQuestions(videoSession: VideoSessionLike): number[] {
  let questions = videoSession.questions;
  if (typeof questions === 'string') {
    const questionIndices = [];
    const clusterList: string[] = [];
    extractDelimFields(questions, clusterList);
    for (let i = 0; i < clusterList.length; i++) {
      const nums = rangeVal(clusterList[i]);
      questionIndices.push(...nums);
    }
    questions = questionIndices;
  } else if (questions == null) {
    throw new Error('[Svelte Init] Video session missing questions list');
  } else if (!Array.isArray(questions)) {
    throw new Error('[Svelte Init] Video session questions must be an array or range string');
  }

  return parseNumericArray(questions, 'Video session questions').map((value: number, index: number) => {
    if (!Number.isInteger(value)) {
      throw new Error(`[Svelte Init] Video session questions[${index}] must be an integer`);
    }
    return value;
  });
}

function resolveVideoQuestionTimes(videoSession: VideoSessionLike): number[] {
  const questionTimes = videoSession.questiontimes;
  if (questionTimes == null) {
    throw new Error('[Svelte Init] Video session missing question times');
  }
  if (!Array.isArray(questionTimes)) {
    throw new Error('[Svelte Init] Video session questiontimes must be an array');
  }
  return parseNumericArray(questionTimes, 'Video session questiontimes');
}

export async function initVideoSessionData(curTdfUnit: VideoTdfUnitLike | null | undefined) {
  const videoSession = curTdfUnit?.videosession;
  if (!videoSession) {
    clearVideoSessionState();
    return;
  }

  setVideoSessionActive(true);

  if (!videoSession.videosource) {
    throw new Error('[Svelte Init] Video session missing videosource');
  }

  const parsedQuestions = resolveVideoQuestions(videoSession);
  const times = resolveVideoQuestionTimes(videoSession);
  if (parsedQuestions.length !== times.length) {
    throw new Error('[Svelte Init] Video session questions do not match question times length');
  }

  const { checkpointBehavior, rewindCheckpoints } = buildRewindCheckpointData(
    videoSession,
    times,
    Session.get('currentStimuliSet') as Array<{ checkpoint?: boolean }> | null | undefined,
  );

  setVideoCheckpoints({
    times,
    questions: parsedQuestions,
    checkpointBehavior,
    rewindCheckpoints,
  });

  let completedCheckpointQuestionCount = 0;
  const userId = Meteor.userId();
  const currentTdfId = Session.get('currentTdfId');
  const currentUnitNumber = Number(Session.get('currentUnitNumber') || 0);
  if (userId && typeof currentTdfId === 'string' && currentTdfId.trim() !== '' && Number.isFinite(currentUnitNumber)) {
    completedCheckpointQuestionCount = await meteorCallAsync(
      'getVideoCompletedCheckpointQuestionCountFromHistory',
      userId,
      currentTdfId,
      currentUnitNumber,
    );
  }
  const videoResumeAnchor = resolveVideoResumeAnchor(times, completedCheckpointQuestionCount);
  setVideoResumeAnchor(videoResumeAnchor);

  const resolvedVideoUrl = resolveDynamicAssetPath(videoSession.videosource, { logPrefix: '[Svelte Init]' });

  const currentDeliverySettings = (deliverySettingsStore.get() || {}) as RuntimeDeliverySettings;
  deliverySettingsStore.set({
    ...currentDeliverySettings,
    isVideoSession: true,
    videoUrl: resolvedVideoUrl,
  } as Parameters<typeof deliverySettingsStore.set>[0]);
}
