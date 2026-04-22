import { expect } from 'chai';
import {
  getSeedColumnLabels,
  parseSeedTableText,
  structureIncludesInstructions,
} from './manualContentCreatorUtils';
import { createDefaultManualCreatorState, type ManualCreatorState } from './manualDraftBuilder';

function buildState(overrides: Partial<ManualCreatorState> = {}): ManualCreatorState {
  return {
    ...createDefaultManualCreatorState(),
    ...overrides,
  };
}

describe('manualContentCreatorUtils', function() {
  it('detects instruction-bearing structures', function() {
    expect(structureIncludesInstructions('instructions-learning')).to.equal(true);
    expect(structureIncludesInstructions('instructions-assessment')).to.equal(true);
    expect(structureIncludesInstructions('learning-only')).to.equal(false);
    expect(structureIncludesInstructions('assessment-only')).to.equal(false);
  });

  it('returns seed column labels for text plus image multiple-choice rows', function() {
    const labels = getSeedColumnLabels(buildState({
      promptType: 'text-image',
      responseType: 'multiple-choice',
    }));

    expect(labels).to.deep.equal([
      'Prompt text',
      'Image file',
      'Answer',
      'Choice 2',
      'Choice 3',
      'Choice 4',
    ]);
  });

  it('parses pasted rows with a header line and tab delimiters', function() {
    const rows = parseSeedTableText(buildState({
      seedTableText: [
        'Prompt\tAnswer',
        '2 + 2\t4',
        '3 + 5\t8',
      ].join('\n'),
      promptType: 'text',
      responseType: 'typed',
    }), (() => {
      let index = 0;
      return () => `row-${++index}`;
    })());

    expect(rows).to.have.length(2);
    expect(rows[0]).to.include({ id: 'row-1', promptText: '2 + 2', answer: '4' });
    expect(rows[1]).to.include({ id: 'row-2', promptText: '3 + 5', answer: '8' });
  });

  it('parses multiple-choice rows without a header using pipe delimiters', function() {
    const rows = parseSeedTableText(buildState({
      seedTableText: 'Capital of France | Paris | London | Rome | Berlin',
      promptType: 'text',
      responseType: 'multiple-choice',
    }), () => 'row-1');

    expect(rows).to.have.length(1);
    expect(rows[0]).to.include({
      id: 'row-1',
      promptText: 'Capital of France',
      answer: 'Paris',
      choice2: 'London',
      choice3: 'Rome',
      choice4: 'Berlin',
    });
  });

  it('parses audio prompt rows by mapping the first column to mediaRef', function() {
    const rows = parseSeedTableText(buildState({
      seedTableText: [
        'Audio file,Answer,Choice 2,Choice 3,Choice 4',
        'prompt-1.mp3,rojo,azul,verde,amarillo',
      ].join('\n'),
      promptType: 'audio',
      responseType: 'multiple-choice',
    }), () => 'row-audio');

    expect(rows).to.have.length(1);
    expect(rows[0]).to.include({
      id: 'row-audio',
      mediaRef: 'prompt-1.mp3',
      answer: 'rojo',
      choice2: 'azul',
      choice3: 'verde',
      choice4: 'amarillo',
    });
  });
});
