import type { LearningComponentCapability } from '../../runtime/ComponentManifest';
import type {
  ComponentLogger,
  HistoryRuntime,
  ServerMethodRuntime,
  SessionRuntime,
} from '../../runtime/LearningComponentContext';

export const AUTO_TUTOR_UNIT_REQUIRED_CAPABILITIES = [
  'session',
  'server-methods',
  'history',
  'logging',
] as const satisfies readonly LearningComponentCapability[];

export type AutoTutorSessionSnapshot = {
  currentTdfId: string;
  currentTdfName: string;
  currentUnitNumber: number;
  currentTdfFile: unknown;
  currentTdfUnit: unknown;
  sectionId?: unknown;
  teacherId?: unknown;
  conditionName?: unknown;
};

export type AutoTutorHistoryTurn = {
  studentAnswer: string;
  tutorMessage: string;
  state: unknown;
  startedAt: number;
  endedAt: number;
};

export interface AutoTutorSessionRuntime extends SessionRuntime {
  getAutoTutorSessionSnapshot(): AutoTutorSessionSnapshot;
  publishAutoTutorState(state: unknown): void;
}

export interface AutoTutorServerMethodsRuntime extends ServerMethodRuntime {
  getAutoTutorHistoryForUnit(userId: string, tdfId: string, unitNumber: number): Promise<unknown[]>;
}

export interface AutoTutorHistoryRuntime extends HistoryRuntime<AutoTutorHistoryTurn> {
  writeAutoTutorTurn(turn: AutoTutorHistoryTurn): Promise<void>;
}

export type AutoTutorRuntimeCapabilities = {
  readonly session: AutoTutorSessionRuntime;
  readonly serverMethods: AutoTutorServerMethodsRuntime;
  readonly history: AutoTutorHistoryRuntime;
  readonly logger: ComponentLogger;
};
