export type RuntimeEventTarget = {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
};

export type RuntimeDocumentTarget = RuntimeEventTarget & {
  readonly visibilityState?: string;
};

export type CardRuntimeWindowEventsDeps = {
  readonly windowTarget?: RuntimeEventTarget | null;
  readonly documentTarget?: RuntimeDocumentTarget | null;
  readonly startRecording: () => void;
  readonly stopRecording: () => void;
  readonly cleanupAudioRecorder: () => void;
  readonly setStudyInteractionText: (value: string) => void;
  readonly requestVideoResume: (reason: string) => void;
  readonly handleVideoAnswer: (detail: Record<string, unknown>) => void;
  readonly syncScreenWakeLock: (reason: string) => Promise<void> | void;
  readonly releaseScreenWakeLock: (reason: string) => Promise<void> | void;
  readonly userCanForceAdvance: () => boolean;
  readonly forceAdvanceToNextUnit: (reason: string) => Promise<void> | void;
  readonly log: (level: number, message: string, details?: unknown) => void;
};

export type CardRuntimeWindowEventController = {
  readonly start: () => void;
  readonly stop: () => void;
};

type RuntimeListenerRegistration = {
  readonly target: RuntimeEventTarget;
  readonly type: string;
  readonly listener: EventListener;
};

function eventDetail(event: Event): Record<string, unknown> {
  const detail = (event as CustomEvent<Record<string, unknown>>)?.detail;
  return detail && typeof detail === 'object' ? detail : {};
}

function createRecordingCommandHandler(
  command: () => void,
  log: CardRuntimeWindowEventsDeps['log'],
  label: string,
): EventListener {
  return () => {
    try {
      command();
    } catch (error) {
      log(1, `[SR] ${label} failed`, error);
    }
  };
}

function createForceAdvanceHandler(deps: CardRuntimeWindowEventsDeps): EventListener {
  return (event) => {
    const keyboardEvent = event as KeyboardEvent;
    const saveShortcutPressed =
      (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
      keyboardEvent.shiftKey &&
      String(keyboardEvent.key || '').toLowerCase() === 's';
    if (!saveShortcutPressed || keyboardEvent.repeat) {
      return;
    }

    if (!deps.userCanForceAdvance()) {
      return;
    }

    keyboardEvent.preventDefault();
    void deps.forceAdvanceToNextUnit('Admin Teacher Shortcut Ctrl+Shift+S');
  };
}

export function createCardRuntimeWindowEventController(
  deps: CardRuntimeWindowEventsDeps,
): CardRuntimeWindowEventController {
  const registrations: RuntimeListenerRegistration[] = [];
  let started = false;

  function add(target: RuntimeEventTarget | null | undefined, type: string, listener: EventListener): void {
    if (!target) {
      return;
    }
    target.addEventListener(type, listener);
    registrations.push({ target, type, listener });
  }

  function start(): void {
    if (started) {
      return;
    }
    started = true;

    add(
      deps.windowTarget,
      'cardMachine:startRecording',
      createRecordingCommandHandler(deps.startRecording, deps.log, 'startRecording'),
    );
    add(
      deps.windowTarget,
      'cardMachine:stopRecording',
      createRecordingCommandHandler(deps.stopRecording, deps.log, 'stopRecording'),
    );
    add(deps.windowTarget, 'cardMachine:displayAnswer', (event) => {
      deps.setStudyInteractionText(String(eventDetail(event).answer || '').trim());
    });
    add(deps.windowTarget, 'cardMachine:resumeVideo', () => {
      deps.requestVideoResume('cardMachine:resumeVideo');
    });
    add(deps.windowTarget, 'cardMachine:videoAnswer', (event) => {
      deps.handleVideoAnswer(eventDetail(event));
    });
    add(deps.windowTarget, 'pagehide', () => {
      deps.cleanupAudioRecorder();
    });
    add(deps.windowTarget, 'beforeunload', () => {
      deps.cleanupAudioRecorder();
    });
    add(deps.windowTarget, 'keydown', createForceAdvanceHandler(deps));

    add(deps.documentTarget, 'visibilitychange', () => {
      if (deps.documentTarget?.visibilityState === 'hidden') {
        deps.cleanupAudioRecorder();
      } else if (deps.documentTarget?.visibilityState === 'visible') {
        deps.log(2, '[CardScreen] visibilitychange visible; preserving card flow for mobile interruption recovery');
      }
      void deps.syncScreenWakeLock('visibilitychange');
    });
  }

  function stop(): void {
    while (registrations.length > 0) {
      const registration = registrations.pop();
      if (!registration) {
        continue;
      }
      registration.target.removeEventListener(registration.type, registration.listener);
    }
    if (started) {
      void deps.releaseScreenWakeLock('card destroy');
    }
    started = false;
  }

  return {
    start,
    stop,
  };
}
