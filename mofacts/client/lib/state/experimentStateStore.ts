import { Session } from 'meteor/session';
import type { ExperimentState } from '../../../common/types/experiment';

const CURRENT_EXPERIMENT_STATE_KEY = 'currentExperimentState';

const ExperimentStateStore = {
  get(): ExperimentState | undefined {
    return Session.get(CURRENT_EXPERIMENT_STATE_KEY);
  },

  set(value: ExperimentState | undefined): void {
    Session.set(CURRENT_EXPERIMENT_STATE_KEY, value);
  },

  update(updater: (state: ExperimentState) => ExperimentState): ExperimentState {
    const current = this.get() || {};
    const next = typeof updater === 'function' ? updater({ ...current }) : current;
    this.set(next);
    return next;
  },

  clear(): void {
    Session.set(CURRENT_EXPERIMENT_STATE_KEY, undefined);
  },
};

export { ExperimentStateStore };
