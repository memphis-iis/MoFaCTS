import { expect } from 'chai';
import {
  createAsyncCommandController,
  rejectAsyncCommand,
  resolveAsyncCommand,
  startAsyncCommand,
  type AsyncCommandState,
} from './asyncCommandState';

function deferred<TResult>(): {
  promise: Promise<TResult>;
  resolve: (value: TResult) => void;
  reject: (error: unknown) => void;
} {
  let resolvePromise!: (value: TResult) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<TResult>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

describe('admin UI async command state', function() {
  it('gates duplicate starts while a command is pending', function() {
    const first = startAsyncCommand<string>({ status: 'idle' }, 1);
    const duplicate = startAsyncCommand(first.state, 2);

    expect(first.started).to.equal(true);
    expect(duplicate).to.deep.equal({ started: false, state: first.state });
  });

  it('accepts success and failure only for the active command', function() {
    const pending: AsyncCommandState<string> = { status: 'pending', commandId: 2 };

    expect(resolveAsyncCommand(pending, 1, 'stale')).to.equal(pending);
    expect(rejectAsyncCommand(pending, 1, 'stale')).to.equal(pending);
    expect(resolveAsyncCommand(pending, 2, 'saved')).to.deep.equal({
      status: 'success',
      result: 'saved',
    });
  });

  it('runs work once and publishes pending then success', async function() {
    const operation = deferred<string>();
    const states: AsyncCommandState<string>[] = [];
    const controller = createAsyncCommandController<string>((state) => states.push(state));
    let calls = 0;
    const work = () => {
      calls += 1;
      return operation.promise;
    };

    const firstRun = controller.run(work);
    const duplicateRun = controller.run(work);
    expect(await duplicateRun).to.equal(false);
    expect(calls).to.equal(1);

    operation.resolve('saved');
    expect(await firstRun).to.equal(true);
    expect(states).to.deep.equal([
      { status: 'pending', commandId: 1 },
      { status: 'success', result: 'saved' },
    ]);
  });

  it('supports explicit caller rollback after a failed optimistic update', async function() {
    const controller = createAsyncCommandController<void>(() => undefined);
    let displayedValue = 'optimistic';

    await controller.run(
      async () => {
        throw new Error('Save rejected');
      },
      {
        onFailure: () => {
          displayedValue = 'confirmed';
        },
      },
    );

    expect(displayedValue).to.equal('confirmed');
    expect(controller.getState()).to.deep.equal({ status: 'error', message: 'Save rejected' });
  });

  it('does not publish late completion after destruction', async function() {
    const operation = deferred<string>();
    const states: AsyncCommandState<string>[] = [];
    const controller = createAsyncCommandController<string>((state) => states.push(state));
    const run = controller.run(() => operation.promise);

    controller.destroy();
    operation.resolve('late');

    expect(await run).to.equal(true);
    expect(states).to.deep.equal([{ status: 'pending', commandId: 1 }]);
    expect(controller.getState()).to.deep.equal({ status: 'idle' });
  });
});
