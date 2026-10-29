import { Session } from 'meteor/session';
import { EJSON } from 'meteor/ejson';
import { Tracker } from 'meteor/tracker';
import { loadSessionMappingRecord, resolveOriginalClusterIndex, validateMappingRecord } from '../views/experiment/svelte/services/mappingRecordService';
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

/**
 * Session reads clone their data. Own one detached reactive snapshot instead of
 * cloning and interpreting the whole deck in every engine cluster lookup.
 * onInvalidate evicts immediately, including before the next Tracker flush.
 */
function createReactiveSnapshot<T>(read: () => T, onClear?: () => void) {
  const dependency = new Tracker.Dependency();
  let snapshot: { value: T; computation: Tracker.Computation } | null = null;

  function clear(): void {
    const previous = snapshot;
    snapshot = null;
    if (!previous) return;
    previous.computation.stop();
    dependency.changed();
    onClear?.();
  }

  return {
    clear,
    get(): T {
      dependency.depend();
      if (snapshot) return snapshot.value;
      const building: { computation?: Tracker.Computation } = {};
      let value!: T;
      try {
        const computation = Tracker.nonreactive(() => Tracker.autorun(current => {
          building.computation = current;
          current.onInvalidate(() => {
            if (snapshot?.computation === current) clear();
          });
          value = read();
        }));
        if (computation.invalidated || computation.stopped) {
          computation.stop();
          throw new Error('[Runtime Stimuli] Source changed while its snapshot was being read');
        }
        snapshot = { value, computation };
        return value;
      } catch (error) {
        building.computation?.stop();
        throw error;
      }
    },
  };
}

const currentMapping = createReactiveSnapshot(() => ({
  record: loadSessionMappingRecord(),
  validatedClusters: null as RuntimeStimulusCluster[] | null,
}));

const currentClusters = createReactiveSnapshot(
  () => getNestedStimulusClustersFromTdfFile({
    tdfFile: Session.get('currentTdfFile'),
    currentStimuliSet: Session.get('currentStimuliSet'),
    currentStimuliSetId: Session.get('currentStimuliSetId'),
    currentTdfId: Session.get('currentTdfId'),
    currentTdfDoc: Session.get('currentTdfDoc'),
  }),
  () => currentMapping.clear(),
);

export function clearRuntimeStimulusCache(): void {
  currentClusters.clear();
  currentMapping.clear();
}

function invalidClusterState(message: string): never {
  clearRuntimeStimulusCache();
  throw new Error(message);
}

export function getStimCount(): number {
  return currentClusters.get().length;
}

export function getStimCluster(clusterMappedIndex = 0): RuntimeStimulusCluster {
  const mapping = currentMapping.get();
  const mappingRecord = mapping.record;
  if (!mappingRecord) {
    invalidClusterState('[Mapping] Cluster retrieval requires an initialized cluster mapping');
  }
  if (!Number.isSafeInteger(clusterMappedIndex) || clusterMappedIndex < 0 || clusterMappedIndex >= mappingRecord.mappingTable.length) {
    throw new Error('[Mapping] Requested shuffled cluster index is outside the cluster mapping');
  }
  const clusters = currentClusters.get();
  if (mapping.validatedClusters !== clusters) {
    if (!validateMappingRecord(mapping.record, clusters.length)) {
      invalidClusterState('[Mapping] Invalid cluster mapping for the current stimulus clusters');
    }
    mapping.validatedClusters = clusters;
  }
  const rawIndex = resolveOriginalClusterIndex(clusterMappedIndex, mappingRecord);
  if (rawIndex === null) {
    invalidClusterState('[Mapping] Cluster mapping does not resolve the requested shuffled cluster index');
  }
  const cluster = clusters[rawIndex];
  if (!cluster) {
    invalidClusterState('[Mapping] Cluster mapping references a missing raw stimulus cluster');
  }
  return { ...EJSON.clone(cluster), shufIndex: clusterMappedIndex };
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
