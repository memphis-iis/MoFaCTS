import {
  createAsyncCommandController,
  type AsyncCommandController,
  type AsyncCommandRunOptions,
  type AsyncCommandState,
} from './asyncCommandState';

// This registry owns command feedback only. Page/card loading remains in LoadableState
// so a row action can never overwrite the failure state of the surface being loaded.

export type ScopedAsyncCommandRegistry<TResult> = Readonly<{
  getState: (scope: string) => AsyncCommandState<TResult>;
  run: (
    scope: string,
    work: () => Promise<TResult>,
    options?: AsyncCommandRunOptions<TResult>,
  ) => Promise<boolean>;
  reset: (scope: string) => void;
  remove: (scope: string) => void;
  destroy: () => void;
}>;

function normalizeScope(scope: string): string {
  const normalized = scope.trim();
  if (!normalized) {
    throw new Error('Scoped async commands require a non-empty scope.');
  }
  return normalized;
}

export function createScopedAsyncCommandRegistry<TResult>(
  onStateChange: (scope: string, state: AsyncCommandState<TResult>) => void,
): ScopedAsyncCommandRegistry<TResult> {
  const controllers = new Map<string, AsyncCommandController<TResult>>();
  let destroyed = false;

  function requireActive(): void {
    if (destroyed) {
      throw new Error('Cannot use a destroyed scoped async command registry.');
    }
  }

  function controllerFor(scope: string): AsyncCommandController<TResult> {
    requireActive();
    const normalized = normalizeScope(scope);
    const existing = controllers.get(normalized);
    if (existing) {
      return existing;
    }

    let controller!: AsyncCommandController<TResult>;
    controller = createAsyncCommandController<TResult>((state) => {
      if (!destroyed && controllers.get(normalized) === controller) {
        onStateChange(normalized, state);
      }
    });
    controllers.set(normalized, controller);
    return controller;
  }

  return {
    getState(scope: string): AsyncCommandState<TResult> {
      const normalized = normalizeScope(scope);
      return controllers.get(normalized)?.getState() ?? { status: 'idle' };
    },
    run(
      scope: string,
      work: () => Promise<TResult>,
      options: AsyncCommandRunOptions<TResult> = {},
    ): Promise<boolean> {
      return controllerFor(scope).run(work, options);
    },
    reset(scope: string): void {
      requireActive();
      const normalized = normalizeScope(scope);
      controllers.get(normalized)?.reset();
    },
    remove(scope: string): void {
      requireActive();
      const normalized = normalizeScope(scope);
      const controller = controllers.get(normalized);
      if (!controller) {
        return;
      }
      controller.destroy();
      controllers.delete(normalized);
      onStateChange(normalized, { status: 'idle' });
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const controller of controllers.values()) {
        controller.destroy();
      }
      controllers.clear();
    },
  };
}
