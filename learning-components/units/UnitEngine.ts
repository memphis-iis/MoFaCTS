export interface UnitSelection {
  readonly clusterIndex?: number;
  readonly stimIndex?: number;
  readonly whichStim?: number;
  readonly testType?: string;
}

export type PreparedAdvanceMode = 'none' | 'seamless' | 'direct';

export interface PreparedUnitTrial {
  readonly selection: Record<string, unknown> | null;
  readonly preparedAdvanceMode: PreparedAdvanceMode;
  readonly questionIndex?: number;
  readonly preparedContent?: Record<string, unknown> | null;
}

export interface PrepareUnitTrialContext {
  readonly experimentState: unknown;
  readonly currentCardRef?: Record<string, unknown> | null;
  readonly ownerToken?: string | null;
}

export interface UnitAnswerOutcome {
  readonly correct: boolean;
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
  prepareNextTrial(context: PrepareUnitTrialContext): Promise<PreparedUnitTrial>;
  commitPreparedTrial(selection: Record<string, unknown> | null, experimentState: unknown): boolean;
  advanceAfterAnswer(outcomes: readonly UnitAnswerOutcome[], practiceTime: number, testType: string): Promise<void>;
  isFinished(): Promise<boolean> | boolean;
  getDisplayQuestionIndex(machineQuestionIndex: number): number;
  clearPreparedTrial(reason: string): void;
}

export type UnitEngineExtension = Pick<
  UnitEngine,
  | 'unitType'
  | 'selectNextCard'
  | 'cardAnswered'
  | 'unitFinished'
  | 'prepareNextTrial'
  | 'commitPreparedTrial'
  | 'advanceAfterAnswer'
  | 'isFinished'
  | 'getDisplayQuestionIndex'
  | 'clearPreparedTrial'
> & Partial<UnitEngine> & Record<string, unknown>;
