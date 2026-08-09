import { expect } from 'chai';
import {
  BLOCKS_PIECES,
  blocksHasLegalPlacement,
  canPlaceBlocksPiece,
  createBlocksBoard,
  createBlocksGame,
  placeBlocksPiece,
  replenishBlocksAfterCorrectAnswer,
  resolveBlocksPlacement,
} from './blocksGameEngine';

describe('blocks game engine', function() {
  const single = BLOCKS_PIECES.find((piece) => piece.id === 'single')!;
  const square = BLOCKS_PIECES.find((piece) => piece.id === 'square-2')!;

  it('rejects out-of-bounds and overlapping placements', function() {
    const board = createBlocksBoard();
    expect(canPlaceBlocksPiece(board, square, 9, 9)).to.equal(false);
    const placed = resolveBlocksPlacement(board, single, 0, 0).board;
    expect(canPlaceBlocksPiece(placed, single, 0, 0)).to.equal(false);
  });

  it('clears a completed row and awards a question gate after a tray is exhausted', function() {
    let board = createBlocksBoard();
    for (let column = 0; column < 9; column += 1) board = resolveBlocksPlacement(board, single, 0, column).board;
    const resolved = resolveBlocksPlacement(board, single, 0, 9);
    expect(resolved.rowsCleared).to.deep.equal([0]);
    expect(resolved.board[0]?.every((cell) => cell === null)).to.equal(true);

    const game = createBlocksGame(() => 0);
    const gated = { ...game, tray: [single, null, null] as const };
    expect(placeBlocksPiece(gated, 0, 0, 0).gate).to.equal('question');
  });

  it('preserves partially filled rows and columns', function() {
    let board = createBlocksBoard();
    board = resolveBlocksPlacement(board, single, 0, 0).board;
    board = resolveBlocksPlacement(board, single, 0, 1).board;

    expect(board[0]?.slice(0, 2)).to.deep.equal(['single', 'single']);
    expect(board[0]?.slice(2).every((cell) => cell === null)).to.equal(true);
  });

  it('repopulates a question-gated tray after a correct answer and only once', function() {
    const game = createBlocksGame(() => 0);
    expect(replenishBlocksAfterCorrectAnswer(game, () => 0)).to.equal(game);
    const questionGated = { ...game, tray: [null, null, null] as const, gate: 'question' as const };
    const replenished = replenishBlocksAfterCorrectAnswer(questionGated, () => 0);
    expect(replenished.gate).to.equal('board');
    expect(replenished.tray.every(Boolean)).to.equal(true);
    expect(replenishBlocksAfterCorrectAnswer(replenished, () => 0)).to.equal(replenished);
  });

  it('detects when a replenished tray has no legal move', function() {
    const full = createBlocksBoard().map((row) => row.map(() => 'single' as const));
    expect(blocksHasLegalPlacement(full, [single])).to.equal(false);
  });
});
