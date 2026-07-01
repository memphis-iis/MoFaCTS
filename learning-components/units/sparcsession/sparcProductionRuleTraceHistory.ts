import {
  assertCanonicalHistoryEnvelope,
  withCanonicalHistorySchemaVersion,
} from '../../runtime/historyEnvelope';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type {
  SparcAuthoredDocument,
  SparcCanonicalHistoryExtension,
  SparcCanonicalHistoryRecord,
  SparcInterfaceEvent,
  SparcOutcome,
  SparcProductionRuleExecution,
  SparcProductionRuleFiring,
  SparcTraceStep,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function selectedActionFact(firing: SparcProductionRuleFiring): SparcWorkingMemoryFact | undefined {
  return [...firing.assertedFacts, ...firing.persistentAssertedFacts]
    .find((fact) => fact.factType === 'controller.selectedAction');
}

function selectedActionId(firing: SparcProductionRuleFiring): string {
  const slots = selectedActionFact(firing)?.slots ?? {};
  return requireNonBlank(
    firing.credits[0]
      ?? slots.action
      ?? slots.targetType
      ?? firing.ruleId,
    `SPARC production-rule trace actionId for "${firing.ruleId}"`,
  );
}

function outcomeForFiring(firing: SparcProductionRuleFiring): SparcOutcome {
  const classification = firing.classifications[0];
  if (classification === 'correct' || classification === 'incorrect' || classification === 'unknown') {
    return classification;
  }
  if (classification === 'buggy') {
    return 'incorrect';
  }
  return firing.modelPracticeObservations[0]?.outcome ?? 'unknown';
}

function ruleMetadata(document: SparcAuthoredDocument, ruleId: string): Record<string, unknown> {
  const rule = document.productionRules?.find((candidate) => candidate.id === ruleId);
  if (!rule && ruleId.startsWith('derived-fact:')) {
    const derivedFactId = ruleId.slice('derived-fact:'.length);
    const derivedFact = document.derivedFacts?.find((candidate) => candidate.id === derivedFactId);
    return {
      ...(derivedFact ? { derivedFactId } : {}),
      salience: 0,
    };
  }
  return {
    ...(rule?.module !== undefined ? { module: rule.module } : {}),
    ...(rule?.salience !== undefined ? { salience: rule.salience } : {}),
  };
}

function traceDetails(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly firing: SparcProductionRuleFiring;
  readonly index: number;
}): Record<string, unknown> {
  const selectedAction = selectedActionFact(params.firing);
  return {
    sourceEventId: params.event.eventId,
    sourceEventType: params.event.type,
    firingIndex: params.index,
    ...ruleMetadata(params.document, params.firing.ruleId),
    bindings: params.firing.bindings,
    ...(params.firing.messages.length > 0 ? { messages: params.firing.messages } : {}),
    ...(params.firing.classifications.length > 0 ? { classifications: params.firing.classifications } : {}),
    ...(params.firing.credits.length > 0 ? { credits: params.firing.credits } : {}),
    ...(selectedAction ? { selectedAction: selectedAction.slots ?? {} } : {}),
    ...(params.firing.terminatesProductionPhase
      ? {
          terminatesProductionPhase: true,
          ...(params.firing.terminalReason ? { terminalReason: params.firing.terminalReason } : {}),
        }
      : {}),
  };
}

export function createSparcProductionRuleTraceHistoryRecords(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly execution: SparcProductionRuleExecution;
}): SparcCanonicalHistoryRecord[] {
  const TDFId = requireNonBlank(params.core.TDFId, 'TDFId');
  const sessionID = requireNonBlank(params.core.sessionID, 'sessionID');
  if (!params.core.userId && !params.core.anonStudentId) {
    throw new Error('SPARC production-rule trace history requires userId or anonStudentId');
  }

  return params.execution.firings.map((firing, index) => {
    const traceStep: SparcTraceStep = {
      traceId: `${params.event.eventId}:production-rule:${index}:${firing.ruleId}`,
      sourceAddress: params.event.source,
      productionRuleId: requireNonBlank(firing.ruleId, `SPARC production-rule trace[${index}].ruleId`),
      actionId: selectedActionId(firing),
      outcome: outcomeForFiring(firing),
      time: params.event.time,
      details: traceDetails({
        document: params.document,
        event: params.event,
        firing,
        index,
      }),
    };
    const extension: SparcCanonicalHistoryExtension = {
      documentId: params.event.source.documentId,
      sourceAddress: params.event.source,
      traceStep,
    };
    const record = withCanonicalHistorySchemaVersion({
      TDFId,
      sessionID,
      userId: params.core.userId,
      anonStudentId: params.core.anonStudentId,
      levelUnit: params.core.levelUnit,
      levelUnitName: params.core.levelUnitName ?? '',
      levelUnitType: 'sparc',
      time: params.event.time,
      problemStartTime: params.event.time,
      selection: `${params.event.source.documentId}:${params.event.source.nodeId}`,
      action: 'sparc-production-rule-trace',
      outcome: traceStep.outcome,
      typeOfResponse: 'sparc',
      responseValue: '',
      input: '',
      displayedStimulus: params.event.source,
      eventType: 'sparc',
      sparc: extension,
    }) as SparcCanonicalHistoryRecord;
    assertCanonicalHistoryEnvelope(record);
    return record;
  });
}
