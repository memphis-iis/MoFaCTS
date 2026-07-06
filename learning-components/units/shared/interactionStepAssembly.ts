import { applyDisplayFieldSubset } from '../../content/display/displayFieldSubsets';
import type { UnitEngineSessionWriteKey } from '../UnitEngineSessionKeys';

const blank = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';

export interface BuildPreparedInteractionStepOptions {
  readonly alternateDisplayIndex?: number;
  readonly testType?: string;
}

export interface BuildPreparedInteractionStepDependencies {
  readonly stimClusters: any[];
  readonly getCurrentTestType: () => string | undefined;
  readonly getDeliverySettings: () => Record<string, unknown> | null | undefined;
  readonly getStimAnswer: (clusterIndex: number, whichStim: number) => string;
  readonly log: (...args: unknown[]) => void;
}

export interface PreparedInteractionStepState {
  readonly cardIndex: number;
  readonly whichStim: number;
  readonly probFunctionParameters: unknown;
  readonly currentAnswer: string;
  readonly originalDisplay: unknown;
  readonly currentDisplay: unknown;
  readonly alternateDisplayIndex?: number | undefined;
  readonly newExperimentState: Record<string, unknown>;
}

export interface ApplyPreparedInteractionStepDependencies {
  readonly setSessionValue: (key: UnitEngineSessionWriteKey, value: unknown) => void;
  readonly setCurrentAnswer: (value: string | undefined) => void;
  readonly setAlternateDisplayIndex: (value: number | undefined) => void;
  readonly setOriginalQuestion: (value: unknown) => void;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildStimulusDisplay(stim: Record<string, unknown>): Record<string, unknown> {
  if (stim.display && typeof stim.display === 'object' && !Array.isArray(stim.display)) {
    return cloneJson(stim.display as Record<string, unknown>);
  }

  return cloneJson({
    text: stim.textStimulus,
    audioSrc: stim.audioStimulus,
    imgSrc: stim.imageStimulus,
    videoSrc: stim.videoStimulus,
    clozeText: stim.clozeStimulus || stim.clozeText,
  });
}

export async function buildPreparedInteractionStepState(
  cardIndex: number,
  whichStim: number,
  probFunctionParameters: unknown,
  options: BuildPreparedInteractionStepOptions = {},
  dependencies: BuildPreparedInteractionStepDependencies,
): Promise<PreparedInteractionStepState> {
  const newExperimentState: Record<string, unknown> = {};
  const cluster = dependencies.stimClusters[cardIndex];
  dependencies.log(
    'setUpCardQuestionAndAnswerGlobals',
    cardIndex,
    whichStim,
    probFunctionParameters,
    cluster,
    cluster.stims[whichStim],
  );
  const curStim = cluster.stims[whichStim];
  let currentDisplay: Record<string, unknown> = buildStimulusDisplay(curStim);
  let resolvedAlternateDisplayIndex = undefined;
  if (curStim.alternateDisplays) {
    const numPotentialDisplays = curStim.alternateDisplays.length + 1;
    const displayIndex = Number.isFinite(options?.alternateDisplayIndex)
      ? Number(options.alternateDisplayIndex)
      : Math.floor(numPotentialDisplays * Math.random());
    if (displayIndex < curStim.alternateDisplays.length) {
      resolvedAlternateDisplayIndex = displayIndex;
      newExperimentState.alternateDisplayIndex = displayIndex;
      const curAltDisplay = curStim.alternateDisplays[displayIndex];
      currentDisplay = buildStimulusDisplay(curAltDisplay);
    }
  }
  const testType = options?.testType || dependencies.getCurrentTestType() || 'd';
  const originalDisplay = cloneJson(currentDisplay);
  currentDisplay = cloneJson(
    applyDisplayFieldSubset(currentDisplay, dependencies.getDeliverySettings(), testType),
  );
  newExperimentState.originalDisplay = originalDisplay;

  const rawCurrentQuestion = currentDisplay.clozeText || currentDisplay.text;
  let currentQuestion = typeof rawCurrentQuestion === 'string' ? rawCurrentQuestion : '';
  let currentQuestionPart2 = undefined;
  const currentStimAnswer = dependencies.getStimAnswer(cardIndex, whichStim);

  newExperimentState.originalAnswer = currentStimAnswer;

  if (currentQuestion && currentQuestion.indexOf('|') !== -1) {
    const prompts = currentQuestion.split('|');
    currentQuestion = prompts[0] ?? '';
    currentQuestionPart2 = prompts[1];
  }
  newExperimentState.originalQuestion = currentQuestion;
  newExperimentState.originalQuestion2 = currentQuestionPart2;

  const regex = /([_])+/g;
  const formattedQuestion = currentQuestion
    ? currentQuestion.replaceAll(regex, `<u>${blank + blank}</u>`)
    : '';

  dependencies.log('setUpCardQuestionAndAnswerGlobals2:', formattedQuestion, currentQuestionPart2);

  newExperimentState.currentAnswer = currentStimAnswer;
  newExperimentState.currentQuestionPart2 = currentQuestionPart2;

  if (formattedQuestion && currentDisplay.clozeText) {
    currentDisplay.clozeText = formattedQuestion;
  } else if (formattedQuestion && currentDisplay.text) {
    currentDisplay.text = formattedQuestion;
  }
  newExperimentState.currentDisplayEngine = currentDisplay;

  const preparedState: PreparedInteractionStepState = {
    cardIndex,
    whichStim,
    probFunctionParameters,
    currentAnswer: currentStimAnswer,
    originalDisplay,
    currentDisplay,
    newExperimentState,
  };
  if (typeof resolvedAlternateDisplayIndex === 'number') {
    return {
      ...preparedState,
      alternateDisplayIndex: resolvedAlternateDisplayIndex,
    };
  }
  return preparedState;
}

export function applyPreparedInteractionStepState(
  preparedState: PreparedInteractionStepState,
  dependencies: ApplyPreparedInteractionStepDependencies,
): Record<string, unknown> {
  const newExperimentState = cloneJson(preparedState?.newExperimentState || {});
  const alternateDisplayIndex = preparedState?.alternateDisplayIndex;
  dependencies.setSessionValue('alternateDisplayIndex', undefined);
  dependencies.setAlternateDisplayIndex(undefined);
  if (typeof alternateDisplayIndex === 'number') {
    dependencies.setSessionValue('alternateDisplayIndex', alternateDisplayIndex);
    dependencies.setAlternateDisplayIndex(alternateDisplayIndex);
  }
  dependencies.setOriginalQuestion(newExperimentState.originalQuestion);
  dependencies.setSessionValue('currentAnswer', preparedState?.currentAnswer);
  dependencies.setCurrentAnswer(preparedState?.currentAnswer);
  return newExperimentState;
}

export const buildPreparedCardQuestionAndAnswerGlobals = buildPreparedInteractionStepState;
export const applyPreparedCardQuestionAndAnswerGlobals = applyPreparedInteractionStepState;
export type BuildPreparedCardOptions = BuildPreparedInteractionStepOptions;
export type BuildPreparedCardDependencies = BuildPreparedInteractionStepDependencies;
export type PreparedCardState = PreparedInteractionStepState;
export type ApplyPreparedCardDependencies = ApplyPreparedInteractionStepDependencies;
export const buildPreparedTrialState = buildPreparedInteractionStepState;
export const applyPreparedTrialState = applyPreparedInteractionStepState;
export type BuildPreparedTrialOptions = BuildPreparedInteractionStepOptions;
export type BuildPreparedTrialDependencies = BuildPreparedInteractionStepDependencies;
export type PreparedTrialState = PreparedInteractionStepState;
export type ApplyPreparedTrialDependencies = ApplyPreparedInteractionStepDependencies;
export const buildPreparedPresentationState = buildPreparedInteractionStepState;
export const applyPreparedPresentationState = applyPreparedInteractionStepState;
export type BuildPreparedPresentationOptions = BuildPreparedInteractionStepOptions;
export type BuildPreparedPresentationDependencies = BuildPreparedInteractionStepDependencies;
export type PreparedPresentationState = PreparedInteractionStepState;
export type ApplyPreparedPresentationDependencies = ApplyPreparedInteractionStepDependencies;
