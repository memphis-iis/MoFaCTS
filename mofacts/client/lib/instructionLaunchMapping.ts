import { createStimClusterMapping, isValidClusterPermutation } from '../../../learning-components/content/tdf/clusterMapping';
import { resolveRawClusters, type RuntimeStimulusSource } from '../../../learning-components/content/tdf/runtimeStimulusInterpretation';
import { hasMeaningfulMappingProgress } from '../views/experiment/svelte/services/mappingProgressPolicy';
import type { ExperimentState } from '../../common/types/experiment';

/** Prepare the durable mapping before an instruction entry can save unit progress. */
export async function prepareInstructionLaunchMapping(params: {
  content: RuntimeStimulusSource['tdfFile'];
  tdfDoc: RuntimeStimulusSource['currentTdfDoc'];
  currentTdfId: unknown;
  experimentState: ExperimentState;
  persist: (patch: ExperimentState) => Promise<unknown>;
}): Promise<number[] | null> {
  // Use the loaded lesson's canonical clusters, never another lesson's Session stimuli.
  // Mapping preparation needs authored positions, not runtime question identities.
  // Runtime interpretation validates those identities once the flat stimuli are loaded.
  const clusters = resolveRawClusters({
    tdfFile: params.content,
    currentTdfDoc: params.tdfDoc,
    currentTdfId: params.currentTdfId,
    currentStimuliSetId: params.tdfDoc?.stimuliSetId,
    currentStimuliSet: [],
  });
  for (const [index, cluster] of clusters.entries()) {
    if (!Array.isArray(cluster.stims)) {
      throw new Error(`Nested stimulus cluster ${index} is missing stims`);
    }
  }
  const stimCount = clusters.length;
  if (stimCount === 0) return null;

  const savedMapping = params.experimentState.clusterMapping;
  if (isValidClusterPermutation(savedMapping, stimCount)) return savedMapping as number[];
  if (hasMeaningfulMappingProgress(params.experimentState)) {
    const missing = !Array.isArray(savedMapping) || savedMapping.length === 0;
    throw new Error(missing
      ? 'The saved question mapping is missing. Please contact the content owner.'
      : 'The saved question mapping contains invalid or missing question references. Please contact the content owner.');
  }

  const setSpec = params.content.tdfs.tutor.setspec || {};
  const mapping = createStimClusterMapping(
    stimCount,
    setSpec.shuffleclusters ? setSpec.shuffleclusters.trim().split(' ') : [''],
    setSpec.swapclusters ? setSpec.swapclusters.trim().split(' ') : [''],
    [],
  );
  if (!isValidClusterPermutation(mapping, stimCount)) {
    throw new Error('[Lesson Launch] Initial question mapping is invalid');
  }
  // A failed write must stop entry; instructions cannot advance on an unsaved shuffle.
  await params.persist({ clusterMapping: mapping });
  return mapping;
}
