import type { SparcVideoSegment } from '../../../../../../learning-components/runtime/sparcVideo';
import { primitiveContext, instructionalNeed, previousSparcQuestions, type SparcMoveLibraryClient, type SparcPrimitiveKind, type SparcPrimitiveContent,
  type SparcPrimitiveReference, type SparcPrimitiveQuery } from '../../../../../../learning-components/units/sparcsession/sparcMoveLibrary';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { sparcInstructionalNeedText } from '../../../../../../learning-components/runtime/sparcInstructionalNeed';
import { clientConsole } from '../../../../lib/clientLogger';

/** Retrieval and generation share their context; the accepted content is journaled before exposure. */
export async function realizeSparcPrimitive(params: {
  request: SparcUtteranceRequest; kind: SparcPrimitiveKind; dependencies: unknown;
  tdfId: string; sessionId: string; library: SparcMoveLibraryClient;
  generate(rejection?: string, previousQuestions?: SparcPrimitiveQuery['previousQuestions'], videos?: SparcVideoSegment[]): Promise<SparcPrimitiveContent>;
  persist(content: SparcPrimitiveContent, reference: SparcPrimitiveReference): Promise<void>;
}): Promise<SparcPrimitiveContent> {
  const callStartedAtMs = Date.now();
  const callStartedAt = new Date(callStartedAtMs).toISOString();
  const callStartedAtMonotonic = performance.now();
  const { request, kind } = params;
  const context = primitiveContext(request, kind, params.dependencies);
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
    if (result.status === 'hit') { content = result.content; reference = result.reference; }
    else {
      let accepted: SparcPrimitiveReference | undefined;
      let rejection: string | undefined;
      let generated: SparcPrimitiveContent | undefined;
      for (let attempt = 0; attempt < (kind === 'question' ? 3 : 1); attempt++) {
        generated = await params.generate(rejection, result.previousQuestions, result.videos);
        const saved = await params.library.publish(result.ticket, generated);
        if (saved.accepted) { accepted = saved.reference; generated = saved.content; break; }
        rejection = saved.reason;
      }
      if (!accepted || !generated) throw new Error('Could not produce a sufficiently distinct question after three attempts. Your saved progress is retained.');
      content = generated; reference = accepted;
    }
    source = reference.source;
    await params.persist(content, reference);
    await params.library.present(query, reference, `${eventId}:${kind === 'feedback' ? 'tutor' : kind}`);
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
