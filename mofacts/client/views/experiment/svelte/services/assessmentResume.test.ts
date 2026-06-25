import { expect } from 'chai';

import {
  assertAssessmentScheduleArtifactForUnit,
  assertAssessmentScheduleBounds,
  deriveAssessmentQuestionIndex,
  deriveAssessmentScheduleCursor,
  hasAssessmentResumeProgress,
  hasScheduleArtifactForUnit,
  resolveResumeHistoryRoute,
  shouldSkipResumeInstructionsForHistoryRoute,
} from './assessmentResume';

describe('assessmentResume', function() {
  describe('resolveResumeHistoryRoute', function() {
    it('routes learning resume history reconstruction through the unit engine', function() {
      expect(resolveResumeHistoryRoute({ learningsession: {} })).to.deep.equal({
        kind: 'learning',
        reconstructSparcHistory: false,
        inferAssessmentPosition: false,
        requiresAssessmentScheduleArtifact: false,
      });
    });

    it('names SPARC resume history replay policy', function() {
      expect(resolveResumeHistoryRoute({ sparcsession: {} })).to.deep.equal({
        kind: 'sparc',
        reconstructSparcHistory: true,
        inferAssessmentPosition: false,
        requiresAssessmentScheduleArtifact: false,
      });
    });

    it('names assessment resume schedule policy', function() {
      const route = resolveResumeHistoryRoute({ assessmentsession: {} });

      expect(route).to.deep.equal({
        kind: 'assessment',
        reconstructSparcHistory: false,
        inferAssessmentPosition: true,
        requiresAssessmentScheduleArtifact: true,
      });
      expect(shouldSkipResumeInstructionsForHistoryRoute(route, true)).to.equal(true);
      expect(shouldSkipResumeInstructionsForHistoryRoute(route, false)).to.equal(false);
    });

    it('keeps non-history unit resume as an explicit no-op route', function() {
      const route = resolveResumeHistoryRoute({});

      expect(route).to.deep.equal({
        kind: 'none',
        reconstructSparcHistory: false,
        inferAssessmentPosition: false,
        requiresAssessmentScheduleArtifact: false,
      });
      expect(shouldSkipResumeInstructionsForHistoryRoute(route, true)).to.equal(false);
    });
  });

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
