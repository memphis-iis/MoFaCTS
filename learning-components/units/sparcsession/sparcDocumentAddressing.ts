import type {
  SparcAddressReference,
  SparcAuthoredDocument,
  SparcAuthoredNode,
  SparcCondition,
  SparcDocumentAddress,
  SparcModelTargetIdentity,
} from './sparcSessionContracts';
import { assertModelPracticeHistoryIdentity } from '../../runtime/historyStimulusIdentity';
import { MODEL_PRACTICE_METRICS } from '../../runtime/modelPracticeStateQueries';

export type SparcResolvedAddress = {
  readonly document: SparcAuthoredDocument;
  readonly node: SparcAuthoredNode;
};

export type SparcReferenceValidationIssue = {
  readonly sourceNodeId: string;
  readonly reference: SparcAddressReference;
  readonly message: string;
};

export type SparcReferenceValidationResult = {
  readonly valid: boolean;
  readonly issues: readonly SparcReferenceValidationIssue[];
};

function collectNodes(
  node: SparcAuthoredNode,
  nodes = new Map<string, SparcAuthoredNode>(),
): Map<string, SparcAuthoredNode> {
  if (nodes.has(node.id)) {
    throw new Error(`SPARC document contains duplicate node id "${node.id}"`);
  }
  nodes.set(node.id, node);
  for (const child of node.children ?? []) {
    collectNodes(child, nodes);
  }
  return nodes;
}

export function resolveSparcDocumentAddress(
  document: SparcAuthoredDocument,
  address: SparcDocumentAddress,
): SparcResolvedAddress {
  if (address.documentId !== document.id) {
    throw new Error(`SPARC address document "${address.documentId}" does not match authored document "${document.id}"`);
  }
  const nodes = collectNodes(document.root);
  const node = nodes.get(address.nodeId);
  if (!node) {
    throw new Error(`SPARC address node "${address.nodeId}" not found in document "${document.id}"`);
  }
  return {
    document,
    node,
  };
}

