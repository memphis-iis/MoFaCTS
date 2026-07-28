import { expect } from 'chai';
import { resolveProlificExperimentEntry } from './prolificExperimentEntry';

describe('prolificExperimentEntry', function() {
  const studyId = '0123456789abcdef01234567';
  const participantId = 'abcdef0123456789abcdef01';

  it('automatically enters when Prolific participant and study IDs are valid and match the target', function() {
    expect(resolveProlificExperimentEntry(studyId, {
      PROLIFIC_PID: participantId,
      STUDY_ID: studyId,
      SESSION_ID: 'ignored-session-id',
    })).to.deep.equal({ mode: 'automatic', participantId });
  });

  it('compares the target and study ID case-insensitively', function() {
    expect(resolveProlificExperimentEntry(studyId.toUpperCase(), {
      PROLIFIC_PID: participantId.toUpperCase(),
      STUDY_ID: studyId,
    })).to.deep.equal({ mode: 'automatic', participantId: participantId.toUpperCase() });
  });

  it('keeps manual login when either required parameter is missing', function() {
    expect(resolveProlificExperimentEntry(studyId, { PROLIFIC_PID: participantId }))
      .to.deep.equal({ mode: 'manual', reason: 'missing' });
    expect(resolveProlificExperimentEntry(studyId, { STUDY_ID: studyId }))
      .to.deep.equal({ mode: 'manual', reason: 'missing' });
  });

  it('keeps manual login for malformed Prolific IDs', function() {
    expect(resolveProlificExperimentEntry(studyId, {
      PROLIFIC_PID: 'not-a-prolific-id',
      STUDY_ID: studyId,
    })).to.deep.equal({ mode: 'manual', reason: 'invalid' });
  });

  it('keeps manual login when STUDY_ID does not match the experiment target', function() {
    expect(resolveProlificExperimentEntry(studyId, {
      PROLIFIC_PID: participantId,
      STUDY_ID: 'fedcba9876543210fedcba98',
    })).to.deep.equal({ mode: 'manual', reason: 'study-mismatch' });
  });
});
