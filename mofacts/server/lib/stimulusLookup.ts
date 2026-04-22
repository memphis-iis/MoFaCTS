import { repairFormattedStimuliResponsesFromRaw } from '../../common/lib/stimuliResponseRepair';

type StimulusRecord = Record<string, unknown> & {
  stimulusKC?: string | number;
  clusterKC?: string | number;
};

type UnknownRecord = Record<string, unknown>;

type StimulusLookupDeps = {
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    rawCollection: () => { aggregate: (pipeline: unknown[]) => { toArray: () => Promise<any[]> } };
  };
  serverConsole: (...args: unknown[]) => void;
  refreshStimDisplayTypeMap: (deps: any, stimuliSetIds: unknown[] | null) => Promise<unknown>;
  getStimDisplayTypeMapSnapshot: (deps: any) => Promise<unknown>;
  getStimDisplayTypeMapSnapshotVersion: (deps: any) => Promise<unknown>;
};

export function createStimulusLookupHelpers(deps: StimulusLookupDeps) {
  function getStimDisplayTypeMapDeps() {
    return {
      serverConsole: deps.serverConsole,
      findAllTdfStimuliDocs: async () => await deps.Tdfs.find(
        {},
        { fields: { stimuliSetId: 1, stimuli: 1 } }
      ).fetchAsync(),
      findTdfStimuliDocsByStimuliSetIds: async (stimuliSetIds: Array<string | number>) => await deps.Tdfs.find(
        { stimuliSetId: { $in: stimuliSetIds } },
        { fields: { stimuliSetId: 1, stimuli: 1 } }
      ).fetchAsync(),
    };
  }

  async function updateStimDisplayTypeMap(stimuliSetIds: unknown[] | null = null) {
    return await deps.refreshStimDisplayTypeMap(getStimDisplayTypeMapDeps(), stimuliSetIds);
  }

  async function getStimDisplayTypeMap() {
    return await deps.getStimDisplayTypeMapSnapshot(getStimDisplayTypeMapDeps());
  }

  async function getStimDisplayTypeMapVersion() {
    return await deps.getStimDisplayTypeMapSnapshotVersion(getStimDisplayTypeMapDeps());
  }

  async function getStimuliSetById(stimuliSetId: string | number): Promise<StimulusRecord[]> {
    const tdf = await deps.Tdfs.findOneAsync(
      { stimuliSetId: stimuliSetId },
      { fields: { stimuli: 1, rawStimuliFile: 1 } }
    );
    if (!Array.isArray(tdf?.stimuli)) {
      return [];
    }

    const repairedStimuli = repairFormattedStimuliResponsesFromRaw(
      tdf.stimuli as StimulusRecord[],
      tdf.rawStimuliFile
    ) || [];
    return [...repairedStimuli].sort((left, right) => {
      const leftStimulusKC = typeof left?.stimulusKC === 'number' ? left.stimulusKC : Number(left?.stimulusKC ?? 0);
      const rightStimulusKC = typeof right?.stimulusKC === 'number' ? right.stimulusKC : Number(right?.stimulusKC ?? 0);
      return leftStimulusKC - rightStimulusKC;
    });
  }

  async function getStimuliSetByFileName(stimulusFileName: string) {
    return deps.Tdfs.rawCollection().aggregate([
      {
        $match: { stimulusFileName: stimulusFileName }
      }, {
        $unwind: { path: "$stimuli" }
      }, {
        $replaceRoot: { newRoot: "$stimuli" }
      }, {
        $sort: { stimulusKC: 1 }
      }]).toArray();
  }

  async function getStimuliSetIdByFilename(stimFilename: string) {
    const idRet = await deps.Tdfs.findOneAsync({ stimulusFileName: stimFilename });
    const stimuliSetId = idRet ? idRet.stimuliSetId : null;
    return stimuliSetId;
  }

  return {
    getStimDisplayTypeMapDeps,
    updateStimDisplayTypeMap,
    getStimDisplayTypeMap,
    getStimDisplayTypeMapVersion,
    getStimuliSetById,
    getStimuliSetByFileName,
    getStimuliSetIdByFilename,
  };
}
