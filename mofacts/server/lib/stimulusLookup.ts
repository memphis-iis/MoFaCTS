import { repairFormattedStimuliResponsesFromRaw } from '../../common/lib/stimuliResponseRepair';

type StimulusRecord = Record<string, unknown> & {
  stimulusKC?: string | number;
  clusterKC?: string | number;
};

type UnknownRecord = Record<string, unknown>;

export function prepareStimuliSetForRuntime(tdf: any): StimulusRecord[] {
  if (!Array.isArray(tdf?.stimuli)) return [];
  const repairedStimuli = repairFormattedStimuliResponsesFromRaw(
    tdf.stimuli as StimulusRecord[],
    tdf.rawStimuliFile,
  ) || [];
  return [...repairedStimuli].sort((left, right) => {
    const leftStimulusKC = typeof left?.stimulusKC === 'number' ? left.stimulusKC : Number(left?.stimulusKC ?? 0);
    const rightStimulusKC = typeof right?.stimulusKC === 'number' ? right.stimulusKC : Number(right?.stimulusKC ?? 0);
    return leftStimulusKC - rightStimulusKC;
  });
}

type StimulusLookupDeps = {
  Tdfs: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    rawCollection: () => { aggregate: (pipeline: unknown[]) => { toArray: () => Promise<any[]> } };
  };
};

export function createStimulusLookupHelpers(deps: StimulusLookupDeps) {
  async function getStimuliSetById(stimuliSetId: string | number): Promise<StimulusRecord[]> {
    const tdf = await deps.Tdfs.findOneAsync(
      { stimuliSetId: stimuliSetId },
      { fields: { stimuli: 1, rawStimuliFile: 1 } }
    );
    return prepareStimuliSetForRuntime(tdf);
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
    getStimuliSetById,
    getStimuliSetByFileName,
    getStimuliSetIdByFilename,
  };
}
