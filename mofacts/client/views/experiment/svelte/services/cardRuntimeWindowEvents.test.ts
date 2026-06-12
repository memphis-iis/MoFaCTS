import { expect } from 'chai';
import {
  createCardRuntimeWindowEventController,
  type RuntimeDocumentTarget,
  type RuntimeEventTarget,
} from './cardRuntimeWindowEvents';

class FakeEventTarget implements RuntimeEventTarget {
  readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) || new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: Partial<Event> = {}): void {
    for (const listener of this.listeners.get(type) || []) {
      listener(event as Event);
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size || 0;
  }
}

class FakeDocumentTarget extends FakeEventTarget implements RuntimeDocumentTarget {
  visibilityState = 'visible';
}

function createHarness() {
  const windowTarget = new FakeEventTarget();
  const documentTarget = new FakeDocumentTarget();
  const calls: string[] = [];
  const logs: Array<{ level: number; message: string; details?: unknown }> = [];
  let studyInteractionText = '';
  let canForceAdvance = false;

  const controller = createCardRuntimeWindowEventController({
    windowTarget,
    documentTarget,
    startRecording: () => calls.push('start-recording'),
    stopRecording: () => calls.push('stop-recording'),
    cleanupAudioRecorder: () => calls.push('cleanup-audio'),
    setStudyInteractionText: (value) => {
      studyInteractionText = value;
    },
    requestVideoResume: (reason) => {
      calls.push(`resume:${reason}`);
    },
    handleVideoAnswer: (detail) => {
      calls.push(`video-answer:${JSON.stringify(detail)}`);
    },
    syncScreenWakeLock: (reason) => {
      calls.push(`sync-wake:${reason}`);
    },
    releaseScreenWakeLock: (reason) => {
      calls.push(`release-wake:${reason}`);
    },
    userCanForceAdvance: () => canForceAdvance,
    forceAdvanceToNextUnit: (reason) => {
      calls.push(`force-advance:${reason}`);
    },
    log: (level, message, details) => {
      const entry: { level: number; message: string; details?: unknown } = { level, message };
      if (details !== undefined) {
        entry.details = details;
      }
      logs.push(entry);
    },
  });

  return {
    calls,
    controller,
    documentTarget,
    getStudyInteractionText: () => studyInteractionText,
    logs,
    setCanForceAdvance: (value: boolean) => {
      canForceAdvance = value;
    },
    windowTarget,
  };
}

describe('card runtime window events', function() {
  it('wires machine command events and removes them on stop', function() {
    const harness = createHarness();
    harness.controller.start();

    harness.windowTarget.dispatch('cardMachine:startRecording');
    harness.windowTarget.dispatch('cardMachine:stopRecording');
    harness.windowTarget.dispatch('cardMachine:displayAnswer', { detail: { answer: '  ATP  ' } } as Partial<Event>);
    harness.windowTarget.dispatch('cardMachine:resumeVideo');
    harness.windowTarget.dispatch('cardMachine:videoAnswer', { detail: { isCorrect: true } } as Partial<Event>);

    expect(harness.calls).to.deep.equal([
      'start-recording',
      'stop-recording',
      'resume:cardMachine:resumeVideo',
      'video-answer:{"isCorrect":true}',
    ]);
    expect(harness.getStudyInteractionText()).to.equal('ATP');
    expect(harness.windowTarget.listenerCount('cardMachine:startRecording')).to.equal(1);

    harness.controller.stop();
    expect(harness.windowTarget.listenerCount('cardMachine:startRecording')).to.equal(0);
    expect(harness.calls).to.include('release-wake:card destroy');
  });

  it('cleans audio and syncs wake lock on visibility changes and page exits', function() {
    const harness = createHarness();
    harness.controller.start();

    harness.documentTarget.visibilityState = 'hidden';
    harness.documentTarget.dispatch('visibilitychange');
    harness.windowTarget.dispatch('pagehide');
    harness.windowTarget.dispatch('beforeunload');
    harness.documentTarget.visibilityState = 'visible';
    harness.documentTarget.dispatch('visibilitychange');

    expect(harness.calls).to.deep.equal([
      'cleanup-audio',
      'sync-wake:visibilitychange',
      'cleanup-audio',
      'cleanup-audio',
      'sync-wake:visibilitychange',
    ]);
    expect(harness.logs).to.deep.include({
      level: 2,
      message: '[CardScreen] visibilitychange visible; preserving card flow for mobile interruption recovery',
    });
  });

  it('logs recording command failures without swallowing other event wiring', function() {
    const windowTarget = new FakeEventTarget();
    const logs: Array<{ level: number; message: string; details?: unknown }> = [];
    const controller = createCardRuntimeWindowEventController({
      windowTarget,
      documentTarget: null,
      startRecording: () => {
        throw new Error('microphone unavailable');
      },
      stopRecording: () => undefined,
      cleanupAudioRecorder: () => undefined,
      setStudyInteractionText: () => undefined,
      requestVideoResume: () => undefined,
      handleVideoAnswer: () => undefined,
      syncScreenWakeLock: () => undefined,
      releaseScreenWakeLock: () => undefined,
      userCanForceAdvance: () => false,
      forceAdvanceToNextUnit: () => undefined,
      log: (level, message, details) => logs.push({ level, message, details }),
    });

    controller.start();
    windowTarget.dispatch('cardMachine:startRecording');

    expect(logs).to.have.length(1);
    expect(logs[0]!.level).to.equal(1);
    expect(logs[0]!.message).to.equal('[SR] startRecording failed');
    expect(logs[0]!.details).to.be.instanceOf(Error);
  });

  it('gates the force-advance shortcut by role, repeat state, and key chord', function() {
    const harness = createHarness();
    let prevented = 0;
    const shortcutEvent = {
      ctrlKey: true,
      shiftKey: true,
      key: 'S',
      repeat: false,
      preventDefault: () => {
        prevented += 1;
      },
    };

    harness.controller.start();
    harness.windowTarget.dispatch('keydown', shortcutEvent as Partial<Event>);
    expect(harness.calls).to.not.include('force-advance:Admin Teacher Shortcut Ctrl+Shift+S');

    harness.setCanForceAdvance(true);
    harness.windowTarget.dispatch('keydown', { ...shortcutEvent, repeat: true } as Partial<Event>);
    harness.windowTarget.dispatch('keydown', { ...shortcutEvent, shiftKey: false } as Partial<Event>);
    harness.windowTarget.dispatch('keydown', shortcutEvent as Partial<Event>);

    expect(harness.calls).to.include('force-advance:Admin Teacher Shortcut Ctrl+Shift+S');
    expect(prevented).to.equal(1);
  });

  it('does not double-register when started twice and tolerates repeated stop', function() {
    const harness = createHarness();

    harness.controller.start();
    harness.controller.start();
    expect(harness.windowTarget.listenerCount('cardMachine:startRecording')).to.equal(1);

    harness.controller.stop();
    harness.controller.stop();
    expect(harness.windowTarget.listenerCount('cardMachine:startRecording')).to.equal(0);
    expect(harness.calls.filter((call) => call === 'release-wake:card destroy')).to.have.length(1);
  });
});
