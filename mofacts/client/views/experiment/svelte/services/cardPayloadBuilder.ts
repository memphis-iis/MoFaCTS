import { Session } from 'meteor/session';
import { getCurrentDeliverySettings } from '../../../../lib/currentDeliverySettings';
import { getStimCluster } from '../../../../lib/runtimeStimuli';
import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
import { sanitizeHTML, nextChar } from '../../../../lib/stringUtils';
import { getDisplayAnswerText } from '../../learnerResponseAssessment';
import { resolveDynamicAssetPath } from './mediaResolver';
import { applyDisplayFieldSubset } from '../../../../../common/lib/displayFieldSubsets';
import { isSelfHostedH5PConfig, normalizeH5PDisplayConfig } from '../../../../../common/lib/h5pDisplay';
import type { UnitEngineLike } from '../../../../../common/types';
import {
  resolveSessionContentSurface,
  resolveSessionSurfaceState,
} from './sessionSurfaceMode';

interface StimResponseLike {
  incorrectResponses?: unknown;
}

export interface StimLike extends Record<string, unknown> {
  _id?: unknown;
  display?: Record<string, unknown> & {
    attribution?: unknown;
  };
  text?: string;
  textStimulus?: string;
  clozeText?: string;
  clozeStimulus?: string;
  imageStimulus?: string;
  audioStimulus?: string;
  videoStimulus?: string;
  correctResponse?: string;
  answer?: string;
  response?: string | StimResponseLike;
  testType?: string;
  incorrectResponses?: unknown;
  stimuliSetId?: unknown;
  stimulusKC?: unknown;
  clusterKC?: unknown;
  responseKC?: unknown;
  speechHintExclusionList?: string;
}

export interface StimClusterLike extends Record<string, unknown> {
  stims: StimLike[];
  clusterKC?: unknown;
}

export interface TdfUnitLike extends Record<string, unknown> {
  assessmentsession?: unknown;
  buttonorder?: string;
  buttonOptions?: unknown;
  isButtonTrial?: unknown;
  buttonTrial?: unknown;
  buttontrial?: unknown;
}

interface TdfFileLike extends Record<string, unknown> {
  tdfs?: {
    tutor?: {
      setspec?: Record<string, unknown>;
    };
  };
}

type RuntimeDeliverySettings = Record<string, unknown> & {
  isVideoSession?: boolean;
  videoUrl?: string;
};

type ScheduleButtonTrialArtifact = {
  isButtonTrial?: unknown;
};

function isStructuredSparcDisplay(display: unknown): boolean {
  return Boolean(display) &&
    typeof display === 'object' &&
    !Array.isArray(display) &&
    Array.isArray((display as Record<string, unknown>).nodes);
}

export function shouldUseScheduleButtonTrial(params: {
  currentUnit?: TdfUnitLike | null | undefined;
  schedule?: ScheduleButtonTrialArtifact | null | undefined;
}): boolean {
  return Boolean(params.currentUnit?.assessmentsession && params.schedule?.isButtonTrial);
}

export function resolveCardPayloadDeliverySettings(params: {
  baseDeliverySettings: RuntimeDeliverySettings;
  existingDeliverySettings?: RuntimeDeliverySettings | null | undefined;
  currentTdfUnit?: Record<string, unknown> | null | undefined;
}): RuntimeDeliverySettings {
  const deliverySettings = {
    ...params.baseDeliverySettings,
  };
  const contentSurface = resolveSessionContentSurface(resolveSessionSurfaceState({
    currentTdfUnit: params.currentTdfUnit,
  }));

  if (!contentSurface.showVideoSession) {
    return deliverySettings;
  }

  deliverySettings.isVideoSession = true;
  const existingVideoUrl = params.existingDeliverySettings?.videoUrl;
  if (
    (typeof deliverySettings.videoUrl !== 'string' || deliverySettings.videoUrl.trim().length === 0) &&
    typeof existingVideoUrl === 'string' &&
    existingVideoUrl.trim().length > 0
  ) {
    deliverySettings.videoUrl = existingVideoUrl;
  }

  return deliverySettings;
}

