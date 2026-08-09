import { createBlocksGame, type BlocksGameState } from './blocksGameEngine';

let activeBlocksGame: BlocksGameState | null = null;

export function loadBlocksPracticeGame(): BlocksGameState {
  activeBlocksGame ||= createBlocksGame();
  return activeBlocksGame;
}

export function saveBlocksPracticeGame(game: BlocksGameState): BlocksGameState {
  activeBlocksGame = game;
  return game;
}

export function clearBlocksPracticeGame(): void {
  activeBlocksGame = null;
}
