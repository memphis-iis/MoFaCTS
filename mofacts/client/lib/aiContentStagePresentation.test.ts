import { expect } from 'chai';
import type { AiContentPipelineRun } from '../../common/aiContentContract';
import { aiContentPipelineProgressMessage } from './aiContentStagePresentation';

function runWithTrace(trace: AiContentPipelineRun['traces'][number]): AiContentPipelineRun {
  return {
    runId: 'run-1',
    revision: 1,
    request: { runId: 'run-1', revision: 1, notes: 'Create state maps.', mode: 'learning' },
    listCandidates: [],
    listRegions: [],
    entries: [{
      itemId: 'state-3',
      sourcePageId: 100,
      sourcePageTitle: 'List of states',
      sourcePageUrl: 'https://en.wikipedia.org/?curid=100',
      regionId: 'region-1',
      sourceLocator: 'States / row 3',
      displayedResponse: 'Arizona',
      normalizedResponseKey: 'arizona',
      directImageCandidateIds: [],
      detailLinkCandidateIds: [],
    }],
    resolutions: [],
    traces: [trace],
    startedAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:01.000Z',
  };
}

describe('AI Content stage presentation', function() {
  it('shows the live step, status, and authoritative item context', function() {
    const message = aiContentPipelineProgressMessage(runWithTrace({
      traceId: 'trace-1',
      stage: 'hydrate-detail-images',
      status: 'running',
      itemId: 'state-3',
      startedAt: '2026-08-15T00:00:01.000Z',
      input: {},
    }));

    expect(message).to.equal('Step 1 — In progress: Resolve item-page image references through Wikimedia. Item 1 of 1: Arizona.');
  });

  it('describes a completed batch stage without inventing item progress', function() {
    const message = aiContentPipelineProgressMessage(runWithTrace({
      traceId: 'trace-1',
      stage: 'resolve-pattern-file-titles',
      status: 'succeeded',
      startedAt: '2026-08-15T00:00:01.000Z',
      completedAt: '2026-08-15T00:00:02.000Z',
      input: {},
      output: {},
    }));

    expect(message).to.equal('Step 1 — Completed: Resolve the predicted image filenames through Wikimedia.');
  });
});
