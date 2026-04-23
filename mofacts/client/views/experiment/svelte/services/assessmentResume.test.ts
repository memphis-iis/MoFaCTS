import { expect } from 'chai';

import {
  assertAssessmentScheduleArtifactForUnit,
  assertAssessmentScheduleBounds,
  deriveAssessmentQuestionIndex,
  deriveAssessmentScheduleCursor,
  hasAssessmentResumeProgress,
  hasScheduleArtifactForUnit,
} from './assessmentResume';

describe('assessmentResume', function() {
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

    it('treats a saved schedule artifact or completed history as durable resume progress', function() {
      expect(hasAssessmentResumeProgress({ schedule: { q: [] }, scheduleUnitNumber: 3 }, 3, 0)).to.equal(true);
      expect(hasAssessmentResumeProgress({}, 3, 2)).to.equal(true);
      expect(hasAssessmentResumeProgress({}, 3, 0)).to.equal(false);
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
});
