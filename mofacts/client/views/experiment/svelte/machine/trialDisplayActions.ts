import { Session } from 'meteor/session';
import { Answers } from '../../answerAssess';
import { setDisplayReadyState, setInputReadyState } from '../services/cardRuntimeState';
import { assign, type ActionArgs } from './contentRuntimeMachineActionTypes';

export const setPrestimulusDisplay = assign({
  currentDisplay: ({ context }: ActionArgs) => {
    const prestimulusDisplay = Session.get('currentTdfFile')?.tdfs?.tutor?.setspec?.prestimulusDisplay;
    if (!prestimulusDisplay) {
      return context.currentDisplay;
    }
    return { text: prestimulusDisplay };
  },
});

export const restoreQuestionDisplay = assign({
  currentDisplay: ({ context }: ActionArgs) => context.questionDisplay || context.currentDisplay,
});

export function focusInput() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:focusInput'));
  }
}

export function disableInput() {
  setInputReadyState(false);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:disableInput'));
  }
}

export function enableInput() {
  setInputReadyState(true);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:enableInput'));
  }
}

export function clearFeedback() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:clearFeedback'));
  }
}

export function announceToScreenReader({ context }: ActionArgs) {
  let message = '';

  if (context.isCorrect) {
    message = context.deliverySettings.correctLabelText || 'Correct.';
  } else if (!context.isCorrect && context.userAnswer) {
    message = context.deliverySettings.incorrectLabelText || 'Incorrect.';
  } else if (context.isTimeout) {
    message = 'Time out';
  }

  if (message && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:announce', {
      detail: { message },
    }));
  }
}

export function displayAnswer({ context }: ActionArgs) {
  const displayAnswerText = Answers.getDisplayAnswerText(
    String(context.originalAnswer || context.currentAnswer || ''),
  ) || String(context.currentAnswer || '');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:displayAnswer', {
      detail: { answer: displayAnswerText },
    }));
  }
}

export function displayFeedback({ context }: ActionArgs) {
  const displayCorrectAnswerText = Answers.getDisplayAnswerText(
    String(context.currentAnswer || ''),
  ) || String(context.currentAnswer || '');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:displayFeedback', {
      detail: {
        isCorrect: context.isCorrect,
        correctAnswer: displayCorrectAnswerText,
        userAnswer: context.userAnswer,
      },
    }));
  }
}

export function setDisplayReady({ context: _context }: ActionArgs) {
  setDisplayReadyState(true);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:displayReady'));
  }
}

export function setDisplayNotReady() {
  setDisplayReadyState(false);
}

export function setInputNotReady() {
  setInputReadyState(false);
}
