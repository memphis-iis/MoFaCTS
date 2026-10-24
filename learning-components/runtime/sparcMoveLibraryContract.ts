import type { SparcVideoSegment } from './sparcVideo';
import type { SparcPromptFigure } from '../../mofacts/common/lib/sparcPromptImage';
import type { SparcQuestionChoice } from './sparcQuestionChoiceContract';
import type { SparcReadingLevel } from './sparcReadingLevel';

export const SPARC_MOVE_LIBRARY_VERSION = 'sparc-moves-v1';
export type SparcPrimitiveKind = 'feedback' | 'richContent' | 'explanation' | 'question' | 'instruction';
export type SparcPrimitiveContent = {
  text: string; video?: SparcVideoSegment; figure?: SparcPromptFigure; choices?: readonly SparcQuestionChoice[]; supportHeading?: string;
  administrativeRemoval?: true;
  /** For instruction entries, text is the explanation and support is its jointly composed companion. */
  support?: Omit<SparcPrimitiveContent, 'support' | 'choices'>;
};
export type SparcPrimitiveReference = {
  entryId: string; version: string; source: 'generated' | 'retrieved'; similarity: number | null;
  priorNodeId?: string;
};
export type SparcPrimitiveContext = {
  readingLevel?: SparcReadingLevel;
  version: typeof SPARC_MOVE_LIBRARY_VERSION; kind: SparcPrimitiveKind; target: string;
  move: string; assistance: number; responseFormat: string; requirements: string;
  focus: string; dependencies: string; components: SparcPrimitiveKind[]; specification: string;
  supportKind?: 'written' | 'visual';
};
export type SparcPrimitiveQuery = {
  tdfId: string; sessionId: string; eventId: string; context: SparcPrimitiveContext;
  queryText: string; previousQuestions: { text: string }[];
};
export type SparcPrimitiveTicket = { query: SparcPrimitiveQuery; embedding: number[] };
export type SparcPrimitiveLookup =
  | { status: 'hit'; content: SparcPrimitiveContent; reference: SparcPrimitiveReference }
  | { status: 'generate'; ticket: SparcPrimitiveTicket; previousQuestions: { text: string }[] };
export type SparcMoveLibraryClient = {
  lookup(query: SparcPrimitiveQuery): Promise<SparcPrimitiveLookup>;
  publish(ticket: SparcPrimitiveTicket, content: SparcPrimitiveContent): Promise<{ accepted: true; content: SparcPrimitiveContent; reference: SparcPrimitiveReference } | { accepted: false; reason: string }>;
};

export function stableMoveJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableMoveJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableMoveJson(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** Durable progress for one matched instruction, never a provider-side job or lock. */
export type SparcInstructionCheckpoint = {
  stage: 'composed' | 'resolved' | 'accepted';
  content: SparcPrimitiveContent;
  visualBrief?: { imagePrompt: string; displayWidth: number };
  ticket?: SparcPrimitiveTicket;
  reference?: SparcPrimitiveReference;
};
