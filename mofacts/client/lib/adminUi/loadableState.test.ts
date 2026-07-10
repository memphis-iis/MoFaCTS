import { expect } from 'chai';
import {
  cancelLoad,
  isLoadPending,
  rejectLoad,
  resolveLoad,
  startLoad,
  type LoadableState,
} from './loadableState';

const isEmpty = (value: readonly string[]) => value.length === 0;

describe('admin UI loadable state', function() {
  it('distinguishes successful empty data from initial failure', function() {
    const loading = startLoad<readonly string[]>({ status: 'idle' }, 1);
    const empty = resolveLoad(loading, 1, [], isEmpty);

    expect(empty).to.deep.equal({ status: 'empty', value: [] });
    expect(rejectLoad(loading, 1, { message: 'Unavailable', retryable: true })).to.deep.equal({
      status: 'error',
      message: 'Unavailable',
      retryable: true,
    });
  });

  it('retains confirmed content during refresh and refresh failure', function() {
    const ready: LoadableState<readonly string[]> = { status: 'ready', value: ['confirmed'] };
    const refreshing = startLoad(ready, 2);

    expect(refreshing).to.deep.equal({
      status: 'refreshing',
      value: ['confirmed'],
      requestId: 2,
    });
    expect(rejectLoad(refreshing, 2, { message: 'Refresh failed', retryable: true })).to.deep.equal({
      status: 'refresh-error',
      value: ['confirmed'],
      message: 'Refresh failed',
      retryable: true,
    });
  });

  it('accepts completion only for the current request', function() {
    const first = startLoad<readonly string[]>({ status: 'idle' }, 1);
    const second = startLoad(first, 2);

    expect(resolveLoad(second, 1, ['stale'], isEmpty)).to.equal(second);
    expect(rejectLoad(second, 1, { message: 'Stale failure', retryable: false })).to.equal(second);
    expect(resolveLoad(second, 2, ['current'], isEmpty)).to.deep.equal({
      status: 'ready',
      value: ['current'],
    });
  });

  it('cancels initial loads and restores confirmed refresh values', function() {
    const loading = startLoad<readonly string[]>({ status: 'idle' }, 1);
    const refreshing = startLoad<readonly string[]>({ status: 'empty', value: [] }, 2);

    expect(cancelLoad(loading, 1, isEmpty)).to.deep.equal({ status: 'idle' });
    expect(cancelLoad(refreshing, 2, isEmpty)).to.deep.equal({ status: 'empty', value: [] });
    expect(isLoadPending(loading)).to.equal(true);
    expect(isLoadPending({ status: 'ready', value: [] })).to.equal(false);
  });

  it('rejects invalid request identities instead of aliasing operations', function() {
    expect(() => startLoad({ status: 'idle' }, 0)).to.throw('positive safe integers');
  });
});

