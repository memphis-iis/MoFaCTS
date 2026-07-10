import { Tracker } from 'meteor/tracker';
import type {
  ManagementChromeMode,
  ManagementRoutePresentationPolicy,
} from './managementRoutePresentationPolicies';
import type { PlatformStringKey } from '../interfaceI18nResources';

type RoutePresentationIdentity = Readonly<{
  routeName: string;
  path: string;
  targetTemplate: string;
  titleKey: PlatformStringKey;
  chromeMode: ManagementChromeMode;
  navigationGeneration: number;
}>;

export type RoutePresentationState =
  | { status: 'idle' }
  | (RoutePresentationIdentity & { status: 'loading' })
  | (RoutePresentationIdentity & { status: 'ready' })
  | (RoutePresentationIdentity & {
    status: 'error';
    message: string;
    retryable: boolean;
  });

export type RoutePresentationStore = Readonly<{
  get: () => RoutePresentationState;
  begin: (
    policy: ManagementRoutePresentationPolicy,
    path: string,
    retry?: () => void,
  ) => number;
  resolve: (navigationGeneration: number) => boolean;
  fail: (
    navigationGeneration: number,
    message: string,
    retryable: boolean,
  ) => boolean;
  clear: () => void;
  retry: () => boolean;
  isCurrent: (navigationGeneration: number) => boolean;
}>;

export function createRoutePresentationStore(): RoutePresentationStore {
  const dependency = new Tracker.Dependency();
  let state: RoutePresentationState = { status: 'idle' };
  let nextGeneration = 1;
  let retryAction: (() => void) | undefined;

  function publish(nextState: RoutePresentationState): void {
    state = nextState;
    dependency.changed();
  }

  return {
    get(): RoutePresentationState {
      dependency.depend();
      return state;
    },
    begin(
      policy: ManagementRoutePresentationPolicy,
      path: string,
      retry?: () => void,
    ): number {
      const navigationGeneration = nextGeneration;
      nextGeneration += 1;
      retryAction = retry;
      publish({
        status: 'loading',
        routeName: policy.routeName,
        path,
        targetTemplate: policy.template,
        titleKey: policy.titleKey,
        chromeMode: policy.chromeMode,
        navigationGeneration,
      });
      return navigationGeneration;
    },
    resolve(navigationGeneration: number): boolean {
      if (state.status === 'idle' || state.navigationGeneration !== navigationGeneration) {
        return false;
      }
      publish({ ...state, status: 'ready' });
      return true;
    },
    fail(navigationGeneration: number, message: string, retryable: boolean): boolean {
      if (state.status === 'idle' || state.navigationGeneration !== navigationGeneration) {
        return false;
      }
      publish({ ...state, status: 'error', message, retryable });
      return true;
    },
    clear(): void {
      retryAction = undefined;
      publish({ status: 'idle' });
    },
    retry(): boolean {
      if (state.status !== 'error' || !state.retryable || !retryAction) {
        return false;
      }
      retryAction();
      return true;
    },
    isCurrent(navigationGeneration: number): boolean {
      return state.status !== 'idle'
        && state.navigationGeneration === navigationGeneration;
    },
  };
}

export const managementRoutePresentation = createRoutePresentationStore();

