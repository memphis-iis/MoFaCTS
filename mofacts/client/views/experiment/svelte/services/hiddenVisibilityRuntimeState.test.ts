import { expect } from 'chai';
import {
  addHiddenItem,
  adjustNumVisibleCards,
  getHiddenItems,
  getNumVisibleCards,
  resetHiddenItems,
  resetHiddenVisibilityRuntimeState,
  setHiddenItems,
  setNumVisibleCards,
  setWasReportedForRemoval,
  wasReportedForRemoval,
} from './hiddenVisibilityRuntimeState';

describe('hiddenVisibilityRuntimeState', function() {
  beforeEach(function() {
    resetHiddenVisibilityRuntimeState();
  });

  afterEach(function() {
    resetHiddenVisibilityRuntimeState();
  });

  it('stores hidden items defensively and ignores duplicate additions', function() {
    const source = [{ id: 'stim-1' }] as unknown[];
    setHiddenItems(source);
    source.push({ id: 'stim-2' });

    expect(getHiddenItems()).to.deep.equal([{ id: 'stim-1' }]);

    addHiddenItem('repeat-key');
    addHiddenItem('repeat-key');
    expect(getHiddenItems().filter((item: unknown) => item === 'repeat-key')).to.have.length(1);
  });

  it('resets hidden items independently', function() {
    setHiddenItems(['hidden']);

    resetHiddenItems();

    expect(getHiddenItems()).to.deep.equal([]);
  });

  it('owns visible-card count and removal-report flag', function() {
    expect(getNumVisibleCards()).to.equal(0);
    expect(wasReportedForRemoval()).to.equal(false);

    setNumVisibleCards(3);
    adjustNumVisibleCards(2);
    setWasReportedForRemoval(true);

    expect(getNumVisibleCards()).to.equal(5);
    expect(wasReportedForRemoval()).to.equal(true);
  });

  it('clears visibility state on reset', function() {
    setHiddenItems(['hidden']);
    setNumVisibleCards(4);
    setWasReportedForRemoval(true);

    resetHiddenVisibilityRuntimeState();

    expect(getHiddenItems()).to.deep.equal([]);
    expect(getNumVisibleCards()).to.equal(0);
    expect(wasReportedForRemoval()).to.equal(false);
  });
});
