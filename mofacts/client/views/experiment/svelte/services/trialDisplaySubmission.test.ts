import { expect } from 'chai';
import type { H5PTrialResult } from '../../../../../common/types';
import type { SparcTrialResult } from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
import {
  createTrialDisplaySubmissionController,
  type TrialDisplaySubmitEvent,
} from './trialDisplaySubmission';

function createH5PResult(overrides: Partial<H5PTrialResult> = {}): H5PTrialResult {
  return {
    contentId: 'content-a',
    batchId: 'batch-a',
    completed: true,
    events: [],
    ...overrides,
  };
}

function createSparcResult(overrides: Partial<SparcTrialResult> = {}): SparcTrialResult {
  return {
    submittedNodes: {
      'node-a': 'value-a',
    },
    timestamp: 1234,
    triggeredBy: 'submit',
    ...overrides,
  };
}

function createHarness(options: {
  h5pOwnsResponse?: boolean;
  sparcOwnsResponse?: boolean;
  h5pResult?: H5PTrialResult | null;
  sparcResult?: SparcTrialResult | null;
  timestamp?: number;
} = {}) {
  let display: Record<string, unknown> | undefined = { id: 'display-a' };
  let h5pOwnsResponse = options.h5pOwnsResponse !== false;
  let sparcOwnsResponse = options.sparcOwnsResponse !== false;
  const submitted: TrialDisplaySubmitEvent[] = [];
  const resolvedDisplays: Array<Record<string, unknown> | undefined> = [];
  const controller = createTrialDisplaySubmissionController({
    getCurrentDisplay: () => display,
    h5pOwnsResponse: () => h5pOwnsResponse,
    sparcOwnsResponse: () => sparcOwnsResponse,
    resolveH5PResult: (currentDisplay) => {
      resolvedDisplays.push(currentDisplay);
      return options.h5pResult === undefined ? createH5PResult() : options.h5pResult;
    },
    resolveSparcResult: (currentDisplay) => {
      resolvedDisplays.push(currentDisplay);
      return options.sparcResult === undefined ? createSparcResult() : options.sparcResult;
    },
    now: () => options.timestamp ?? 5678,
    submit: (event) => submitted.push(event),
  });
  controller.resetForDisplay(display);

  return {
    controller,
    resolvedDisplays,
    submitted,
    setDisplay: (value: Record<string, unknown> | undefined) => {
      display = value;
    },
    setH5POwnership: (value: boolean) => {
      h5pOwnsResponse = value;
    },
    setSparcOwnership: (value: boolean) => {
      sparcOwnsResponse = value;
    },
  };
}

describe('trial display submission controller', function() {
  it('ignores H5P results when the current display does not own the response', function() {
    const harness = createHarness({ h5pOwnsResponse: false });

    harness.controller.handleH5PResult({ batchId: 'batch-a' });

    expect(harness.submitted).to.deep.equal([]);
    expect(harness.resolvedDisplays).to.deep.equal([]);
  });

  it('submits the first H5P result once with the normalized completion answer', function() {
    const h5pResult = createH5PResult({ completed: false, batchId: 'batch-b' });
    const harness = createHarness({ h5pResult, timestamp: 9001 });

    harness.controller.handleH5PResult({ batchId: 'batch-b' });
    harness.controller.handleH5PResult({ batchId: 'batch-b' });

    expect(harness.submitted).to.deep.equal([{
      type: 'SUBMIT',
      userAnswer: '__H5P_INCOMPLETE__',
      timestamp: 9001,
      source: 'h5p',
      h5pResult,
    }]);
  });

  it('fails clearly when an owned H5P response cannot be resolved', function() {
    const harness = createHarness({ h5pResult: null });

    expect(() => harness.controller.handleH5PResult({}))
      .to.throw('[CardScreen] H5P result received for non-H5P display');
  });

  it('ignores SPARC submissions when the current display does not own the response', function() {
    const harness = createHarness({ sparcOwnsResponse: false });

    harness.controller.handleSparcSubmit({ submittedValue: 'value-a' });

    expect(harness.submitted).to.deep.equal([]);
    expect(harness.resolvedDisplays).to.deep.equal([]);
  });

  it('submits SPARC results and suppresses duplicate timestamp/source pairs', function() {
    const sparcResult = createSparcResult({ timestamp: 2222, triggeredBy: 'button' });
    const harness = createHarness({ sparcResult });

    harness.controller.handleSparcSubmit({ submittedValue: 'value-a' });
    harness.controller.handleSparcSubmit({ submittedValue: 'value-a' });

    expect(harness.submitted).to.deep.equal([{
      type: 'SUBMIT',
      userAnswer: '__SPARC_COMPLETED__',
      timestamp: 2222,
      source: 'sparc',
      sparcResult,
    }]);
  });

  it('fails clearly when an owned SPARC response cannot be resolved', function() {
    const harness = createHarness({ sparcResult: null });

    expect(() => harness.controller.handleSparcSubmit({}))
      .to.throw('[CardScreen] SPARC result received for non-SPARC display');
  });

  it('allows H5P and SPARC submissions again after the display changes', function() {
    const harness = createHarness();

    harness.controller.handleH5PResult({ batchId: 'batch-a' });
    harness.controller.handleSparcSubmit({ submittedValue: 'value-a' });
    harness.setDisplay({ id: 'display-b' });
    harness.controller.resetForDisplay({ id: 'display-b' });
    harness.controller.handleH5PResult({ batchId: 'batch-a' });
    harness.controller.handleSparcSubmit({ submittedValue: 'value-a' });

    expect(harness.submitted.map((event) => event.source)).to.deep.equal([
      'h5p',
      'sparc',
      'h5p',
      'sparc',
    ]);
  });
});
