/*
 * Adapted from viliceq/10block (MIT), commit
 * 93dfa7eaf785043d038a4e5f20ba358d90f6edd9.  See docs/licenses/10block-MIT.txt.
 * This module intentionally contains only renderer-independent game mechanics.
 */

export const BLOCKS_BOARD_SIZE = 10;

export type BlocksPieceFamily = 'single' | 'line' | 'sq2' | 'sq3' | 'l2' | 'l3';
export type BlocksPiece = Readonly<{
  id: string;
  family: BlocksPieceFamily;
  cells: ReadonlyArray<readonly [number, number]>;
}>;
export type BlocksBoard = ReadonlyArray<ReadonlyArray<BlocksPieceFamily | null>>;
export type BlocksGateState = 'board' | 'question' | 'game-over';

const line = (id: string, length: number, vertical = false): BlocksPiece => ({
  id,
  family: 'line',
  cells: Array.from({ length }, (_, index) => vertical ? [index, 0] as const : [0, index] as const),
});

export const BLOCKS_PIECES: readonly BlocksPiece[] = [
  { id: 'single', family: 'single', cells: [[0, 0]] },
  line('domino-h', 2), line('domino-v', 2, true),
  line('tromino-h', 3), line('tromino-v', 3, true),
  line('tetra-h', 4), line('tetra-v', 4, true),
  line('penta-h', 5), line('penta-v', 5, true),
  { id: 'square-2', family: 'sq2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: 'square-3', family: 'sq3', cells: Array.from({ length: 9 }, (_, index) => [Math.floor(index / 3), index % 3] as const) },
  { id: 'l2-ne', family: 'l2', cells: [[0, 0], [1, 0], [1, 1]] },
  { id: 'l2-se', family: 'l2', cells: [[0, 0], [0, 1], [1, 0]] },
  { id: 'l2-sw', family: 'l2', cells: [[0, 0], [0, 1], [1, 1]] },
  { id: 'l2-nw', family: 'l2', cells: [[0, 1], [1, 0], [1, 1]] },
  { id: 'l3-ne', family: 'l3', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
  { id: 'l3-se', family: 'l3', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]] },
  { id: 'l3-sw', family: 'l3', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { id: 'l3-nw', family: 'l3', cells: [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]] },
];

const WEIGHTS: Readonly<Record<BlocksPieceFamily, number>> = {
  single: 5, line: 12, sq2: 6, sq3: 1, l2: 5, l3: 1,
};
const EASY_FAMILIES = new Set<BlocksPieceFamily>(['single', 'sq2', 'l2']);

export function createBlocksBoard(): BlocksBoard {
  return Array.from({ length: BLOCKS_BOARD_SIZE }, () => Array.from({ length: BLOCKS_BOARD_SIZE }, () => null));
}

export function canPlaceBlocksPiece(board: BlocksBoard, piece: BlocksPiece, row: number, col: number): boolean {
  return piece.cells.every(([pieceRow, pieceCol]) => {
    const targetRow = row + pieceRow;
    const targetCol = col + pieceCol;
    return targetRow >= 0 && targetRow < BLOCKS_BOARD_SIZE && targetCol >= 0 && targetCol < BLOCKS_BOARD_SIZE && board[targetRow]?.[targetCol] === null;
  });
}

export function resolveBlocksPlacement(board: BlocksBoard, piece: BlocksPiece, row: number, col: number) {
  if (!canPlaceBlocksPiece(board, piece, row, col)) throw new Error('Blocks piece cannot be placed at that cell');
  const next = board.map((existingRow) => [...existingRow]);
  for (const [pieceRow, pieceCol] of piece.cells) next[row + pieceRow]![col + pieceCol] = piece.family;
  const rows = next.map((existingRow, index) => existingRow.every(Boolean) ? index : -1).filter((index) => index >= 0);
  const cols = Array.from({ length: BLOCKS_BOARD_SIZE }, (_, colIndex) => next.every((existingRow) => Boolean(existingRow[colIndex])) ? colIndex : -1).filter((index) => index >= 0);
  const rowSet = new Set(rows);
  const colSet = new Set(cols);
  const clearedBoard = next.map((existingRow, rowIndex) => existingRow.map((cell, colIndex) => rowSet.has(rowIndex) || colSet.has(colIndex) ? null : cell));
  return { board: clearedBoard as BlocksBoard, rowsCleared: rows, colsCleared: cols };
}

