import { Meteor } from 'meteor/meteor';
import { clientConsole } from '../../../../lib/clientLogger';
import { reportRecoverableWarning } from '../../../../lib/recoverableWarnings';
import { redactSparcDialogueDiagnosticText } from '../../../../../common/lib/sparcDiagnosticText';
import type { SparcContentRemovalCheckWarning } from '../../../../../common/recoverableWarnings';
import type { SparcMoveLibraryClient } from '../../../../../../learning-components/units/sparcsession/sparcMoveLibrary';

export async function readSparcAdministrativeRemovals(ids: string[], tdfId: string | null): Promise<string[]> {
  try {
    return await Meteor.callAsync('getSparcAdministrativeRemovals', ids);
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

export const sparcMoveLibraryClient: SparcMoveLibraryClient = {
  lookup: query => Meteor.callAsync('lookupSparcPrimitive', query),
  publish: (ticket, content) => Meteor.callAsync('publishSparcPrimitive', ticket, content),
  present: (query, reference, nodeId) => Meteor.callAsync('presentSparcPrimitive', query, reference, nodeId),
};
