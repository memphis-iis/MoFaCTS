import { expect } from 'chai';
import {
  countStimClustersForPolicy,
  hasMeaningfulProgressSignal,
  isBreakingMappingChange,
} from './mappingPolicyClassifier';
import { LAST_ACTION } from '../../common/constants/resumeActions';

describe('mappingPolicyClassifier', function() {
  it('counts unique clusters for policy signature input', function() {
    const count = countStimClustersForPolicy([
      { clusterKC: 100 },
      { clusterKC: 100 },
      { clusterKC: 200 },
    ]);
    expect(count).to.equal(2);
  });

  it('detects breaking mapping change when topology-relevant setSpec changes', function() {
    const baseTdf = {
      tdfs: {
        tutor: {
          setspec: { shuffleclusters: '0-1', swapclusters: '' },
          unit: [],
        },
      },
    };
    const changedTdf = {
      tdfs: {
        tutor: {
          setspec: { shuffleclusters: '0-2', swapclusters: '' },
          unit: [],
        },
      },
    };

    const breaking = isBreakingMappingChange({
      prevTdfFile: baseTdf,
      nextTdfFile: changedTdf,
      prevStimuliSet: [{ clusterKC: 100 }, { clusterKC: 200 }, { clusterKC: 300 }],
      nextStimuliSet: [{ clusterKC: 100 }, { clusterKC: 200 }, { clusterKC: 300 }],
      rootTdfId: 'tdf-1',
      conditionTdfId: null,
      stimuliSetId: 'stim-1',
    });

    expect(breaking).to.equal(true);
  });

  it('detects breaking change when cluster structure changes under same stimulus filename scenario', function() {
    const tdf = {
      tdfs: {
        tutor: {
          setspec: { stimulusfile: 'lesson.csv', shuffleclusters: '', swapclusters: '' },
          unit: [],
        },
      },
    };

    const breaking = isBreakingMappingChange({
      prevTdfFile: tdf,
      nextTdfFile: tdf,
      prevStimuliSet: [{ clusterKC: 100 }, { clusterKC: 200 }],
      nextStimuliSet: [{ clusterKC: 100 }, { clusterKC: 200 }, { clusterKC: 300 }],
      rootTdfId: 'tdf-1',
      conditionTdfId: null,
      stimuliSetId: 'stim-1',
    });

    expect(breaking).to.equal(true);
  });

  it('does not detect breaking change when content is unchanged', function() {
    const tdf = {
      tdfs: {
        tutor: {
          setspec: { stimulusfile: 'lesson.csv', shuffleclusters: '', swapclusters: '' },
          unit: [],
        },
      },
    };

    const nonBreaking = isBreakingMappingChange({
      prevTdfFile: tdf,
      nextTdfFile: tdf,
      prevStimuliSet: [{ clusterKC: 100 }, { clusterKC: 200 }],
      nextStimuliSet: [{ clusterKC: 100 }, { clusterKC: 200 }],
      rootTdfId: 'tdf-1',
      conditionTdfId: null,
      stimuliSetId: 'stim-1',
    });

    expect(nonBreaking).to.equal(false);
  });

  it('detects breaking change when unit topology schedule references change', function() {
    const prevTdf = {
      tdfs: {
        tutor: {
          setspec: { shuffleclusters: '', swapclusters: '' },
          unit: [{ unitname: 'unit-1', assessmentsession: { clusterlist: '0,1' } }],
        },
      },
    };
    const nextTdf = {
      tdfs: {
        tutor: {
          setspec: { shuffleclusters: '', swapclusters: '' },
          unit: [{ unitname: 'unit-1', assessmentsession: { clusterlist: '0,1,2' } }],
        },
      },
    };
    const stimuli = [{ clusterKC: 100 }, { clusterKC: 200 }, { clusterKC: 300 }];

    const breaking = isBreakingMappingChange({
      prevTdfFile: prevTdf,
      nextTdfFile: nextTdf,
      prevStimuliSet: stimuli,
      nextStimuliSet: stimuli,
      rootTdfId: 'tdf-1',
      conditionTdfId: null,
      stimuliSetId: 'stim-1',
    });

    expect(breaking).to.equal(true);
  });

  it('does not flag non-breaking text-only TDF change as breaking', function() {
    const prevTdf = {
      tdfs: {
        tutor: {
          setspec: { shuffleclusters: '0-1', swapclusters: '' },
          unit: [{ unitname: 'unit-1' }],
        },
      },
    };
    const nextTdf = {
      tdfs: {
        tutor: {
          setspec: { shuffleclusters: '0-1', swapclusters: '' },
          unit: [{ unitname: 'unit-1', instructionText: 'Updated instructions' }],
        },
      },
    };
    const stimuli = [{ clusterKC: 100 }, { clusterKC: 200 }];

    const nonBreaking = isBreakingMappingChange({
      prevTdfFile: prevTdf,
      nextTdfFile: nextTdf,
      prevStimuliSet: stimuli,
      nextStimuliSet: stimuli,
      rootTdfId: 'tdf-1',
      conditionTdfId: null,
      stimuliSetId: 'stim-1',
    });

    expect(nonBreaking).to.equal(false);
  });

  it('detects meaningful progress signals from experiment state evidence', function() {
    expect(hasMeaningfulProgressSignal({})).to.equal(false);
    expect(hasMeaningfulProgressSignal({ lastAction: LAST_ACTION.CARD_DISPLAYED })).to.equal(true);
    expect(hasMeaningfulProgressSignal({ overallOutcomeHistory: [{ a: 1 }] })).to.equal(true);
  });
});
