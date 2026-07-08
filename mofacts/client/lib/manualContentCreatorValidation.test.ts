import { expect } from 'chai';
import {
  parsePositiveInteger,
  resolveSeedRowsForValidation,
  validateManualCreatorStep,
  validateStarterRow,
} from './manualContentCreatorValidation';
import { createDefaultManualCreatorState, type ManualCreatorState } from './manualDraftBuilder';

function buildState(overrides: Partial<ManualCreatorState> = {}): ManualCreatorState {
  return {
    ...createDefaultManualCreatorState(),
    lessonName: 'Manual Lesson',
    instructionText: 'Start here.',
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

describe('manualContentCreatorValidation', function() {
  it('parses positive integers and rejects invalid values', function() {
    expect(parsePositiveInteger(3)).to.equal(3);
    expect(parsePositiveInteger('7')).to.equal(7);
    expect(parsePositiveInteger('0')).to.equal(null);
    expect(parsePositiveInteger('-2')).to.equal(null);
    expect(parsePositiveInteger('abc')).to.equal(null);
  });

  it('validates lesson basics for missing name, instructions, and invalid link slug', function() {
    const errors = validateManualCreatorStep(1, buildState({
      lessonName: '',
      structure: 'instructions-learning',
      instructionText: '',
      experimentLinkEnabled: true,
      experimentTarget: 'bad slug',
    }), () => 'row-1');

    expect(errors).to.include('Lesson name required.');
    expect(errors).to.include('Instruction text required when the selected structure includes instructions.');
    expect(errors).to.include('Link name must use letters, numbers, underscores, or hyphens.');
  });

  it('validates authored language metadata as BCP 47 tags', function() {
    const errors = validateManualCreatorStep(1, buildState({
      contentLanguage: 'bad locale',
      recommendedUiLocales: 'es, also bad',
    }), () => 'row-1');

    expect(errors).to.include('Content language must be a BCP 47 language tag such as en, es, zh-Hans, or hi.');
    expect(errors).to.include('Recommended UI locales must be comma-separated BCP 47 language tags. Invalid: also bad.');
  });

  it('validates practice timing as numeric and ordered', function() {
    const errors = validateManualCreatorStep(3, buildState({
      practiceTimingEnabled: true,
      minPracticeTime: '10',
      maxPracticeTime: '5',
    }), () => 'row-1');

    expect(errors).to.deep.equal([
      'Maximum practice time must be greater than or equal to minimum practice time.'
    ]);
  });

  it('requires explicit speech language for text-to-speech but not speech recognition', function() {
    expect(validateManualCreatorStep(3, buildState({
      textToSpeechMode: 'prompts',
      speechLanguage: '',
    }), () => 'row-1')).to.deep.equal([
      'Speech language required when text-to-speech is enabled.',
    ]);

    expect(validateManualCreatorStep(3, buildState({
      speechRecognitionEnabled: true,
      speechLanguage: '',
    }), () => 'row-1')).to.deep.equal([]);
  });

  it('validates multiple-choice media starter rows', function() {
    const errors = validateStarterRow(buildState({
      promptType: 'audio',
      responseType: 'multiple-choice',
    }), {
      id: 'row-1',
      promptText: '',
      mediaRef: '',
      answer: '',
      choice2: '',
      choice3: '',
      choice4: '',
    }, 0);

    expect(errors).to.deep.equal([
      'Row 1: audio file required.',
      'Row 1: answer required.',
      'Row 1: three distractors required.',
    ]);
  });

  it('resolves pasted starter rows before validating step 4', function() {
    const state = buildState({
      rows: [],
      seedMode: 'paste-table',
      seedTableText: [
        'Prompt\tAnswer',
        '2 + 2\t4',
        '3 + 5\t8',
      ].join('\n'),
      promptType: 'text',
      responseType: 'typed',
    });

    const rows = resolveSeedRowsForValidation(state, (() => {
      let index = 0;
      return () => `row-${++index}`;
    })());
    const errors = validateManualCreatorStep(4, state, () => 'row-x');

    expect(rows).to.have.length(2);
    expect(rows[0]).to.include({ id: 'row-1', promptText: '2 + 2', answer: '4' });
    expect(errors).to.deep.equal([]);
  });
});
