export type CardTrialMachineEvent =
  | {
      type: 'SUBMIT';
      userAnswer: unknown;
      timestamp: unknown;
      source: 'keypress' | 'buttonClick';
    }
  | {
      type: 'FIRST_KEYPRESS';
      timestamp: unknown;
    }
  | {
      type: 'SKIP_STUDY';
    };

export type CardTrialReplayContext = Record<string, unknown>;

export type CardTrialTtsPlayback = (
  context: CardTrialReplayContext,
  options: {
    audioSrc: string;
    isQuestion: boolean;
    autoRestartSr: boolean;
  },
) => void | Promise<void>;

export interface CardTrialEventControllerOptions {
  readonly getContext: () => CardTrialReplayContext;
  readonly loadTtsPlayback: () => Promise<CardTrialTtsPlayback>;
  readonly send: (event: CardTrialMachineEvent) => void;
}

function eventDetail(event: { detail?: unknown } | null | undefined): Record<string, unknown> {
  return event?.detail && typeof event.detail === 'object'
    ? event.detail as Record<string, unknown>
    : {};
}

export function createCardTrialEventController({
  getContext,
  loadTtsPlayback,
  send,
}: CardTrialEventControllerOptions) {
  return {
    handleSubmit(event: { detail?: unknown } | null | undefined): void {
      const detail = eventDetail(event);
      send({
        type: 'SUBMIT',
        userAnswer: detail.answer,
        timestamp: detail.timestamp,
        source: 'keypress',
      });
    },
    handleChoice(event: { detail?: unknown } | null | undefined): void {
      const detail = eventDetail(event);
      send({
        type: 'SUBMIT',
        userAnswer: detail.answer,
        timestamp: detail.timestamp,
        source: 'buttonClick',
      });
    },
    handleFirstKeypress(event: { detail?: unknown } | null | undefined): void {
      const detail = eventDetail(event);
      send({
        type: 'FIRST_KEYPRESS',
        timestamp: detail.timestamp,
      });
    },
    handleSkipStudy(): void {
      send({ type: 'SKIP_STUDY' });
    },
    async handleReplay(event: { detail?: unknown } | null | undefined): Promise<void> {
      const detail = eventDetail(event);
      const audioSrc = typeof detail.audioSrc === 'string' ? detail.audioSrc : '';
      if (!audioSrc) {
        return;
      }

      const ttsPlayback = await loadTtsPlayback();
      void ttsPlayback(getContext(), {
        audioSrc,
        isQuestion: true,
        autoRestartSr: true,
      });
    },
  };
}
