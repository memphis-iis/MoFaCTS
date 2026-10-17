import { SPARC_INSTRUCTIONAL_POLICY_IDS, isSparcCategorizedPolicy } from '../../../learning-components/runtime/sparcInstructionalPolicies';
import { sparcTargetCategoryFields } from '../../../learning-components/runtime/sparcTargetCategories';

export type AutoTutorValidationResult = {
  valid: boolean;
  errors: string[];
};

type AutoTutorValidationContext = {
  tdf?: unknown;
  stimuli?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getTutor(tdf: unknown): Record<string, unknown> | null {
  if (!isRecord(tdf)) {
    return null;
  }
  const tutor = tdf.tutor;
  return isRecord(tutor) ? tutor : null;
}

function getSparcUnits(tdf: unknown): Array<{ unit: Record<string, unknown>; index: number }> {
  const tutor = getTutor(tdf);
  const units = Array.isArray(tutor?.unit) ? tutor.unit : [];
  return units
    .map((unit, index) => ({ unit, index }))
    .filter((entry): entry is { unit: Record<string, unknown>; index: number } =>
      isRecord(entry.unit) &&
      isRecord(entry.unit.sparcsession)
    );
}

function getStimClusters(stimuli: unknown): unknown[] {
  if (!isRecord(stimuli) || !isRecord(stimuli.setspec) || !Array.isArray(stimuli.setspec.clusters)) {
    return [];
  }
  return stimuli.setspec.clusters;
}

function getSparcPages(stimuli: unknown): Array<Record<string, unknown>> {
  if (!isRecord(stimuli) || !isRecord(stimuli.setspec) || !Array.isArray(stimuli.setspec.sparcPages)) {
    return [];
  }
  return stimuli.setspec.sparcPages.filter(isRecord);
}

export function validateAutoTutorContent(context: AutoTutorValidationContext): AutoTutorValidationResult {
  const errors: string[] = [];
  const tutor = getTutor(context.tdf);
  if (!tutor) {
    return { valid: false, errors: ['TDF is missing tutor object'] };
  }

  const setspec = isRecord(tutor.setspec) ? tutor.setspec : {};
  for (const [path, value] of [
    ['tutor.unit', tutor.unit],
    ['tutor.unitTemplate', tutor.unitTemplate],
    ['tutor.setspec.unitTemplate', setspec.unitTemplate],
  ] as const) {
    const units = Array.isArray(value) ? value : [];
    units.forEach((unit, index) => {
      if (isRecord(unit) && Object.prototype.hasOwnProperty.call(unit, 'autotutorsession')) {
        errors.push(`${path}[${index}].autotutorsession is no longer supported; standalone AutoTutor has been removed`);
      }
    });
  }
  getStimClusters(context.stimuli).forEach((cluster, clusterIndex) => {
    const stims = isRecord(cluster) && Array.isArray(cluster.stims) ? cluster.stims : [];
    stims.forEach((stim, stimIndex) => {
      if (isRecord(stim) && Object.prototype.hasOwnProperty.call(stim, 'autoTutor')) {
        errors.push(`setspec.clusters[${clusterIndex}].stims[${stimIndex}].autoTutor is no longer supported; standalone AutoTutor has been removed`);
      }
    });
  });

  validateSparcAutoTutorContent(context, errors);

  return { valid: errors.length === 0, errors };
}

const FORBIDDEN_SPARC_AUTOTUTOR_FIELDS = new Set([
  'sourceAutoTutor',
  'stimulusKC',
  'KCId',
  'KCDefault',
  'KCCluster',
]);

function validateNoForbiddenSparcAutoTutorFields(value: unknown, path: string, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoForbiddenSparcAutoTutorFields(entry, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const fieldPath = `${path}.${key}`;
    if (FORBIDDEN_SPARC_AUTOTUTOR_FIELDS.has(key)) {
      errors.push(`${fieldPath} is not allowed in SPARC AutoTutor target data`);
    }
    validateNoForbiddenSparcAutoTutorFields(entry, fieldPath, errors);
  }
}

function validateSparcAutoTutorTargets(
  display: Record<string, unknown>,
  clusters: unknown[],
  prefix: string,
  errors: string[],
): void {
  validateNoForbiddenSparcAutoTutorFields({
    clusterTargets: display.clusterTargets,
    autoTutorTargets: display.autoTutorTargets,
  }, prefix, errors);

  const clusterTargets = Array.isArray(display.clusterTargets) ? display.clusterTargets : [];
  if (clusterTargets.length === 0) {
    errors.push(`${prefix}.clusterTargets must contain at least one clean target`);
  }
  const clusterKCs = new Set<string>();
  clusterTargets.forEach((target, index) => {
    const targetPrefix = `${prefix}.clusterTargets[${index}]`;
    if (!isRecord(target)) {
      errors.push(`${targetPrefix} must be an object`);
      return;
    }
    if (!Number.isInteger(target.clusterIndex) || Number(target.clusterIndex) < 0) {
      errors.push(`${targetPrefix}.clusterIndex must be a non-negative integer`);
      return;
    }
    if (!nonEmptyString(target.clusterKC)) {
      errors.push(`${targetPrefix}.clusterKC must be a non-empty string`);
      return;
    }
    const cluster = clusters[Number(target.clusterIndex)];
    if (!isRecord(cluster)) {
      errors.push(`${targetPrefix}.clusterIndex references a missing stimulus cluster`);
      return;
    }
    if (nonEmptyString(cluster.clusterKC) && cluster.clusterKC !== target.clusterKC) {
      errors.push(`${targetPrefix}.clusterKC must match setspec.clusters[${Number(target.clusterIndex)}].clusterKC`);
    }
    clusterKCs.add(target.clusterKC);
  });

  const autoTutorTargets = isRecord(display.autoTutorTargets) ? display.autoTutorTargets : {};
  const categorized = isSparcCategorizedPolicy(isRecord(display.instructionalController) ? display.instructionalController.policyId : undefined);
  if (categorized) {
    const sources = Array.isArray(display.workingMemoryFacts)
      ? display.workingMemoryFacts.filter(fact => isRecord(fact) && fact.factType === 'dialogue.source') : [];
    if (sources.length !== 1 || !isRecord(sources[0]) || !isRecord(sources[0].slots) || !nonEmptyString(sources[0].slots.topic)) {
      errors.push(`${prefix}.workingMemoryFacts requires exactly one dialogue.source with a non-empty topic for categorized instruction`);
    }
  }
  const expectations = Array.isArray(autoTutorTargets.expectations) ? autoTutorTargets.expectations : [];
  if (expectations.length === 0) {
    errors.push(`${prefix}.autoTutorTargets.expectations must contain at least one expectation`);
  }
  expectations.forEach((expectation, index) => {
    const expectationPrefix = `${prefix}.autoTutorTargets.expectations[${index}]`;
    if (!isRecord(expectation)) {
      errors.push(`${expectationPrefix} must be an object`);
      return;
    }
    if (!nonEmptyString(expectation.clusterKC)) {
      errors.push(`${expectationPrefix}.clusterKC must be a non-empty string`);
    } else if (!clusterKCs.has(expectation.clusterKC)) {
      errors.push(`${expectationPrefix}.clusterKC must reference a clean cluster target`);
    }
    if (!nonEmptyString(expectation.text)) {
      errors.push(`${expectationPrefix}.text must be a non-empty string`);
    }
    try { sparcTargetCategoryFields(expectation.category, `${expectationPrefix} (${String(expectation.clusterKC)})`, categorized); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  });

  const misconceptions = Array.isArray(autoTutorTargets.misconceptions) ? autoTutorTargets.misconceptions : [];
  misconceptions.forEach((misconception, index) => {
    const misconceptionPrefix = `${prefix}.autoTutorTargets.misconceptions[${index}]`;
    if (!isRecord(misconception)) {
      errors.push(`${misconceptionPrefix} must be an object`);
      return;
    }
    if (!nonEmptyString(misconception.id)) {
      errors.push(`${misconceptionPrefix}.id must be a non-empty string`);
    }
    if (!nonEmptyString(misconception.text)) {
      errors.push(`${misconceptionPrefix}.text must be a non-empty string`);
    }
    try { sparcTargetCategoryFields(misconception.category, `${misconceptionPrefix} (${String(misconception.id)})`, categorized); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  });
}

function validateSparcAutoTutorContent(context: AutoTutorValidationContext, errors: string[]): void {
  const sparcPages = getSparcPages(context.stimuli);
  const autoTutorPages = sparcPages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => isRecord(page.display) && page.display.unitType === 'sparc-autotutor-dialogue');
  if (autoTutorPages.length === 0) {
    return;
  }

  const sparcUnits = getSparcUnits(context.tdf);
  if (sparcUnits.length === 0) {
    errors.push('SPARC AutoTutor content requires a tutor.unit sparcsession selector');
  }
  const configuredPageIds = new Set(
    sparcUnits
      .map(({ unit }) => isRecord(unit.sparcsession) ? unit.sparcsession.pageId : undefined)
      .filter(nonEmptyString),
  );
  const clusters = getStimClusters(context.stimuli);

  autoTutorPages.forEach(({ page, index }) => {
    const pagePrefix = `setspec.sparcPages[${index}]`;
    const pageId = page.pageId;
    if (!nonEmptyString(pageId)) {
      errors.push(`${pagePrefix}.pageId must be a non-empty string`);
    } else if (configuredPageIds.size > 0 && !configuredPageIds.has(pageId)) {
      errors.push(`${pagePrefix}.pageId must match a tutor.unit sparcsession.pageId`);
    }

    const display = page.display as Record<string, unknown>;
    if (display.schema !== 'tutorscript-sparc/2.0') {
      errors.push(`${pagePrefix}.display.schema must be tutorscript-sparc/2.0`);
    }
    if (!Array.isArray(display.nodes) || display.nodes.length === 0) {
      errors.push(`${pagePrefix}.display.nodes must contain the AutoTutor dialogue nodes`);
    }
    if (Object.prototype.hasOwnProperty.call(display, 'productionRules')) {
      errors.push(`${pagePrefix}.display.productionRules is runtime-owned and must be omitted`);
    }
    const instructionalController = isRecord(display.instructionalController)
      ? display.instructionalController
      : undefined;
    if (
      !instructionalController
      || instructionalController.adapterId !== 'sparc-autotutor-v1'
      || !(SPARC_INSTRUCTIONAL_POLICY_IDS as readonly string[]).includes(String(instructionalController.policyId))
      || instructionalController.policyVersion !== 1
    ) {
      errors.push(`${pagePrefix}.display.instructionalController must select sparc-autotutor-v1 and a registered policy (${SPARC_INSTRUCTIONAL_POLICY_IDS.join(', ')}) at version 1`);
    }
    validateSparcAutoTutorTargets(display, clusters, `${pagePrefix}.display`, errors);
  });
}
