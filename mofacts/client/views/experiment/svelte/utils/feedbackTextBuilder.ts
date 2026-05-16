type FeedbackSetting = boolean | 'onCorrect' | 'onIncorrect' | null | undefined;

type FeedbackHtmlContext = {
  message?: string;
  isCorrectAnswer?: boolean;
  isTimeoutAnswer?: boolean;
  showUserAnswer?: boolean;
  userAnswerText?: string;
  correctAnswerText?: string;
  displayCorrectAnswer?: boolean;
  correctAnswerImage?: string;
  feedbackLayout?: 'inline' | 'stacked';
  correctLabelText?: string;
  incorrectLabelText?: string;
};

type FeedbackDisplayPolicy = {
  showUserAnswer: boolean;
  showCorrectAnswerOnIncorrect: boolean;
  mode: 'full' | 'labelOnly';
  layout: 'inline' | 'stacked';
  correctLabelText: string;
  incorrectLabelText: string;
};

type FeedbackSemanticState =
  | {
      outcome: 'correct' | 'incorrect';
      reason: 'labelOnly';
      mainText: string;
    }
  | {
      outcome: 'correct' | 'incorrect';
      reason: 'evaluatedMessage' | 'timeout';
      mainText: string;
    }
  | {
      outcome: 'incorrect';
      reason: 'correctAnswerImage';
      mainText: string;
      imageSrc: string;
    };

type FeedbackSegmentKey =
  | 'userAnswerText'
  | 'mainFeedbackMessage'
  | 'correctAnswerText'
  | 'correctAnswerImage';

type FeedbackSegment = {
  key: FeedbackSegmentKey;
  kind: 'text' | 'image';
  text: string;
  html: string;
};

type FeedbackContent = {
  feedbackText: string;
  feedbackHtml: string;
};

function stripTags(value: unknown): string {
  return String(value || '').replace(/<[^>]*>/g, '');
}

function formatLabel(text: string): string {
  return `<b class="feedback-label">${text}</b>`;
}

function shouldShow(setting: FeedbackSetting, isCorrectAnswer: boolean | undefined): boolean {
  if (setting === true) return true;
  if (setting === false || setting == null) return false;
  if (setting === 'onCorrect') return isCorrectAnswer === true;
  if (setting === 'onIncorrect') return isCorrectAnswer !== true;
  return false;
}

function normalizeDisplayPolicy({
  showUserAnswer,
  displayCorrectAnswer,
  feedbackLayout,
  correctLabelText,
  incorrectLabelText,
}: {
  showUserAnswer: boolean | undefined;
  displayCorrectAnswer: boolean | undefined;
  feedbackLayout: 'inline' | 'stacked' | undefined;
  correctLabelText: string | undefined;
  incorrectLabelText: string | undefined;
}): FeedbackDisplayPolicy {
  return {
    showUserAnswer: showUserAnswer === true,
    showCorrectAnswerOnIncorrect: displayCorrectAnswer === true,
    mode: 'full',
    layout: feedbackLayout === 'inline' ? 'inline' : 'stacked',
    correctLabelText: normalizeOutcomeLabelText(correctLabelText, 'Correct.'),
    incorrectLabelText: normalizeOutcomeLabelText(incorrectLabelText, 'Incorrect.'),
  };
}

function normalizeOutcomeLabelText(value: unknown, fallback: string): string {
  const label = stripTags(value || '').trim() || fallback;
  return /[.!?]$/.test(label) ? label : `${label}.`;
}

function normalizeEvaluatorMessage(message: unknown): string {
  const value = String(message || '');
  const trimmed = stripTags(value).trim();

  if (trimmed === 'Correct') {
    return 'Correct.';
  }

  if (trimmed === 'Incorrect') {
    return 'Incorrect.';
  }

  return value;
}

function determineSemanticState({
  message,
  isCorrectAnswer,
  isTimeoutAnswer,
  correctAnswerImage,
  policy,
}: {
  message: string | undefined;
  isCorrectAnswer: boolean | undefined;
  isTimeoutAnswer: boolean | undefined;
  correctAnswerImage: string | undefined;
  policy: FeedbackDisplayPolicy;
}): FeedbackSemanticState {
  const outcome = isCorrectAnswer ? 'correct' : 'incorrect';
  const hasCorrectImage = outcome === 'incorrect' && !!correctAnswerImage;

  if (hasCorrectImage) {
    return {
      outcome: 'incorrect',
      reason: 'correctAnswerImage',
      mainText: 'Incorrect. The correct response is displayed below.',
      imageSrc: String(correctAnswerImage),
    };
  }

  if (policy.mode === 'labelOnly') {
    return {
      outcome,
      reason: 'labelOnly',
      mainText: outcome === 'correct' ? policy.correctLabelText : policy.incorrectLabelText,
    };
  }

  let mainText = normalizeEvaluatorMessage(message);

  if (isTimeoutAnswer && !stripTags(mainText).includes('Incorrect.')) {
    mainText = mainText ? `Incorrect. ${mainText}` : 'Incorrect.';
  }

  return {
    outcome,
    reason: isTimeoutAnswer ? 'timeout' : 'evaluatedMessage',
    mainText,
  };
}

