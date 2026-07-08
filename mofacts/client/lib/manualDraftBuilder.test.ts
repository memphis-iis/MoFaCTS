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
    expect(tutor.setspec.enableAudioPromptAndFeedback).to.equal('false');
    expect(tutor.setspec.audioInputEnabled).to.equal('false');
    expect(tutor.setspec).to.not.have.property('textToSpeechLanguage');
    expect(tutor.setspec).to.not.have.property('speechRecognitionLanguage');
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
    expect(tutor.setspec.textToSpeechLanguage).to.equal('es-ES');
    expect(tutor.setspec.audioInputEnabled).to.equal('true');
    expect(tutor.setspec.speechRecognitionLanguage).to.equal('es-ES');
    expect(tutor.setspec.speechIgnoreOutOfGrammarResponses).to.equal('false');
    expect(assessmentUnit.unitname).to.equal('Assessment');
    expect(assessmentUnit.buttontrial).to.equal('true');
    expect(assessmentUnit.buttonorder).to.equal('fixed');
    expect(assessmentUnit.assessmentsession).to.deep.equal({
      conditiontemplatesbygroup: {
        groupnames: 'A',
        clustersrepeated: '1',
        templatesrepeated: '1',
        group: '0,b,t,0',
      },
      initialpositions: 'A_1',
      randomizegroups: 'false',
      clusterlist: '0-0',
      assignrandomclusters: 'false',
      permutefinalresult: '0-0',
    });
    expect((firstStim?.display || {}).audioSrc).to.equal('prompt-audio.mp3');
    expect(response.correctResponse).to.equal('rojo');
    expect(response.incorrectResponses).to.deep.equal(['azul', 'verde', 'amarillo']);
  });

  it('builds assessment sessions with the Prequiz-style explicit template schedule', function() {
    const draft = buildManualDraftLesson(buildState({
      structure: 'instructions-assessment',
      instructionText: 'Answer each question once.',
      responseType: 'multiple-choice',
      rows: Array.from({ length: 10 }, (_unused, index) => ({
        id: `row-${index + 1}`,
        promptText: `Question ${index + 1}`,
        mediaRef: '',
        answer: `Answer ${index + 1}`,
        choice2: `Choice ${index + 1}b`,
        choice3: `Choice ${index + 1}c`,
        choice4: `Choice ${index + 1}d`,
      })),
    }));

    const tutor = draft.workingCopy.tutor as {
      unit: Array<Record<string, unknown>>;
    };
    const assessmentUnit = tutor.unit[0] as Record<string, unknown>;
    const assessmentSession = assessmentUnit.assessmentsession as Record<string, unknown>;

    expect(tutor.unit).to.have.length(1);
    expect(assessmentUnit.unitinstructions).to.contain('Answer each question once.');
    expect(assessmentUnit.buttontrial).to.equal('true');
    expect(assessmentSession.initialpositions).to.equal('A_1 A_2 A_3 A_4 A_5 A_6 A_7 A_8 A_9 A_10');
    expect(assessmentSession.clusterlist).to.equal('0-9');
    expect(assessmentSession.permutefinalresult).to.equal('0-0');
    expect(assessmentSession.conditiontemplatesbygroup).to.deep.equal({
      groupnames: 'A',
      clustersrepeated: '1',
      templatesrepeated: '10',
      group: '0,b,t,0 0,b,t,0 0,b,t,0 0,b,t,0 0,b,t,0 0,b,t,0 0,b,t,0 0,b,t,0 0,b,t,0 0,b,t,0',
    });
  });

  it('emits author-declared language metadata without translating lesson content', function() {
    const draft = buildManualDraftLesson(buildState({
      contentLanguage: 'es',
      recommendedUiLocales: 'es, en',
      translationStatus: 'author-provided',
      rows: [
        {
          id: 'row-1',
          promptText: 'Sistema esquelético',
          mediaRef: '',
          answer: 'hueso',
          choice2: '',
          choice3: '',
          choice4: '',
        },
      ],
    }));

    const tutor = draft.workingCopy.tutor as {
      setspec: Record<string, unknown>;
    };
    const firstCluster = draft.workingCopy.stimuli.setspec.clusters[0] as {
      stims?: Array<{ display?: Record<string, unknown> }>;
    };

    expect(tutor.setspec.contentLanguage).to.equal('es');
    expect(tutor.setspec.recommendedUiLocales).to.deep.equal(['es', 'en']);
    expect(tutor.setspec.translationStatus).to.equal('author-provided');
    expect(firstCluster.stims?.[0]?.display?.text).to.equal('Sistema esquelético');
  });

  it('emits author-controlled typed-answer matching settings', function() {
    const draft = buildManualDraftLesson(buildState({
      responseType: 'typed',
      caseSensitive: true,
      accentSensitive: true,
      rows: [
        {
          id: 'row-1',
          promptText: 'Spanish word for heart',
          mediaRef: '',
          answer: 'corazón',
          choice2: '',
          choice3: '',
          choice4: '',
        },
      ],
    }));

    const tutor = draft.workingCopy.tutor as {
      deliverySettings: Record<string, unknown>;
      unit: Array<{ deliverySettings?: Record<string, unknown> }>;
    };
    const practiceUnit = tutor.unit.find((unit) => unit.deliverySettings);

    expect(tutor.deliverySettings.caseSensitive).to.equal(true);
    expect(tutor.deliverySettings.accentSensitive).to.equal(true);
    expect(practiceUnit?.deliverySettings?.caseSensitive).to.equal(true);
    expect(practiceUnit?.deliverySettings?.accentSensitive).to.equal(true);
  });

  it('requires explicit speech language before emitting text-to-speech language metadata', function() {
    expect(() => buildManualDraftLesson(buildState({
      textToSpeechMode: 'prompts',
      speechLanguage: '',
    }))).to.throw('Manual draft text-to-speech requires an explicit speech language.');
  });

  it('allows speech recognition without TDF speech language metadata', function() {
    const draft = buildManualDraftLesson(buildState({
      speechRecognitionEnabled: true,
      speechLanguage: '',
    }));

    const tutor = draft.workingCopy.tutor as {
      setspec: Record<string, unknown>;
    };

    expect(tutor.setspec.audioInputEnabled).to.equal('true');
    expect(tutor.setspec).to.not.have.property('speechRecognitionLanguage');
  });
});
