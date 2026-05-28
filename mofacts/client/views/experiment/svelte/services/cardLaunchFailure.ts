export interface CardLaunchFailureUser {
  readonly loginParams?: {
    readonly loginMode?: string;
  };
}

export interface CardLaunchFailureDependencies {
  readonly finishLaunchLoading: (reason: 'card-initialization-failed') => void;
  readonly getLoginMode: () => unknown;
  readonly getUser: () => CardLaunchFailureUser | null | undefined;
  readonly routeTo: (path: '/experimentError' | '/home') => void;
  readonly setSessionValue: (key: string, value: unknown) => void;
}

export function isExperimentParticipantSession(params: {
  readonly user: CardLaunchFailureUser | null | undefined;
  readonly loginMode: unknown;
}): boolean {
  return params.user?.loginParams?.loginMode === 'experiment' ||
    params.loginMode === 'experiment';
}

export function routeCardInitializationFailure(deps: CardLaunchFailureDependencies): void {
  deps.finishLaunchLoading('card-initialization-failed');
  deps.setSessionValue('appLoading', false);

  if (isExperimentParticipantSession({
    user: deps.getUser(),
    loginMode: deps.getLoginMode(),
  })) {
    deps.setSessionValue('uiMessage', null);
    deps.setSessionValue('experimentError', {
      title: 'Experiment paused',
      message: 'This practice activity did not start correctly.',
      note: 'Please email the experiment coordinator or study contact with your participant ID.',
    });
    deps.setSessionValue('suppressAuthenticatedChrome', true);
    deps.routeTo('/experimentError');
    return;
  }

  deps.setSessionValue('uiMessage', {
    text: 'Lesson did not initialize correctly. Please restart from the practice menu.',
    variant: 'danger',
  });
  deps.routeTo('/home');
}
