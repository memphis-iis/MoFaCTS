import { expect } from 'chai';

import {
  assertAssessmentScheduleArtifactForUnit,
  assertAssessmentScheduleBounds,
  deriveAssessmentQuestionIndex,
  deriveAssessmentScheduleCursor,
  hasScheduleArtifactForUnit,
  resolveVideoResumeAnchor,
} from './assessmentVideoResume';

describe('assessmentVideoResume', function() {
  describe('hasScheduleArtifactForUnit', function() {
    it('requires both a schedule artifact and matching unit number', function() {
      expect(hasScheduleArtifactForUnit({ schedule: { q: [] }, scheduleUnitNumber: 3 }, 3)).to.equal(true);
      expect(hasScheduleArtifactForUnit({ schedule: { q: [] }, scheduleUnitNumber: 2 }, 3)).to.equal(false);
      expect(hasScheduleArtifactForUnit({}, 3)).to.equal(false);
    });

    it('fails loudly when assessment resume lacks the persisted schedule for that unit', function() {
      expect(() => assertAssessmentScheduleArtifactForUnit(
        { schedule: { q: [] }, scheduleUnitNumber: 2 },
        3
      )).to.throw(/requires a persisted schedule artifact/);
      expect(() => assertAssessmentScheduleArtifactForUnit(
        { schedule: { q: [] }, scheduleUnitNumber: 3 },
        3
      )).not.to.throw();
    });
  });

  describe('deriveAssessmentQuestionIndex', function() {
    it('uses completed history count directly as the next schedule position', function() {
      expect(deriveAssessmentQuestionIndex(0)).to.equal(0);
      expect(deriveAssessmentQuestionIndex(3)).to.equal(3);
      expect(deriveAssessmentScheduleCursor(3)).to.equal(3);
    });
  });

  describe('assertAssessmentScheduleBounds', function() {
    it('allows valid next-card pointers from completed history count', function() {
      expect(() => assertAssessmentScheduleBounds(5, 2)).not.to.throw();
      expect(() => assertAssessmentScheduleBounds(5, 3)).not.to.throw();
    });

    it('rejects impossible completed-history counts', function() {
      expect(() => assertAssessmentScheduleBounds(2, 3)).to.throw(/exceeds schedule bounds/);
    });
  });

  describe('resolveVideoResumeAnchor', function() {
    const checkpointTimes = [10, 20, 30];

    it('resumes from the last completed checkpoint time and next unanswered checkpoint index', function() {
      expect(resolveVideoResumeAnchor(checkpointTimes, 1)).to.deep.equal({
        resumeStartTime: 10,
        resumeCheckpointIndex: 1,
      });
      expect(resolveVideoResumeAnchor(checkpointTimes, 2)).to.deep.equal({
        resumeStartTime: 20,
        resumeCheckpointIndex: 2,
      });
    });

    it('returns null when no checkpoints are completed yet', function() {
      expect(resolveVideoResumeAnchor(checkpointTimes, 0)).to.equal(null);
    });

    it('resumes from the last checkpoint when all questions are already completed', function() {
      expect(resolveVideoResumeAnchor(checkpointTimes, 3)).to.deep.equal({
        resumeStartTime: 30,
        resumeCheckpointIndex: 3,
      });
    });

    it('fails on invalid checkpoint times', function() {
      expect(() => resolveVideoResumeAnchor([10, 'bad', 30], 1)).to.throw(/invalid/);
    });
  });
});
