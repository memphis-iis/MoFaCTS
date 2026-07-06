import { EVENTS } from '../machine/constants';

type SendEvent =
  | {
      type: 'FEEDBACK_CONTENT';
      feedbackText: string;
      feedbackHtml: string;
      feedbackSuppressed: boolean;
    }
  | {
      type: typeof EVENTS.TRIAL_REVEAL_STARTED;
      timestamp: number;
      subsetKind: unknown;
    }
  | {
      type: typeof EVENTS.REVIEW_REVEAL_STARTED;
      timestamp: number;
    };

export function createCardReviewEventController({
  getSubsetKind,
  isTestMode,
  log,
  now,
  send,
  stateMatches,
}: {
  getSubsetKind: () => unknown;
  isTestMode: () => boolean;
  log: (level: number, message: string, details?: unknown) => void;
  now: () => number;
  send: (event: SendEvent) => void;
  stateMatches: (path: string) => boolean;
}) {
  function handleFeedbackContent(detail: {
    feedbackText?: unknown;
    feedbackHtml?: unknown;
    suppressed?: unknown;
  } | null | undefined): void {
    send({
      type: 'FEEDBACK_CONTENT',
      feedbackText: String(detail?.feedbackText || '').trim(),
      feedbackHtml: String(detail?.feedbackHtml || ''),
      feedbackSuppressed: detail?.suppressed === true,
    });
  }

  function handleReviewRevealStarted(detail: {
    subsetKind?: unknown;
    timestamp?: unknown;
    transitionDurationMs?: unknown;
  } | null | undefined): void {
    if (isTestMode()) {
      return;
    }

    const subsetKind = detail?.subsetKind || getSubsetKind();
    const timestamp = Number.isFinite(Number(detail?.timestamp))
      ? Number(detail?.timestamp)
      : now();
    const transitionDurationMs = detail?.transitionDurationMs ?? null;

    if (stateMatches('study.preparing')) {
      log(2, '[ContentSurface][StudyReveal] started', {
        subsetKind,
        transitionDurationMs,
      });

      send({
        type: EVENTS.TRIAL_REVEAL_STARTED,
        timestamp,
        subsetKind,
      });
      return;
    }

    if (!stateMatches('feedback.preparing')) {
      return;
    }

    log(2, '[ContentSurface][ReviewReveal] started', {
      subsetKind,
      transitionDurationMs,
    });

    send({
      type: EVENTS.REVIEW_REVEAL_STARTED,
      timestamp,
    });
  }

  return {
    handleFeedbackContent,
    handleReviewRevealStarted,
  };
}
