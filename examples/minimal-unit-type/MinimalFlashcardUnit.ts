import type { UnitEngine, UnitSelection } from '../../learning-components/units/UnitEngine';

export interface MinimalFlashcardUnitDeps {
  readonly cards: Array<{ prompt: string; answer: string }>;
  readonly showCard: (card: { prompt: string; answer: string }, index: number) => void;
}

export function createMinimalFlashcardUnit(deps: MinimalFlashcardUnitDeps): UnitEngine {
  let index = -1;

  return {
    unitType: 'example-minimal-flashcard',

    async init() {
      if (!deps.cards.length) {
        throw new Error('Minimal flashcard unit requires at least one card');
      }
    },

    async loadResumeState() {
      index = -1;
    },

    selectNextCard(): UnitSelection | void {
      const nextIndex = index + 1;
      const card = deps.cards[nextIndex];
      if (!card) {
        return;
      }

      index = nextIndex;
      deps.showCard(card, index);
      return { clusterIndex: index, stimIndex: 0, testType: 'd' };
    },

    findCurrentCardInfo() {
      return { index, card: deps.cards[index] ?? null };
    },

    async cardAnswered() {
      // This minimal example leaves scoring to the caller.
    },

    unitFinished() {
      return index >= deps.cards.length - 1;
    },
    async prepareNextTrial() {
      return { selection: null, preparedAdvanceMode: 'direct' };
    },
    commitPreparedTrial() { return false; },
    async advanceAfterAnswer(outcomes, practiceTime) {
      for (const outcome of outcomes) {
        await this.cardAnswered(outcome.correct, practiceTime);
      }
    },
    isFinished() { return this.unitFinished(); },
    getDisplayQuestionIndex(machineQuestionIndex) { return machineQuestionIndex; },
    clearPreparedTrial() { },
  };
}
