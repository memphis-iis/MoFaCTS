export function parseUnitClusterList(clusterList: any): number[] {
  const unitClusterList: number[] = [];
  clusterList.split(' ').forEach(
    (value: any) => {
      if (value.includes('-')) {
        const [start, end] = value.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          unitClusterList.push(i);
        }
      } else {
        unitClusterList.push(Number(value));
      }
    },
  );
  return unitClusterList;
}

export interface ResolveModelClusterListParams {
  readonly currentTdfFile: any;
  readonly currentUnitNumber: any;
  readonly subTdfIndex: any;
  readonly isVideoSession: boolean;
  readonly curUnit: any;
  readonly currentSessionUnit: any;
  readonly extractDelimFields: (source: any, target: any[]) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export function resolveModelClusterList(params: ResolveModelClusterListParams): any[] {
  const isMultiTdf = params.currentTdfFile.isMultiTdf;
  const clusterList: any = [];

  if (isMultiTdf) {
    // NOTE: We are currently assuming that multiTdfs will have only three units:
    // an instruction unit, an assessment session with exactly one question which is the last
    // item in the stim file, and a unit with all clusters specified in the generated subtdfs array
    if (params.currentUnitNumber == 2) {
      if (typeof(params.subTdfIndex) == 'undefined') {
        params.log(1, 'assuming we are in studentReporting, therefore ignoring the clusterlists');
      } else {
        const unitClusterList = params.currentTdfFile.subTdfs[params.subTdfIndex].clusterList;
        params.extractDelimFields(unitClusterList, clusterList);
      }
    } else if (params.currentUnitNumber > 2) {
      throw new Error('We shouldn\'t ever get here, dynamic tdf cluster list error');
    }
  } else {
    params.log(1, 'setupclusterlist:', params.curUnit, params.currentSessionUnit);
    let unitClusterList = "";
    if (params.isVideoSession) {
      if (params.curUnit && params.curUnit.videosession && params.curUnit.videosession.questions)
        unitClusterList = params.curUnit.videosession.questions;
    } else {
      if (params.curUnit && params.curUnit.learningsession && params.curUnit.learningsession.clusterlist)
        unitClusterList = params.curUnit.learningsession.clusterlist.trim();
    }
    params.extractDelimFields(unitClusterList, clusterList);
  }

  return clusterList;
}

export function applyClusterListAvailability(
  cards: any[],
  clusterList: any[],
  rangeVal: (source: any) => any[],
  legacyInt: (source: any) => number,
): void {
  for (let i = 0; i < clusterList.length; ++i) {
    const nums = rangeVal(clusterList[i]);
    for (let j = 0; j < nums.length; ++j) {
      cards[legacyInt(nums[j])].canUse = true;
    }
  }
}