function applyOutcomeLabelText(text: string, policy: FeedbackDisplayPolicy): string {
  const trimmed = stripTags(text).trim();

  if (trimmed === 'Correct' || trimmed === 'Correct.') {
    return policy.correctLabelText;
  }

  if (trimmed === 'Incorrect' || trimmed === 'Incorrect.') {
    return policy.incorrectLabelText;
  }

  if (text.startsWith('Correct.')) {
    return `${policy.correctLabelText}${text.slice('Correct.'.length)}`;
  }

  if (text.startsWith('Incorrect.')) {
    return `${policy.incorrectLabelText}${text.slice('Incorrect.'.length)}`;
  }

  return text;
}

function projectTextSegment(
  key: FeedbackSegmentKey,
  text: string,
  options: { outcomeLabelText?: string } = {}
): FeedbackSegment {
  const plainText = stripTags(text);
  const outcomeLabelText = options.outcomeLabelText;
  const html = outcomeLabelText && text.startsWith(outcomeLabelText)
    ? `${formatLabel(outcomeLabelText)}${text.slice(outcomeLabelText.length)}`
    : text;

  return {
    key,
    kind: 'text',
    text: plainText,
    html,
  };
}

function composeFeedbackSegments({
  semanticState,
  policy,
  userAnswerText,
  correctAnswerText,
}: {
  semanticState: FeedbackSemanticState;
  policy: FeedbackDisplayPolicy;
  userAnswerText: string | undefined;
  correctAnswerText: string | undefined;
}): FeedbackSegment[] {
  const segments: FeedbackSegment[] = [];
  const hasCorrectImage = semanticState.reason === 'correctAnswerImage';
  const displayUserAnswer = policy.showUserAnswer && !hasCorrectImage;
  const displayCorrectAnswer =
    semanticState.outcome === 'incorrect' &&
    policy.showCorrectAnswerOnIncorrect &&
    policy.mode !== 'labelOnly' &&
    !hasCorrectImage &&
    !!correctAnswerText;

  if (displayUserAnswer && userAnswerText) {
    segments.push(projectTextSegment('userAnswerText', `Your answer was ${userAnswerText}.`));
  }

  if (semanticState.mainText) {
    const mainText = applyOutcomeLabelText(semanticState.mainText, policy);
    const outcomeLabelText = mainText.startsWith(policy.correctLabelText)
      ? policy.correctLabelText
      : (mainText.startsWith(policy.incorrectLabelText) ? policy.incorrectLabelText : undefined);
    segments.push(projectTextSegment(
      'mainFeedbackMessage',
      mainText,
      outcomeLabelText ? { outcomeLabelText } : {}
    ));
  }

  if (displayCorrectAnswer) {
    segments.push(projectTextSegment('correctAnswerText', `The correct answer is ${correctAnswerText}.`));
  }

  if (hasCorrectImage) {
    segments.push({
      key: 'correctAnswerImage',
      kind: 'image',
      text: '',
      html: `<img src="${semanticState.imageSrc}" alt="Correct answer image" class="feedback-image">`,
    });
  }

  return segments;
}

function renderFeedbackText(segments: FeedbackSegment[]): string {
  const textSegments = segments.filter((segment) => segment.kind === 'text');
  return textSegments.map((segment) => segment.text).join(' ');
}

function renderFeedbackHtml(segments: FeedbackSegment[], policy: FeedbackDisplayPolicy): string {
  const separator = policy.layout === 'inline' ? ' ' : '<br>';
  const imageSegments = segments.filter((segment) => segment.kind === 'image');
  const textSegments = segments.filter((segment) => segment.kind === 'text');
  const html = textSegments.map((segment) => segment.html).join(separator);

  if (imageSegments.length === 0) {
    return html;
  }

  const imageHtml = imageSegments.map((segment) => segment.html).join('<br>');
  return html ? `${html}<br>${imageHtml}` : imageHtml;
}

function buildFeedbackContent({
  message,
  isCorrectAnswer,
  isTimeoutAnswer,
  showUserAnswer,
  userAnswerText,
  correctAnswerText,
  displayCorrectAnswer,
  correctAnswerImage,
  feedbackLayout,
  correctLabelText,
  incorrectLabelText,
}: FeedbackHtmlContext): FeedbackContent {
  const policy = normalizeDisplayPolicy({
    showUserAnswer,
    displayCorrectAnswer,
    feedbackLayout,
    correctLabelText,
    incorrectLabelText,
  });
  const semanticState = determineSemanticState({
    message,
    isCorrectAnswer,
    isTimeoutAnswer,
    correctAnswerImage,
    policy,
  });
  const segments = composeFeedbackSegments({
    semanticState,
    policy,
    userAnswerText,
    correctAnswerText,
  });

  return {
    feedbackText: renderFeedbackText(segments),
    feedbackHtml: renderFeedbackHtml(segments, policy),
  };
}

export {
  buildFeedbackContent,
  shouldShow,
};
