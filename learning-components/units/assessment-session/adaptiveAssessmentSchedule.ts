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
    const value = item.clusterIndex;
    const clusterIndex = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()))
      ? Number(value)
      : NaN;
    if (!Number.isSafeInteger(clusterIndex) || clusterIndex < 0) {
      const unitName = typeof options.unit.unitname === 'string' ? options.unit.unitname : '<unnamed>';
      throw new Error(`Adaptive assessment template for unit "${unitName}" produced an invalid cluster index`);
    }
    return `${clusterIndex}-${clusterIndex}`;
  });

  options.unit.assessmentsession.clusterlist = clusters.join(' ');
  return true;
}
