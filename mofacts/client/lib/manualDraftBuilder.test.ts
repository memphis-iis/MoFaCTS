import { expect } from 'chai';
import {
  buildManualDraftLesson,
  createDefaultManualCreatorState,
  type ManualCreatorState,
} from './manualDraftBuilder';

function buildState(overrides: Partial<ManualCreatorState> = {}): ManualCreatorState {
  return {
    ...createDefaultManualCreatorState(),
    lessonName: 'Manual Lesson',
    rows: [
      {
        id: 'row-1',
        promptText: 'Capital of France',
        mediaRef: '',
        answer: 'Paris',
        choice2: '',
        choice3: '',
        choice4: '',
      },
    ],
    ...overrides,
  };
}

describe('manualDraftBuilder', function() {
  it('builds a typed learning lesson with authored instructions and visibility settings', function() {
    const draft = buildManualDraftLesson(buildState({
      structure: 'instructions-learning',
      instructionText: 'Read this first.\n\nThen answer carefully.',
      visibility: 'public',
      experimentLinkEnabled: true,
      experimentTarget: 'manual-test',
      tags: 'geography, capitals',
      shuffle: true,
    }));

    const tutor = draft.workingCopy.tutor as {
      setspec: Record<string, unknown>;
      unit: Array<Record<string, unknown>>;
    };
    const firstCluster = draft.workingCopy.stimuli.setspec.clusters[0] as {
      stims?: Array<{ display?: Record<string, unknown> }>;
    };

    expect(draft.sourceKind).to.equal('manual');
    expect(tutor.setspec.userselect).to.equal('true');
    expect(tutor.setspec.experimentTarget).to.equal('manual-test');
    expect(tutor.setspec.shuffleclusters).to.equal('0-0');
    expect(tutor.setspec.tags).to.deep.equal(['geography', 'capitals']);
    expect(tutor.unit).to.have.length(2);
    expect(tutor.unit[0]?.unitname).to.equal('Instructions');
    expect(tutor.unit[0]?.unitinstructions).to.contain('Read this first.');
    expect(tutor.unit[0]?.unitinstructions).to.contain('Then answer carefully.');
    expect(tutor.unit[1]?.unitname).to.equal('Practice');
    expect(tutor.unit[1]?.learningsession).to.be.an('object');
    expect(firstCluster.stims?.[0]?.display?.text).to.equal('Capital of France');
  });

  it('builds a multiple-choice assessment lesson with audio prompt settings', function() {
    const draft = buildManualDraftLesson(buildState({
      structure: 'assessment-only',
      promptType: 'audio',
      responseType: 'multiple-choice',
      buttonOrder: 'fixed',
      textToSpeechMode: 'feedback',
      speechRecognitionEnabled: true,
      speechLanguage: 'es-ES',
      ignoreOutOfGrammar: false,
      rows: [
        {
          id: 'row-1',
          promptText: '',
          mediaRef: 'prompt-audio.mp3',
          answer: 'rojo',
          choice2: 'azul',
          choice3: 'verde',
          choice4: 'amarillo',
        },
      ],
    }));

    const tutor = draft.workingCopy.tutor as {
      setspec: Record<string, unknown>;
      unit: Array<Record<string, unknown>>;
    };
    const assessmentUnit = tutor.unit[0] as Record<string, unknown>;
    const firstCluster = draft.workingCopy.stimuli.setspec.clusters[0] as {
      stims?: Array<{
        display?: Record<string, unknown>;
        response?: Record<string, unknown>;
      }>;
    };
    const firstStim = firstCluster.stims?.[0];
    const response = (firstStim?.response || {}) as Record<string, unknown>;

    expect(tutor.setspec.enableAudioPromptAndFeedback).to.equal('true');
    expect(tutor.setspec.audioPromptMode).to.equal('feedback');
    expect(tutor.setspec.audioInputEnabled).to.equal('true');
    expect(tutor.setspec.speechRecognitionLanguage).to.equal('es-ES');
    expect(tutor.setspec.speechIgnoreOutOfGrammarResponses).to.equal('false');
    expect(assessmentUnit.unitname).to.equal('Assessment');
    expect((assessmentUnit.assessmentsession as Record<string, unknown>).clusterlist).to.equal('0-0');
    expect(assessmentUnit.buttonorder).to.equal('fixed');
    expect((firstStim?.display || {}).audioSrc).to.equal('prompt-audio.mp3');
    expect(response.correctResponse).to.equal('rojo');
    expect(response.incorrectResponses).to.deep.equal(['azul', 'verde', 'amarillo']);
  });
});
