export interface AdaptiveAssessmentSession {
  clusterlist?: unknown;
}

export interface AdaptiveAssessmentUnit {
  unitname?: unknown;
  assessmentsession?: AdaptiveAssessmentSession;
}

export interface AdaptiveAssessmentScheduleItem {
  clusterIndex?: unknown;
}

export function applyAdaptiveAssessmentTemplateSchedule(options: {
  unit: AdaptiveAssessmentUnit;
  schedule: AdaptiveAssessmentScheduleItem[];
}): boolean {
  if (!options.unit.assessmentsession) {
    return false;
  }

  const clusters = options.schedule.map((item) => {
    const clusterIndex = Number(item.clusterIndex);
    if (!Number.isInteger(clusterIndex)) {
      const unitName = typeof options.unit.unitname === 'string' ? options.unit.unitname : '<unnamed>';
      throw new Error(`Adaptive assessment template for unit "${unitName}" produced an invalid cluster index`);
    }
    return String(clusterIndex);
  });

  options.unit.assessmentsession.clusterlist = clusters.join(' ');
  return true;
}
