import { expect } from 'chai';
import { normalizeLearnerResponseText } from './learnerResponseNormalization';

describe('learner response normalization', function() {
  it('normalizes composed and decomposed Latin accents by default', function() {
    expect(normalizeLearnerResponseText('corazón')).to.equal('corazon');
    expect(normalizeLearnerResponseText('corozo\u0301n')).to.equal('corozon');
  });

  it('can preserve accents when an author-controlled policy requires it', function() {
    expect(normalizeLearnerResponseText('corazón', { accentSensitive: true })).to.equal('corazón');
    expect(normalizeLearnerResponseText('corazo\u0301n', { accentSensitive: true })).to.equal('corazón');
  });

  it('preserves case only when requested', function() {
    expect(normalizeLearnerResponseText('Résumé')).to.equal('resume');
    expect(normalizeLearnerResponseText('Résumé', { caseSensitive: true })).to.equal('Resume');
  });

  it('keeps non-Latin scripts available for exact matching', function() {
    expect(normalizeLearnerResponseText('हृदय')).to.equal('हृदय');
    expect(normalizeLearnerResponseText('বাংলা')).to.equal('বাংলা');
    expect(normalizeLearnerResponseText('中文')).to.equal('中文');
  });
});

