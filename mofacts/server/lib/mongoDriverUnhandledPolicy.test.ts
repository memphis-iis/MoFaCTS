import { expect } from 'chai';
import {
  installMongoDriverUnhandledPolicy,
  isMongoPoolMonitorInterruption,
  summarizeMongoPoolInterruption,
} from './mongoDriverUnhandledPolicy';

class FakeProcess {
  handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: 'uncaughtException' | 'unhandledRejection', handler: (...args: unknown[]) => void): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)?.add(handler);
  }

  off(event: 'uncaughtException' | 'unhandledRejection', handler: (...args: unknown[]) => void): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: 'uncaughtException' | 'unhandledRejection', ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) || []) {
      handler(...args);
    }
  }

  count(event: string): number {
    return this.handlers.get(event)?.size || 0;
  }
}

function poolMonitorTimeoutError() {
  const cause = new Error('connection <monitor> to 127.0.0.1:27017 timed out') as Error & {
    errorLabelSet: Set<string>;
  };
  cause.name = 'MongoNetworkTimeoutError';
  cause.errorLabelSet = new Set(['ResetPool', 'InterruptInUseConnections']);
  const error = new Error('Connection to 127.0.0.1:27017 interrupted due to server monitor timeout') as Error & {
    address: string;
    cause: Error;
    errorLabelSet: Set<string>;
  };
  error.name = 'PoolClearedOnNetworkError';
  error.address = '127.0.0.1:27017';
  error.cause = cause;
  error.errorLabelSet = new Set(['PoolRequstedRetry']);
  return error;
}

describe('mongo driver unhandled policy', function() {
  it('recognizes the Mongo pool monitor timeout shape from the driver', function() {
    const error = poolMonitorTimeoutError();

    expect(isMongoPoolMonitorInterruption(error)).to.equal(true);
    expect(summarizeMongoPoolInterruption(error)).to.deep.equal({
      name: 'PoolClearedOnNetworkError',
      message: 'Connection to 127.0.0.1:27017 interrupted due to server monitor timeout',
      address: '127.0.0.1:27017',
      causeName: 'MongoNetworkTimeoutError',
      causeMessage: 'connection <monitor> to 127.0.0.1:27017 timed out',
    });
  });

  it('does not classify unrelated Mongo or application errors as recoverable', function() {
    const networkError = new Error('connection failed');
    networkError.name = 'MongoNetworkError';

    expect(isMongoPoolMonitorInterruption(networkError)).to.equal(false);
    expect(isMongoPoolMonitorInterruption(new Error('boom'))).to.equal(false);
  });

  it('logs exact pool monitor interruptions without invoking fatal handling', function() {
    const fakeProcess = new FakeProcess();
    const logs: unknown[] = [];
    const fatals: unknown[] = [];
    const uninstall = installMongoDriverUnhandledPolicy({
      logger: (_level, _message, details) => logs.push(details),
      onFatal: (reason) => fatals.push(reason),
      processLike: fakeProcess,
    });

    fakeProcess.emit('unhandledRejection', poolMonitorTimeoutError());
    fakeProcess.emit('uncaughtException', poolMonitorTimeoutError(), 'unhandledRejection');
    fakeProcess.emit('uncaughtException', poolMonitorTimeoutError(), 'uncaughtException');

    expect(logs).to.have.length(3);
    expect(fatals).to.deep.equal([]);
    uninstall();
    expect(fakeProcess.count('unhandledRejection')).to.equal(0);
    expect(fakeProcess.count('uncaughtException')).to.equal(0);
  });

  it('preserves fatal handling for non-matching unhandled errors', function() {
    const fakeProcess = new FakeProcess();
    const fatals: unknown[] = [];
    installMongoDriverUnhandledPolicy({
      logger: () => undefined,
      onFatal: (reason) => fatals.push(reason),
      processLike: fakeProcess,
    });
    const error = new Error('not recoverable');

    fakeProcess.emit('unhandledRejection', error);

    expect(fatals).to.deep.equal([error]);
  });
});
