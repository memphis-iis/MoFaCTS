/** Authoring warnings compare stored authored structure, never generated learner units. */
export type ContentUpdateWarning = 'questions-removed' | 'unit-sequence-changed';
export type ContentUpdateConfirmation = { expectedRevision: number; confirmed: true };
export type ContentUpdateReview = {
  status: 'confirmation-required';
  tdfId: string;
  lessonName: string;
  expectedRevision: number;
  structuralWarnings: ContentUpdateWarning[];
};

type TutorStructure = { unit?: Array<{ unitname?: unknown }>; [key: string]: unknown };
type StimuliStructure = { setspec: { clusters: Array<{ stims: unknown[] }> } };

export function getContentUpdateWarnings(previous: {
  tutor?: TutorStructure | undefined;
  stimuli?: StimuliStructure;
}, proposed: {
  tutor?: TutorStructure | undefined;
  stimuli?: StimuliStructure;
}): ContentUpdateWarning[] {
  const warnings: ContentUpdateWarning[] = [];
  if (previous.stimuli && proposed.stimuli) {
    const before = previous.stimuli.setspec.clusters;
    const after = proposed.stimuli.setspec.clusters;
    if (after.length < before.length
      || after.reduce((count, cluster) => count + cluster.stims.length, 0)
        < before.reduce((count, cluster) => count + cluster.stims.length, 0)
      || before.some((cluster, index) => index < after.length && after[index]!.stims.length < cluster.stims.length)) {
      warnings.push('questions-removed');
    }
  }
  if (previous.tutor && proposed.tutor) {
    // Missing unit lists are intentional on condition-family roots.
    const before = previous.tutor.unit || [];
    const after = proposed.tutor.unit || [];
    if (before.length !== after.length || before.some((unit, index) => unit.unitname !== after[index]!.unitname)) {
      warnings.push('unit-sequence-changed');
    }
  }
  return warnings;
}
