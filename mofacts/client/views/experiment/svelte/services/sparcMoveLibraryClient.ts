import { Meteor } from 'meteor/meteor';
import { clientConsole } from '../../../../lib/clientLogger';
import { reportRecoverableWarning } from '../../../../lib/recoverableWarnings';
import { redactSparcDialogueDiagnosticText } from '../../../../../common/lib/sparcDiagnosticText';
import type { SparcContentRemovalCheckWarning } from '../../../../../common/recoverableWarnings';
import type { SparcMoveLibraryClient } from '../../../../../../learning-components/units/sparcsession/sparcMoveLibrary';
import { embedSparcTexts } from './sparcLocalEmbeddings';
import { sparcLibraryMinimumSimilarity } from '../../../../../../learning-components/runtime/sparcInstructionalNeed';

export async function readSparcAdministrativeRemovals(ids: string[], tdfId: string | null): Promise<string[]> {
  try {
    return await Meteor.callAsync('getSparcAdministrativeRemovals', ids, tdfId);
  } catch (error) {
    const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const safe = (text: unknown, limit: number) => redactSparcDialogueDiagnosticText(String(text ?? '')).replace(/\s+/g, ' ').slice(0, limit);
    const warning: SparcContentRemovalCheckWarning = {
      code: 'sparc.contentRemovalCheckFailed', tdfId: tdfId || null, referenceCount: ids.length,
      error: { name: safe(value.name || 'Error', 80), code: safe(value.error ?? value.code, 80),
        message: safe(value.reason || value.message || error || 'Unknown error', 800) },
    };
    clientConsole(1, '[SPARC] Content-removal check failed', warning);
    try { await reportRecoverableWarning(warning); }
    catch (reportError) {
      clientConsole(1, '[SPARC] Could not persist content-removal failure', { original: warning.error,
        reportingError: safe(reportError instanceof Error ? reportError.message : reportError, 800) });
    }
    throw error;
  }
}

export function createSparcMoveLibraryClient(
  prepare: typeof import('./sparcLocalRetrieval').prepareSparcLocalRetrieval,
): SparcMoveLibraryClient {
  return {
    async lookup(query) {
      const { kind, readingLevel, responseFormat, supportKind } = query.context;
      if (kind !== 'instruction' && supportKind === 'visual') return Meteor.callAsync('lookupSparcPrimitive', query, null, []);
      const [embedding] = await embedSparcTexts(query.tdfId, [query.queryText]);
      // Visual resources have one combined image/video index, searched once after the brief exists.
      const selection = (await prepare({ kind, responseFormat,
        ...(readingLevel ? { readingLevel } : {}), ...(supportKind ? { supportKind } : {}) }))
        .maximum(embedding!, sparcLibraryMinimumSimilarity(kind));
      // Accepted events stay resumable even after their content leaves this user's eligible index.
      return Meteor.callAsync('lookupSparcPrimitive', query, selection, embedding);
    },
    async publish({ query }, content) {
      const embedding = query.context.kind !== 'instruction' && query.context.supportKind === 'visual'
        ? [] : (await embedSparcTexts(query.tdfId, [query.queryText]))[0]!;
      return Meteor.callAsync('publishSparcPrimitive', { query, embedding }, content);
    },
  };
}

export const sparcMoveLibraryClient = createSparcMoveLibraryClient(async category => {
  const { prepareSparcLocalRetrieval } = await import('./sparcLocalRetrieval');
  return prepareSparcLocalRetrieval(category);
});
