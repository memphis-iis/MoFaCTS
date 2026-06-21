import type {
  SparcAuthoredDocument,
  SparcAuthoredNode,
  SparcReactiveEvent,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import type { SparcReplayState } from './sparcStateReplay';
import {
  SPARC_WORKING_MEMORY_FACT_STATE_KEY_PREFIX,
  stateValueToSparcWorkingMemoryFact,
} from './sparcWorkingMemoryState';

export type SparcWorkingMemoryFactBuildInput = {
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event?: SparcReactiveEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
};

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function authoredFactWithId(
  fact: SparcWorkingMemoryFact,
  index: number,
): SparcWorkingMemoryFact {
  return {
    ...fact,
    factType: requireNonBlank(fact.factType, `SPARC authored workingMemoryFacts[${index}].factType`),
  };
}

function collectNodeFacts(params: {
  readonly document: SparcAuthoredDocument;
  readonly node: SparcAuthoredNode;
  readonly parentId?: string;
  readonly facts: SparcWorkingMemoryFact[];
}): void {
  params.facts.push({
    factType: 'node',
    slots: {
      documentId: params.document.id,
      node: params.node.id,
      kind: params.node.kind,
      ...(params.parentId ? { parent: params.parentId } : {}),
    },
  });

  for (const reference of params.node.refs ?? []) {
    params.facts.push({
      factType: 'node-reference',
      slots: {
        documentId: params.document.id,
        sourceNode: params.node.id,
        targetNode: reference.target.nodeId,
        relation: reference.relation ?? null,
        ...(reference.stateKey ? { stateKey: reference.stateKey } : {}),
        ...(reference.modelMetric ? { modelMetric: reference.modelMetric } : {}),
      },
    });
  }

  if (params.node.modelTarget) {
    params.facts.push({
      factType: 'node-model-target',
      slots: {
        documentId: params.document.id,
        node: params.node.id,
        stimuliSetId: params.node.modelTarget.stimuliSetId,
        stimulusKC: params.node.modelTarget.stimulusKC,
        clusterKC: params.node.modelTarget.clusterKC,
        KCId: params.node.modelTarget.KCId,
        KCDefault: params.node.modelTarget.KCDefault,
        KCCluster: params.node.modelTarget.KCCluster,
      },
    });
  }

  for (const clusterIndex of params.node.clusterIndices ?? []) {
    params.facts.push({
      factType: 'node-cluster-attachment',
      slots: {
        documentId: params.document.id,
        node: params.node.id,
        clusterIndex,
      },
    });
  }

  for (const child of params.node.children ?? []) {
    collectNodeFacts({
      ...params,
      node: child,
      parentId: params.node.id,
    });
  }
}

function replayStateFacts(replayState: SparcReplayState): readonly SparcWorkingMemoryFact[] {
  return Object.values(replayState.cells).flatMap((cell) => {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'interface-state',
      slots: {
        documentId: cell.address.documentId,
        node: cell.address.nodeId,
        key: cell.key,
        value: cell.value,
        transitionId: cell.transitionId,
        eventId: cell.eventId,
        time: cell.time,
      },
    }];

    if (cell.key.startsWith(SPARC_WORKING_MEMORY_FACT_STATE_KEY_PREFIX)) {
      const workingMemoryFact = stateValueToSparcWorkingMemoryFact(cell.value);
      if (workingMemoryFact) {
        facts.push(workingMemoryFact);
      }
    }

    return facts;
  });
}

function eventFacts(event: SparcReactiveEvent): readonly SparcWorkingMemoryFact[] {
  const payloadSlots = isRecord(event.payload) ? event.payload : {};
  const facts: SparcWorkingMemoryFact[] = [{
    factType: 'interface-event',
    slots: {
      documentId: event.source.documentId,
      sourceNode: event.source.nodeId,
      eventId: event.eventId,
      eventType: event.type,
      time: event.time,
      ...payloadSlots,
    },
  }];

  if (event.practiceObservation) {
    facts.push({
      factType: 'practice-observation',
      slots: {
        observationId: event.practiceObservation.observationId,
        documentId: event.practiceObservation.sourceAddress.documentId,
        sourceNode: event.practiceObservation.sourceAddress.nodeId,
        outcome: event.practiceObservation.outcome,
        responseValue: event.practiceObservation.responseValue,
        time: event.practiceObservation.time,
        problemStartTime: event.practiceObservation.problemStartTime,
        ...(event.practiceObservation.practiceDurationMs !== undefined
          ? { practiceDurationMs: event.practiceObservation.practiceDurationMs }
          : {}),
      },
    });
  }

  return facts;
}

export function buildSparcWorkingMemoryFacts(
  input: SparcWorkingMemoryFactBuildInput,
): readonly SparcWorkingMemoryFact[] {
  requireNonBlank(input.document.id, 'SPARC authored document id');
  const facts: SparcWorkingMemoryFact[] = [
    ...((input.document.workingMemoryFacts ?? []).map(authoredFactWithId)),
  ];

  collectNodeFacts({
    document: input.document,
    node: input.document.root,
    facts,
  });

  if (input.replayState) {
    facts.push(...replayStateFacts(input.replayState));
  }
  if (input.event) {
    facts.push(...eventFacts(input.event));
  }
  facts.push(...(input.extraFacts ?? []));

  return facts;
}