function validateNodeReferences(
  document: SparcAuthoredDocument,
  sourceNode: SparcAuthoredNode,
  issues: SparcReferenceValidationIssue[],
): void {
  for (const reference of sourceNode.refs ?? []) {
    try {
      resolveSparcDocumentAddress(document, reference.target);
    } catch (error) {
      issues.push({
        sourceNodeId: sourceNode.id,
        reference,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (
      reference.stateKey !== undefined
      && (typeof reference.stateKey !== 'string' || reference.stateKey.trim().length === 0)
    ) {
      issues.push({
        sourceNodeId: sourceNode.id,
        reference,
        message: `SPARC node "${sourceNode.id}" reference stateKey is required when declared`,
      });
    }
    if (
      reference.modelMetric !== undefined
      && !(MODEL_PRACTICE_METRICS as readonly string[]).includes(String(reference.modelMetric))
    ) {
      issues.push({
        sourceNodeId: sourceNode.id,
        reference,
        message: `SPARC node "${sourceNode.id}" reference modelMetric "${String(reference.modelMetric)}" is not recognized`,
      });
    }
  }
  for (const child of sourceNode.children ?? []) {
    validateNodeReferences(document, child, issues);
  }
}

function validateReactiveRuleReferences(
  document: SparcAuthoredDocument,
  issues: SparcReferenceValidationIssue[],
): void {
  for (const rule of document.reactiveRules ?? []) {
    for (const [index, write] of rule.writes.entries()) {
      try {
        resolveSparcDocumentAddress(document, write.target);
      } catch (error) {
        issues.push({
          sourceNodeId: `reactive-rule:${rule.id}`,
          reference: {
            relation: 'controls',
            target: write.target,
          },
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (typeof write.key !== 'string' || write.key.trim().length === 0) {
        issues.push({
          sourceNodeId: `reactive-rule:${rule.id}`,
          reference: {
            relation: 'controls',
            target: write.target,
          },
          message: `SPARC reactive rule "${rule.id}" writes[${index}].key is required`,
        });
      }
    }
  }
}

function validateConditionReferences(params: {
  readonly document: SparcAuthoredDocument;
  readonly condition: SparcCondition;
  readonly sourceNodeId: string;
  readonly issues: SparcReferenceValidationIssue[];
}): void {
  switch (params.condition.type) {
    case 'state':
      try {
        resolveSparcDocumentAddress(params.document, params.condition.query.target);
      } catch (error) {
        params.issues.push({
          sourceNodeId: params.sourceNodeId,
          reference: {
            relation: 'depends-on',
            target: params.condition.query.target,
          },
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (
        typeof params.condition.query.key !== 'string'
        || params.condition.query.key.trim().length === 0
      ) {
        params.issues.push({
          sourceNodeId: params.sourceNodeId,
          reference: {
            relation: 'depends-on',
            target: params.condition.query.target,
          },
          message: 'SPARC state-condition query key is required',
        });
      }
      return;
    case 'model':
      try {
        resolveSparcDocumentAddress(
          params.document,
          modelTargetReferenceAddress(params.condition.query.target),
        );
      } catch (error) {
        params.issues.push({
          sourceNodeId: params.sourceNodeId,
          reference: {
            relation: 'model-target',
            target: modelTargetReferenceAddress(params.condition.query.target),
          },
          message: error instanceof Error ? error.message : String(error),
        });
      }
      validateModelTargetIdentity({
        target: params.condition.query.target,
        sourceNodeId: params.sourceNodeId,
        issues: params.issues,
      });
      return;
    case 'all':
    case 'any':
      for (const condition of params.condition.conditions) {
        validateConditionReferences({
          ...params,
          condition,
        });
      }
      return;
    case 'not':
      validateConditionReferences({
        ...params,
        condition: params.condition.condition,
      });
  }
}

function validateReactiveRuleConditionReferences(
  document: SparcAuthoredDocument,
  issues: SparcReferenceValidationIssue[],
): void {
  for (const rule of document.reactiveRules ?? []) {
    if (!rule.when) {
      continue;
    }
    validateConditionReferences({
      document,
      condition: rule.when,
      sourceNodeId: `reactive-rule:${rule.id}:when`,
      issues,
    });
  }
}

function validateNodeReactiveConditionReferences(
  document: SparcAuthoredDocument,
  node: SparcAuthoredNode,
  issues: SparcReferenceValidationIssue[],
): void {
  if (node.reactive?.visibleWhen) {
    validateConditionReferences({
      document,
      condition: node.reactive.visibleWhen,
      sourceNodeId: `${node.id}:reactive.visibleWhen`,
      issues,
    });
  }
  if (node.reactive?.enabledWhen) {
    validateConditionReferences({
      document,
      condition: node.reactive.enabledWhen,
      sourceNodeId: `${node.id}:reactive.enabledWhen`,
      issues,
    });
  }
  for (const child of node.children ?? []) {
    validateNodeReactiveConditionReferences(document, child, issues);
  }
}

function validateInitialStateReferences(
  document: SparcAuthoredDocument,
  issues: SparcReferenceValidationIssue[],
): void {
  for (const [index, write] of (document.initialState ?? []).entries()) {
    try {
      resolveSparcDocumentAddress(document, write.target);
    } catch (error) {
      issues.push({
        sourceNodeId: `initial-state:${index}`,
        reference: {
          relation: 'controls',
          target: write.target,
        },
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (typeof write.key !== 'string' || write.key.trim().length === 0) {
      issues.push({
        sourceNodeId: `initial-state:${index}`,
        reference: {
          relation: 'controls',
          target: write.target,
        },
        message: `SPARC authored initialState[${index}].key is required`,
      });
    }
  }
}

function modelTargetAddressForNode(
  document: SparcAuthoredDocument,
  node: SparcAuthoredNode,
): SparcDocumentAddress {
  return {
    documentId: document.id,
    nodeId: node.id,
  };
}

function modelTargetReferenceAddress(
  target: SparcModelTargetIdentity,
): SparcDocumentAddress {
  return {
    documentId: target.sparcDocumentId,
    nodeId: target.sparcNodeId,
  };
}

function validateModelTargetIdentity(params: {
  readonly target: SparcModelTargetIdentity;
  readonly sourceNodeId: string;
  readonly issues: SparcReferenceValidationIssue[];
}): void {
  try {
    assertModelPracticeHistoryIdentity({
      levelUnitType: 'model',
      ...params.target,
    });
  } catch (error) {
    params.issues.push({
      sourceNodeId: params.sourceNodeId,
      reference: {
        relation: 'model-target',
        target: modelTargetReferenceAddress(params.target),
      },
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function modelTargetMatchesAuthoredAddress(
  target: SparcModelTargetIdentity,
  address: SparcDocumentAddress,
): boolean {
  return target.sparcDocumentId === address.documentId && target.sparcNodeId === address.nodeId;
}

function modelTargetAddressMessage(
  target: SparcModelTargetIdentity,
  address: SparcDocumentAddress,
): string {
  return `SPARC authored modelTarget for node "${address.nodeId}" must match authored address `
    + `${JSON.stringify(address)}; got ${JSON.stringify({
      sparcDocumentId: target.sparcDocumentId,
      sparcNodeId: target.sparcNodeId,
    })}`;
}

function validateAuthoredModelTargets(
  document: SparcAuthoredDocument,
  node: SparcAuthoredNode,
  issues: SparcReferenceValidationIssue[],
): void {
  if (node.modelTarget) {
    const address = modelTargetAddressForNode(document, node);
    validateModelTargetIdentity({
      target: node.modelTarget,
      sourceNodeId: node.id,
      issues,
    });
    if (!modelTargetMatchesAuthoredAddress(node.modelTarget, address)) {
      issues.push({
        sourceNodeId: node.id,
        reference: {
          relation: 'model-target',
          target: address,
        },
        message: modelTargetAddressMessage(node.modelTarget, address),
      });
    }
  }
  for (const child of node.children ?? []) {
    validateAuthoredModelTargets(document, child, issues);
  }
}

export function validateSparcDocumentReferences(
  document: SparcAuthoredDocument,
): SparcReferenceValidationResult {
  const issues: SparcReferenceValidationIssue[] = [];
  validateNodeReferences(document, document.root, issues);
  validateInitialStateReferences(document, issues);
  validateReactiveRuleReferences(document, issues);
  validateReactiveRuleConditionReferences(document, issues);
  validateNodeReactiveConditionReferences(document, document.root, issues);
  validateAuthoredModelTargets(document, document.root, issues);
  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertSparcDocumentReferences(document: SparcAuthoredDocument): void {
  const result = validateSparcDocumentReferences(document);
  if (result.valid) {
    return;
  }
  throw new Error(result.issues.map((issue) => issue.message).join('; '));
}
