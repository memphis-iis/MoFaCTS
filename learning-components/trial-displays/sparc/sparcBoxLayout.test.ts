import assert from 'node:assert/strict';
import { buildSparcBoxedNodeGroups } from './sparcBoxLayout';
import type { SparcTrialDisplay } from './SparcTrialDisplayAdapter';

describe('sparcBoxLayout', function() {
  it('groups top-level nodes into authored layout boxes by placement region and order', function() {
    const display: SparcTrialDisplay = {
      layout: {
        zones: [
          { id: 'readingBox', role: 'reading' },
          { id: 'activityBox', role: 'activity' },
        ],
      },
      nodes: [{
        id: 'problem',
        placement: { region: 'activityBox', order: 2 },
      }, {
        id: 'intro',
        placement: { region: 'readingBox', order: 1 },
      }, {
        id: 'prompt',
        placement: { region: 'activityBox', order: 1 },
      }],
    };

    const groups = buildSparcBoxedNodeGroups(display);

    assert.deepEqual(groups.map((group) => group.box.id), ['readingBox', 'activityBox']);
    assert.deepEqual(groups.map((group) => group.nodes.map((node) => (node as { id: string }).id)), [
      ['intro'],
      ['prompt', 'problem'],
    ]);
  });

  it('keeps unordered progressive nodes after authored ordered nodes in the same box', function() {
    const display: SparcTrialDisplay = {
      layout: {
        zones: [
          { id: 'chapterFlowBox', role: 'reading' },
        ],
      },
      nodes: [{
        id: 'intro',
        placement: { region: 'chapterFlowBox', order: 1 },
      }, {
        id: 'multiple-choice',
        placement: { region: 'chapterFlowBox', order: 2 },
      }, {
        id: 'remediation',
        placement: { region: 'chapterFlowBox' },
      }, {
        id: 'challenge',
        placement: { region: 'chapterFlowBox' },
      }],
    };

    const groups = buildSparcBoxedNodeGroups(display);

    assert.deepEqual(groups[0]?.nodes.map((node) => (node as { id: string }).id), [
      'intro',
      'multiple-choice',
      'remediation',
      'challenge',
    ]);
  });

  it('leaves document-flow displays without authored zones unboxed', function() {
    const display: SparcTrialDisplay = {
      nodes: [{ id: 'node-1' }],
    };

    assert.deepEqual(buildSparcBoxedNodeGroups(display), []);
  });
});
