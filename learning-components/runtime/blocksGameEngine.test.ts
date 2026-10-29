import { strict as assert } from 'node:assert';
import {
  BLOCKS_PIECES,
  blocksHasLegalPlacement,
  canPlaceBlocksPiece,
  createBlocksBoard,
  createBlocksGame,
  createBlocksTray,
  placeBlocksPiece,
  replenishBlocksAfterCorrectAnswer,
  resolveBlocksPlacement,
} from './blocksGameEngine';

describe('blocks game engine', function() {
  const single = BLOCKS_PIECES.find((piece) => piece.id === 'single')!;
  const square = BLOCKS_PIECES.find((piece) => piece.id === 'square-2')!;

  it('rejects out-of-bounds and overlapping placements', function() {
    const board = createBlocksBoard();
    assert.equal(canPlaceBlocksPiece(board, square, 9, 9), false);
    const placed = resolveBlocksPlacement(board, single, 0, 0).board;
    assert.equal(canPlaceBlocksPiece(placed, single, 0, 0), false);
  });

  it('clears a completed row and awards a question gate after a tray is exhausted', function() {
    let board = createBlocksBoard();
    for (let column = 0; column < 9; column += 1) board = resolveBlocksPlacement(board, single, 0, column).board;
    const resolved = resolveBlocksPlacement(board, single, 0, 9);
    assert.deepEqual(resolved.rowsCleared, [0]);
    assert.equal(resolved.board[0]?.every((cell) => cell === null), true);

    const game = createBlocksGame(() => 0);
    const gated = { ...game, tray: [single, null, null] as const };
    assert.equal(placeBlocksPiece(gated, 0, 0, 0).gate, 'question');
  });

  it('preserves partially filled rows and columns', function() {
    let board = createBlocksBoard();
    board = resolveBlocksPlacement(board, single, 0, 0).board;
    board = resolveBlocksPlacement(board, single, 0, 1).board;

    assert.deepEqual(board[0]?.slice(0, 2), ['single', 'single']);
    assert.equal(board[0]?.slice(2).every((cell) => cell === null), true);
  });

  it('repopulates a question-gated tray after a correct answer and only once', function() {
    const game = createBlocksGame(() => 0);
    assert.equal(replenishBlocksAfterCorrectAnswer(game, () => 0), game);
    const questionGated = { ...game, tray: [null, null, null] as const, gate: 'question' as const };
    const replenished = replenishBlocksAfterCorrectAnswer(questionGated, () => 0);
    assert.equal(replenished.gate, 'board');
    assert.equal(replenished.tray.every(Boolean), true);
    assert.equal(replenishBlocksAfterCorrectAnswer(replenished, () => 0), replenished);
  });

  it('detects when a replenished tray has no legal move', function() {
    const full = createBlocksBoard().map((row) => row.map(() => 'single' as const));
    assert.equal(blocksHasLegalPlacement(full, [single]), false);
  });

  it('awards placement, simultaneous line clears and perfect-board bonuses without mutating prior state', function() {
    const board = createBlocksBoard().map((row, rowIndex) => row.map((_cell, colIndex) =>
      (rowIndex === 0 || colIndex === 0) && rowIndex + colIndex > 0 ? 'single' as const : null));
    const state = { ...createBlocksGame(() => 0), board, tray: [single, null, null] as const, score: 7, streak: 1 };
    const next = placeBlocksPiece(state, 0, 0, 0);
    assert.equal(next.score, 7 + 1 + Math.round(30 * 1.25) + 300);
    assert.equal(next.streak, 2);
    assert.equal(next.gate, 'question');
    assert.equal(next.board.every(row => row.every(cell => cell === null)), true);
    assert.equal(state.board[0]?.[0], null);
    assert.equal(state.tray[0], single);
  });

  it('preserves the question gate until an earned replenishment and ends when the new tray cannot fit', function() {
    const state = { ...createBlocksGame(() => 0), gate: 'question' as const };
    assert.equal(placeBlocksPiece(state, 0, 0, 0), state);
    const full = { ...state, board: createBlocksBoard().map(row => row.map(() => 'single' as const)) };
    assert.equal(replenishBlocksAfterCorrectAnswer(full, () => 0).gate, 'game-over');
  });

  it('rejects an invalid random dependency instead of substituting a piece', function() {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1]) {
      assert.throws(() => createBlocksTray(() => value), /Blocks random source/);
    }
  });
});
