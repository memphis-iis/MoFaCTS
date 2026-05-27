import { applyDisplayFieldSubset } from "../../content/display/displayFieldSubsets";

const blank = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";

export interface BuildPreparedCardOptions {
  readonly alternateDisplayIndex?: number;
  readonly testType?: string;
}

export interface BuildPreparedCardDependencies {
  readonly stimClusters: any[];
  readonly getCurrentTestType: () => string | undefined;
  readonly getDeliverySettings: () => Record<string, unknown> | null | undefined;
  readonly getStimAnswer: (clusterIndex: number, whichStim: number) => string;
  readonly log: (...args: unknown[]) => void;
}

export interface PreparedCardState {
  readonly cardIndex: number;
  readonly whichStim: number;
  readonly probFunctionParameters: unknown;
  readonly currentAnswer: string;
  readonly originalDisplay: unknown;
  readonly currentDisplay: unknown;
  readonly alternateDisplayIndex?: number | undefined;
  readonly newExperimentState: Record<string, unknown>;
}

export interface ApplyPreparedCardDependencies {
  readonly setSessionValue: (key: string, value: unknown) => void;
  readonly setCardValue: (key: string, value: unknown) => void;
  readonly setAlternateDisplayIndex: (value: number | undefined) => void;
  readonly setOriginalQuestion: (value: unknown) => void;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function buildPreparedCardQuestionAndAnswerGlobals(
  cardIndex: number,
  whichStim: number,
  probFunctionParameters: unknown,
  options: BuildPreparedCardOptions = {},
  dependencies: BuildPreparedCardDependencies,
): Promise<PreparedCardState> {
  const newExperimentState: Record<string, unknown> = {};
  const cluster = dependencies.stimClusters[cardIndex];
  dependencies.log(
    "setUpCardQuestionAndAnswerGlobals",
    cardIndex,
    whichStim,
    probFunctionParameters,
    cluster,
    cluster.stims[whichStim],
  );
  const curStim = cluster.stims[whichStim];
  let currentDisplay: Record<string, unknown> = cloneJson({
    text: curStim.textStimulus,
    audioSrc: curStim.audioStimulus,
    imgSrc: curStim.imageStimulus,
    videoSrc: curStim.videoStimulus,
    clozeText: curStim.clozeStimulus || curStim.clozeText,
  });
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
      currentDisplay = cloneJson({
        text: curAltDisplay.textStimulus,
        audioSrc: curAltDisplay.audioStimulus,
        imgSrc: curAltDisplay.imageStimulus,
        videoSrc: curAltDisplay.videoStimulus,
        clozeText: curAltDisplay.clozeStimulus || curAltDisplay.clozeText,
      });
    }
  }
  const testType = options?.testType || dependencies.getCurrentTestType() || "d";
  const originalDisplay = cloneJson(currentDisplay);
  currentDisplay = cloneJson(
    applyDisplayFieldSubset(currentDisplay, dependencies.getDeliverySettings(), testType),
  );
  newExperimentState.originalDisplay = originalDisplay;

  const rawCurrentQuestion = currentDisplay.clozeText || currentDisplay.text;
  let currentQuestion = typeof rawCurrentQuestion === "string" ? rawCurrentQuestion : "";
  let currentQuestionPart2 = undefined;
  const currentStimAnswer = dependencies.getStimAnswer(cardIndex, whichStim);

  newExperimentState.originalAnswer = currentStimAnswer;

  if (currentQuestion && currentQuestion.indexOf("|") != -1) {
    const prompts = currentQuestion.split("|");
    currentQuestion = prompts[0] ?? "";
    currentQuestionPart2 = prompts[1];
  }
  newExperimentState.originalQuestion = currentQuestion;
  newExperimentState.originalQuestion2 = currentQuestionPart2;

  const regex = /([_])+/g;
  const formattedQuestion = currentQuestion
    ? currentQuestion.replaceAll(regex, `<u>${blank + blank}</u>`)
    : "";

  dependencies.log("setUpCardQuestionAndAnswerGlobals2:", formattedQuestion, currentQuestionPart2);

  newExperimentState.currentAnswer = currentStimAnswer;
  newExperimentState.currentQuestionPart2 = currentQuestionPart2;

  if (formattedQuestion && currentDisplay.clozeText) {
    currentDisplay.clozeText = formattedQuestion;
  } else if (formattedQuestion && currentDisplay.text) {
    currentDisplay.text = formattedQuestion;
  }
  newExperimentState.currentDisplayEngine = currentDisplay;

  const preparedState: PreparedCardState = {
    cardIndex,
    whichStim,
    probFunctionParameters,
    currentAnswer: currentStimAnswer,
    originalDisplay,
    currentDisplay,
    newExperimentState,
  };
  if (typeof resolvedAlternateDisplayIndex === "number") {
    return {
      ...preparedState,
      alternateDisplayIndex: resolvedAlternateDisplayIndex,
    };
  }
  return preparedState;
}

export function applyPreparedCardQuestionAndAnswerGlobals(
  preparedState: PreparedCardState,
  dependencies: ApplyPreparedCardDependencies,
): Record<string, unknown> {
  const newExperimentState = cloneJson(preparedState?.newExperimentState || {});
  const alternateDisplayIndex = preparedState?.alternateDisplayIndex;
  dependencies.setSessionValue("alternateDisplayIndex", undefined);
  dependencies.setAlternateDisplayIndex(undefined);
  if (typeof alternateDisplayIndex === "number") {
    dependencies.setSessionValue("alternateDisplayIndex", alternateDisplayIndex);
    dependencies.setAlternateDisplayIndex(alternateDisplayIndex);
  }
  dependencies.setOriginalQuestion(newExperimentState.originalQuestion);
  dependencies.setSessionValue("currentAnswer", preparedState?.currentAnswer);
  dependencies.setCardValue("currentAnswer", preparedState?.currentAnswer);
  return newExperimentState;
}
