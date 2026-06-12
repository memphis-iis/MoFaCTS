import { expect } from 'chai';
import { createLearningProgressRuntimeController } from './learningProgressPanelRuntime';
import type { SessionSurfaceState } from './sessionSurfaceMode';

const cardSurface: SessionSurfaceState = {
  isAutoTutorSession: false,
  isVideoSession: false,
  mode: 'card',
};

function modelEngine(probabilityEstimate = 0.7) {
  return {
    unitType: 'model',
    currentCardRef: { clusterIndex: 0, stimIndex: 0 },
    getCardProbabilitiesNoCalc: () => ({
      cards: [
        {
          canUse: true,
          stims: [
            {
              canUse: true,
              probabilityEstimate,
              stimulusKC: 'kc-a',
              timesSeen: 1,
            },
          ],
        },
      ],
    }),
  };
}

function fakeDocument() {
  const toggles: Array<{ className: string; force?: boolean }> = [];
  return {
    documentRef: {
      documentElement: {
        classList: {
          toggle(className: string, force?: boolean) {
            toggles.push(force === undefined ? { className } : { className, force });
          },
        },
      },
    },
    toggles,
  };
}

describe('learning progress panel runtime', function() {
  it('seeds progress when adaptive progress first becomes available', function() {
    const { documentRef, toggles } = fakeDocument();
    const controller = createLearningProgressRuntimeController({
      defaultDeliverySettings: {},
      documentRef: () => documentRef,
      getHiddenItems: () => [],
    });
    controller.setRequestedOpen(true);

    const runtime = controller.buildRuntimeSnapshot({
      deliverySettings: { optimalThreshold: 0.8 },
      engine: modelEngine(),
      feedbackEnd: 0,
      surfaceState: cardSurface,
    });

    expect(runtime.snapshot.available).to.equal(true);
    expect(runtime.showPanel).to.equal(true);
    expect(runtime.panelState.panelOpen).to.equal(true);
    expect(runtime.requestedOpen).to.equal(true);
    expect(toggles[toggles.length - 1]).to.deep.equal({
      className: 'learning-progress-panel-viewport-open',
      force: true,
    });
  });

  it('commits updated progress only for a new feedback end timestamp', function() {
    let probability = 0.6;
    const controller = createLearningProgressRuntimeController({
      defaultDeliverySettings: {},
      documentRef: () => null,
      getHiddenItems: () => [],
    });

    controller.buildRuntimeSnapshot({
      deliverySettings: {},
      engine: modelEngine(probability),
      feedbackEnd: 10,
      surfaceState: cardSurface,
    });
    expect(controller.getSnapshot().rows[0]?.probability).to.equal(0.6);

    probability = 0.9;
    controller.buildRuntimeSnapshot({
      deliverySettings: {},
      engine: modelEngine(probability),
      feedbackEnd: 10,
      surfaceState: cardSurface,
    });
    expect(controller.getSnapshot().rows[0]?.probability).to.equal(0.6);

    controller.buildRuntimeSnapshot({
      deliverySettings: {},
      engine: modelEngine(probability),
      feedbackEnd: 20,
      surfaceState: cardSurface,
    });
    expect(controller.getSnapshot().rows[0]?.probability).to.equal(0.9);
    expect(controller.getLastFeedbackEnd()).to.equal(20);
  });

  it('closes and clears viewport state when the panel is unavailable', function() {
    const { documentRef, toggles } = fakeDocument();
    const controller = createLearningProgressRuntimeController({
      defaultDeliverySettings: {},
      documentRef: () => documentRef,
      getHiddenItems: () => [],
    });
    controller.setRequestedOpen(true);

    controller.buildRuntimeSnapshot({
      deliverySettings: {},
      engine: modelEngine(),
      feedbackEnd: 0,
      surfaceState: cardSurface,
    });
    const runtime = controller.buildRuntimeSnapshot({
      deliverySettings: { disableProgressReport: true },
      engine: modelEngine(),
      feedbackEnd: 0,
      surfaceState: cardSurface,
    });

    expect(runtime.showPanel).to.equal(false);
    expect(runtime.panelState.panelOpen).to.equal(false);
    expect(runtime.requestedOpen).to.equal(false);
    expect(toggles[toggles.length - 1]).to.deep.equal({
      className: 'learning-progress-panel-viewport-open',
      force: false,
    });
  });

  it('clears the viewport class on cleanup', function() {
    const { documentRef, toggles } = fakeDocument();
    const controller = createLearningProgressRuntimeController({
      defaultDeliverySettings: {},
      documentRef: () => documentRef,
      getHiddenItems: () => [],
    });

    controller.setRequestedOpen(true);
    controller.buildRuntimeSnapshot({
      deliverySettings: {},
      engine: modelEngine(),
      feedbackEnd: 0,
      surfaceState: cardSurface,
    });
    controller.closeViewport();

    expect(toggles[toggles.length - 1]).to.deep.equal({
      className: 'learning-progress-panel-viewport-open',
      force: false,
    });
  });
});
