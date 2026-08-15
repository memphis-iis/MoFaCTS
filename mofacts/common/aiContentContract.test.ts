import { expect } from 'chai';
import {
  AI_CONTENT_CONTRACT_VERSION,
  getAiContentSaveBlockingIssues,
  imageStimulusForResponse,
  requireAiContentWorkingRecordVersion,
  validateAiContentSaveContract,
} from './aiContentContract';

describe('AI Content list-source contract', function() {
  it('uses v4 and rejects obsolete browser records explicitly', function() {
    expect(AI_CONTENT_CONTRACT_VERSION).to.equal(4);
    expect(() => requireAiContentWorkingRecordVersion({ contractVersion: 3 })).to.throw('obsolete contract');
    expect(() => requireAiContentWorkingRecordVersion({ contractVersion: 4, phase: 'input' })).to.throw('invalid mode');
  });

  it('keeps image stimuli deterministic and response-owned', function() {
    expect(imageStimulusForResponse('Alabama')).to.equal('image: Alabama');
  });

  it('accepts backward-compatible filename-pattern provenance in v4 browser work', function() {
    const record = requireAiContentWorkingRecordVersion({
      contractVersion: 4,
      phase: 'review',
      notes: 'State maps',
      mode: 'learning',
      title: 'States',
      model: 'openai/test',
      reasoningLevel: 'medium',
      promptType: 'image',
      responseType: 'text',
      pairs: [{
        id: 'arizona',
        kind: 'image',
        stimulus: 'image: Arizona',
        response: 'Arizona',
        provenance: {
          listPageId: 100,
          listPageTitle: 'List of states',
          listPageUrl: 'https://en.wikipedia.org/?curid=100',
          regionId: 'region-1',
          sourceLocator: 'row 3',
          sourcePath: 'filename-pattern',
          selectedFileTitle: 'File:Arizona in United States.svg',
          filenamePatternId: 'pattern-1',
        },
        image: { status: 'resolved', source: 'wikimedia' },
      }],
      warnings: [],
      updatedAt: '2026-08-15T00:00:00.000Z',
    });
    expect(record.contractVersion).to.equal(4);
    expect(record.pairs[0]?.provenance.sourcePath).to.equal('filename-pattern');
  });

  it('requires a pattern ID for filename-pattern provenance', function() {
    expect(() => requireAiContentWorkingRecordVersion({
      contractVersion: 4,
      phase: 'review',
      notes: 'State maps',
      mode: 'learning',
      title: 'States',
      model: 'openai/test',
      reasoningLevel: 'medium',
      promptType: 'image',
      responseType: 'text',
      pairs: [{
        id: 'arizona',
        kind: 'image',
        stimulus: 'image: Arizona',
        response: 'Arizona',
        provenance: {
          listPageId: 100,
          listPageTitle: 'List of states',
          listPageUrl: 'https://en.wikipedia.org/?curid=100',
          regionId: 'region-1',
          sourceLocator: 'row 3',
          sourcePath: 'filename-pattern',
          selectedFileTitle: 'File:Arizona in United States.svg',
        },
        image: { status: 'resolved', source: 'wikimedia' },
      }],
      warnings: [],
      updatedAt: '2026-08-15T00:00:00.000Z',
    })).to.throw('missing its filename-pattern ID');
  });

  it('rejects extra save fields and invalid image source ownership', function() {
    expect(() => validateAiContentSaveContract({
      contractVersion: 4,
      mode: 'learning',
      title: 'States',
      pairs: [],
      pipelineRun: {},
    })).to.throw('unsupported fields: pipelineRun');
    expect(() => validateAiContentSaveContract({
      contractVersion: 4,
      mode: 'learning',
      title: 'States',
      pairs: [{
        id: 'alabama',
        kind: 'image',
        stimulus: 'image: Alabama',
        response: 'Alabama',
        image: { source: 'uploaded', fileName: 'alabama.webp' },
      }],
    })).to.throw('image source is invalid');
  });

  it('blocks mixed prompt types and incomplete Wikimedia provenance', function() {
    const contract = validateAiContentSaveContract({
      contractVersion: 4,
      mode: 'learning',
      title: 'Mixed',
      pairs: [
        { id: 'a', kind: 'text', stimulus: 'A definition', response: 'A' },
        {
          id: 'b',
          kind: 'image',
          stimulus: 'image: B',
          response: 'B',
          image: { source: 'wikimedia', fileName: 'b.webp' },
        },
      ],
    });
    expect(getAiContentSaveBlockingIssues(contract)).to.include('A generation run must use one universal prompt type.');
    expect(getAiContentSaveBlockingIssues(contract)).to.include('Pair 2 Wikimedia image is missing source or license attribution.');
  });
});
