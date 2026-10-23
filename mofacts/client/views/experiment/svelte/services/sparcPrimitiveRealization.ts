import { primitiveContext, instructionalNeed, previousSparcQuestions, type SparcMoveLibraryClient, type SparcPrimitiveKind, type SparcPrimitiveContent,
  type SparcPrimitiveReference, type SparcPrimitiveQuery } from '../../../../../../learning-components/units/sparcsession/sparcMoveLibrary';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { sparcInstructionalNeedText } from '../../../../../../learning-components/runtime/sparcInstructionalNeed';
import { clientConsole } from '../../../../lib/clientLogger';
import type { SparcReadingLevel } from '../../../../../../learning-components/runtime/sparcReadingLevel';

/** Retrieval and generation share their context; the accepted content is journaled before exposure. */
export async function realizeSparcPrimitive(params: {
  request: SparcUtteranceRequest; kind: SparcPrimitiveKind; dependencies: unknown;
  readingLevel?: SparcReadingLevel;
  tdfId: string; sessionId: string; library: SparcMoveLibraryClient;
  generate(previousQuestions?: SparcPrimitiveQuery['previousQuestions']): Promise<SparcPrimitiveContent>;
  persist(content: SparcPrimitiveContent, reference: SparcPrimitiveReference): Promise<void>;
}): Promise<SparcPrimitiveContent> {
  const callStartedAtMs = Date.now();
  const callStartedAt = new Date(callStartedAtMs).toISOString();
  const callStartedAtMonotonic = performance.now();
  const { request, kind } = params;
  const context = primitiveContext(request, kind, params.dependencies, params.readingLevel);
  const previousQuestions = previousSparcQuestions(request);
  const eventId = String(request.selectedAction.snapshotId ?? '');
  if (!eventId) throw new Error('Primitive retrieval requires a production event');
  let source: SparcPrimitiveReference['source'] | null = null;
  let status: 'returned' | 'failed' = 'failed';
  const query: SparcPrimitiveQuery = { tdfId: params.tdfId, sessionId: params.sessionId, eventId, context, previousQuestions,
    queryText: sparcInstructionalNeedText(instructionalNeed(request, params.dependencies, { feedback: kind === 'feedback' })) };
  try {
    const result = await params.library.lookup(query);
    let content: SparcPrimitiveContent;
    let reference: SparcPrimitiveReference;
    if (result.status === 'hit') {
      content = result.content; reference = result.reference;
      if (kind === 'explanation' || kind === 'richContent') {
        const prior = request.dialogueHistory?.find(entry => {
          const saved = entry.primitiveReference as SparcPrimitiveReference | undefined;
          return entry.role === 'tutor' && saved?.entryId === reference.entryId && !saved.priorNodeId
            && typeof entry.responseId === 'string' && !entry.responseId.startsWith(`${eventId}:`);
        });
        if (prior) reference = { ...reference, priorNodeId: String(prior.responseId) };
      }
    }
    else {
      const generated = await params.generate(result.previousQuestions);
      const saved = await params.library.publish(result.ticket, generated);
      if (!saved.accepted) throw new Error(saved.reason);
      content = saved.content; reference = saved.reference;
    }
    source = reference.source;
    await params.persist(content, reference);
    status = 'returned';
    return content;
  } finally {
    const returnedAt = new Date().toISOString();
    clientConsole(2, `[SPARC][MoveTiming] ${JSON.stringify({
      eventId,
      kind,
      source,
      status,
      callStartedAt,
      returnedAt,
      durationMs: Math.round((performance.now() - callStartedAtMonotonic) * 100) / 100,
    })}`);
  }
}
