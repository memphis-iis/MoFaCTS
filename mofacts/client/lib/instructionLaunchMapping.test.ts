import { expect } from 'chai';
import { prepareInstructionLaunchMapping } from './instructionLaunchMapping';
import { resolveInstructionContinuePolicy } from '../views/experiment/instructionContinuePolicy';
import { hasMeaningfulMappingProgress } from '../views/experiment/svelte/services/mappingProgressPolicy';
import { isValidClusterPermutation } from '../../../learning-components/content/tdf/clusterMapping';
import type { ExperimentState } from '../../common/types/experiment';

function lesson(clusterCount = 1, stimuliPerCluster = 1) {
  return {
    content: { tdfs: { tutor: { setspec: { shuffleclusters: '0', swapclusters: '' } } } },
    tdfDoc: {
      stimuliSetId: 'test-stimuli',
      rawStimuliFile: { setspec: { clusters: Array.from({ length: clusterCount }, (_, clusterIndex) => ({
        clusterKC: `cluster-${clusterIndex}`,
        stims: Array.from({ length: stimuliPerCluster }, () => ({ response: { correctResponse: 'answer' } })),
      })) } },
    },
    currentTdfId: 'test-lesson',
  };
}

describe('instructionLaunchMapping', function() {
  it('counts authored clusters without requiring optional runtime identities before stimuli load', async function() {
    const params = lesson(3);
    for (const cluster of params.tdfDoc.rawStimuliFile.setspec.clusters) {
      delete (cluster as { clusterKC?: string }).clusterKC;
    }
    const mapping = await prepareInstructionLaunchMapping({
      ...params, experimentState: {}, persist: async () => undefined,
    });
    expect(isValidClusterPermutation(mapping, 3)).to.equal(true);
  });

  it('still rejects malformed authored clusters before writing a mapping', async function() {
    const params = lesson();
    delete (params.tdfDoc.rawStimuliFile.setspec.clusters[0] as { stims?: unknown }).stims;
    let writes = 0;
    let caught: unknown;
    try {
      await prepareInstructionLaunchMapping({ ...params, experimentState: {}, persist: async () => { writes++; } });
    } catch (error) { caught = error; }
    expect((caught as Error).message).to.include('cluster 0 is missing stims');
    expect(writes).to.equal(0);
  });
  it('saves the real cluster mapping before instruction-only advancement and reuses it afterward', async function() {
    let state: ExperimentState = {};
    let writes = 0;
    const params = { ...lesson(1, 3), experimentState: state, persist: async (patch: ExperimentState) => {
      writes += 1;
      state = { ...state, ...patch };
    } };
    const mapping = await prepareInstructionLaunchMapping(params);
    expect(mapping).to.deep.equal([0]); // Mapping is per cluster, not per individual stimulus.
    expect(state.clusterMapping).to.equal(mapping);
    const continuation = resolveInstructionContinuePolicy({ unitType: 'instruction-only', currentUnitNumber: 0, unitCount: 3 });
    state = { ...state, ...continuation.experimentStatePatch };
    expect(hasMeaningfulMappingProgress(state)).to.equal(true);
    expect(await prepareInstructionLaunchMapping({ ...params, experimentState: state })).to.equal(mapping);
    expect(writes).to.equal(1);
  });

  it('does not finish preparing entry until the durable write finishes', async function() {
    let finishWrite!: () => void;
    const persisted = new Promise<void>((resolve) => { finishWrite = resolve; });
    let ready = false;
    const preparation = prepareInstructionLaunchMapping({ ...lesson(), experimentState: {}, persist: () => persisted })
      .then(() => { ready = true; });
    await Promise.resolve();
    expect(ready).to.equal(false);
    finishWrite();
    await preparation;
    expect(ready).to.equal(true);
  });

  it('propagates a persistence failure instead of permitting instruction entry', async function() {
    const error = new Error('write rejected');
    let caught: unknown;
    try {
      await prepareInstructionLaunchMapping({ ...lesson(), experimentState: {}, persist: async () => { throw error; } });
    } catch (failure) { caught = failure; }
    expect(caught).to.equal(error);
  });

  it('preserves a saved permutation on reload even after shuffle settings change', async function() {
    const mapping = [2, 0, 1];
    let writes = 0;
    expect(await prepareInstructionLaunchMapping({ ...lesson(3), experimentState: { clusterMapping: mapping },
      persist: async () => { writes += 1; },
    })).to.equal(mapping);
    expect(writes).to.equal(0);
  });

  it('uses the configured shuffle/swap behavior for a new attempt', async function() {
    const params = lesson(6);
    params.content.tdfs.tutor.setspec = { shuffleclusters: '1-3', swapclusters: '0-1 2-3' };
    const mapping = await prepareInstructionLaunchMapping({ ...params, experimentState: {}, persist: async () => {} });
    expect(isValidClusterPermutation(mapping, 6)).to.equal(true);
    expect(mapping!.slice(4)).to.deep.equal([4, 5]);
  });

  it('keeps every meaningful-progress guard for missing or invalid mappings', async function() {
    for (const progress of [{ currentUnitNumber: 1, lastUnitCompleted: 0 }, { questionIndex: 0 }, { schedule: {} }, { overallStudyHistory: [{}] }]) {
      for (const mapping of [undefined, [], [0, 0], [0], [0, 1.5]]) {
        let writes = 0;
        let caught: unknown;
        try {
          await prepareInstructionLaunchMapping({ ...lesson(2), experimentState: { ...progress, clusterMapping: mapping },
            persist: async () => { writes += 1; },
          });
        } catch (error) { caught = error; }
        expect(caught).to.be.instanceOf(Error);
        expect((caught as Error).message).to.include('saved question mapping');
        expect(writes).to.equal(0);
      }
    }
  });

  it('requires canonical lesson clusters instead of inventing a mapping', async function() {
    const params = lesson();
    delete (params.tdfDoc as any).rawStimuliFile;
    let writes = 0;
    let caught: unknown;
    try {
      await prepareInstructionLaunchMapping({ ...params, experimentState: {}, persist: async () => { writes += 1; } });
    } catch (error) { caught = error; }
    expect((caught as Error).message).to.include('missing rawStimuliFile.setspec.clusters');
    expect(writes).to.equal(0);
  });

  it('does not save a mapping for a canonical lesson with no question clusters', async function() {
    let writes = 0;
    expect(await prepareInstructionLaunchMapping({ ...lesson(0), experimentState: {}, persist: async () => { writes += 1; } })).to.equal(null);
    expect(writes).to.equal(0);
  });
});
