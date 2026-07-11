import { Session } from 'meteor/session';
import { clientConsole } from './userSessionHelpers';
import { loadSessionMappingRecord, resolveOriginalClusterIndex } from '../views/experiment/svelte/services/mappingRecordService';
import { createStimClusterMapping as createStimClusterMappingCore } from '../../../learning-components/content/tdf/clusterMapping';
import {
  collectCurrentStimulusAnswers,
  interpretRuntimeStimulusClusters,
  resolveStimulusAnswerDisplayCase,
  type RuntimeStimulusCluster,
  type RuntimeStimulusSource,
} from '../../../learning-components/content/tdf/runtimeStimulusInterpretation';

function findCanonicalTdfDocument(tdfId: string): any | null {
  return (globalThis as any).Tdfs?.findOne?.({ _id: tdfId }) ?? null;
}

export function getNestedStimulusClustersFromTdfFile(source: RuntimeStimulusSource): RuntimeStimulusCluster[] {
  return interpretRuntimeStimulusClusters({ ...source, findTdfDocument: findCanonicalTdfDocument });
}

function currentClusters(): RuntimeStimulusCluster[] {
  return getNestedStimulusClustersFromTdfFile({
    tdfFile: Session.get('currentTdfFile'),
    currentStimuliSet: Session.get('currentStimuliSet'),
    currentStimuliSetId: Session.get('currentStimuliSetId'),
    currentTdfId: Session.get('currentTdfId'),
  });
}

export function getStimCount(): number {
  return currentClusters().length;
}

export function getStimCluster(clusterMappedIndex = 0): RuntimeStimulusCluster {
  const rawIndex = resolveOriginalClusterIndex(clusterMappedIndex, loadSessionMappingRecord());
  if (typeof rawIndex !== 'number') {
    clientConsole(1, '[Mapping] Missing/invalid mapping record during cluster retrieval', { clusterMappedIndex });
    return { shufIndex: clusterMappedIndex, clusterIndex: -1, stims: [] };
  }
  const cluster = currentClusters()[rawIndex];
  return cluster ? { ...cluster, shufIndex: clusterMappedIndex } : {
    shufIndex: clusterMappedIndex,
    clusterIndex: rawIndex,
    stims: [],
  };
}

export function createStimClusterMapping(
  stimCount: number,
  shuffleClusters: unknown,
  swapClusters: unknown,
  startMapping: number[] | null | undefined,
): number[] {
  return createStimClusterMappingCore(stimCount, shuffleClusters, swapClusters, startMapping);
}

export function getAllCurrentStimAnswers(removeExcludedPhraseHints = false): string[] {
  let answers = collectCurrentStimulusAnswers(Session.get('currentStimuliSet'));
  if (!removeExcludedPhraseHints) return answers;
  const currentCluster = getStimCluster(Number(Session.get('clusterIndex')) || 0);
  const currentStim = currentCluster.stims[Number(Session.get('whichStim')) || 0];
  const exclusions = String(currentStim?.speechHintExclusionList || '').split(',');
  answers = answers.filter((answer) => !exclusions.includes(answer));
  return answers;
}

export function getStimAnswerDisplayCase(userAnswer: string): string {
  return resolveStimulusAnswerDisplayCase(userAnswer, Session.get('currentStimuliSet'));
}
