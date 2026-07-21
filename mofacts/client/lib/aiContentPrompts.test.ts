import { expect } from 'chai';
import {
  AI_CONTENT_SYSTEM_PROMPT,
  buildPairGenerationPrompt,
  buildPairRepairPrompt,
  imageModalityIssues,
  notesExplicitlyRequestImages,
} from './aiContentPrompts';

describe('AI Content pair prompts', function() {
  it('asks only for the complete ordered stimulus-response pair set', function() {
    const prompt = buildPairGenerationPrompt('All carpal bones with image prompts');
    expect(AI_CONTENT_SYSTEM_PROMPT).to.contain('complete ordered set of individual stimulus-response pairs');
    expect(AI_CONTENT_SYSTEM_PROMPT).to.contain('Each pair contains only kind, stimulus, and response');
    expect(AI_CONTENT_SYSTEM_PROMPT).to.contain('Never replace a requested collection with one aggregate pair');
    expect(AI_CONTENT_SYSTEM_PROMPT).to.contain('Do not add landmarks');
    expect(AI_CONTENT_SYSTEM_PROMPT).to.contain('A plural class is not an individual member');
    expect(AI_CONTENT_SYSTEM_PROMPT).to.contain('never invent a member merely to fill a pattern');
    expect(AI_CONTENT_SYSTEM_PROMPT).to.contain('short conventional answer');
    expect(AI_CONTENT_SYSTEM_PROMPT).to.contain('stimulus must be exactly "image: <response>"');
    expect(prompt).to.contain('Create each distinct member of the complete standard set');
    expect(prompt).to.contain('not one overview item');
    expect(prompt).to.contain('stimulus is exactly "image: <response>"');
    expect(prompt).not.to.contain('blueprint');
  });

  it('identifies explicit image requests and preserves uploaded asset identity', function() {
    const prompt = buildPairGenerationPrompt('Name each bird.', [{ id: 'asset-1', originalName: 'warbler.jpg' }]);
    expect(notesExplicitlyRequestImages('bones with diagrams')).to.equal(true);
    expect(prompt).to.contain('asset-1: warbler.jpg');
    expect(prompt).to.contain('that pair must have kind "image"');
  });

  it('rejects text substitutions for an explicit image lesson', function() {
    expect(imageModalityIssues([{ kind: 'text', stimulus: 'What is this?', response: 'Scaphoid' }], 'hand bones with images', 0))
      .to.deep.equal(['Pair 1 changed an explicit image request into text.']);
    expect(imageModalityIssues([{ kind: 'text', stimulus: 'What is this?', response: 'Scaphoid' }], 'hand bones', 1))
      .to.deep.equal(['1 uploaded image was changed into text pairs.']);
  });

  it('gives one repair prompt the exact errors and requires image modality preservation', function() {
    const prompt = buildPairRepairPrompt('bones with images', [], [], ['At least one pair is required.']);
    expect(prompt).to.contain('At least one pair is required.');
    expect(prompt).to.contain('Preserve every requested image pair as kind "image"');
    expect(prompt).to.contain('restore its stimulus to exactly "image: <response>"');
    expect(prompt).to.contain('response object containing only pairs');
    expect(prompt).to.contain('Do not add any pair fields beyond kind, stimulus, and response');
  });
});
