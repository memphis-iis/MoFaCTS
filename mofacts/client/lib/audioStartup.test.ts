import { expect } from 'chai';
import { Session } from 'meteor/session';
import { audioManager } from './audioContextManager';
import { getAudioLaunchPreparationPlan, getSpeechRecognitionMediaConstraints } from './audioStartup';
import { resetAudioState } from './state/audioState';

describe('audioStartup', function() {
  beforeEach(function() {
    resetAudioState();
    Session.set('speechAPIKey', null);
    audioManager.setPreInitializedStream(null);
  });

  afterEach(function() {
    resetAudioState();
    Session.set('speechAPIKey', null);
    audioManager.setPreInitializedStream(null);
  });

  it('uses the same microphone constraints for warm-path preinit and live SR', function() {
    expect(getSpeechRecognitionMediaConstraints()).to.deep.equal({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  });

  it('skips launch preparation when no audio features are enabled', function() {
    const plan = getAudioLaunchPreparationPlan(
      {
        tdfs: {
          tutor: {
            setspec: {
              enableAudioPromptAndFeedback: 'false',
              audioInputEnabled: 'false',
            },
          },
        },
      },
      {
        audioSettings: {
          audioPromptMode: 'silent',
          audioInputMode: false,
        },
      },
    );

    expect(plan.requiresPreparation).to.equal(false);
    expect(plan.ttsWarmup).to.equal(false);
    expect(plan.srWarmup).to.equal(false);
    expect(plan.recorderPreInitialization).to.equal(false);
  });

  it('prepares launch-time TTS only when both user and TDF enable prompt audio with a TTS key', function() {
    const plan = getAudioLaunchPreparationPlan(
      {
        tdfs: {
          tutor: {
            setspec: {
              textToSpeechAPIKey: 'tts-key',
              enableAudioPromptAndFeedback: 'true',
            },
          },
        },
      },
      {
        audioSettings: {
          audioPromptMode: 'question',
          audioInputMode: false,
        },
      },
    );

    expect(plan.requiresPreparation).to.equal(true);
    expect(plan.ttsWarmup).to.equal(true);
    expect(plan.srWarmup).to.equal(false);
    expect(plan.recorderPreInitialization).to.equal(false);
  });

  it('skips TTS warmup when the learner has prompt audio turned off even if the TDF is enabled', function() {
    const plan = getAudioLaunchPreparationPlan(
      {
        tdfs: {
          tutor: {
            setspec: {
              textToSpeechAPIKey: 'tts-key',
              enableAudioPromptAndFeedback: 'true',
            },
          },
        },
      },
      {
        audioSettings: {
          audioPromptMode: 'silent',
          audioInputMode: false,
        },
      },
    );

    expect(plan.requiresPreparation).to.equal(false);
    expect(plan.ttsWarmup).to.equal(false);
  });

  it('skips TTS warmup when the TDF does not enable prompt audio', function() {
    const plan = getAudioLaunchPreparationPlan(
      {
        tdfs: {
          tutor: {
            setspec: {
              textToSpeechAPIKey: 'tts-key',
              enableAudioPromptAndFeedback: 'false',
            },
          },
        },
      },
      {
        audioSettings: {
          audioPromptMode: 'all',
          audioInputMode: false,
        },
      },
    );

    expect(plan.requiresPreparation).to.equal(false);
    expect(plan.ttsWarmup).to.equal(false);
  });

  it('allows TTS warmup when the lesson is enabled and the key comes from the user account', function() {
    const plan = getAudioLaunchPreparationPlan(
      {
        tdfs: {
          tutor: {
            setspec: {
              enableAudioPromptAndFeedback: 'true',
            },
          },
        },
      },
      {
        ttsAPIKey: 'user-tts-key',
        audioSettings: {
          audioPromptMode: 'feedback',
          audioInputMode: false,
        },
      },
    );

    expect(plan.requiresPreparation).to.equal(true);
    expect(plan.ttsWarmup).to.equal(true);
    expect(plan.srWarmup).to.equal(false);
    expect(plan.recorderPreInitialization).to.equal(false);
  });

  it('prepares SR warmup and recorder pre-initialization when speech input is enabled with a TDF key', function() {
    const plan = getAudioLaunchPreparationPlan(
      {
        tdfs: {
          tutor: {
            setspec: {
              audioInputEnabled: 'true',
              speechAPIKey: 'speech-key',
            },
          },
        },
      },
      {
        audioSettings: {
          audioPromptMode: 'silent',
          audioInputMode: true,
        },
      },
    );

    expect(plan.requiresPreparation).to.equal(true);
    expect(plan.ttsWarmup).to.equal(false);
    expect(plan.srWarmup).to.equal(true);
    expect(plan.recorderPreInitialization).to.equal(true);
  });

  it('does not treat prerecorded audio assets as launch-time preparation work', function() {
    const plan = getAudioLaunchPreparationPlan(
      {
        tdfs: {
          tutor: {
            setspec: {
              enableAudioPromptAndFeedback: 'false',
              audioInputEnabled: 'false',
            },
          },
        },
        stim: [
          {
            audioStimulus: 'prompt.mp3',
          },
        ],
      } as any,
      {
        audioSettings: {
          audioPromptMode: 'silent',
          audioInputMode: false,
        },
      },
    );

    expect(plan.requiresPreparation).to.equal(false);
    expect(plan.ttsWarmup).to.equal(false);
    expect(plan.srWarmup).to.equal(false);
    expect(plan.recorderPreInitialization).to.equal(false);
  });
});
