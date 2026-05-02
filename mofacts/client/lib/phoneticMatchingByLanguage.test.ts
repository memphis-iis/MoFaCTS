import { expect } from 'chai';
import {
  buildPhoneticIndexForLanguage,
  findPhoneticConflictsWithCorrectAnswerForLanguage,
  findPhoneticMatchForLanguage,
  getPhoneticMatchingStrategy
} from './phoneticMatchingByLanguage';

describe('phoneticMatchingByLanguage', function() {
  it('routes Spanish speech recognition languages to the Spanish phonetic strategy', function() {
    expect(getPhoneticMatchingStrategy('es-US')).to.equal('spanish');
    expect(getPhoneticMatchingStrategy('es-ES')).to.equal('spanish');
    expect(getPhoneticMatchingStrategy('en-US')).to.equal('english-default');
  });

  it('keeps the English router path compatible with the existing phonetic matcher', function() {
    const grammar = ['cero', 'estar'];
    const phoneticIndex = buildPhoneticIndexForLanguage(grammar, 'en-US');

    const result = findPhoneticMatchForLanguage(
      'star',
      grammar,
      phoneticIndex,
      'en-US'
    );

    expect(result).to.equal('estar');
  });

  it('matches omitted initial vowels in Spanish words', function() {
    const grammar = ['cero', 'estar'];
    const phoneticIndex = buildPhoneticIndexForLanguage(grammar, 'es-US');

    const result = findPhoneticMatchForLanguage(
      'star',
      grammar,
      phoneticIndex,
      'es-US'
    );

    expect(result).to.equal('estar');
  });

  it('recovers common b/v Spanish transcription variants', function() {
    const grammar = ['otro', 'volver'];
    const phoneticIndex = buildPhoneticIndexForLanguage(grammar, 'es-US');

    const result = findPhoneticMatchForLanguage(
      'bolver',
      grammar,
      phoneticIndex,
      'es-US'
    );

    expect(result).to.equal('volver');
  });

  it('matches common Spanish spelling-sound confusions', function() {
    const grammar = ['hacer', 'llamar', 'guitarra'];
    const phoneticIndex = buildPhoneticIndexForLanguage(grammar, 'es-US');

    expect(findPhoneticMatchForLanguage('aser', grammar, phoneticIndex, 'es-US')).to.equal('hacer');
    expect(findPhoneticMatchForLanguage('yamar', grammar, phoneticIndex, 'es-US')).to.equal('llamar');
    expect(findPhoneticMatchForLanguage('gitarra', grammar, phoneticIndex, 'es-US')).to.equal('guitarra');
  });

  it('does not create unrelated Spanish matches', function() {
    const grammar = ['volver'];
    const phoneticIndex = buildPhoneticIndexForLanguage(grammar, 'es-US');

    const result = findPhoneticMatchForLanguage(
      'otro',
      grammar,
      phoneticIndex,
      'es-US'
    );

    expect(result).to.equal(null);
  });

  it('preserves enough detail to avoid broad false-positive Spanish matches', function() {
    expect(
      findPhoneticMatchForLanguage(
        'elena',
        ['alguno', 'el enero'],
        buildPhoneticIndexForLanguage(['alguno', 'el enero'], 'es-US'),
        'es-US'
      )
    ).to.equal(null);

    expect(
      findPhoneticMatchForLanguage(
        'pelear',
        ['hablar', 'pedir'],
        buildPhoneticIndexForLanguage(['hablar', 'pedir'], 'es-US'),
        'es-US'
      )
    ).to.equal(null);

    expect(
      findPhoneticMatchForLanguage(
        'over',
        ['dejar', 'saber'],
        buildPhoneticIndexForLanguage(['dejar', 'saber'], 'es-US'),
        'es-US'
      )
    ).to.equal(null);
  });

  it('uses the Spanish encoder for conflict filtering', function() {
    const grammar = ['vaca', 'baca', 'casa'];
    const phoneticIndex = buildPhoneticIndexForLanguage(grammar, 'es-US');

    const conflicts = findPhoneticConflictsWithCorrectAnswerForLanguage(
      'vaca',
      grammar,
      phoneticIndex,
      'es-US'
    );

    expect(conflicts).to.include('baca');
    expect(conflicts).to.not.include('casa');
  });

  it('does not treat accented Spanish answer aliases as phonetic conflicts', function() {
    const grammar = ['que', 'de', 'se', 'qué', 'e'];
    const phoneticIndex = buildPhoneticIndexForLanguage(grammar, 'es-MX');

    const conflicts = findPhoneticConflictsWithCorrectAnswerForLanguage(
      'que',
      grammar,
      phoneticIndex,
      'es-MX'
    );

    expect(conflicts).to.include('de');
    expect(conflicts).to.include('se');
    expect(conflicts).to.include('e');
    expect(conflicts).to.not.include('qué');
  });
});