export function resolveStimAnswer(stim: StimLike): string {
  const candidates = [stim.correctResponse, stim.answer];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  if (typeof stim.response === 'string') {
    return stim.response;
  }
  return '';
}

function resolveImageUrl(src: unknown, fallbackStimuliSetId: unknown = null): string {
  return resolveDynamicAssetPath(src, {
    logPrefix: '[Unit Engine]',
    fallbackStimuliSetId,
  });
}

export function resolvePreparedMediaPath(
  preparedSource: unknown,
  authoredSource: unknown,
  stimuliSetId: unknown,
  resolver: (source: unknown, scopedStimuliSetId: unknown) => string = resolveImageUrl,
): string {
  return resolver(firstNonEmptyString(preparedSource, authoredSource), stimuliSetId);
}

export function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

export function resolveStimMediaSource(
  stim: Record<string, unknown>,
  kind: 'image' | 'audio' | 'video',
): string {
  const displayObj = (stim.display && typeof stim.display === 'object')
    ? (stim.display as Record<string, unknown>)
    : {};

  if (kind === 'image') {
    return firstNonEmptyString(displayObj.imgSrc, stim.imageStimulus);
  }
  if (kind === 'audio') {
    return firstNonEmptyString(displayObj.audioSrc, stim.audioStimulus);
  }
  return firstNonEmptyString(displayObj.videoSrc, stim.videoStimulus);
}

function getClientBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  return 'https://mofacts.local/';
}

export function resolveH5PDisplayConfig(...sources: unknown[]): Record<string, unknown> | undefined {
  for (const source of sources) {
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      return normalizeH5PDisplayConfig(source, getClientBaseUrl()) as unknown as Record<string, unknown>;
    }
  }
  return undefined;
}

export function normalizeDisplayAttribution(
  ...sources: unknown[]
): Record<string, string> | undefined {
  const attributionSources = sources
    .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null);

  const creatorName = firstNonEmptyString(...attributionSources.map((value) => value.creatorName));
  const sourceName = firstNonEmptyString(...attributionSources.map((value) => value.sourceName));
  const sourceUrl = firstNonEmptyString(...attributionSources.map((value) => value.sourceUrl));
  const licenseName = firstNonEmptyString(...attributionSources.map((value) => value.licenseName));
  const licenseUrl = firstNonEmptyString(...attributionSources.map((value) => value.licenseUrl));

  if (!creatorName && !sourceName && !sourceUrl && !licenseName && !licenseUrl) {
    return undefined;
  }

  return {
    ...(creatorName ? { creatorName } : {}),
    ...(sourceName ? { sourceName } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(licenseName ? { licenseName } : {}),
    ...(licenseUrl ? { licenseUrl } : {}),
  };
}

function isImagePath(value: unknown): boolean {
  if (!value || typeof value !== 'string') return false;
  const imageExtensions = /\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?)$/i;
  return imageExtensions.test(value.trim());
}

export function normalizeButtonOptions(buttonOptions: unknown): string[] {
  if (!buttonOptions) return [];
  if (Array.isArray(buttonOptions)) {
    return buttonOptions.slice();
  }
  if (typeof buttonOptions === 'string') {
    return buttonOptions.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (typeof buttonOptions === 'object') {
    return Array.isArray(buttonOptions) ? buttonOptions.slice() : [];
  }
  return [];
}

export function getStimIncorrectResponses(stim: Record<string, unknown> | null | undefined): Array<string | unknown> {
  if (!stim) return [];
  const response = stim.response as { incorrectResponses?: unknown } | undefined;
  const raw = stim.incorrectResponses ?? response?.incorrectResponses;
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === 'string' ? item.trim() : item)).filter(Boolean);
  }
  return [];
}

function hasIncorrectResponses(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return false;
}

