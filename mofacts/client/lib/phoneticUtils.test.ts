import { expect } from 'chai';
import { buildPhoneticIndex, findPhoneticMatch } from './phoneticUtils';

describe('phoneticUtils', function() {
  it('matches long names through fuzzy phonetics even when using a precomputed index', function() {
    const grammar = ['emilyn.srisarajivakul', 'amelia.smith'];
    const phoneticIndex = buildPhoneticIndex(grammar);

    const result = findPhoneticMatch(
      'emilyandceriserajivacool',
      grammar,
      phoneticIndex
    );

    expect(result).to.equal('emilyn.srisarajivakul');
  });

  it('handles speech transcripts that insert joiner words into long names', function() {
    const grammar = ['emilyn.srisarajivakul'];
    const phoneticIndex = buildPhoneticIndex(grammar);

    const result = findPhoneticMatch(
      'emily and sorry sarajeva cool',
      grammar,
      phoneticIndex
    );

    expect(result).to.equal('emilyn.srisarajivakul');
  });

  it('does not accept a short partial first-name fragment as the full answer', function() {
    const grammar = ['emilyn.srisarajivakul'];
    const phoneticIndex = buildPhoneticIndex(grammar);

    const result = findPhoneticMatch(
      'emilyn',
      grammar,
      phoneticIndex
    );

    expect(result).to.equal(null);
  });

  it('prefers the higher normalized phonetic overlap for fuzzy matches', function() {
    const grammar = ['cero', 'estar'];
    const phoneticIndex = buildPhoneticIndex(grammar);

    const result = findPhoneticMatch(
      'star',
      grammar,
      phoneticIndex
    );

    expect(result).to.equal('estar');
  });

  it('matches short standalone words when Google drops a final th sound', function() {
    const grammar = ['growth'];
    const phoneticIndex = buildPhoneticIndex(grammar);

    const result = findPhoneticMatch(
      'grow',
      grammar,
      phoneticIndex
    );

    expect(result).to.equal('growth');
  });
});
