import { expect } from 'chai';
import type { AsyncCommandState } from './asyncCommandState';
import { createScopedAsyncCommandRegistry } from './scopedAsyncCommandRegistry';

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

describe('admin UI scoped async command registry', function() {
  it('rejects blank scopes', async function() {
    const registry = createScopedAsyncCommandRegistry<string>(() => undefined);

    expect(() => registry.getState('   ')).to.throw('non-empty scope');
    let error: unknown;
    try {
      await registry.run('', async () => 'saved');
    } catch (caught) {
      error = caught;
    }
    expect(error).to.be.instanceOf(Error);
  });

  it('publishes pending then success for one scope', async function() {
    const states: Array<[string, AsyncCommandState<string>]> = [];
    const registry = createScopedAsyncCommandRegistry<string>((scope, state) => {
      states.push([scope, state]);
    });

    expect(await registry.run(' user:role:1 ', async () => 'saved')).to.equal(true);
    expect(states).to.deep.equal([
      ['user:role:1', { status: 'pending', commandId: 1 }],
      ['user:role:1', { status: 'success', result: 'saved' }],
    ]);
  });

  it('publishes normalized failure for one scope', async function() {
    const states: Array<[string, AsyncCommandState<string>]> = [];
    const registry = createScopedAsyncCommandRegistry<string>((scope, state) => {
      states.push([scope, state]);
    });

    await registry.run('user:delete:1', async () => {
      throw new Error('Delete rejected');
    });

    expect(states.at(-1)).to.deep.equal([
      'user:delete:1',
      { status: 'error', message: 'Delete rejected' },
    ]);
  });

  it('blocks the same pending scope while allowing another scope', async function() {
    const first = deferred<string>();
    const second = deferred<string>();
    const registry = createScopedAsyncCommandRegistry<string>(() => undefined);
    let firstCalls = 0;

    const firstRun = registry.run('backup:verify:1', () => {
      firstCalls += 1;
      return first.promise;
    });
    const duplicateRun = registry.run('backup:verify:1', () => {
      firstCalls += 1;
      return first.promise;
    });
    const secondRun = registry.run('backup:verify:2', () => second.promise);

    expect(await duplicateRun).to.equal(false);
    expect(firstCalls).to.equal(1);
    expect(registry.getState('backup:verify:1').status).to.equal('pending');
    expect(registry.getState('backup:verify:2').status).to.equal('pending');

    first.resolve('verified-1');
    second.resolve('verified-2');
    expect(await firstRun).to.equal(true);
    expect(await secondRun).to.equal(true);
  });

  it('resets completed state and rejects resetting pending state', async function() {
    const pending = deferred<string>();
    const registry = createScopedAsyncCommandRegistry<string>(() => undefined);
    const pendingRun = registry.run('theme:save:1', () => pending.promise);

    expect(() => registry.reset('theme:save:1')).to.throw('Cannot reset a pending command.');
    pending.resolve('saved');
    await pendingRun;
    registry.reset('theme:save:1');
    expect(registry.getState('theme:save:1')).to.deep.equal({ status: 'idle' });
  });

  it('ignores late completion after a scope is removed and recreated', async function() {
    const oldOperation = deferred<string>();
    const states: Array<[string, AsyncCommandState<string>]> = [];
    const registry = createScopedAsyncCommandRegistry<string>((scope, state) => {
      states.push([scope, state]);
    });
    const oldRun = registry.run('course:join:1', () => oldOperation.promise);

    registry.remove('course:join:1');
    await registry.run('course:join:1', async () => 'new result');
    oldOperation.resolve('old result');
    await oldRun;

    expect(registry.getState('course:join:1')).to.deep.equal({
      status: 'success',
      result: 'new result',
    });
    expect(states.filter(([, state]) =>
      state.status === 'success' && state.result === 'old result'
    )).to.have.length(0);
  });

  it('removes one scope without affecting another and destroys all scopes', async function() {
    const registry = createScopedAsyncCommandRegistry<string>(() => undefined);
    await registry.run('content:asset:1', async () => 'one');
    await registry.run('content:asset:2', async () => 'two');

    registry.remove('content:asset:1');
    expect(registry.getState('content:asset:1')).to.deep.equal({ status: 'idle' });
    expect(registry.getState('content:asset:2')).to.deep.equal({
      status: 'success',
      result: 'two',
    });

    registry.destroy();
    expect(() => registry.run('content:asset:3', async () => 'three'))
      .to.throw('destroyed scoped async command registry');
  });
});
