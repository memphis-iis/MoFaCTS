import { expect } from 'chai';
import { Session } from 'meteor/session';
import { ExperimentStateStore } from './experimentStateStore';

describe('ExperimentStateStore', function() {
  const KEY = 'currentExperimentState';

  beforeEach(function() {
    Session.set(KEY, undefined);
  });

  afterEach(function() {
    Session.set(KEY, undefined);
  });

  it('gets undefined when no state is present', function() {
    expect(ExperimentStateStore.get()).to.equal(undefined);
  });

  it('sets and gets state snapshots', function() {
    const state = { currentTdfId: 'tdf-1', unit: 2 };
    ExperimentStateStore.set(state);

    expect(ExperimentStateStore.get()).to.deep.equal(state);
  });

  it('updates state via updater function', function() {
    ExperimentStateStore.set({ currentTdfId: 'tdf-1', currentUnitNumber: 0 });

    const next = ExperimentStateStore.update((current) => ({
      ...current,
      currentUnitNumber: 1,
    }));

    expect(next.currentUnitNumber).to.equal(1);
    expect(ExperimentStateStore.get()!.currentUnitNumber).to.equal(1);
  });

  it('clears state', function() {
    ExperimentStateStore.set({ currentTdfId: 'tdf-1' });
    ExperimentStateStore.clear();

    expect(ExperimentStateStore.get()).to.equal(undefined);
  });
});

