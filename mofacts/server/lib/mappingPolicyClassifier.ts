import { createMappingSignature } from '../../client/lib/mappingSignature';

export function countStimClustersForPolicy(stimuli: unknown): number {
  if (!Array.isArray(stimuli)) {
    return 0;
  }
  const seen = new Set<string>();
  for (const stim of stimuli as Array<Record<string, unknown>>) {
    const clusterId = stim?.clusterKC ?? stim?.clusterkc ?? stim?.clusterId ?? stim?.cluster ?? stim?.clusterIndex;
    if (clusterId === null || clusterId === undefined) {
      continue;
    }
    seen.add(String(clusterId));
  }
  return seen.size > 0 ? seen.size : stimuli.length;
}

function buildMappingPolicySignature(params: {
  tdfFile: unknown;
  rootTdfId: unknown;
  conditionTdfId: unknown;
  stimuliSetId: unknown;
  stimuliSet: unknown;
}) {
  return createMappingSignature({
    tdfFile: params.tdfFile,
    rootTdfId: params.rootTdfId,
    conditionTdfId: params.conditionTdfId,
    stimuliSetId: params.stimuliSetId,
    stimuliSet: params.stimuliSet,
    stimCount: countStimClustersForPolicy(params.stimuliSet),
  }).signature;
}

export function isBreakingMappingChange(params: {
  prevTdfFile: unknown;
  nextTdfFile: unknown;
  prevStimuliSet: unknown;
  nextStimuliSet: unknown;
  rootTdfId: unknown;
  conditionTdfId: unknown;
  stimuliSetId: unknown;
}) {
  try {
    const prevSig = buildMappingPolicySignature({
      tdfFile: params.prevTdfFile,
      rootTdfId: params.rootTdfId,
      conditionTdfId: params.conditionTdfId,
      stimuliSetId: params.stimuliSetId,
      stimuliSet: params.prevStimuliSet,
    });
    const nextSig = buildMappingPolicySignature({
      tdfFile: params.nextTdfFile,
      rootTdfId: params.rootTdfId,
      conditionTdfId: params.conditionTdfId,
      stimuliSetId: params.stimuliSetId,
      stimuliSet: params.nextStimuliSet,
    });
    return prevSig !== nextSig;
  } catch (_error) {
    return true;
  }
}

export function hasMeaningfulProgressSignal(experimentState: any): boolean {
  if (!experimentState || typeof experimentState !== 'object') {
    return false;
  }

  if (Array.isArray(experimentState.overallOutcomeHistory) && experimentState.overallOutcomeHistory.length > 0) {
    return true;
  }
  if (Array.isArray(experimentState.overallStudyHistory) && experimentState.overallStudyHistory.length > 0) {
    return true;
  }
  if (typeof experimentState.questionIndex === 'number' && experimentState.questionIndex > 0) {
    return true;
  }
  if (typeof experimentState.currentUnitNumber === 'number' && experimentState.currentUnitNumber > 0) {
    return true;
  }
  if (typeof experimentState.clusterIndex === 'number' && experimentState.clusterIndex >= 0) {
    return true;
  }
  if (typeof experimentState.shufIndex === 'number' && experimentState.shufIndex >= 0) {
    return true;
  }

  return false;
}
