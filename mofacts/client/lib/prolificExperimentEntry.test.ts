import { expect } from 'chai';
import { resolveProlificExperimentEntry } from './prolificExperimentEntry';

describe('Prolific entry and ordinary experiment separation', () => {
  const studyId = '0123456789abcdef01234567';
  const participantId = 'abcdef0123456789abcdef01';
  const submissionId = 'abcdef0123456789abcdef02';
  const config = { prolificCompletionUrl: 'https://app.prolific.com/submissions/complete?cc=ABC123' };
  const query = () => new URLSearchParams({ PROLIFIC_PID: participantId, STUDY_ID: studyId, SESSION_ID: submissionId });
  it('binds all three launch identities and normalizes hexadecimal case', () => {
    expect(resolveProlificExperimentEntry(studyId.toUpperCase(), query(), config)).to.deep.equal({ mode: 'automatic', participantId, identity: { participantId, studyId, submissionId } });
  });
  it('preserves ordinary and password-protected experiments even with completion configuration', () => {
    expect(resolveProlificExperimentEntry('ordinary', new URLSearchParams(), config)).to.deep.equal({ mode: 'manual' });
    expect(resolveProlificExperimentEntry(studyId, {}, { ...config, experimentPasswordRequired: true })).to.deep.equal({ mode: 'manual' });
  });
  for (const key of ['PROLIFIC_PID', 'STUDY_ID', 'SESSION_ID']) {
    it(`rejects missing, duplicated and malformed ${key} without manual fallback`, () => {
      const missing = query(); missing.delete(key);
      const duplicate = query(); duplicate.append(key, duplicate.get(key)!);
      const malformed = query(); malformed.set(key, 'invalid');
      for (const q of [missing, duplicate, malformed]) expect(resolveProlificExperimentEntry(studyId, q, config).mode).to.equal('error');
    });
  }
  it('rejects study mismatch, missing configuration, and password conflicts', () => {
    expect(resolveProlificExperimentEntry(participantId, query(), config).mode).to.equal('error');
    expect(resolveProlificExperimentEntry(studyId, query()).mode).to.equal('error');
    expect(resolveProlificExperimentEntry(studyId, query(), { ...config, experimentPasswordRequired: true }).mode).to.equal('error');
  });
});
