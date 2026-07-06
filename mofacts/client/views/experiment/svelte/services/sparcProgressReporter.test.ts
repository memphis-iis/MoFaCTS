import { expect } from 'chai';
import {
  resolveSparcProgressReporterState,
  sparcDisplayHasDocumentProgress,
} from './sparcProgressReporter';

describe('sparcProgressReporter', function() {
  it('treats authored learning-progress nodes as document placement', function() {
    const state = resolveSparcProgressReporterState({
      deliverySettings: { optimalThreshold: 0.8 },
      display: {
        nodes: [{
          id: 'group',
          nodeType: 'group',
          children: [{
            id: 'progress',
            nodeType: 'atomic',
            atomType: 'learning-progress',
          }],
        }],
      },
    });

    expect(state.isSparcDisplay).to.equal(true);
    expect(state.requestsDocument).to.equal(true);
    expect(state.requestsSidebar).to.equal(false);
    expect(state.effectiveProgressDisabled).to.equal(true);
    expect(state.deliverySettings.disableProgressReport).to.equal(true);
  });

  it('allows explicit sidebar placement when delivery settings permit progress', function() {
    const state = resolveSparcProgressReporterState({
      deliverySettings: { optimalThreshold: 0.8 },
      display: {
        nodes: [],
        progressReporter: {
          placement: 'sidebar',
        },
      },
    });

    expect(state.requestsSidebar).to.equal(true);
    expect(state.requestsDocument).to.equal(false);
    expect(state.effectiveProgressDisabled).to.equal(false);
    expect(state.deliverySettings).to.deep.equal({ optimalThreshold: 0.8 });
  });

  it('keeps disableProgressReport as a hard off switch for sidebar placement', function() {
    const state = resolveSparcProgressReporterState({
      deliverySettings: {
        disableProgressReport: true,
      },
      display: {
        nodes: [],
        progressReporter: {
          placement: 'sidebar',
        },
      },
    });

    expect(state.requestsSidebar).to.equal(true);
    expect(state.effectiveProgressDisabled).to.equal(true);
    expect(state.deliverySettings.disableProgressReport).to.equal(true);
  });

  it('detects nested panel-selector document progress nodes', function() {
    expect(sparcDisplayHasDocumentProgress({
      nodes: [{
        id: 'selector',
        nodeType: 'atomic',
        atomType: 'panel-selector',
        panels: [{
          id: 'panel',
          children: [{
            id: 'progress',
            nodeType: 'atomic',
            atomType: 'learning-progress',
          }],
        }],
      }],
    })).to.equal(true);
  });
});

