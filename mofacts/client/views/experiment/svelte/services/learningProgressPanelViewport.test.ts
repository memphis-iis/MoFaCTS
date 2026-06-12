import { expect } from 'chai';
import {
  notifyLearningProgressLayoutChange,
  progressPanelDisabled,
  setLearningProgressViewportOpen,
  type LearningProgressWindow,
} from './learningProgressPanelViewport';

function createClassListHarness() {
  const toggles: Array<{ className: string; force?: boolean }> = [];
  const documentRef = {
    documentElement: {
      classList: {
        toggle(className: string, force?: boolean) {
          const entry: { className: string; force?: boolean } = { className };
          if (force !== undefined) {
            entry.force = force;
          }
          toggles.push(entry);
        },
      },
    },
  };
  return { documentRef, toggles };
}

function createWindowHarness() {
  const events: string[] = [];
  const scheduled: Array<() => void> = [];
  const windowRef: LearningProgressWindow = {
    dispatchEvent(event: Event) {
      events.push(event.type);
      return true;
    },
    setTimeout(handler: () => void) {
      scheduled.push(handler);
      return scheduled.length;
    },
  };
  return { events, scheduled, windowRef };
}

describe('learning progress panel viewport', function() {
  it('parses disableProgressReport values from delivery settings', function() {
    expect(progressPanelDisabled({ disableProgressReport: true })).to.equal(true);
    expect(progressPanelDisabled({ disableProgressReport: 'true' })).to.equal(true);
    expect(progressPanelDisabled({ disableProgressReport: 1 })).to.equal(true);
    expect(progressPanelDisabled({ disableProgressReport: '1' })).to.equal(true);

    expect(progressPanelDisabled({ disableProgressReport: false })).to.equal(false);
    expect(progressPanelDisabled({ disableProgressReport: 'false' })).to.equal(false);
    expect(progressPanelDisabled({ disableProgressReport: 0 })).to.equal(false);
    expect(progressPanelDisabled(null)).to.equal(false);
  });

  it('toggles the viewport class on the document root', function() {
    const harness = createClassListHarness();

    setLearningProgressViewportOpen({ documentRef: harness.documentRef, open: true });
    setLearningProgressViewportOpen({ documentRef: harness.documentRef, open: false });
    setLearningProgressViewportOpen({ documentRef: null, open: true });

    expect(harness.toggles).to.deep.equal([
      { className: 'learning-progress-panel-viewport-open', force: true },
      { className: 'learning-progress-panel-viewport-open', force: false },
    ]);
  });

  it('dispatches immediate and deferred resize events after DOM update', async function() {
    const harness = createWindowHarness();
    const sequence: string[] = [];

    await notifyLearningProgressLayoutChange({
      windowRef: harness.windowRef,
      waitForDomUpdate: async () => {
        sequence.push('dom-updated');
      },
      resizeDelayMs: 5,
    });

    expect(sequence).to.deep.equal(['dom-updated']);
    expect(harness.events).to.deep.equal(['resize']);
    expect(harness.scheduled).to.have.length(1);

    harness.scheduled[0]!();
    expect(harness.events).to.deep.equal(['resize', 'resize']);
  });

  it('does not wait for DOM updates when no window is available', async function() {
    let waited = false;

    await notifyLearningProgressLayoutChange({
      windowRef: null,
      waitForDomUpdate: async () => {
        waited = true;
      },
    });

    expect(waited).to.equal(false);
  });
});
