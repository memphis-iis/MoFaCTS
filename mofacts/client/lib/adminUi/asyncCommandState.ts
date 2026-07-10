export type AsyncCommandState<TResult = unknown> =
  | { status: 'idle' }
  | { status: 'pending'; commandId: number }
  | { status: 'success'; result: TResult }
  | { status: 'error'; message: string };

export type StartCommandResult<TResult> = Readonly<{
  started: boolean;
  state: AsyncCommandState<TResult>;
}>;

export type AsyncCommandRunOptions<TResult> = Readonly<{
  onSuccess?: (result: TResult) => void;
  onFailure?: (error: unknown) => void;
  getErrorMessage?: (error: unknown) => string;
}>;

export type AsyncCommandController<TResult> = Readonly<{
  getState: () => AsyncCommandState<TResult>;
  run: (
    work: () => Promise<TResult>,
    options?: AsyncCommandRunOptions<TResult>,
  ) => Promise<boolean>;
  reset: () => void;
  destroy: () => void;
}>;

function assertCommandId(commandId: number): void {
  if (!Number.isSafeInteger(commandId) || commandId < 1) {
    throw new Error(`Command IDs must be positive safe integers; received ${commandId}.`);
  }
}

export function startAsyncCommand<TResult>(
  state: AsyncCommandState<TResult>,
  commandId: number,
): StartCommandResult<TResult> {
  assertCommandId(commandId);
  if (state.status === 'pending') {
    return { started: false, state };
  }
  return {
    started: true,
    state: { status: 'pending', commandId },
  };
}

export function resolveAsyncCommand<TResult>(
  state: AsyncCommandState<TResult>,
  commandId: number,
  result: TResult,
): AsyncCommandState<TResult> {
  assertCommandId(commandId);
  if (state.status !== 'pending' || state.commandId !== commandId) {
    return state;
  }
  return { status: 'success', result };
}

export function rejectAsyncCommand<TResult>(
  state: AsyncCommandState<TResult>,
  commandId: number,
  message: string,
): AsyncCommandState<TResult> {
  assertCommandId(commandId);
  if (state.status !== 'pending' || state.commandId !== commandId) {
    return state;
  }
  return { status: 'error', message };
}

function defaultErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'The operation failed.';
}

export function createAsyncCommandController<TResult>(
  onStateChange: (state: AsyncCommandState<TResult>) => void,
): AsyncCommandController<TResult> {
  let state: AsyncCommandState<TResult> = { status: 'idle' };
  let nextCommandId = 1;
  let destroyed = false;

  function publish(nextState: AsyncCommandState<TResult>): void {
    state = nextState;
    if (!destroyed) {
      onStateChange(state);
    }
  }

  return {
    getState(): AsyncCommandState<TResult> {
      return state;
    },
    async run(
      work: () => Promise<TResult>,
      options: AsyncCommandRunOptions<TResult> = {},
    ): Promise<boolean> {
      if (destroyed) {
        throw new Error('Cannot run a command through a destroyed command controller.');
      }

      const commandId = nextCommandId;
      const started = startAsyncCommand(state, commandId);
      if (!started.started) {
        return false;
      }
      nextCommandId += 1;
      publish(started.state);

      try {
        const result = await work();
        if (destroyed) {
          return true;
        }
        const completed = resolveAsyncCommand(state, commandId, result);
        if (completed === state) {
          return true;
        }
        publish(completed);
        options.onSuccess?.(result);
      } catch (error: unknown) {
        if (destroyed) {
          return true;
        }
        const message = (options.getErrorMessage ?? defaultErrorMessage)(error);
        const failed = rejectAsyncCommand(state, commandId, message);
        if (failed === state) {
          return true;
        }
        publish(failed);
        options.onFailure?.(error);
      }
      return true;
    },
    reset(): void {
      if (destroyed) {
        throw new Error('Cannot reset a destroyed command controller.');
      }
      if (state.status === 'pending') {
        throw new Error('Cannot reset a pending command.');
      }
      publish({ status: 'idle' });
    },
    destroy(): void {
      destroyed = true;
      state = { status: 'idle' };
    },
  };
}

