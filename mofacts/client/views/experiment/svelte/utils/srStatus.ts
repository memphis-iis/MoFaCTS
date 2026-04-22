type DerivedSrStatus = 'idle' | 'ready' | 'recording' | 'processing';

type DeriveSrStatusInput = {
  isSrEnabled: boolean;
  isReady: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  isVoiceValidating: boolean;
};

export function deriveSrStatus({
  isSrEnabled,
  isReady,
  isRecording,
  isProcessing,
  isVoiceValidating,
}: DeriveSrStatusInput): DerivedSrStatus {
  if (!isSrEnabled) {
    return 'idle';
  }

  if (isProcessing || isVoiceValidating) {
    return 'processing';
  }

  if (isRecording) {
    return 'recording';
  }

  if (isReady) {
    return 'ready';
  }

  return 'idle';
}
