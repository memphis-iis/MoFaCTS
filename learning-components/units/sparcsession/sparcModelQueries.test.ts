import assert from 'node:assert/strict';
import {
  evaluateSparcModelQuery,
  toModelPracticeStateQuery,
} from './sparcModelQueries';
import type { SparcModelQuery } from './sparcSessionContracts';

const query: SparcModelQuery = {
  target: {
    stimuliSetId: 'stim-set-1',
    stimulusKC: 'kc-1',
    clusterKC: 'cluster-1',
    KCId: 'kc-1',
    KCDefault: 'kc-1',
    KCCluster: 'cluster-1',
    sparcPageKey: 'doc-1',
    sparcNodeId: 'widget-1',
    response: {
      responseKC: 'response-kc-1',
      responseKey: 'answer',
    },
  },
  metric: 'priorCorrect',
};

describe('sparcModelQueries', function() {
  it('converts SPARC model queries to generic model-practice state queries', function() {
    assert.deepEqual(toModelPracticeStateQuery(query), {
      target: query.target,
      metric: 'priorCorrect',
    });
  });

  it('evaluates through an injected model-query capability', function() {
    const seenQueries: unknown[] = [];
    const result = evaluateSparcModelQuery({
      queryModelPracticeState(genericQuery) {
        seenQueries.push(genericQuery);
        return 7;
      },
    }, query);

    assert.equal(result, 7);
    assert.deepEqual(seenQueries, [{
      target: query.target,
      metric: 'priorCorrect',
    }]);
  });
});
