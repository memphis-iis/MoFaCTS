function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

type ResumeUnitLike = {
  learningsession?: unknown;
  assessmentsession?: unknown;
  sparcsession?: unknown;
};

export type ResumeHistoryRouteKind = 'learning' | 'assessment' | 'sparc' | 'none';

export type ResumeHistoryRoute = {
  kind: ResumeHistoryRouteKind;
  reconstructLearningHistory: boolean;
  reconstructSparcHistory: boolean;
  inferAssessmentPosition: boolean;
  requiresAssessmentScheduleArtifact: boolean;
};

export function resolveResumeHistoryRoute(unit: ResumeUnitLike | null | undefined): ResumeHistoryRoute {
  if (unit?.learningsession) {
    return {
      kind: 'learning',
      reconstructLearningHistory: true,
      reconstructSparcHistory: false,
      inferAssessmentPosition: false,
      requiresAssessmentScheduleArtifact: false,
    };
  }

  if (unit?.sparcsession) {
    return {
      kind: 'sparc',
      reconstructLearningHistory: false,
      reconstructSparcHistory: true,
      inferAssessmentPosition: false,
      requiresAssessmentScheduleArtifact: false,
    };
  }

  if (unit?.assessmentsession) {
    return {
      kind: 'assessment',
      reconstructLearningHistory: false,
      reconstructSparcHistory: false,
      inferAssessmentPosition: true,
      requiresAssessmentScheduleArtifact: true,
    };
  }

  return {
    kind: 'none',
    reconstructLearningHistory: false,
    reconstructSparcHistory: false,
    inferAssessmentPosition: false,
    requiresAssessmentScheduleArtifact: false,
  };
}

export function shouldSkipResumeInstructionsForHistoryRoute(
  route: ResumeHistoryRoute,
  assessmentHasDurableResumeProgress: boolean,
): boolean {
  return route.inferAssessmentPosition && assessmentHasDurableResumeProgress;
}

export function hasScheduleArtifactForUnit(
  experimentState: Record<string, unknown> | null | undefined,
  unitNumber: number
): boolean {
  return !!experimentState?.schedule && toNonNegativeInteger(experimentState?.scheduleUnitNumber) === toNonNegativeInteger(unitNumber);
}

export function assertAssessmentScheduleArtifactForUnit(
  experimentState: Record<string, unknown> | null | undefined,
  unitNumber: number
): void {
  if (!hasScheduleArtifactForUnit(experimentState, unitNumber)) {
    throw new Error(
      `Assessment resume requires a persisted schedule artifact for unit ${toNonNegativeInteger(unitNumber)}`
    );
  }
}

export function hasAssessmentResumeProgress(
  experimentState: Record<string, unknown> | null | undefined,
  unitNumber: number,
  completedTrialCount: unknown
): boolean {
  return hasScheduleArtifactForUnit(experimentState, unitNumber) || toNonNegativeInteger(completedTrialCount) > 0;
}

export function deriveAssessmentQuestionIndex(
  completedTrialCount: unknown
): number {
  return toNonNegativeInteger(completedTrialCount);
}

export function deriveAssessmentScheduleCursor(
  completedTrialCount: unknown
): number {
  return deriveAssessmentQuestionIndex(completedTrialCount);
}

export function assertAssessmentScheduleBounds(
  scheduleLength: unknown,
  completedTrialCount: unknown
): void {
  const length = toNonNegativeInteger(scheduleLength);
  const questionIndex = deriveAssessmentQuestionIndex(completedTrialCount);

  if (questionIndex > length) {
    throw new Error(
      `Assessment resume history exceeds schedule bounds (completed=${questionIndex}, scheduleLength=${length})`
    );
  }

  if (questionIndex < 0 || questionIndex > length) {
    throw new Error(
      `Assessment resume next-card pointer is out of bounds (questionIndex=${questionIndex}, scheduleLength=${length})`
    );
  }
}
