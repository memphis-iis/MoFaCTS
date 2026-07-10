export type LoadableState<T> =
  | { status: 'idle' }
  | { status: 'loading'; requestId: number }
  | { status: 'ready'; value: T }
  | { status: 'empty'; value: T }
  | { status: 'refreshing'; value: T; requestId: number }
  | { status: 'refresh-error'; value: T; message: string; retryable: boolean }
  | { status: 'error'; message: string; retryable: boolean };

export type LoadFailure = Readonly<{
  message: string;
  retryable: boolean;
}>;

function assertRequestId(requestId: number): void {
  if (!Number.isSafeInteger(requestId) || requestId < 1) {
    throw new Error(`Load request IDs must be positive safe integers; received ${requestId}.`);
  }
}

function activeRequestId<T>(state: LoadableState<T>): number | undefined {
  return state.status === 'loading' || state.status === 'refreshing'
    ? state.requestId
    : undefined;
}

export function startLoad<T>(state: LoadableState<T>, requestId: number): LoadableState<T> {
  assertRequestId(requestId);

  if (
    state.status === 'ready'
    || state.status === 'empty'
    || state.status === 'refreshing'
    || state.status === 'refresh-error'
  ) {
    return {
      status: 'refreshing',
      value: state.value,
      requestId,
    };
  }

  return { status: 'loading', requestId };
}

export function resolveLoad<T>(
  state: LoadableState<T>,
  requestId: number,
  value: T,
  isEmpty: (value: T) => boolean,
): LoadableState<T> {
  assertRequestId(requestId);
  if (activeRequestId(state) !== requestId) {
    return state;
  }

  return isEmpty(value)
    ? { status: 'empty', value }
    : { status: 'ready', value };
}

export function rejectLoad<T>(
  state: LoadableState<T>,
  requestId: number,
  failure: LoadFailure,
): LoadableState<T> {
  assertRequestId(requestId);
  if (activeRequestId(state) !== requestId) {
    return state;
  }

  if (state.status === 'refreshing') {
    return {
      status: 'refresh-error',
      value: state.value,
      message: failure.message,
      retryable: failure.retryable,
    };
  }

  return {
    status: 'error',
    message: failure.message,
    retryable: failure.retryable,
  };
}

export function cancelLoad<T>(
  state: LoadableState<T>,
  requestId: number,
  isEmpty: (value: T) => boolean,
): LoadableState<T> {
  assertRequestId(requestId);
  if (activeRequestId(state) !== requestId) {
    return state;
  }

  if (state.status === 'refreshing') {
    return isEmpty(state.value)
      ? { status: 'empty', value: state.value }
      : { status: 'ready', value: state.value };
  }

  return { status: 'idle' };
}

export function isLoadPending<T>(state: LoadableState<T>): boolean {
  return state.status === 'loading' || state.status === 'refreshing';
}

