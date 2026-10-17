import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import { buildSparcInstructionalNeed, type SparcInstructionalNeed } from '../../runtime/sparcInstructionalNeed';
import { SPARC_MOVE_LIBRARY_VERSION, stableMoveJson, type SparcPrimitiveContext, type SparcPrimitiveKind } from '../../runtime/sparcMoveLibraryContract';
export * from '../../runtime/sparcMoveLibraryContract';

export function selectedSparcEvidence(request: SparcUtteranceRequest) {
  const planner = request.plannerState as { evidence?: Record<string, unknown>[]; assessment?: Record<string, unknown>[] } | undefined;
  const targetKind = request.targetType === 'learningTarget' ? 'expectation' : request.targetType === 'misconception' ? 'misconception' : undefined;
  return (planner?.evidence ?? planner?.assessment?.filter(e => e.factType === 'instructional.evidence') ?? [])
    .filter(e => e.id === request.targetId && (!targetKind || e.kind === targetKind))
    .map(e => ({ kind: e.kind, id: e.id, demonstrated: e.demonstrated, incorrect: e.incorrect, unresolved: e.unresolved }));
}

export function previousSparcQuestions(request: SparcUtteranceRequest) {
  return (request.dialogueHistory ?? []).filter(e => e.role === 'tutor' && (e.component === 'question' || String(e.responseId).endsWith(':question')))
    .map(e => ({ text: String(e.text) }));
}

/** Images and text share this selected-target projection; only their actual case differs. */
export function instructionalNeed(request: SparcUtteranceRequest, dependencies: unknown, options: {
  feedback?: boolean; illustrationBrief?: string;
} = {}): SparcInstructionalNeed {
  return buildSparcInstructionalNeed({ targetContent: request.targetContent, targetTexts: request.contentTexts,
    assistance: request.moveDefinition.assistance ?? 0, evidence: selectedSparcEvidence(request), dependencies,
    ...(request.selectionDiagnostic ? { currentValue: request.selectionDiagnostic.currentValue } : {}),
    ...(options.feedback ? { feedback: { precedingQuestion: previousSparcQuestions(request).at(-1)?.text ?? '', learnerResponse: request.learnerText ?? '' } } : {}),
    ...(options.illustrationBrief ? { illustrationBrief: options.illustrationBrief } : {}),
  });
}

export function primitiveContext(request: SparcUtteranceRequest, kind: SparcPrimitiveKind, dependencies: unknown): SparcPrimitiveContext {
  return { version: SPARC_MOVE_LIBRARY_VERSION, kind, target: request.targetId,
    move: request.action, assistance: request.moveDefinition.assistance ?? 0,
    responseFormat: request.moveDefinition.responseFormat ?? 'text', requirements: stableMoveJson(request.targetContent ?? request.contentTexts),
    specification: stableMoveJson({ version: request.moveDefinition.version,
      promptId: request.moveDefinition.promptId, promptVersion: request.moveDefinition.promptVersion,
      outputSchemaId: request.moveDefinition.outputSchemaId, outputSchemaVersion: request.moveDefinition.outputSchemaVersion,
      promptPolicy: request.moveDefinition.promptPolicy }),
    components: kind === 'feedback' ? ['feedback'] : [...(request.moveDefinition.components ?? [kind])],
    focus: stableMoveJson(selectedSparcEvidence(request)), dependencies: stableMoveJson(dependencies) };
}
