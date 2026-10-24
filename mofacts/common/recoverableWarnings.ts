// Allowlisted diagnostic events only; never carry learner text or provider payloads.
import type { SparcStaleQuestionDiagnostic } from '../../learning-components/units/sparcsession/sparcMultipleChoiceQuestion';

export type SparcAnswerSubmissionPresentation = Readonly<{
  displayedQuestionId: string | null;
  submittedButtonPresent: boolean;
  submittedButtonDisabled: boolean | null;
  submittedButtonSelected: boolean | null;
  submissionPending: boolean;
}>;

export type SparcStaleQuestionWarning = Readonly<{
  code: 'sparc.staleQuestion';
  tdfId: string | null;
  pageKey: string;
  diagnostic: SparcStaleQuestionDiagnostic;
  presentation: SparcAnswerSubmissionPresentation | null;
}>;
export const RECOVERABLE_WARNING_ACTION = 'system.recoverableWarning';
export const RECOVERABLE_WARNING_PAGE_SIZE = 50;

export type SparcContentRemovalCheckWarning = Readonly<{
  code: 'sparc.contentRemovalCheckFailed';
  tdfId: string | null;
  referenceCount: number;
  error: { name: string; code: string; message: string };
}>;

export type SparcOutputLimitWarning = Readonly<{
  code: 'autotutor.outputLimit';
  tdfId: string | null;
  operation: 'instruction' | 'utterance' | 'explanation' | 'question' | 'rich' | 'visual';
  field: 'tutorMessage' | 'workedExample' | 'figureDescription' | 'imagePrompt' | 'heading' | 'choices.label';
  unit: 'characters' | 'json-utf8-bytes';
  observedSize: number;
  limit: number;
  attempts: 1 | 2;
  outcome: 'continued' | 'regenerated' | 'retry-needed' | 'failed';
}>;

export type RecoverableWarning = Readonly<{
  code: 'autotutor.citationMismatch';
  tdfId: string | null;
  mismatchCount: number;
}> | SparcOutputLimitWarning | SparcStaleQuestionWarning | SparcContentRemovalCheckWarning;

export type RecoverableWarningCursor = Readonly<{ createdAt: Date; id: string }>;
export type RecoverableWarningRow = Readonly<{
  _id: string;
  createdAt: Date;
  details: RecoverableWarning;
}>;
export type RecoverableWarningPage = Readonly<{
  rows: readonly RecoverableWarningRow[];
  nextCursor: RecoverableWarningCursor | null;
}>;
