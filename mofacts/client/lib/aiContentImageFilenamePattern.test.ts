import { expect } from 'chai';
import {
  inferAiContentImageFilenamePattern,
  predictedAiContentImageFileTitle,
} from './aiContentImageFilenamePattern';

describe('AI Content image filename patterns', function() {
  it('infers one normalized response placeholder without changing later display responses', function() {
    const inference = inferAiContentImageFilenamePattern(
      { itemId: 'georgia', response: 'Georgia', fileTitle: 'File:Georgia_in_United States.svg', sourcePath: 'detail-page' },
      { itemId: 'alabama', response: 'Alabama', fileTitle: 'file:alabama in united states.SVG', sourcePath: 'detail-page' },
    );
    expect(inference.pattern).not.to.equal(null);
    expect(predictedAiContentImageFileTitle(inference.pattern!, 'New York'))
      .to.equal('File:New York_in_United States.svg');
  });

  it('matches Unicode-equivalent and underscore-separated seed responses', function() {
    const inference = inferAiContentImageFilenamePattern(
      { itemId: 'quebec', response: 'Qu\u00e9bec', fileTitle: 'File:Que\u0301bec locator.svg', sourcePath: 'list-page' },
      { itemId: 'new-york', response: 'New_York', fileTitle: 'FILE:New York locator.SVG', sourcePath: 'list-page' },
    );
    expect(inference.pattern).not.to.equal(null);
    expect(predictedAiContentImageFileTitle(inference.pattern!, 'Rhode Island'))
      .to.equal('File:Rhode Island locator.svg');
  });

  it('rejects absent, repeated, incompatible, extension-mismatched, and cross-branch seeds', function() {
    const base = { itemId: 'one', response: 'Georgia', fileTitle: 'File:Georgia in United States.svg', sourcePath: 'detail-page' as const };
    expect(inferAiContentImageFilenamePattern(base, {
      itemId: 'two', response: 'Alabama', fileTitle: 'File:Map of the Southeast.svg', sourcePath: 'detail-page',
    }).pattern).to.equal(null);
    expect(inferAiContentImageFilenamePattern(base, {
      itemId: 'two', response: 'Alabama', fileTitle: 'File:Alabama and Alabama.svg', sourcePath: 'detail-page',
    }).pattern).to.equal(null);
    expect(inferAiContentImageFilenamePattern(base, {
      itemId: 'two', response: 'Alabama', fileTitle: 'File:Map of Alabama.svg', sourcePath: 'detail-page',
    }).pattern).to.equal(null);
    expect(inferAiContentImageFilenamePattern(base, {
      itemId: 'two', response: 'Alabama', fileTitle: 'File:Alabama in United States.png', sourcePath: 'detail-page',
    }).pattern).to.equal(null);
    expect(inferAiContentImageFilenamePattern(base, {
      itemId: 'two', response: 'Alabama', fileTitle: 'File:Alabama in United States.svg', sourcePath: 'list-page',
    }).pattern).to.equal(null);
  });
});
