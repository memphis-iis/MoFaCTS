import assert from 'node:assert/strict';
import { sparcTrialDisplayAdapter } from './SparcTrialDisplayAdapter';

describe('SparcTrialDisplayAdapter progress reporter', function() {
  it('normalizes sidebar progress reporter configuration', function() {
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      nodes: [],
      progressReporter: {
        placement: 'sidebar',
        nodeId: 'progress-node',
        label: 'Progress',
        showReferenceLines: true,
        compact: false,
        ignored: 'field',
      },
    });

    assert.deepEqual(display.progressReporter, {
      placement: 'sidebar',
      nodeId: 'progress-node',
      label: 'Progress',
      showReferenceLines: true,
      compact: false,
    });
  });

  it('rejects invalid progress reporter placement', function() {
    assert.throws(
      () => sparcTrialDisplayAdapter.normalizeDisplay({
        type: 'sparc',
        nodes: [],
        progressReporter: {
          placement: 'skillRail',
        },
      }),
      /SPARC progressReporter\.placement must be "document" or "sidebar"/,
    );
  });
});

