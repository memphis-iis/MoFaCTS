import { clientConsole } from '../../../../lib/clientLogger';
import { isTtsRequested } from '../services/audioRuntimeState';
import { shouldPlayAudioPrompt, stopTtsPlayback, ttsPlaybackService } from '../services/ttsService';
import {
  commitPreparedTrialRuntime as commitPreparedTrialRuntimeService,
  startEarlyLockForCurrentTrial as startEarlyLockForCurrentTrialService,
} from '../services/unitEngineService';
import type { ActionArgs } from './contentRuntimeMachineActionTypes';

export function startEarlyLockForCurrentTrial({ context }: ActionArgs) {
  startEarlyLockForCurrentTrialService(context as unknown as Parameters<typeof startEarlyLockForCurrentTrialService>[0]);
}

export function commitPreparedTrialRuntime({ context }: ActionArgs) {
  commitPreparedTrialRuntimeService({
    engine: context.engine as Parameters<typeof commitPreparedTrialRuntimeService>[0]['engine'],
    preparedTrial: context.preparedTrial || null,
  });
}

export function notifyVideoAnswer({ context }: ActionArgs) {
  clientConsole(2, '[VIDEO-REWIND-DEBUG] notifyVideoAnswer called:', {
    isActive: context.videoSession?.isActive,
    isCorrect: context.isCorrect,
    currentCheckpointIndex: context.videoSession?.currentCheckpointIndex,
  });
  if (!context.videoSession?.isActive) {
    clientConsole(1, '[VIDEO-REWIND-DEBUG] notifyVideoAnswer skipped because videoSession is not active');
    return;
  }
  if (!Number.isFinite(context.videoSession.currentCheckpointIndex)) {
    throw new Error('[ContentRuntimeMachine] Video answer completion missing active checkpoint index');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:videoAnswer', {
      detail: {
        isCorrect: context.isCorrect,
        checkpointIndex: context.videoSession.currentCheckpointIndex,
      },
    }));
    clientConsole(2, '[VIDEO-REWIND-DEBUG] contentRuntimeMachine:videoAnswer event dispatched');
  }
}

export function maybeSpeakQuestion({ context }: ActionArgs) {
  const display = context.currentDisplay || {};
  const questionText = display.clozeText || display.text || '';

  if (!questionText || display.audioSrc) {
    return;
  }

  if (!shouldPlayAudioPrompt('question')) {
    return;
  }

  if (isTtsRequested()) {
    return;
  }

  void ttsPlaybackService(context, {
    text: questionText,
    isQuestion: true,
    autoRestartSr: true,
  });
}

export function playTTS({ context, event: _event }: ActionArgs) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:playTTS', {
      detail: { text: context.currentDisplay.text },
    }));
  }
}

export function stopTTS({ context: _context, event: _event }: ActionArgs) {
  stopTtsPlayback('machine-stop');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:stopTTS'));
  }
}

export function resumeVideoPlayback() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:resumeVideo'));
  }
}
