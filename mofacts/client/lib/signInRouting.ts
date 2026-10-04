import { Session } from 'meteor/session';
import { Cookie } from './cookies';
import { setExperimentParticipantContext } from './idContext';
import { isLessonRoutePath } from './lessonRoute';
import { resolveNormalLoginDestination, type NormalLoginReturnDestination } from './normalLoginDestination';
import { clearStoredPublicDemoSession } from './publicDemoSession';

type SignInRoutingContext = {
  currentPath: string;
  loginMode: unknown;
  experimentTarget: string;
  experimentXCond: string;
  rememberedExperiment: boolean;
  rememberedTarget: string;
  rememberedXCond: string;
  returnTo?: NormalLoginReturnDestination | undefined;
};

export type SignInDestination =
  | { kind: 'normal'; returnTo: string }
  | { kind: 'experiment'; target: string; xcond: string };

const ORDINARY_LOGIN_MODES = new Set(['password', 'google', 'microsoft', 'memphisSaml']);

export function resolveSignInDestination(context: SignInRoutingContext): SignInDestination {
  const pathname = context.currentPath.split('?')[0] || '';
  const experimentEntry = /^\/experiment(?:\/|$)/.test(pathname);
  const lessonContinuation = isLessonRoutePath(context.currentPath);
  const ordinaryLogin = ORDINARY_LOGIN_MODES.has(String(context.loginMode));

  // An explicit ordinary destination always wins. Cookies may only restore
  // experiment context on experiment entry or shared learner runtime routes.
  if (context.returnTo === undefined && experimentEntry) {
    const parts = pathname.split('/');
    return { kind: 'experiment', target: decodeURIComponent(parts[2] || ''), xcond: decodeURIComponent(parts[3] || '') };
  }
  if (context.returnTo === undefined && lessonContinuation && !ordinaryLogin) {
    if (context.loginMode === 'experiment') {
      return { kind: 'experiment', target: context.experimentTarget, xcond: context.experimentXCond };
    }
    if (context.rememberedExperiment) {
      return { kind: 'experiment', target: context.rememberedTarget, xcond: context.rememberedXCond };
    }
  }
  return { kind: 'normal', returnTo: resolveNormalLoginDestination(context.returnTo ?? context.currentPath) };
}

export function getSignInDestination(
  returnTo?: NormalLoginReturnDestination,
  loginMode: unknown = Session.get('loginMode'),
): SignInDestination {
  return resolveSignInDestination({
    currentPath: `${window.location.pathname}${window.location.search}`,
    loginMode,
    experimentTarget: Session.get('experimentTarget') || '',
    experimentXCond: Session.get('experimentXCond') || '',
    rememberedExperiment: Cookie.get('isExperiment') === '1',
    rememberedTarget: Cookie.get('experimentTarget'),
    rememberedXCond: Cookie.get('experimentXCond'),
    returnTo,
  });
}

export function clearExperimentSignInContext(): void {
  Session.set('loginMode', 'normal');
  setExperimentParticipantContext({ experimentTarget: '' }, 'signInRouting.normalEntry');
  Session.set('experimentXCond', '');
  Session.set('experimentPasswordRequired', false);
  Session.set('loginPrompt', '');
  Session.set('useEmbeddedAPIKeys', false);
  Cookie.set('isExperiment', '0', 1);
  Cookie.set('experimentTarget', '', 1);
  Cookie.set('experimentXCond', '', 1);
  clearStoredPublicDemoSession();
}
