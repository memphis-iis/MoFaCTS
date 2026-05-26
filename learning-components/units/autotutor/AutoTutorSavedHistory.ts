import {
  isAutoTutorEndReason,
  type AutoTutorEndReason,
} from './AutoTutorEndState';

export type AutoTutorHistoryRow = {
  time?: number;
  problemStartTime?: number;
  input?: string;
  responseValue?: string;
  feedbackText?: string;
  CFNote?: string;
};

export type AutoTutorHistoryNote<TState = unknown> = {
  kind: 'autotutor';
  model: string;
  scriptId: string;
  state: TState;
  progress: number;
  completed: boolean;
  mastered: boolean;
  endReason: AutoTutorEndReason;
  stoppedByCost: boolean;
  tutorMessage: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readAutoTutorHistoryNote<TState = unknown>(
  row: AutoTutorHistoryRow,
): AutoTutorHistoryNote<TState> {
  if (typeof row.CFNote !== 'string' || !row.CFNote.trim()) {
    throw new Error('AutoTutor history row is missing CFNote');
  }
  let note: unknown;
  try {
    note = JSON.parse(row.CFNote);
  } catch {
    throw new Error('AutoTutor history row CFNote is not valid JSON');
  }
  if (!isRecord(note) || note.kind !== 'autotutor' || !isRecord(note.state)) {
    throw new Error('AutoTutor history row CFNote has an invalid AutoTutor payload');
  }
  if ('schemaVersion' in note) {
    throw new Error('AutoTutor history row CFNote must not include schemaVersion');
  }
  return note as AutoTutorHistoryNote<TState>;
}

export function validateAutoTutorSavedEndState(note: AutoTutorHistoryNote): void {
  if (typeof note.completed !== 'boolean' || typeof note.stoppedByCost !== 'boolean') {
    throw new Error('AutoTutor saved history completion flags must be boolean');
  }
  if (typeof note.mastered !== 'boolean' || !isAutoTutorEndReason(note.endReason)) {
    throw new Error('AutoTutor saved history mastery flags must be present and valid');
  }
}
