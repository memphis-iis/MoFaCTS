import { expect } from 'chai';
import {
  isExperimentParticipantSession,
  routeCardInitializationFailure,
  type CardLaunchFailureUser,
} from './cardLaunchFailure';

function createDeps(user: CardLaunchFailureUser | null, loginMode: unknown) {
  const sessionValues = new Map<string, unknown>();
  const routes: string[] = [];
  const launchReasons: string[] = [];

  return {
    deps: {
      finishLaunchLoading: (reason: 'card-initialization-failed') => {
        launchReasons.push(reason);
      },
      getLoginMode: () => loginMode,
      getUser: () => user,
      routeTo: (path: '/experimentError' | '/learningDashboard') => {
        routes.push(path);
      },
      setSessionValue: (key: string, value: unknown) => {
        sessionValues.set(key, value);
      },
    },
    launchReasons,
    routes,
    sessionValues,
  };
}

describe('card launch failure routing', function() {
  it('detects experiment participants from user login params or session login mode', function() {
    expect(isExperimentParticipantSession({
      user: { loginParams: { loginMode: 'experiment' } },
      loginMode: 'normal',
    })).to.equal(true);
    expect(isExperimentParticipantSession({
      user: null,
      loginMode: 'experiment',
    })).to.equal(true);
    expect(isExperimentParticipantSession({
      user: { loginParams: { loginMode: 'password' } },
      loginMode: 'normal',
    })).to.equal(false);
  });

  it('routes experiment participants to the experiment error page', function() {
    const harness = createDeps({ loginParams: { loginMode: 'experiment' } }, 'normal');

    routeCardInitializationFailure(harness.deps);

    expect(harness.launchReasons).to.deep.equal(['card-initialization-failed']);
    expect(harness.routes).to.deep.equal(['/experimentError']);
    expect(harness.sessionValues.get('appLoading')).to.equal(false);
    expect(harness.sessionValues.get('uiMessage')).to.equal(null);
    expect(harness.sessionValues.get('suppressAuthenticatedChrome')).to.equal(true);
    expect(harness.sessionValues.get('experimentError')).to.deep.equal({
      title: 'Experiment paused',
      message: 'This practice activity did not start correctly.',
      note: 'Please email the experiment coordinator or study contact with your participant ID.',
    });
  });

  it('routes ordinary learners back to the dashboard with the existing message', function() {
    const harness = createDeps(null, 'normal');

    routeCardInitializationFailure(harness.deps);

    expect(harness.launchReasons).to.deep.equal(['card-initialization-failed']);
    expect(harness.routes).to.deep.equal(['/learningDashboard']);
    expect(harness.sessionValues.get('appLoading')).to.equal(false);
    expect(harness.sessionValues.get('uiMessage')).to.deep.equal({
      text: 'Lesson did not initialize correctly. Please restart from the Learning Dashboard.',
      variant: 'danger',
    });
    expect(harness.sessionValues.has('experimentError')).to.equal(false);
    expect(harness.sessionValues.has('suppressAuthenticatedChrome')).to.equal(false);
  });
});
