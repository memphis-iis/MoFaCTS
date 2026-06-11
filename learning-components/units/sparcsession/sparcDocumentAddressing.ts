import type {
  SparcAddressReference,
  SparcAddressSegment,
  SparcAuthoredDocument,
  SparcAuthoredNode,
  SparcCondition,
  SparcDocumentAddress,
  SparcModelTargetIdentity,
} from './sparcSessionContracts';
import { assertModelPracticeHistoryIdentity } from '../../runtime/historyStimulusIdentity';

export type SparcResolvedAddress = {
  readonly document: SparcAuthoredDocument;
  readonly node: SparcAuthoredNode;
  readonly pathNodes: readonly SparcAuthoredNode[];
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

function resolvePathSegment(
  parent: SparcAuthoredNode,
  segment: SparcAddressSegment,
): SparcAuthoredNode {
  const children = parent.children ?? [];
  if (typeof segment === 'number') {
    const child = children[segment];
    if (!child) {
      throw new Error(`SPARC address path segment ${segment} is outside node "${parent.id}" children`);
    }
    return child;
  }
  const child = children.find((candidate) => candidate.id === segment);
  if (!child) {
    throw new Error(`SPARC address path segment "${segment}" not found under node "${parent.id}"`);
  }
  return child;
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
  const pathNodes: SparcAuthoredNode[] = [];
  let currentNode = node;
  for (const segment of address.path ?? []) {
    currentNode = resolvePathSegment(currentNode, segment);
    pathNodes.push(currentNode);
  }
  return {
    document,
    node,
    pathNodes,
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
    for (const write of rule.writes) {
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
    ...(target.sparcPath !== undefined ? { path: target.sparcPath } : {}),
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
  if (target.sparcDocumentId !== address.documentId || target.sparcNodeId !== address.nodeId) {
    return false;
  }
  if (target.sparcPath === undefined || target.sparcPath.length === 0) {
    return true;
  }
  return String(target.sparcPath[target.sparcPath.length - 1]) === address.nodeId;
}

function modelTargetAddressMessage(
  target: SparcModelTargetIdentity,
  address: SparcDocumentAddress,
): string {
  return `SPARC authored modelTarget for node "${address.nodeId}" must match authored address `
    + `${JSON.stringify(address)} and any sparcPath must end at that node; got ${JSON.stringify({
      sparcDocumentId: target.sparcDocumentId,
      sparcNodeId: target.sparcNodeId,
      sparcPath: target.sparcPath ?? [],
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
