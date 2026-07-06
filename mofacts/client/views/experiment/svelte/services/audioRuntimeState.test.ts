import { expect } from 'chai';
import {
  getIgnoreOutOfGrammarResponses,
  getSampleRate,
  isAudioInputModeEnabled,
  isRecording,
  isRecordingLocked,
  isTtsRequested,
  isWaitingForTranscription,
  resetAudioRuntimeState,
  setAudioInputModeEnabled,
  setIgnoreOutOfGrammarResponses,
  setRecording,
  setRecordingLocked,
  setSampleRate,
  setTtsRequested,
  setWaitingForTranscription,
} from './audioRuntimeState';

describe('audioRuntimeState', function() {
  beforeEach(function() {
    resetAudioRuntimeState();
  });

  afterEach(function() {
    resetAudioRuntimeState();
  });

  it('starts with runtime audio defaults after reset', function() {
    expect(isRecording()).to.equal(false);
    expect(isRecordingLocked()).to.equal(false);
    expect(isWaitingForTranscription()).to.equal(false);
    expect(isAudioInputModeEnabled()).to.equal(false);
    expect(isTtsRequested()).to.equal(false);
    expect(getIgnoreOutOfGrammarResponses()).to.equal(false);
    expect(getSampleRate()).to.equal(undefined);
  });

  it('stores active SR and TTS coordination flags', function() {
    setRecording(true);
    setRecordingLocked(true);
    setWaitingForTranscription(true);
    setAudioInputModeEnabled(true);
    setTtsRequested(true);

    expect(isRecording()).to.equal(true);
    expect(isRecordingLocked()).to.equal(true);
    expect(isWaitingForTranscription()).to.equal(true);
    expect(isAudioInputModeEnabled()).to.equal(true);
    expect(isTtsRequested()).to.equal(true);
  });

  it('stores speech recognition grammar cache and sample rate', function() {
    setIgnoreOutOfGrammarResponses(true);
    setSampleRate(16000);

    expect(getIgnoreOutOfGrammarResponses()).to.equal(true);
    expect(getSampleRate()).to.equal(16000);

    setIgnoreOutOfGrammarResponses(false);
    expect(getIgnoreOutOfGrammarResponses()).to.equal(false);
  });

  it('clears runtime audio state on reset', function() {
    setRecording(true);
    setRecordingLocked(true);
    setWaitingForTranscription(true);
    setAudioInputModeEnabled(true);
    setTtsRequested(true);
    setIgnoreOutOfGrammarResponses(true);
    setSampleRate(44100);

    resetAudioRuntimeState();

    expect(isRecording()).to.equal(false);
    expect(isRecordingLocked()).to.equal(false);
    expect(isWaitingForTranscription()).to.equal(false);
    expect(isAudioInputModeEnabled()).to.equal(false);
    expect(isTtsRequested()).to.equal(false);
    expect(getIgnoreOutOfGrammarResponses()).to.equal(false);
    expect(getSampleRate()).to.equal(undefined);
  });
});
