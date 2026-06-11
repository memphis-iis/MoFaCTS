import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { Tracker } from 'meteor/tracker';

export interface ReactiveComputation {
  stop: () => void;
}

export type Autorun = (callback: () => void) => ReactiveComputation;

export interface CardReactiveTrackers {
  readonly start: () => void;
  readonly stop: () => void;
}

export function createCardReactiveTrackers(deps: {
  readonly autorun: Autorun;
  readonly getPerformance: () => unknown;
  readonly getUser: () => unknown;
  readonly getVideoCheckpoints: () => unknown;
  readonly setPerformanceData: (performance: unknown) => void;
  readonly setUser: (user: unknown) => void;
  readonly setVideoCheckpoints: (videoCheckpoints: unknown) => void;
  readonly resetCompletedVideoQuestions: () => void;
}): CardReactiveTrackers {
  let computations: ReactiveComputation[] = [];

  function stop(): void {
    for (const computation of computations) {
      computation.stop();
    }
    computations = [];
  }

  function start(): void {
    stop();
    computations = [
      deps.autorun(() => {
        deps.setPerformanceData(deps.getPerformance());
      }),
      deps.autorun(() => {
        deps.setUser(deps.getUser());
      }),
      deps.autorun(() => {
        deps.setVideoCheckpoints(deps.getVideoCheckpoints());
        deps.resetCompletedVideoQuestions();
      }),
    ];
  }

  return {
    start,
    stop,
  };
}

export function createMeteorCardReactiveTrackers(deps: {
  readonly setPerformanceData: (performance: unknown) => void;
  readonly setUser: (user: unknown) => void;
  readonly setVideoCheckpoints: (videoCheckpoints: unknown) => void;
  readonly resetCompletedVideoQuestions: () => void;
}): CardReactiveTrackers {
  return createCardReactiveTrackers({
    autorun: (callback) => Tracker.autorun(callback),
    getPerformance: () => Session.get('curStudentPerformance'),
    getUser: () => Meteor.user(),
    getVideoCheckpoints: () => Session.get('videoCheckpoints'),
    ...deps,
  });
}
