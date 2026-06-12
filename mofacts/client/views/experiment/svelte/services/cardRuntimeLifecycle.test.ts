import { expect } from 'chai';
import { createCardRuntimeLifecycleController } from './cardRuntimeLifecycle';

function component(name: string, calls: string[]) {
  return {
    start: () => calls.push(`${name}:start`),
    stop: () => calls.push(`${name}:stop`),
  };
}

describe('card runtime lifecycle controller', function() {
  it('starts window events before the machine and reactive trackers', function() {
    const calls: string[] = [];
    const machine = component('machine', calls);
    const controller = createCardRuntimeLifecycleController({
      startRuntimeWindowEvents: () => {
        calls.push('window:start');
        return {
          stop: () => calls.push('window:stop'),
        };
      },
      machineRuntime: machine,
      createReactiveTrackers: () => component('trackers', calls),
    });

    controller.startReadyRuntime();

    expect(calls).to.deep.equal([
      'machine:stop',
      'window:start',
      'machine:start',
      'trackers:start',
    ]);
  });

  it('stops owned runtime pieces cleanly', function() {
    const calls: string[] = [];
    const controller = createCardRuntimeLifecycleController({
      startRuntimeWindowEvents: () => ({
        stop: () => calls.push('window:stop'),
      }),
      machineRuntime: component('machine', calls),
      createReactiveTrackers: () => component('trackers', calls),
    });

    controller.startReadyRuntime();
    calls.length = 0;
    controller.stop();

    expect(calls).to.deep.equal([
      'window:stop',
      'machine:stop',
      'trackers:stop',
    ]);
  });

  it('cleans up the previous runtime before restarting', function() {
    const calls: string[] = [];
    const controller = createCardRuntimeLifecycleController({
      startRuntimeWindowEvents: () => {
        calls.push('window:start');
        return {
          stop: () => calls.push('window:stop'),
        };
      },
      machineRuntime: component('machine', calls),
      createReactiveTrackers: () => component('trackers', calls),
    });

    controller.startReadyRuntime();
    calls.length = 0;
    controller.startReadyRuntime();

    expect(calls).to.deep.equal([
      'window:stop',
      'machine:stop',
      'trackers:stop',
      'window:start',
      'machine:start',
      'trackers:start',
    ]);
  });
});
