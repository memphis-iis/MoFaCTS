import { expect } from 'chai';
import { createCardUnitContinuationController } from './cardUnitContinuation';

describe('card unit continuation controller', function() {
  it('starts one continuation at a time and publishes continuing state', async function() {
    let resolveContinue: () => void = () => {
      throw new Error('Expected pending continuation promise');
    };
    const updates: boolean[] = [];
    const reasons: string[] = [];
    const controller = createCardUnitContinuationController({
      isTestMode: () => false,
      continueUnit: (reason) => {
        reasons.push(reason);
        return new Promise<void>((resolve) => {
          resolveContinue = resolve;
        });
      },
      onUpdate: (snapshot) => updates.push(snapshot.continuing),
    });

    const first = controller.forceAdvanceToNextUnit('timeout');
    expect(controller.getSnapshot().continuing).to.equal(true);
    expect(await controller.forceAdvanceToNextUnit('duplicate')).to.equal(false);
    expect(reasons).to.deep.equal(['timeout']);

    resolveContinue();
    expect(await first).to.equal(true);
    expect(updates).to.deep.equal([true]);
  });

  it('does not continue in test mode', async function() {
    let calls = 0;
    const controller = createCardUnitContinuationController({
      isTestMode: () => true,
      continueUnit: async () => {
        calls += 1;
      },
    });

    expect(await controller.forceAdvanceToNextUnit('test')).to.equal(false);
    expect(calls).to.equal(0);
    expect(controller.getSnapshot().continuing).to.equal(false);
  });

  it('resets continuing state and logs when continuation fails', async function() {
    const updates: boolean[] = [];
    const logs: unknown[][] = [];
    const error = new Error('nope');
    const controller = createCardUnitContinuationController({
      isTestMode: () => false,
      continueUnit: async () => {
        throw error;
      },
      log: (...args) => logs.push(args),
      onUpdate: (snapshot) => updates.push(snapshot.continuing),
    });

    expect(await controller.forceAdvanceToNextUnit('failure')).to.equal(false);
    expect(controller.getSnapshot().continuing).to.equal(false);
    expect(updates).to.deep.equal([true, false]);
    expect(logs[0]).to.deep.equal([
      1,
      '[ContentSurface] Failed to continue to next unit:',
      error,
    ]);
  });
});
