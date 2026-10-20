import type { SparcVideoSegment } from './sparcVideo';
import type { SparcPromptFigure } from '../../mofacts/common/lib/sparcPromptImage';
import type { SparcQuestionChoice } from './sparcQuestionChoiceContract';

export const SPARC_MOVE_LIBRARY_VERSION = 'sparc-moves-v1';
export type SparcPrimitiveKind = 'feedback' | 'richContent' | 'explanation' | 'question';
export type SparcPrimitiveContent = {
  text: string; video?: SparcVideoSegment; figure?: SparcPromptFigure; choices?: readonly SparcQuestionChoice[]; supportHeading?: string;
  administrativeRemoval?: true;
};
export type SparcPrimitiveReference = {
  entryId: string; version: string; source: 'generated' | 'retrieved'; similarity: number | null;
  priorNodeId?: string;
};
export type SparcPrimitiveContext = {
  version: typeof SPARC_MOVE_LIBRARY_VERSION; kind: SparcPrimitiveKind; target: string;
  move: string; assistance: number; responseFormat: string; requirements: string;
  focus: string; dependencies: string; components: SparcPrimitiveKind[]; specification: string;
  supportKind?: 'written' | 'visual';
};
export type SparcPrimitiveQuery = {
  tdfId: string; sessionId: string; eventId: string; context: SparcPrimitiveContext;
  queryText: string; previousQuestions: { text: string }[];
};
export type SparcPrimitiveLookup =
  | { status: 'hit'; content: SparcPrimitiveContent; reference: SparcPrimitiveReference }
  | { status: 'generate'; ticket: string; previousQuestions: { text: string }[] };
export type SparcMoveLibraryClient = {
  lookup(query: SparcPrimitiveQuery): Promise<SparcPrimitiveLookup>;
  publish(ticket: string, content: SparcPrimitiveContent): Promise<{ accepted: true; content: SparcPrimitiveContent; reference: SparcPrimitiveReference } | { accepted: false; reason: string }>;
  present(query: SparcPrimitiveQuery, reference: SparcPrimitiveReference, nodeId: string): Promise<void>;
};

export function stableMoveJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableMoveJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableMoveJson(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
