import { primitiveContext, instructionalNeed, previousSparcQuestions, type SparcMoveLibraryClient, type SparcPrimitiveKind, type SparcPrimitiveContent,
  type SparcPrimitiveReference, type SparcPrimitiveQuery } from '../../../../../../learning-components/units/sparcsession/sparcMoveLibrary';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { sparcInstructionalNeedText } from '../../../../../../learning-components/runtime/sparcInstructionalNeed';

/** Retrieval and generation share their context; the accepted version is journaled before exposure. */
export async function realizeSparcPrimitive(params: {
  request: SparcUtteranceRequest; kind: SparcPrimitiveKind; dependencies: unknown;
  tdfId: string; sessionId: string; library: SparcMoveLibraryClient;
  generate(rejection?: string, previousQuestions?: SparcPrimitiveQuery['previousQuestions']): Promise<SparcPrimitiveContent>;
  persist(content: SparcPrimitiveContent, reference: SparcPrimitiveReference): Promise<void>;
}): Promise<SparcPrimitiveContent> {
  const { request, kind } = params;
  const context = primitiveContext(request, kind, params.dependencies);
  const previousQuestions = previousSparcQuestions(request);
  const eventId = String(request.selectedAction.snapshotId ?? '');
  if (!eventId) throw new Error('Primitive retrieval requires a production event');
  const query: SparcPrimitiveQuery = { tdfId: params.tdfId, sessionId: params.sessionId, eventId, context, previousQuestions,
    queryText: sparcInstructionalNeedText(instructionalNeed(request, params.dependencies, { feedback: kind === 'feedback' })) };
  const result = await params.library.lookup(query);
  let content: SparcPrimitiveContent;
  let reference: SparcPrimitiveReference;
  if (result.status === 'hit') { content = result.content; reference = result.reference; }
  else {
    let accepted: SparcPrimitiveReference | undefined;
    let rejection: string | undefined;
    let generated: SparcPrimitiveContent | undefined;
    for (let attempt = 0; attempt < (kind === 'question' ? 3 : 1); attempt++) {
      generated = await params.generate(rejection, result.previousQuestions);
      const saved = await params.library.publish(result.ticket, generated);
      if (saved.accepted) { accepted = saved.reference; generated = saved.content; break; }
      rejection = saved.reason;
    }
    if (!accepted || !generated) throw new Error('Could not produce a sufficiently distinct question after three attempts. Your saved progress is retained.');
    content = generated; reference = accepted;
  }
  await params.persist(content, reference);
  await params.library.present(query, reference, `${eventId}:${kind === 'feedback' ? 'tutor' : kind}`);
  return content;
}
