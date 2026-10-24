import type { SparcPrimitiveContext } from '../../../learning-components/runtime/sparcMoveLibraryContract';
import { stableMoveJson } from '../../../learning-components/runtime/sparcMoveLibraryContract';
import { resolveSparcReadingLevel } from '../../../learning-components/runtime/sparcReadingLevel';
import { collectionMongoName } from '../collectionOwnership';

/** DDP-only browser cache, not a second persisted instructional library. */
export const SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION = collectionMongoName('SparcRetrievalEmbeddings');
export const SPARC_VISUAL_MINIMUM_SIMILARITY = .95;
export type SparcRetrievalCategory =
  | { kind: 'visual'; language: string }
  | Pick<SparcPrimitiveContext, 'kind' | 'readingLevel' | 'responseFormat' | 'supportKind'>;
export type SparcRetrievalSelection = { entryId: string; similarity: number } | null;

export function parseSparcRetrievalCategory(value: unknown): SparcRetrievalCategory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid retrieval category');
  const record = value as Record<string, unknown>;
  if (record.kind === 'visual') {
    if (Object.keys(record).some(key => key !== 'kind' && key !== 'language')
      || typeof record.language !== 'string' || (record.language !== '' && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(record.language))) {
      throw new Error('Visual retrieval requires the authored content language');
    }
    return { kind: 'visual', language: record.language };
  }
  if (!['feedback', 'explanation', 'richContent', 'question', 'instruction'].includes(String(record.kind))
    || Object.keys(record).some(key => !['kind', 'readingLevel', 'responseFormat', 'supportKind'].includes(key))
    || typeof record.responseFormat !== 'string' || record.responseFormat.length > 100
    || (record.supportKind !== undefined && record.supportKind !== 'written' && record.supportKind !== 'visual')) {
    throw new Error('Invalid retrieval category');
  }
  return { kind: record.kind as SparcPrimitiveContext['kind'], readingLevel: resolveSparcReadingLevel(record.readingLevel),
    responseFormat: record.kind === 'question' ? record.responseFormat : 'text', ...(record.supportKind ? { supportKind: record.supportKind as 'written' | 'visual' } : {}) };
}

export const sparcRetrievalCategoryKey = (category: SparcRetrievalCategory) => encodeURIComponent(stableMoveJson(parseSparcRetrievalCategory(category)));
