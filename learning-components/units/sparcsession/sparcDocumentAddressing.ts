import type {
  SparcAddressReference,
  SparcAddressSegment,
  SparcAuthoredDocument,
  SparcAuthoredNode,
  SparcDocumentAddress,
} from './sparcSessionContracts';

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

export function validateSparcDocumentReferences(
  document: SparcAuthoredDocument,
): SparcReferenceValidationResult {
  const issues: SparcReferenceValidationIssue[] = [];
  validateNodeReferences(document, document.root, issues);
  validateInitialStateReferences(document, issues);
  validateReactiveRuleReferences(document, issues);
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