function shuffleArray<T>(values: T[]): T[] {
  const arr = values.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function buildButtonList({
  curUnit,
  stim,
  originalAnswer,
  correctAnswer,
  deliverySettings,
}: {
  curUnit: TdfUnitLike | null | undefined;
  stim: StimLike;
  originalAnswer: string;
  correctAnswer: string;
  deliverySettings: Record<string, unknown> | null | undefined;
}) {
  const buttonOrder = curUnit?.buttonorder ? curUnit.buttonorder.trim().toLowerCase() : '';
  const unitButtonOptions = normalizeButtonOptions(curUnit?.buttonOptions);
  let buttonChoices = [];
  let correctButtonPopulated = null;

  if (unitButtonOptions.length) {
    buttonChoices = unitButtonOptions;
    correctButtonPopulated = true;
  } else {
    buttonChoices = getStimIncorrectResponses(stim);
    correctButtonPopulated = false;
  }

  if (correctButtonPopulated === null) {
    throw new Error('Bad TDF/Stim file - no buttonOptions and no false responses');
  }

  const displayCorrectAnswer = getDisplayAnswerText(originalAnswer || correctAnswer || '');
  const wrongButtonLimitValue = deliverySettings?.falseAnswerLimit;
  const wrongButtonLimit = typeof wrongButtonLimitValue === 'number'
    ? wrongButtonLimitValue
    : Number(wrongButtonLimitValue);

  if (wrongButtonLimit) {
    let foundIsCurrentAnswer = undefined;
    let correctAnswerIndex = undefined;
    if (correctButtonPopulated) {
      correctAnswerIndex = buttonChoices.findIndex((answer) => {
        if (answer === originalAnswer) {
          foundIsCurrentAnswer = true;
          return true;
        }
        if (answer === displayCorrectAnswer) {
          foundIsCurrentAnswer = false;
          return true;
        }
        return false;
      });
      if (correctAnswerIndex !== -1) buttonChoices.splice(correctAnswerIndex, 1);
      else correctAnswerIndex = undefined;
    }

    const numberOfWrongButtonsToPrune = buttonChoices.length - wrongButtonLimit;
    for (let i = 0; i < numberOfWrongButtonsToPrune; i += 1) {
      const randomIndex = Math.floor(Math.random() * buttonChoices.length);
      buttonChoices.splice(randomIndex, 1);
    }

    if (correctAnswerIndex) {
      buttonChoices.unshift(foundIsCurrentAnswer ? originalAnswer : displayCorrectAnswer);
    }
  }

  if (!correctButtonPopulated) {
    buttonChoices.unshift(displayCorrectAnswer);
  }

  if (buttonOrder === 'random') {
    buttonChoices = shuffleArray(buttonChoices);
  }

  let curChar = 'a';
  return buttonChoices.map((value) => {
    const rawValue = value ?? '';
    const entry = {
      verbalChoice: curChar,
      buttonName: rawValue,
      buttonValue: sanitizeHTML(String(rawValue)),
      isImage: isImagePath(String(rawValue)),
    };
    curChar = nextChar(curChar);
    return entry;
  });
}

export function buildCardDataFromResolvedTrial(params: {
  resolvedClusterIndex: number;
  whichStim: number;
  probabilityEstimate?: unknown;
  forceButtonTrial?: boolean;
  questionIndex: number;
  currentDisplay: Record<string, unknown>;
  fullAnswer: string;
  correctAnswer: string;
  testTypeOverride?: string;
}) {
  const {
    resolvedClusterIndex,
    whichStim,
    probabilityEstimate,
    forceButtonTrial,
    questionIndex,
    currentDisplay,
    fullAnswer,
    correctAnswer,
    testTypeOverride,
  } = params;
  const cluster = getStimCluster(resolvedClusterIndex) as StimClusterLike;
  const stim = cluster.stims[whichStim] as StimLike;
  const curUnit = Session.get('currentTdfUnit') as TdfUnitLike | null | undefined;
  let buttonTrial = false;

  if (typeof curUnit?.isButtonTrial === 'string' ||
      typeof curUnit?.buttonTrial === 'string' ||
      typeof curUnit?.buttontrial === 'string') {
    buttonTrial = (
      curUnit.isButtonTrial === 'true' ||
      curUnit.buttonTrial === 'true' ||
      curUnit.buttontrial === 'true'
    );
  } else if (typeof curUnit?.isButtonTrial === 'undefined' &&
             typeof curUnit?.buttonTrial === 'undefined' &&
             typeof curUnit?.buttontrial === 'undefined') {
    buttonTrial = false;
  } else {
    buttonTrial = Boolean(curUnit?.isButtonTrial || curUnit?.buttonTrial || curUnit?.buttontrial);
  }

  if (forceButtonTrial) {
    buttonTrial = true;
  } else if (
    hasIncorrectResponses(stim.incorrectResponses) ||
    (typeof stim.response === 'object' &&
      stim.response !== null &&
      hasIncorrectResponses((stim.response as StimResponseLike).incorrectResponses))
  ) {
    buttonTrial = true;
  } else {
    if (shouldUseScheduleButtonTrial({
      currentUnit: curUnit,
      schedule: Session.get('schedule') as ScheduleButtonTrialArtifact | null | undefined,
    })) {
      buttonTrial = true;
    }
  }

  const baseDeliverySettings = getCurrentDeliverySettings() as RuntimeDeliverySettings;
  const existingDeliverySettings = (deliverySettingsStore.get() || {}) as RuntimeDeliverySettings;
  const deliverySettings = resolveCardPayloadDeliverySettings({
    baseDeliverySettings,
    existingDeliverySettings,
    currentTdfUnit: curUnit,
  });
  const currentTdfFile = Session.get('currentTdfFile') as TdfFileLike | null | undefined;
  const setspec = currentTdfFile?.tdfs?.tutor?.setspec || {};

  const sessionTestType = typeof Session.get('testType') === 'string'
    ? String(Session.get('testType')).trim().toLowerCase()
    : '';
  const stimTestType = typeof stim.testType === 'string'
    ? String(stim.testType).trim().toLowerCase()
    : '';
  const testType = testTypeOverride || stimTestType || sessionTestType || 'd';

  const buttonList = buttonTrial
    ? buildButtonList({
        curUnit,
        stim,
        originalAnswer: fullAnswer,
        correctAnswer,
        deliverySettings,
      })
    : [];

  return {
    currentDisplay,
    originalAnswer: fullAnswer,
    currentAnswer: correctAnswer,
    questionIndex,
    testType,
    buttonTrial,
    buttonList,
    deliverySettings,
    setspec,
    engineIndices: {
      clusterIndex: resolvedClusterIndex,
      stimIndex: whichStim,
      whichStim,
      probabilityEstimate,
    },
    stimuliSetId: stim.stimuliSetId,
    stimulusKC: stim.stimulusKC,
    clusterKC: stim.clusterKC,
    responseKC: stim.responseKC,
    speechHintExclusionList: stim.speechHintExclusionList || '',
  };
}

export function getPreparedCardDataFromSelection(
  engine: UnitEngineLike,
  selection: Record<string, unknown>,
  questionIndex: number,
) {
  const resolvedClusterIndex = Number(selection.clusterIndex ?? 0);
  const whichStim = Number(selection.stimIndex ?? selection.whichStim ?? 0);
  const cluster = getStimCluster(resolvedClusterIndex) as StimClusterLike;
  const stim = cluster.stims[whichStim] as StimLike;
  const preparedState = (selection.preparedState || selection.currentPreparedState || {}) as Record<string, unknown>;
  const stimScopedSetId = stim?.stimuliSetId ?? Session.get('currentStimuliSetId') ?? null;
  const rawImgSrc = resolveStimMediaSource(stim, 'image');
  const rawVideoSrc = resolveStimMediaSource(stim, 'video');
  const rawAudioSrc = resolveStimMediaSource(stim, 'audio');
  const preparedDisplay = (preparedState.currentDisplay || preparedState.currentDisplayEngine || {}) as Record<string, unknown>;
  if (isStructuredSparcDisplay(preparedDisplay)) {
    const currentDisplay = applyDisplayFieldSubset(preparedDisplay, getCurrentDeliverySettings(), selection.testType ?? stim.testType ?? Session.get('testType') ?? 'd');
    const fullAnswer = typeof preparedState.newExperimentState === 'object' &&
      typeof (preparedState.newExperimentState as Record<string, unknown>).originalAnswer === 'string'
      ? String((preparedState.newExperimentState as Record<string, unknown>).originalAnswer)
      : resolveStimAnswer(stim);
    const correctAnswer = typeof preparedState.currentAnswer === 'string'
      ? String(preparedState.currentAnswer)
      : (fullAnswer.split('~')[0] ?? '').trim();

    return buildCardDataFromResolvedTrial({
      resolvedClusterIndex,
      whichStim,
      probabilityEstimate: selection.probabilityEstimate,
      forceButtonTrial: selection.forceButtonTrial === true,
      questionIndex,
      currentDisplay,
      fullAnswer,
      correctAnswer,
      testTypeOverride: typeof selection.testType === 'string'
        ? selection.testType
        : typeof stim.testType === 'string'
          ? stim.testType
          : typeof Session.get('testType') === 'string'
            ? Session.get('testType')
            : 'd',
    });
  }

  const displayAttribution = normalizeDisplayAttribution(
    preparedDisplay.attribution,
    stim.display?.attribution,
  );
  const h5pDisplay = resolveH5PDisplayConfig(preparedDisplay.h5p, stim.display?.h5p);
  const h5pOwnsPrompt = isSelfHostedH5PConfig(h5pDisplay);
  const resolvedDisplay = {
    text: h5pOwnsPrompt ? '' : String(preparedDisplay.text ?? stim.display?.text ?? stim.text ?? stim.textStimulus ?? ''),
    clozeText: h5pOwnsPrompt ? '' : String(preparedDisplay.clozeText ?? stim.display?.clozeText ?? stim.clozeText ?? stim.clozeStimulus ?? ''),
    imgSrc: resolvePreparedMediaPath(preparedDisplay.imgSrc, rawImgSrc, stimScopedSetId),
    videoSrc: resolvePreparedMediaPath(preparedDisplay.videoSrc, rawVideoSrc, stimScopedSetId),
    audioSrc: resolvePreparedMediaPath(preparedDisplay.audioSrc, rawAudioSrc, stimScopedSetId),
    ...(h5pDisplay ? { h5p: h5pDisplay } : {}),
    ...(displayAttribution ? { attribution: displayAttribution } : {}),
  };
  const deliverySettings = getCurrentDeliverySettings();
  const testType = typeof selection.testType === 'string'
    ? selection.testType
    : typeof stim.testType === 'string'
      ? stim.testType
      : typeof Session.get('testType') === 'string'
        ? Session.get('testType')
        : 'd';
  const currentDisplay = applyDisplayFieldSubset(resolvedDisplay, deliverySettings, testType);
  const fullAnswer = typeof preparedState.newExperimentState === 'object' &&
    typeof (preparedState.newExperimentState as Record<string, unknown>).originalAnswer === 'string'
    ? String((preparedState.newExperimentState as Record<string, unknown>).originalAnswer)
    : (isSelfHostedH5PConfig(h5pDisplay) ? '__H5P_COMPLETED__' : resolveStimAnswer(stim));
  const correctAnswer = typeof preparedState.currentAnswer === 'string'
    ? String(preparedState.currentAnswer)
    : (isSelfHostedH5PConfig(h5pDisplay) ? '__H5P_COMPLETED__' : (fullAnswer.split('~')[0] ?? '').trim());

  return buildCardDataFromResolvedTrial({
    resolvedClusterIndex,
    whichStim,
    probabilityEstimate: selection.probabilityEstimate,
    forceButtonTrial: selection.forceButtonTrial === true,
    questionIndex,
    currentDisplay,
    fullAnswer,
    correctAnswer,
    testTypeOverride: testType,
  });
}
