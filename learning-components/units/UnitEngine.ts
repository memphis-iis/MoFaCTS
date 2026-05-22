export interface UnitSelection {
  readonly clusterIndex?: number;
  readonly stimIndex?: number;
  readonly whichStim?: number;
  readonly testType?: string;
}

export interface UnitEngine {
  readonly unitType: string;

  init(): Promise<void>;
  loadResumeState(): Promise<void>;
  selectNextCard(indices?: unknown, curExperimentState?: unknown): Promise<UnitSelection | void> | UnitSelection | void;
  findCurrentCardInfo?(): unknown;
  cardAnswered(wasCorrect?: boolean, practiceTime?: number): Promise<void>;
  updatePracticeTime?(practiceTime?: number): void;
  unitFinished(): boolean | Promise<boolean>;
  prefetchNextCard?(indices?: unknown, curExperimentState?: unknown): Promise<void> | void;
  applyPrefetchedNextCard?(curExperimentState?: unknown): Promise<boolean> | boolean;
  clearPrefetchedNextCard?(): void;
}
