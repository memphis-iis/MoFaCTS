import { expect } from 'chai';
import { Session } from 'meteor/session';
import { Cookie } from './cookies';
import { PUBLIC_DEMO_SESSION_STORAGE_KEY } from './publicDemoSession';
import { clearExperimentSignInContext, getSignInDestination, resolveSignInDestination } from './signInRouting';

describe('signInRouting destination ownership', function() {
  const remembered = {
    currentPath: '/home',
    loginMode: 'normal',
    experimentTarget: '',
    experimentXCond: '',
    rememberedExperiment: true,
    rememberedTarget: 'public-demo-student-maps',
    rememberedXCond: '2',
  };

  for (const path of ['/home', '/auth/login', '/courses', '/contentUpload', '/classes/teacher/section', '/']) {
    it(`uses ordinary sign-in for ${path} despite experiment cookies and active experiment mode`, function() {
      const result = resolveSignInDestination({ ...remembered, currentPath: path, loginMode: 'experiment' });
      expect(result.kind).to.equal('normal');
      if (result.kind === 'normal') expect(result.returnTo).not.to.match(/^\/(experiment|auth)\//);
    });
  }

  it('preserves the explicit normal destination ahead of active experiment context', function() {
    expect(resolveSignInDestination({
      ...remembered, currentPath: '/content/root-a', loginMode: 'experiment', returnTo: '/courses?section=active',
    })).to.deep.equal({ kind: 'normal', returnTo: '/courses?section=active' });
  });

  it('validates an explicit normal return destination without restoring an experiment', function() {
    expect(resolveSignInDestination({ ...remembered, returnTo: 'https://example.com' }))
      .to.deep.equal({ kind: 'normal', returnTo: '/home' });
  });

  for (const path of ['/content/root-a', '/instructions/root-a?mode=blocks']) {
    it(`restores remembered experiment continuation on ${path}`, function() {
      expect(resolveSignInDestination({ ...remembered, currentPath: path }))
        .to.deep.equal({ kind: 'experiment', target: 'public-demo-student-maps', xcond: '2' });
    });

    for (const loginMode of ['password', 'google', 'microsoft', 'memphisSaml']) {
      it(`keeps ${loginMode} session loss on ${path} in ordinary sign-in`, function() {
        expect(resolveSignInDestination({ ...remembered, currentPath: path, loginMode }))
          .to.deep.equal({ kind: 'normal', returnTo: path });
      });
    }
  }

  it('uses active experiment target and condition ahead of a different remembered experiment', function() {
    expect(resolveSignInDestination({
      ...remembered, currentPath: '/content/root-a', loginMode: 'experiment',
      experimentTarget: 'study-a', experimentXCond: '3',
    })).to.deep.equal({ kind: 'experiment', target: 'study-a', xcond: '3' });
  });

  it('preserves explicit experiment entry even with an ordinary provider mode', function() {
    expect(resolveSignInDestination({ ...remembered, currentPath: '/experiment/study-a/2', loginMode: 'google' }))
      .to.deep.equal({ kind: 'experiment', target: 'study-a', xcond: '2' });
  });

  it('returns an ordinary lesson to its URL when no experiment is remembered', function() {
    expect(resolveSignInDestination({ ...remembered, currentPath: '/content/root-a', rememberedExperiment: false }))
      .to.deep.equal({ kind: 'normal', returnTo: '/content/root-a' });
  });
});

describe('signInRouting ordinary entry cleanup', function() {
  const keys = ['loginMode', 'experimentTarget', 'experimentXCond', 'experimentPasswordRequired',
    'loginPrompt', 'useEmbeddedAPIKeys', 'sessionUserId', 'currentTdfId', 'currentUnitNumber'];
  let previousSession: unknown[];
  let previousCookies: typeof Cookie.cookieSource;
  let previousDemo: string | null;
  let previousPath: string;
  const cookies = new Map<string, string>();

  beforeEach(function() {
    previousSession = keys.map((key) => Session.get(key));
    previousCookies = Cookie.cookieSource;
    previousDemo = window.sessionStorage.getItem(PUBLIC_DEMO_SESSION_STORAGE_KEY);
    previousPath = `${window.location.pathname}${window.location.search}`;
    cookies.clear();
    Cookie.cookieSource = {
      get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); },
      set cookie(value: string) {
        const [entry] = value.split(';');
        const separator = entry!.indexOf('=');
        cookies.set(entry!.slice(0, separator), entry!.slice(separator + 1));
      },
    };
    Session.set('loginMode', 'experiment');
    Session.set('experimentTarget', 'study-a');
    Session.set('experimentXCond', '3');
    Session.set('experimentPasswordRequired', true);
    Session.set('loginPrompt', 'Participant ID');
    Session.set('useEmbeddedAPIKeys', true);
    Session.set('currentTdfId', 'root-a');
    Session.set('currentUnitNumber', 4);
    Cookie.set('isExperiment', '1');
    Cookie.set('experimentTarget', 'study-a');
    Cookie.set('experimentXCond', '3');
    window.sessionStorage.setItem(PUBLIC_DEMO_SESSION_STORAGE_KEY, '{"kind":"student"}');
  });

  afterEach(function() {
    keys.forEach((key, index) => Session.set(key, previousSession[index]));
    Cookie.cookieSource = previousCookies;
    window.history.replaceState({}, '', previousPath);
    if (previousDemo === null) window.sessionStorage.removeItem(PUBLIC_DEMO_SESSION_STORAGE_KEY);
    else window.sessionStorage.setItem(PUBLIC_DEMO_SESSION_STORAGE_KEY, previousDemo);
  });

  it('clears experiment routing and presentation without changing learner progress', function() {
    clearExperimentSignInContext();
    expect(Session.get('loginMode')).to.equal('normal');
    expect(Session.get('experimentTarget')).to.equal('');
    expect(Session.get('experimentXCond')).to.equal('');
    expect(Session.get('experimentPasswordRequired')).to.equal(false);
    expect(Session.get('loginPrompt')).to.equal('');
    expect(Session.get('useEmbeddedAPIKeys')).to.equal(false);
    expect(Cookie.get('isExperiment')).to.equal('0');
    expect(Cookie.get('experimentTarget')).to.equal('');
    expect(Cookie.get('experimentXCond')).to.equal('');
    expect(window.sessionStorage.getItem(PUBLIC_DEMO_SESSION_STORAGE_KEY)).to.equal(null);
    expect(Session.get('currentTdfId')).to.equal('root-a');
    expect(Session.get('currentUnitNumber')).to.equal(4);
  });

  it('clears context idempotently and cannot restore the old experiment afterward', function() {
    clearExperimentSignInContext();
    clearExperimentSignInContext();
    expect(getSignInDestination('/home')).to.deep.equal({ kind: 'normal', returnTo: '/home' });
  });

  it('uses the last authenticated Google mode after user removal instead of stale experiment state', function() {
    window.history.replaceState({}, '', '/content/root-a');
    expect(getSignInDestination(undefined, 'google'))
      .to.deep.equal({ kind: 'normal', returnTo: '/content/root-a' });
  });
});
