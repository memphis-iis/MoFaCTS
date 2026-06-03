import type { ManualCreatorState } from './manualDraftBuilder';
import type { PromptAttribution } from './normalizedImportTypes';

export type CreationModuleId = 'learningSession' | 'assessmentSession' | 'autoTutor';

export type CreatedOutput = {
  moduleId: CreationModuleId;
  title: string;
  artifactKindLabel: string;
  tdfId?: string;
  packageAssetId?: string;
  route?: string;
  editRoute?: string;
  tdfEditRoute?: string;
  itemCount: number;
  summary?: string;
};

export type AiItem = {
  prompt?: { text?: string; imgSrc?: string; audioSrc?: string; videoSrc?: string; attribution?: PromptAttribution };
  response?: { correctResponse?: string; incorrectResponses?: string[] };
  sourceType?: 'freeResponse' | 'choice';
};

export type AiLessonOutput = {
  lessonName?: string;
  instructions?: string;
  promptType?: ManualCreatorState['promptType'];
  responseType?: ManualCreatorState['responseType'];
  shuffle?: boolean;
  buttonOrder?: ManualCreatorState['buttonOrder'];
  textToSpeechMode?: ManualCreatorState['textToSpeechMode'];
  topBarMode?: ManualCreatorState['topBarMode'];
  visibility?: ManualCreatorState['visibility'];
  visibilityLockReason?: string;
  tags?: string[];
  items?: AiItem[];
  creationSummary?: string;
};

export type AiAutoTutorExpectation = {
  id?: string;
  label?: string;
  proposition?: string;
  hints?: string[];
  prompts?: Array<{ stem?: string; target?: string }>;
  assertion?: string;
};

export type AiAutoTutorMisconception = {
  id?: string;
  label?: string;
  misconception?: string;
  detectionCues?: string[];
  contrastWithExpectations?: string[];
  correction?: string;
  repairQuestion?: string;
  repairCriteria?: string;
  acceptableRepairAnswers?: string[];
};

export type AiAutoTutorOutput = {
  lessonName?: string;
  prompt?: string;
  topic?: string;
  learningGoal?: string;
  idealAnswer?: string;
  expectations?: AiAutoTutorExpectation[];
  misconceptions?: AiAutoTutorMisconception[];
  maxTurns?: number;
  requiredExpectationCount?: number;
  maxActiveMisconceptions?: number;
  visibility?: ManualCreatorState['visibility'];
  attribution?: PromptAttribution;
  summary?: string;
  creationSummary?: string;
};
