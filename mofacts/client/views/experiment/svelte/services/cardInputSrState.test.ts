import { expect } from 'chai';
import { buildCardInputSrSnapshot } from './cardInputSrState';

const speechReadyUser = {
  speechAPIKey: 'user-key',
  audioSettings: {
    audioInputMode: true,
  },
};

const speechReadyTdf = {
  tdfs: {
    tutor: {
      setspec: {
        audioInputEnabled: true,
      },
    },
  },
};

function createStateMatcher(matches: unknown[]) {
  return (value: unknown) => matches.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value));
}

describe('card input SR state', function() {
  it('uses button input mode and blocks SR for button trials', function() {
    const snapshot = buildCardInputSrSnapshot({
      user: speechReadyUser,
      tdfFile: speechReadyTdf,
      sessionSpeechApiKey: null,
      serverSpeechConfigured: false,
      buttonTrial: true,
      source: 'keyboard',
      stateMatches: () => false,
    });

    expect(snapshot.inputMode).to.equal('buttons');
    expect(snapshot.isSrEnabled).to.equal(false);
    expect(snapshot.srAvailability.detail).to.equal('not_text_trial');
    expect(snapshot.srStatus).to.equal('idle');
  });

  it('uses SR input mode and ready status when text-trial speech is available', function() {
    const readyPath = {
      presenting: {
        awaiting: {
          speechRecognition: {
            active: 'ready',
          },
        },
      },
    };
    const snapshot = buildCardInputSrSnapshot({
      user: speechReadyUser,
      tdfFile: speechReadyTdf,
      sessionSpeechApiKey: null,
      serverSpeechConfigured: false,
      buttonTrial: false,
      source: 'keyboard',
      stateMatches: createStateMatcher([readyPath]),
    });

    expect(snapshot.inputMode).to.equal('sr');
    expect(snapshot.isSrEnabled).to.equal(true);
    expect(snapshot.isSrReady).to.equal(true);
    expect(snapshot.srStatus).to.equal('ready');
  });

  it('reports recording and processing states from the machine path', function() {
    const recordingPath = {
      presenting: {
        awaiting: {
          speechRecognition: {
            active: 'recording',
          },
        },
      },
    };
    const recording = buildCardInputSrSnapshot({
      user: speechReadyUser,
      tdfFile: speechReadyTdf,
      sessionSpeechApiKey: null,
      serverSpeechConfigured: false,
      buttonTrial: false,
      source: 'keyboard',
      stateMatches: createStateMatcher([recordingPath]),
    });

    const processing = buildCardInputSrSnapshot({
      user: speechReadyUser,
      tdfFile: speechReadyTdf,
      sessionSpeechApiKey: null,
      serverSpeechConfigured: false,
      buttonTrial: false,
      source: 'voice',
      stateMatches: createStateMatcher(['presenting.validating']),
    });

    expect(recording.isSrRecording).to.equal(true);
    expect(recording.srStatus).to.equal('recording');
    expect(processing.isVoiceValidating).to.equal(true);
    expect(processing.srStatus).to.equal('processing');
  });

  it('falls back to text mode when speech is unavailable for a text trial', function() {
    const snapshot = buildCardInputSrSnapshot({
      user: {
        audioSettings: {
          audioInputMode: false,
        },
      },
      tdfFile: speechReadyTdf,
      sessionSpeechApiKey: null,
      serverSpeechConfigured: false,
      buttonTrial: false,
      source: 'keyboard',
      stateMatches: () => false,
    });

    expect(snapshot.inputMode).to.equal('text');
    expect(snapshot.isSrEnabled).to.equal(false);
    expect(snapshot.srAvailability.detail).to.equal('user_pref_disabled');
  });
});
