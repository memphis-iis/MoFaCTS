// Allowlisted diagnostic events only; never carry learner text or provider payloads.
export const RECOVERABLE_WARNING_ACTION = 'system.recoverableWarning';
export const RECOVERABLE_WARNING_PAGE_SIZE = 50;

export type RecoverableWarning = Readonly<{
  code: 'autotutor.citationMismatch';
  tdfId: string | null;
  mismatchCount: number;
}>;

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
