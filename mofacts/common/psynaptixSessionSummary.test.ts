import { expect } from 'chai';
import {
  sanitizePsynaptixSessionSummary,
  serializePsynaptixSessionSummary,
} from './psynaptixSessionSummary';

describe('sanitizePsynaptixSessionSummary (#286)', function() {
  it('keeps metrics and drops nested trial/answer blobs', function() {
    const sanitized = sanitizePsynaptixSessionSummary({
      trials: 3,
      correct: 2,
      durationMs: 12000,
      providerIds: ['mouse', 'eeg'],
      trialsDetail: [{ userAnswer: 'Paris' }],
      rawEvents: [{ payload: 'huge' }],
      userAnswer: 'should drop',
    });
    expect(sanitized).to.deep.equal({
      trials: 3,
      correct: 2,
      durationMs: 12000,
      providerIds: ['mouse', 'eeg'],
    });
    expect(JSON.stringify(sanitized)).to.not.include('Paris');
    expect(JSON.stringify(sanitized)).to.not.include('rawEvents');
  });

  it('serializes empty object for non-objects', function() {
    expect(serializePsynaptixSessionSummary(null)).to.equal('{}');
    expect(serializePsynaptixSessionSummary('x')).to.equal('{}');
  });
});
