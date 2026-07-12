import { expect } from 'chai';
import { resolveSparcControllerDisplay } from './sparcController';

describe('SPARC controller display ownership', function() {
  it('does not claim an ordinary flashcard display', function() {
    expect(resolveSparcControllerDisplay({
      text: 'What is the capital of Thailand?',
      response: 'Bangkok',
    }, '[test]')).to.equal(null);
  });

  it('does not claim a placeholder display merely because it contains a nodes array', function() {
    expect(resolveSparcControllerDisplay({
      pageKey: 'placeholder-page',
      nodes: [],
    }, '[test]')).to.equal(null);
  });

  it('normalizes a display owned by the SPARC adapter', function() {
    const display = resolveSparcControllerDisplay({
      schema: 'tutorscript-sparc/2.0',
      pageId: 'page-1',
      nodes: [],
    }, '[test]');

    expect(display).to.include({
      pageId: 'page-1',
    });
    expect(display?.nodes).to.deep.equal([]);
  });
});
