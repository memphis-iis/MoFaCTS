import { expect } from 'chai';
import { CardStore } from './cardStore';

describe('CardStore', function() {
  beforeEach(function() {
    CardStore.destroy();
    CardStore.initialize();
  });

  afterEach(function() {
    CardStore.destroy();
  });

  it('initializes key defaults for card and SR state', function() {
    expect(CardStore.isDisplayReady()).to.equal(false);
    expect(CardStore.isInputReady()).to.equal(false);
    expect(CardStore.isAudioInputModeEnabled()).to.equal(false);
    expect(CardStore.getHiddenItems()).to.deep.equal([]);
  });

  it('stores hidden items defensively and ignores duplicate additions', function() {
    const source = [{ id: 'stim-1' }] as unknown[];
    CardStore.setHiddenItems(source as never[]);
    source.push({ id: 'stim-2' });

    expect(CardStore.getHiddenItems() as unknown[]).to.deep.equal([{ id: 'stim-1' }]);

    CardStore.addHiddenItem('repeat-key');
    CardStore.addHiddenItem('repeat-key');
    expect((CardStore.getHiddenItems() as unknown[]).filter((item: unknown) => item === 'repeat-key')).to.have.length(1);
  });

  it('tracks and bounds paused locks', function() {
    CardStore.setPausedLocks(1);
    CardStore.incrementPausedLocks(2);
    CardStore.decrementPausedLocks(1);
    expect(CardStore.getPausedLocks()).to.equal(2);

    CardStore.decrementPausedLocks(10);
    expect(CardStore.getPausedLocks()).to.equal(0);
  });

  it('manages active timeout handle lifecycle', function() {
    const handle = { id: 'timeout-1' };
    CardStore.setActiveTimeoutHandle(handle);
    expect(CardStore.getActiveTimeoutHandle()).to.equal(handle);

    CardStore.clearActiveTimeoutHandle();
    expect(CardStore.getActiveTimeoutHandle()).to.equal(null);
  });
});

