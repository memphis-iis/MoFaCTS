import { expect } from 'chai';
import {
  shouldEnterBlocksBoard,
  shouldEnterBlocksBoardFromPreparedAdvance,
} from './contentRuntimeMachineTransitionGuards';

function args(context: Record<string, unknown>) {
  return { context, event: { type: '__test__' } } as never;
}

describe('Blocks content-runtime transition guards', function() {
  it('enters a puzzle board only for a Blocks launch that has earned a tray', function() {
    expect(shouldEnterBlocksBoard(args({ practiceLaunchMode: 'blocks', blocksNeedsTray: true }))).to.equal(true);
    expect(shouldEnterBlocksBoard(args({ practiceLaunchMode: 'normal', blocksNeedsTray: true }))).to.equal(false);
    expect(shouldEnterBlocksBoard(args({ practiceLaunchMode: 'blocks', blocksNeedsTray: false }))).to.equal(false);
  });

  it('requires an actual prepared next card before replacing the normal prepared-card display route', function() {
    expect(shouldEnterBlocksBoardFromPreparedAdvance(args({
      practiceLaunchMode: 'blocks',
      blocksNeedsTray: true,
      preparedTrial: { currentDisplay: { text: 'next question' } },
    }))).to.equal(true);
    expect(shouldEnterBlocksBoardFromPreparedAdvance(args({
      practiceLaunchMode: 'blocks',
      blocksNeedsTray: true,
      preparedTrial: null,
    }))).to.equal(false);
  });
});
