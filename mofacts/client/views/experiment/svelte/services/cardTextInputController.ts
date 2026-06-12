type MachineStateLike = {
  matches: (path: string) => boolean;
};

type CardTextInputContextLike = {
  timestamps?: {
    trialStart?: unknown;
  };
  userAnswer?: unknown;
};

export function createCardTextInputController({
  getContext,
  getState,
  now,
  send,
  setContextUserAnswer,
  setTextAnswer,
}: {
  getContext: () => CardTextInputContextLike;
  getState: () => MachineStateLike;
  now: () => number;
  send: (event: { type: 'INPUT_ACTIVITY'; timestamp: number }) => void;
  setContextUserAnswer: (value: string) => void;
  setTextAnswer: (value: string) => void;
}) {
  let lastInputTrialStart: unknown = null;

  function resetForRuntimeState(): void {
    const state = getState();
    if (state.matches('presenting.loading') || state.matches('transition.clearing')) {
      setTextAnswer('');
    }
  }

  function syncTrialStart(): void {
    const currentTrialStart = getContext().timestamps?.trialStart ?? null;
    if (currentTrialStart === lastInputTrialStart) {
      return;
    }

    lastInputTrialStart = currentTrialStart;
    setTextAnswer('');
    setContextUserAnswer('');
  }

  function handleInput(detail: { value?: unknown } | null | undefined): void {
    const value = String(detail?.value ?? '');
    setTextAnswer(value);
    setContextUserAnswer(value);
  }

  function handleInputActivity(detail: { timestamp?: unknown } | null | undefined): void {
    if (!getState().matches('presenting.awaiting')) {
      return;
    }

    const timestamp = Number(detail?.timestamp);
    send({
      type: 'INPUT_ACTIVITY',
      timestamp: Number.isFinite(timestamp) ? timestamp : now(),
    });
  }

  return {
    handleInput,
    handleInputActivity,
    resetForRuntimeState,
    syncTrialStart,
  };
}
