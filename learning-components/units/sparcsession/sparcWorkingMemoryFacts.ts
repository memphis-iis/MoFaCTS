import type {
  SparcAuthoredDocument,
  SparcAuthoredNode,
  SparcDerivedFactRule,
  SparcInterfaceEvent,
  SparcProductionRule,
  SparcProductionRuleExecution,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import { runSparcProductionRules } from './sparcProductionRuleEvaluator';
import type { SparcReplayState } from './sparcStateReplay';
import {
  SPARC_STABLE_WORKING_MEMORY_FACT_STATE_KEY_PREFIX,
  SPARC_WORKING_MEMORY_FACT_STATE_KEY_PREFIX,
  stateValueToSparcWorkingMemoryFact,
} from './sparcWorkingMemoryState';

export type SparcWorkingMemoryFactBuildInput = {
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event?: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
};

export type SparcWorkingMemoryFactBuildResult = {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly derivedRuleExecution?: SparcProductionRuleExecution;
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

    if (
      cell.key.startsWith(SPARC_WORKING_MEMORY_FACT_STATE_KEY_PREFIX)
      || cell.key.startsWith(SPARC_STABLE_WORKING_MEMORY_FACT_STATE_KEY_PREFIX)
    ) {
      const workingMemoryFact = stateValueToSparcWorkingMemoryFact(cell.value);
      if (workingMemoryFact) {
        facts.push(workingMemoryFact);
      }
    }

    return facts;
  });
}

function eventFacts(event: SparcInterfaceEvent): readonly SparcWorkingMemoryFact[] {
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

function derivedFactProductionRule(rule: SparcDerivedFactRule): SparcProductionRule {
  return {
    id: `derived-fact:${rule.id}`,
    salience: 0,
    when: rule.when,
    ...(rule.tests ? { tests: rule.tests } : {}),
    then: [{
      type: 'assert-fact',
      persist: false,
      fact: rule.fact,
    }],
  };
}

function autoTutorTargetFacts(document: SparcAuthoredDocument): readonly SparcWorkingMemoryFact[] {
  const targets = document.autoTutorTargets;
  if (!targets) {
    return [];
  }
  return [
    ...targets.expectations.map((expectation) => ({
      factType: 'autotutor.expectation',
      slots: {
        clusterKC: expectation.clusterKC,
        text: expectation.text,
      },
    })),
    ...targets.misconceptions.map((misconception) => ({
      factType: 'autotutor.misconception',
      slots: {
        id: misconception.id,
        text: misconception.text,
      },
    })),
  ];
}

function appendDerivedFacts(
  facts: SparcWorkingMemoryFact[],
  derivedFacts: readonly SparcDerivedFactRule[] | undefined,
): SparcProductionRuleExecution | undefined {
  if (!derivedFacts?.length) {
    return undefined;
  }
  const existingFactKeys = new Set(facts.map((fact) => JSON.stringify(fact)));
  const execution = runSparcProductionRules({
    facts,
    rules: derivedFacts.map(derivedFactProductionRule),
  });
  for (const firing of execution.firings) {
    for (const fact of firing.assertedFacts) {
      const key = JSON.stringify(fact);
      if (existingFactKeys.has(key)) {
        continue;
      }
      existingFactKeys.add(key);
      facts.push(fact);
    }
  }
  return execution;
}

export function buildSparcWorkingMemoryFactsWithDerivations(
  input: SparcWorkingMemoryFactBuildInput,
): SparcWorkingMemoryFactBuildResult {
  requireNonBlank(input.document.id, 'SPARC authored document id');
  const facts: SparcWorkingMemoryFact[] = [
    ...autoTutorTargetFacts(input.document),
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
  const derivedRuleExecution = appendDerivedFacts(facts, input.document.derivedFacts);

  return {
    facts,
    ...(derivedRuleExecution ? { derivedRuleExecution } : {}),
  };
}

export function buildSparcWorkingMemoryFacts(
  input: SparcWorkingMemoryFactBuildInput,
): readonly SparcWorkingMemoryFact[] {
  return buildSparcWorkingMemoryFactsWithDerivations(input).facts;
}
