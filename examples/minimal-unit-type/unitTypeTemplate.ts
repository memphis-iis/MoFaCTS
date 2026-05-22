export interface UnitSelection {
  clusterIndex: number;
  stimulusIndex: number;
}

export interface UnitEngine {
  readonly unitType: string;
  init(): Promise<void>;
  loadResumeState(): Promise<void>;
  selectNextCard(): Promise<UnitSelection | void>;
  cardAnswered(wasCorrect?: boolean, practiceTime?: number): Promise<void>;
  unitFinished(): boolean | Promise<boolean>;
}

export function createMinimalUnitEngine(): UnitEngine {
  let initialized = false;
  let answered = false;

  return {
    unitType: "minimal-unit",

    async init() {
      initialized = true;
    },

    async loadResumeState() {
      if (!initialized) {
        throw new Error("Cannot load resume state before init().");
      }
    },

    async selectNextCard() {
      if (!initialized) {
        throw new Error("Cannot select a card before init().");
      }

      if (answered) {
        return;
      }

      return { clusterIndex: 0, stimulusIndex: 0 };
    },

    async cardAnswered() {
      if (!initialized) {
        throw new Error("Cannot answer a card before init().");
      }

      answered = true;
    },

    unitFinished() {
      return answered;
    },
  };
}