export function blocksLineBonus(lines: number): number {
  if (lines <= 0) return 0;
  if (lines === 1) return 10;
  if (lines === 2) return 30;
  if (lines === 3) return 60;
  if (lines === 4) return 120;
  if (lines === 5) return 200;
  if (lines === 6) return 300;
  return 300 + 50 * (lines - 6);
}

export function blocksStreakMultiplier(streak: number): number {
  return streak <= 1 ? 1 : Math.min(1 + 0.25 * (streak - 1), 3);
}

export function blocksHasLegalPlacement(board: BlocksBoard, tray: readonly (BlocksPiece | null)[]): boolean {
  return tray.some((piece) => piece && Array.from({ length: BLOCKS_BOARD_SIZE }, (_, row) =>
    Array.from({ length: BLOCKS_BOARD_SIZE }, (_, col) => canPlaceBlocksPiece(board, piece, row, col)).some(Boolean),
  ).some(Boolean));
}

export function createBlocksTray(random = Math.random): BlocksPiece[] {
  const families = Object.entries(WEIGHTS) as [BlocksPieceFamily, number][];
  const total = families.reduce((sum, [, weight]) => sum + weight, 0);
  const sample = () => {
    let cursor = random() * total;
    const family = families.find(([, weight]) => (cursor -= weight) < 0)?.[0] || 'single';
    const candidates = BLOCKS_PIECES.filter((piece) => piece.family === family);
    return candidates[Math.floor(random() * candidates.length)] || BLOCKS_PIECES[0]!;
  };
  const tray = [sample(), sample(), sample()];
  if (!tray.some((piece) => EASY_FAMILIES.has(piece.family))) {
    const easy = BLOCKS_PIECES.filter((piece) => EASY_FAMILIES.has(piece.family));
    tray[0] = easy[Math.floor(random() * easy.length)] || tray[0]!;
  }
  return tray;
}

export type BlocksGameState = Readonly<{
  board: BlocksBoard;
  tray: readonly (BlocksPiece | null)[];
  score: number;
  streak: number;
  gate: BlocksGateState;
}>;

export function createBlocksGame(random = Math.random): BlocksGameState {
  return { board: createBlocksBoard(), tray: createBlocksTray(random), score: 0, streak: 0, gate: 'board' };
}

export function placeBlocksPiece(state: BlocksGameState, trayIndex: number, row: number, col: number) {
  if (state.gate !== 'board') return state;
  const piece = state.tray[trayIndex];
  if (!piece || !canPlaceBlocksPiece(state.board, piece, row, col)) return state;
  const resolved = resolveBlocksPlacement(state.board, piece, row, col);
  const lines = resolved.rowsCleared.length + resolved.colsCleared.length;
  const streak = lines > 0 ? state.streak + 1 : 0;
  const perfect = resolved.board.every((boardRow) => boardRow.every((cell) => cell === null));
  const score = state.score + piece.cells.length + Math.round(blocksLineBonus(lines) * blocksStreakMultiplier(streak)) + (perfect ? 300 : 0);
  const tray = state.tray.map((item, index) => index === trayIndex ? null : item);
  const noPieceLeft = tray.every((item) => item === null);
  const gate: BlocksGateState = noPieceLeft ? 'question' : blocksHasLegalPlacement(resolved.board, tray) ? 'board' : 'game-over';
  return { board: resolved.board, tray, score, streak, gate };
}

export function replenishBlocksAfterCorrectAnswer(state: BlocksGameState, random = Math.random): BlocksGameState {
  if (state.gate !== 'question') return state;
  const tray = createBlocksTray(random);
  return { ...state, tray, gate: blocksHasLegalPlacement(state.board, tray) ? 'board' : 'game-over' };
}
