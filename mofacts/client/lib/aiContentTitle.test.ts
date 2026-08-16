import { expect } from 'chai';
import type { AiContentIntent } from '../../common/aiContentContract';
import { aiContentSystemTitle } from './aiContentTitle';

function intent(subject: string): AiContentIntent {
  return {
    promptType: 'image',
    responseType: 'text',
    subject,
    imageRequirement: 'A map.',
  };
}

describe('AI Content system title', function() {
  it('combines the existing structured subject with the authoritative item count', function() {
    expect(aiContentSystemTitle(intent('U.S. states.'), 50, 'learning'))
      .to.equal('Learn the 50 U.S. states');
  });

  it('uses the selected session mode and does not duplicate an existing count', function() {
    expect(aiContentSystemTitle(intent('50 U.S. states'), 50, 'test'))
      .to.equal('Test the 50 U.S. states');
  });

  it('keeps long subjects concise without ending on a partial word', function() {
    const title = aiContentSystemTitle(intent(`the ${'descriptive '.repeat(12)}concepts`), 12, 'learning');
    expect(title.length).to.be.at.most(100);
    expect(title).not.to.match(/\s$/);
    expect(title).not.to.match(/descript$/);
  });
});
