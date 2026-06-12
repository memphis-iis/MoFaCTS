import { evaluateSrAvailability } from '../../../../lib/audioAvailability';
import { deriveSrStatus } from '../utils/srStatus';

type CardInputSrSnapshotInput = {
  user: Parameters<typeof evaluateSrAvailability>[0]['user'];
  tdfFile: Parameters<typeof evaluateSrAvailability>[0]['tdfFile'];
  sessionSpeechApiKey: unknown;
  serverSpeechConfigured: unknown;
  buttonTrial: boolean;
  source: unknown;
  stateMatches: (value: unknown) => boolean;
};

export type CardInputSrSnapshot = {
  srAvailability: ReturnType<typeof evaluateSrAvailability>;
  isSrEnabled: boolean;
  isSrReady: boolean;
  isSrProcessing: boolean;
  inputMode: 'sr' | 'text' | 'buttons';
  isSrRecording: boolean;
  isVoiceValidating: boolean;
  srStatus: ReturnType<typeof deriveSrStatus>;
};

export function buildCardInputSrSnapshot(input: CardInputSrSnapshotInput): CardInputSrSnapshot {
  const srAvailability = evaluateSrAvailability({
    user: input.user ?? null,
    tdfFile: input.tdfFile ?? null,
    sessionSpeechApiKey: input.sessionSpeechApiKey,
    serverSpeechConfigured: input.serverSpeechConfigured,
    requireTextTrial: true,
    isTextTrial: !input.buttonTrial,
  });
  const isSrEnabled = srAvailability.status === 'available';
  const isSrReady = isSrEnabled && input.stateMatches({
    presenting: {
      awaiting: {
        speechRecognition: {
          active: 'ready',
        },
      },
    },
  });
  const isSrProcessing = isSrEnabled && input.stateMatches({
    presenting: {
      awaiting: {
        speechRecognition: {
          active: 'processing',
        },
      },
    },
  });
  const inputMode = input.buttonTrial ? 'buttons' : (isSrEnabled ? 'sr' : 'text');
  const isSrRecording = isSrEnabled && input.stateMatches({
    presenting: {
      awaiting: {
        speechRecognition: {
          active: 'recording',
        },
      },
    },
  });
  const isVoiceValidating = isSrEnabled &&
    input.stateMatches('presenting.validating') &&
    input.source === 'voice';
  const srStatus = deriveSrStatus({
    isSrEnabled,
    isReady: isSrReady,
    isRecording: isSrRecording,
    isProcessing: isSrProcessing,
    isVoiceValidating,
  });

  return {
    srAvailability,
    isSrEnabled,
    isSrReady,
    isSrProcessing,
    inputMode,
    isSrRecording,
    isVoiceValidating,
    srStatus,
  };
}
