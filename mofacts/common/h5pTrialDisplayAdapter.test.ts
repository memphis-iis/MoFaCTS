import { expect } from 'chai';
import {
  H5P_TRIAL_DISPLAY_TYPE,
  h5pTrialDisplayAdapter,
  h5pTrialDisplayComponentManifest,
} from './h5pTrialDisplayAdapter';
import { registerLearningComponent } from '../../learning-components/runtime/ComponentManifest';
import {
  getTrialDisplayAdapter,
  registerTrialDisplayAdapter,
  resetTrialDisplayAdapterRegistryForTests,
} from '../../learning-components/runtime/TrialDisplayAdapterRegistry';
import { registerDefaultTrialDisplayComponents } from './defaultTrialDisplayComponents';

describe('H5P trial display adapter', function() {
  beforeEach(function() {
    resetTrialDisplayAdapterRegistryForTests();
  });

  it('normalizes H5P display and result payloads through the adapter boundary', function() {
    const display = h5pTrialDisplayAdapter.normalizeDisplay({
      text: 'Prompt',
      h5p: {
        sourceType: 'self-hosted',
        contentId: ' content-1 ',
        packageAssetId: ' activity.h5p ',
        library: ' H5P.MultiChoice 1.16 ',
        completionPolicy: 'xapi-completed',
        scorePolicy: 'correct-if-passed',
      },
    });

    expect(display.h5p).to.deep.equal({
      sourceType: 'self-hosted',
      contentId: 'content-1',
      packageAssetId: 'activity.h5p',
      library: 'H5P.MultiChoice 1.16',
      completionPolicy: 'xapi-completed',
      scorePolicy: 'correct-if-passed',
    });

    const result = h5pTrialDisplayAdapter.normalizeResult?.({
      contentId: 'content-1',
      batchId: 'batch-1',
      completed: true,
      events: [{ correct: true }],
    }, display);

    expect(result?.contentId).to.equal('content-1');
    expect(result?.events).to.deep.equal([{ correct: true }]);
  });

  it('fails clearly when H5P display or result payloads do not satisfy the contract', function() {
    expect(() => h5pTrialDisplayAdapter.normalizeDisplay({
      h5p: {
        sourceType: 'self-hosted',
        contentId: 'content-1',
      },
    })).to.throw('Self-hosted H5P requires packageAssetId');

    const display = h5pTrialDisplayAdapter.normalizeDisplay({
      h5p: {
        sourceType: 'self-hosted',
        contentId: 'content-1',
        packageAssetId: 'activity.h5p',
        library: 'H5P.MultiChoice 1.16',
        completionPolicy: 'xapi-completed',
        scorePolicy: 'record-only',
      },
    });

    expect(() => h5pTrialDisplayAdapter.normalizeResult?.({
      contentId: 'other-content',
      batchId: 'batch-1',
      completed: true,
      events: [],
    }, display)).to.throw('H5P trial result contentId does not match current display');
  });

  it('registers H5P through the learning component manifest', function() {
    registerLearningComponent(h5pTrialDisplayComponentManifest, {
      capabilities: new Set(['media', 'history']),
      registerUnitEngine() {},
      registerUnitEngineWithDeps() {},
      registerTrialDisplayAdapter,
    });

    expect(getTrialDisplayAdapter(H5P_TRIAL_DISPLAY_TYPE)).to.equal(h5pTrialDisplayAdapter);
  });

  it('registers default trial display components idempotently without replacing existing adapters', function() {
    registerDefaultTrialDisplayComponents();
    registerDefaultTrialDisplayComponents();

    expect(getTrialDisplayAdapter(H5P_TRIAL_DISPLAY_TYPE)).to.equal(h5pTrialDisplayAdapter);
  });

  it('fails clearly when another adapter already owns the default H5P display type', function() {
    registerTrialDisplayAdapter({
      id: 'custom.h5p',
      displayType: H5P_TRIAL_DISPLAY_TYPE,
      requiredCapabilities: [],
      ownsInteraction: () => true,
      normalizeDisplay: (display) => display,
    });

    expect(() => registerDefaultTrialDisplayComponents())
      .to.throw('adapter "custom.h5p" is already registered');
  });
});
