import { ReactiveDict } from 'meteor/reactive-dict';

const audioRuntimeState = new ReactiveDict('audioRuntimeState');

const AudioRuntimeKeys = Object.freeze({
  RECORDING: 'recording',
  RECORDING_LOCKED: 'recordingLocked',
  WAITING_FOR_TRANSCRIPTION: 'waitingForTranscription',
  AUDIO_INPUT_MODE_ENABLED: 'audioInputModeEnabled',
  TTS_REQUESTED: 'ttsRequested',
  IGNORE_OUT_OF_GRAMMAR_RESPONSES: 'ignoreOutOfGrammarResponses',
  SAMPLE_RATE: 'sampleRate',
});

const AUDIO_RUNTIME_DEFAULTS = Object.freeze({
  [AudioRuntimeKeys.RECORDING]: false,
  [AudioRuntimeKeys.RECORDING_LOCKED]: false,
  [AudioRuntimeKeys.WAITING_FOR_TRANSCRIPTION]: false,
  [AudioRuntimeKeys.AUDIO_INPUT_MODE_ENABLED]: false,
  [AudioRuntimeKeys.TTS_REQUESTED]: false,
  [AudioRuntimeKeys.IGNORE_OUT_OF_GRAMMAR_RESPONSES]: false,
  [AudioRuntimeKeys.SAMPLE_RATE]: undefined,
});

function seedAudioRuntimeDefaults(): void {
  Object.entries(AUDIO_RUNTIME_DEFAULTS).forEach(([key, value]) => {
    audioRuntimeState.set(key, value);
  });
}

export function resetAudioRuntimeState(): void {
  seedAudioRuntimeDefaults();
}

export function isRecording(): boolean {
  return !!audioRuntimeState.get(AudioRuntimeKeys.RECORDING);
}

export function setRecording(value: unknown): void {
  audioRuntimeState.set(AudioRuntimeKeys.RECORDING, !!value);
}

export function isRecordingLocked(): boolean {
  return !!audioRuntimeState.get(AudioRuntimeKeys.RECORDING_LOCKED);
}

export function setRecordingLocked(value: unknown): void {
  audioRuntimeState.set(AudioRuntimeKeys.RECORDING_LOCKED, !!value);
}

export function isWaitingForTranscription(): boolean {
  return !!audioRuntimeState.get(AudioRuntimeKeys.WAITING_FOR_TRANSCRIPTION);
}

export function setWaitingForTranscription(value: unknown): void {
  audioRuntimeState.set(AudioRuntimeKeys.WAITING_FOR_TRANSCRIPTION, !!value);
}

export function isAudioInputModeEnabled(): boolean {
  return !!audioRuntimeState.get(AudioRuntimeKeys.AUDIO_INPUT_MODE_ENABLED);
}

export function setAudioInputModeEnabled(value: unknown): void {
  audioRuntimeState.set(AudioRuntimeKeys.AUDIO_INPUT_MODE_ENABLED, !!value);
}

export function isTtsRequested(): boolean {
  return !!audioRuntimeState.get(AudioRuntimeKeys.TTS_REQUESTED);
}

export function setTtsRequested(value: unknown): void {
  audioRuntimeState.set(AudioRuntimeKeys.TTS_REQUESTED, !!value);
}

export function getIgnoreOutOfGrammarResponses(): boolean | undefined {
  const value = audioRuntimeState.get(AudioRuntimeKeys.IGNORE_OUT_OF_GRAMMAR_RESPONSES);
  return value === undefined ? undefined : !!value;
}

export function setIgnoreOutOfGrammarResponses(value: unknown): void {
  audioRuntimeState.set(AudioRuntimeKeys.IGNORE_OUT_OF_GRAMMAR_RESPONSES, !!value);
}

export function getSampleRate(): number | undefined {
  return audioRuntimeState.get(AudioRuntimeKeys.SAMPLE_RATE) as number | undefined;
}

export function setSampleRate(value: number | undefined): void {
  audioRuntimeState.set(AudioRuntimeKeys.SAMPLE_RATE, value);
}

resetAudioRuntimeState();
