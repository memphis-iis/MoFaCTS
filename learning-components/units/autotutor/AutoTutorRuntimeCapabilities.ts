import type { LearningComponentCapability } from '../../runtime/ComponentManifest';
import type {
  ComponentLogger,
  HistoryRuntime,
  ServerMethodRuntime,
  SessionRuntime,
} from '../../runtime/LearningComponentContext';

export const AUTO_TUTOR_UNIT_REQUIRED_CAPABILITIES = [
  'session',
  'stimuli',
  'server-methods',
  'history',
  'logging',
] as const satisfies readonly LearningComponentCapability[];

export type AutoTutorSessionSnapshot = {
  currentUserId?: string;
  currentUsername?: string;
  currentTdfId: string;
  currentTdfName: string;
  currentUnitNumber: number;
  currentTdfFile: unknown;
  currentTdfUnit: unknown;
  sectionId?: unknown;
  teacherId?: unknown;
  conditionName?: unknown;
  entryPoint?: unknown;
};

export type AutoTutorHistoryTurn = {
  studentAnswer: string;
  tutorMessage: string;
  config: unknown;
  state: unknown;
  startedAt: number;
  endedAt: number;
};

export type AutoTutorCompressedHistoryRecord = {
  itemId: unknown;
  KCId: unknown;
  userId: string | undefined;
  TDFId: string;
  outcome: 'correct' | 'incorrect';
  probabilityEstimate: null;
  typeOfResponse: 'autotutor-chat';
  responseValue: string;
  displayedStimulus: { text: string };
  sectionId?: unknown;
  teacherId?: unknown;
  anonStudentId: string | undefined;
  sessionID: string;
  conditionNameA: 'tdf file';
  conditionTypeA: string;
  conditionNameB: 'xcondition';
  conditionTypeB: unknown;
  conditionNameC: 'schedule condition';
  conditionTypeC: null;
  conditionNameD: 'how answered';
  conditionTypeD: 'autotutor-chat';
  conditionNameE: 'section';
  conditionTypeE: unknown;
  responseDuration: number;
  levelUnit: number;
  levelUnitName: string;
  levelUnitType: 'autotutor';
  problemName: string;
  stepName: string;
  time: number;
  problemStartTime: number;
  selection: 'autotutor-chat';
  action: 'autotutor-complete' | 'autotutor-turn';
  input: string;
  studentResponseType: 'ATTEMPT';
  studentResponseSubtype: 'autotutor';
  tutorResponseType: 'RESULT' | 'HINT_MSG';
  KCDefault: unknown;
  KCCategoryDefault: '';
  KCCluster: unknown;
  KCCategoryCluster: '';
  CFAudioInputEnabled: false;
  CFAudioOutputEnabled: false;
  CFDisplayOrder: number;
  CFStimFileIndex: number;
  CFSetShuffledIndex: number;
  CFAlternateDisplayIndex: null;
  CFStimulusVersion: 0;
  CFCorrectAnswer: string;
  CFOverlearning: false;
  CFResponseTime: number;
  CFStartLatency: 0;
  CFEndLatency: number;
  CFFeedbackLatency: 0;
  CFReviewEntry: '';
  CFButtonOrder: '';
  CFItemRemoved: false;
  CFNote: string;
  feedbackText: string;
  feedbackType: 'correct' | 'autotutor';
  instructionQuestionResult: false;
  entryPoint: unknown;
  eventType: 'autotutor-turn';
};

export type AutoTutorStimulusCluster = {
  clusterKC?: unknown;
  stims?: unknown[];
};

export interface AutoTutorSessionRuntime extends SessionRuntime {
  getAutoTutorSessionSnapshot(): AutoTutorSessionSnapshot;
  publishAutoTutorState(state: unknown): void;
}

export interface AutoTutorStimuliRuntime {
  getStimCluster(clusterIndex: number): AutoTutorStimulusCluster | null;
}

export interface AutoTutorServerMethodsRuntime extends ServerMethodRuntime {
  getAutoTutorHistoryForUnit(userId: string, tdfId: string, unitNumber: number): Promise<unknown[]>;
}

export interface AutoTutorHistoryRuntime extends HistoryRuntime<AutoTutorHistoryTurn> {
  writeAutoTutorTurn(turn: AutoTutorHistoryTurn): Promise<void>;
  writeCompressedHistory(record: AutoTutorCompressedHistoryRecord): Promise<void>;
}

export type AutoTutorRuntimeCapabilities = {
  readonly session: AutoTutorSessionRuntime;
  readonly stimuli: AutoTutorStimuliRuntime;
  readonly serverMethods: AutoTutorServerMethodsRuntime;
  readonly history: AutoTutorHistoryRuntime;
  readonly logger: ComponentLogger;
};
