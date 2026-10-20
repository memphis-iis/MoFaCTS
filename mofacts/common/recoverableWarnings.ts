// Allowlisted diagnostic events only; never carry learner text or provider payloads.
export const RECOVERABLE_WARNING_ACTION = 'system.recoverableWarning';
export const RECOVERABLE_WARNING_PAGE_SIZE = 50;

export type SparcOutputLimitWarning = Readonly<{
  code: 'autotutor.outputLimit';
  tdfId: string | null;
  operation: 'utterance' | 'explanation' | 'question' | 'rich' | 'visual';
  field: 'tutorMessage' | 'workedExample' | 'figureDescription' | 'imagePrompt' | 'heading' | 'choices.label';
  unit: 'characters' | 'json-utf8-bytes';
  observedSize: number;
  limit: number;
  attempts: 2;
  outcome: 'regenerated' | 'retry-needed' | 'failed';
}>;

export type RecoverableWarning = Readonly<{
  code: 'autotutor.citationMismatch';
  tdfId: string | null;
  mismatchCount: number;
}> | SparcOutputLimitWarning;

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
