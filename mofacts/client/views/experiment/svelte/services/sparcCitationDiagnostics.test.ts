import { expect } from 'chai';
import { summarizeSparcCitation } from './sparcCitationDiagnostics.ts';

describe('SPARC citation diagnostics', function() {
  const history = [
    { role: 'student', text: 'Private learner explanation.' },
    { role: 'tutor', text: 'Private tutor question.' },
  ];

  it('distinguishes a misplaced learner quote from a quote copied from the tutor', function() {
    const misplaced = summarizeSparcCitation({
      source: 'dialogueHistory', dialogueHistoryIndex: 1, quote: history[0]!.text,
    }, history, 'Private latest answer.');
    expect(misplaced.referencedRole).to.equal('tutor');
    expect(misplaced.quoteMatchesReferenced).to.equal(false);
    expect(misplaced.matchingStudentIndices).to.deep.equal([0]);
    expect(misplaced.matchingTutorCount).to.equal(0);

    const tutorQuote = summarizeSparcCitation({
      source: 'dialogueHistory', dialogueHistoryIndex: 1, quote: history[1]!.text,
    }, history, 'Private latest answer.');
    expect(tutorQuote.quoteMatchesReferenced).to.equal(true);
    expect(tutorQuote.matchingStudentCount).to.equal(0);
    expect(tutorQuote.matchingTutorIndices).to.deep.equal([1]);
    expect(JSON.stringify([misplaced, tutorQuote])).not.to.contain('Private');
  });

  it('reports latest-answer matches and missing references without inventing a source', function() {
    const summary = summarizeSparcCitation({
      source: 'dialogueHistory', dialogueHistoryIndex: 99, quote: 'Latest answer.',
    }, history, 'Latest answer.');
    expect(summary.index).to.equal(99);
    expect(summary.referencedRole).to.equal('missing');
    expect(summary.quoteMatchesLatest).to.equal(true);
    expect(summary.quoteMatchesReferenced).to.equal(false);
    expect(summary.matchingStudentCount).to.equal(0);
  });

  it('bounds repeated matches while retaining totals and distinguishing ambiguous sources', function() {
    const repeatedHistory = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 ? 'tutor' : 'student', text: 'Repeated wording.',
    }));
    const summary = summarizeSparcCitation({
      source: 'learnerText', dialogueHistoryIndex: null, quote: 'Repeated wording.',
    }, repeatedHistory, 'Repeated wording.');
    expect(summary.matchingStudentCount).to.equal(15);
    expect(summary.matchingTutorCount).to.equal(15);
    expect(summary.matchingStudentIndices).to.have.length(8);
    expect(summary.matchingTutorIndices).to.have.length(8);
    expect(summary.studentEntries).to.equal(15);
    expect(summary.historyEntries).to.equal(30);
    expect(summary.quoteMatchesLatest).to.equal(true);
  });

  it('does not echo malformed provider fields or treat a blank quote as matching everything', function() {
    const summary = summarizeSparcCitation({
      source: 'private injected source', dialogueHistoryIndex: 'private injected index', quote: '  ',
    }, history, 'Private latest answer.');
    expect(summary.source).to.equal('invalid');
    expect(summary.index).to.equal('invalid');
    expect(summary.matchingStudentCount).to.equal(0);
    expect(summary.matchingTutorCount).to.equal(0);
    expect(summary.quoteMatchesLatest).to.equal(false);
    expect(JSON.stringify(summary).toLowerCase()).not.to.contain('private');
  });

  it('retains citation alignment without learner, tutor, or provider wording', function() {
    const quote = '  Private learner explanation.  ';
    const latest = 'An answer\nwith punctuation—and spacing.';
    const diagnostic = summarizeSparcCitation({
      source: 'dialogueHistory', dialogueHistoryIndex: 1, quote,
    }, history, latest);
    expect(diagnostic.quoteCharacters).to.equal(quote.trim().length);
    expect(diagnostic.referencedRole).to.equal('tutor');
    expect(diagnostic.quoteMatchesReferenced).to.equal(false);
    expect(diagnostic.matchingStudentIndices).to.deep.equal([0]);
    const serialized = JSON.stringify(diagnostic);
    for (const text of [quote, quote.trim(), latest, history[1]!.text]) {
      expect(serialized).not.to.contain(text);
    }
    for (const field of ['quote', 'learnerText', 'dialogueHistory']) {
      expect(diagnostic).not.to.have.property(field);
    }
  });

  it('never retains credentials or surrounding wording supplied as citation text', function() {
    const text = 'Answer: Bearer private-token mongodb://private-host/db sk-or-v1-privateKey1234567890';
    const diagnostic = summarizeSparcCitation({
      source: 'learnerText', dialogueHistoryIndex: null, quote: text,
    }, [{ role: 'student', text }], text);
    const serialized = JSON.stringify(diagnostic);
    expect(diagnostic.quoteMatchesReferenced).to.equal(true);
    for (const secret of ['Answer:', 'private-token', 'private-host', 'privateKey1234567890']) {
      expect(serialized).not.to.contain(secret);
    }
  });

  it('locates older citations without retaining dialogue context', function() {
    const longHistory = Array.from({ length: 100 }, (_, index) => ({
      role: index % 2 ? 'tutor' : 'student', text: `Statement ${index}.`,
    }));
    const diagnostic = summarizeSparcCitation({
      source: 'dialogueHistory', dialogueHistoryIndex: 1, quote: 'Statement 0.',
    }, longHistory, 'Latest.');
    expect(diagnostic.index).to.equal(1);
    expect(diagnostic.matchingStudentIndices).to.deep.equal([0]);
    expect(diagnostic.historyEntries).to.equal(100);
    expect(diagnostic.studentEntries).to.equal(50);
    expect(JSON.stringify(diagnostic)).not.to.contain('Statement');
  });
});
