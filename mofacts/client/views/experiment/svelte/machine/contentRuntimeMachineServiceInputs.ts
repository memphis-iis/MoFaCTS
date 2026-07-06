import { getOverallOutcomeHistory } from '../services/cardRuntimeState';
import type { MachineArgs } from './contentRuntimeMachineTypes';

export function toServiceInput({ context, event }: MachineArgs) {
  return { context, event };
}

export function toSelectCardInput({ context, event }: MachineArgs) {
  return {
    context,
    event,
    engine: context.engine,
    sessionId: context.sessionId,
    unitId: context.unitId,
    tdfId: context.tdfId,
  };
}

export function toDisplayedTrialStateInput({ context, event }: MachineArgs) {
  return {
    context,
    event,
    stateUpdate: {
      clusterIndex: context.engineIndices?.clusterIndex,
      originalDisplay: context.currentDisplay?.text || context.currentDisplay?.clozeText || '',
      originalAnswer: context.originalAnswer,
      currentAnswer: context.currentAnswer,
    },
    source: 'contentRuntimeMachine.displaying',
  };
}

export function toSpeechRecognitionInput({ context, event }: MachineArgs) {
  return {
    context,
    event,
    correctAnswer: context.currentAnswer,
    deliverySettings: context.deliverySettings,
    speechHintExclusionList: context.speechHintExclusionList,
  };
}

export function toEvaluateAnswerInput({ context }: MachineArgs) {
  return { context };
}

export function toPrepareIncomingTrialInput({ context, event }: MachineArgs) {
  return {
    context,
    event,
    engine: context.engine,
  };
}

export function toStudyAnswerTtsInput({ context, event }: MachineArgs) {
  return {
    context,
    event,
    text: context.currentAnswer,
    questionText: context.currentDisplay?.clozeText || context.currentDisplay?.text || '',
    questionAudioSrc: context.currentDisplay?.audioSrc || '',
    delayAfterQuestionMs: 1000,
    display: context.currentDisplay,
    isQuestion: false,
    deliverySettings: context.deliverySettings,
  };
}

export function toFeedbackTtsInput({ context, event }: MachineArgs) {
  const feedbackText = context.feedbackText;
  if (context.feedbackSuppressed === true) {
    throw new Error('[contentRuntimeMachine] suppressed feedback should not enter feedback.speaking');
  }
  if (typeof feedbackText !== 'string' || feedbackText.trim() === '') {
    throw new Error('[contentRuntimeMachine] feedbackText missing at feedback.speaking handoff');
  }

  return {
    context,
    event,
    text: feedbackText,
    isQuestion: false,
    display: context.currentDisplay,
    deliverySettings: context.deliverySettings,
    feedbackType: context.isCorrect ? 'correct' : 'incorrect',
  };
}

export function toHistoryLoggingInput({ context, event }: MachineArgs) {
  return {
    context,
    event,
    engine: context.engine,
  };
}

export function toOutcomeHistoryStateInput({ context, event }: MachineArgs) {
  return {
    context,
    event,
    stateUpdate: {
      overallOutcomeHistory: getOverallOutcomeHistory(),
    },
    source: 'contentRuntimeMachine.transition.logging',
  };
}

export function toUpdateEngineInput({ context, event }: MachineArgs) {
  return {
    context,
    event,
    isCorrect: context.isCorrect,
    responseTime: context.timestamps.trialEnd
      ? context.timestamps.trialEnd - context.timestamps.trialStart
      : 0,
  };
}
