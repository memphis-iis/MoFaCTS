import { Session } from 'meteor/session';
import { getDisplayAnswerText } from '../../learnerResponseAssessment';
import { translatePlatformString } from '../../../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
import { setDisplayReadyState, setInputReadyState } from '../services/cardRuntimeState';
import { assign, type ActionArgs } from './contentRuntimeMachineActionTypes';

const DEFAULT_CORRECT_LABELS = new Set(['Correct', 'Correct.']);
const DEFAULT_INCORRECT_LABELS = new Set(['Incorrect', 'Incorrect.']);

function resolveOutcomeLabelText(
  rawLabel: unknown,
  defaultKey: 'feedback.correct' | 'feedback.incorrect',
  knownDefaults: Set<string>,
): string {
  const platformText = (key: Parameters<typeof translatePlatformString>[1]) =>
    translatePlatformString(getActiveUiLocale(), key);
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
  if (label && !knownDefaults.has(label)) {
    return label;
  }
  return platformText(defaultKey);
}

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
    message = resolveOutcomeLabelText(
      context.deliverySettings.correctLabelText,
      'feedback.correct',
      DEFAULT_CORRECT_LABELS,
    );
  } else if (!context.isCorrect && context.userAnswer) {
    message = resolveOutcomeLabelText(
      context.deliverySettings.incorrectLabelText,
      'feedback.incorrect',
      DEFAULT_INCORRECT_LABELS,
    );
  } else if (context.isTimeout) {
    message = translatePlatformString(getActiveUiLocale(), 'feedback.timeout');
  }

  if (message && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:announce', {
      detail: { message },
    }));
  }
}

export function displayAnswer({ context }: ActionArgs) {
  const displayAnswerText = getDisplayAnswerText(
    String(context.originalAnswer || context.currentAnswer || ''),
  ) || String(context.currentAnswer || '');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:displayAnswer', {
      detail: { answer: displayAnswerText },
    }));
  }
}

export function displayFeedback({ context }: ActionArgs) {
  const displayCorrectAnswerText = getDisplayAnswerText(
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
