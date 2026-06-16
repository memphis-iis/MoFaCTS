export const SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY = 'progressive-node-operation';
export const SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY = '__sparcProgressiveNodeOperations';

export type SparcProgressiveNodeOperation =
  | {
      readonly type: 'append-node';
      readonly frontier?: string;
      readonly boxId: string;
      readonly node: Record<string, unknown>;
    }
  | {
      readonly type: 'append-node-if-missing';
      readonly frontier?: string;
      readonly boxId: string;
      readonly beforeNodeId?: string;
      readonly afterNodeId?: string;
      readonly node: Record<string, unknown>;
    }
  | {
      readonly type: 'append-text';
      readonly nodeId: string;
      readonly text: string;
      readonly separator?: string;
    }
  | {
      readonly type: 'insert-node';
      readonly boxId?: string;
      readonly beforeNodeId?: string;
      readonly afterNodeId?: string;
      readonly node: Record<string, unknown>;
    };

type TransitionLike = {
  readonly writes?: readonly {
    readonly key?: string;
    readonly value?: unknown;
  }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeOperation(value: unknown): SparcProgressiveNodeOperation | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.type === 'append-node' || value.type === 'append-node-if-missing') {
    if (!isRecord(value.node)) {
      return null;
    }
    const boxId = nonBlankString(value.boxId);
    if (!boxId) {
      return null;
    }
    return {
      type: value.type,
      ...(nonBlankString(value.frontier) ? { frontier: nonBlankString(value.frontier) } : {}),
      ...(value.type === 'append-node-if-missing' && nonBlankString(value.beforeNodeId) ? { beforeNodeId: nonBlankString(value.beforeNodeId) } : {}),
      ...(value.type === 'append-node-if-missing' && nonBlankString(value.afterNodeId) ? { afterNodeId: nonBlankString(value.afterNodeId) } : {}),
      boxId,
      node: value.node,
    };
  }
  if (value.type === 'insert-node') {
    if (!isRecord(value.node)) {
      return null;
    }
    const boxId = nonBlankString(value.boxId);
    const beforeNodeId = nonBlankString(value.beforeNodeId);
    const afterNodeId = nonBlankString(value.afterNodeId);
    return {
      type: 'insert-node',
      ...(boxId ? { boxId } : {}),
      ...(beforeNodeId ? { beforeNodeId } : {}),
      ...(afterNodeId ? { afterNodeId } : {}),
      node: value.node,
    };
  }
  if (value.type === 'append-text') {
    const targetNodeId = nonBlankString(value.nodeId);
    const text = nonBlankString(value.text);
    if (!targetNodeId || !text) {
      return null;
    }
    return {
      type: 'append-text',
      nodeId: targetNodeId,
      text,
      ...(typeof value.separator === 'string' ? { separator: value.separator } : {}),
    };
  }
  return null;
}

function nodeId(node: unknown): string {
  return isRecord(node) ? nonBlankString(node.id) : '';
}

function nodeRegion(node: unknown): string {
  if (!isRecord(node) || !isRecord(node.placement)) {
    return '';
  }
  return nonBlankString(node.placement.region);
}

function withPlacementRegion(node: Record<string, unknown>, boxId: string): Record<string, unknown> {
  const placement = isRecord(node.placement) ? node.placement : {};
  return {
    ...node,
    placement: {
      ...placement,
      region: nonBlankString(placement.region) || boxId,
    },
  };
}

function removeExistingNode(nodes: readonly unknown[], id: string): unknown[] {
  if (!id) {
    return [...nodes];
  }
  return nodes.filter((node) => nodeId(node) !== id);
}

function insertAt(nodes: readonly unknown[], index: number, node: unknown): unknown[] {
  const next = [...nodes];
  const boundedIndex = Math.max(0, Math.min(index, next.length));
  next.splice(boundedIndex, 0, node);
  return next;
}

function appendNode(nodes: readonly unknown[], operation: Extract<SparcProgressiveNodeOperation, { type: 'append-node' }>): unknown[] {
  const nextNode = withPlacementRegion(operation.node, operation.boxId);
  return [...removeExistingNode(nodes, nodeId(nextNode)), nextNode];
}

function hasNodeId(nodes: readonly unknown[], id: string): boolean {
  return nodes.some((node) => {
    if (nodeId(node) === id) {
      return true;
    }
    return isRecord(node) && Array.isArray(node.children) ? hasNodeId(node.children, id) : false;
  });
}

function appendNodeIfMissing(nodes: readonly unknown[], operation: Extract<SparcProgressiveNodeOperation, { type: 'append-node-if-missing' }>): unknown[] {
  const nextNode = withPlacementRegion(operation.node, operation.boxId);
  const id = nodeId(nextNode);
  if (id && hasNodeId(nodes, id)) {
    return [...nodes];
  }
  if (operation.beforeNodeId || operation.afterNodeId) {
    return insertNode(nodes, {
      type: 'insert-node',
      boxId: operation.boxId,
      ...(operation.beforeNodeId ? { beforeNodeId: operation.beforeNodeId } : {}),
      ...(operation.afterNodeId ? { afterNodeId: operation.afterNodeId } : {}),
      node: nextNode,
    });
  }
  return [...nodes, nextNode];
}

function insertNode(nodes: readonly unknown[], operation: Extract<SparcProgressiveNodeOperation, { type: 'insert-node' }>): unknown[] {
  const targetBoxId = operation.boxId || nodeRegion(operation.node);
  const nextNode = targetBoxId ? withPlacementRegion(operation.node, targetBoxId) : operation.node;
  const current = removeExistingNode(nodes, nodeId(nextNode));
  if (operation.beforeNodeId) {
    const beforeIndex = current.findIndex((node) => nodeId(node) === operation.beforeNodeId);
    return insertAt(current, beforeIndex >= 0 ? beforeIndex : current.length, nextNode);
  }
  if (operation.afterNodeId) {
    const afterIndex = current.findIndex((node) => nodeId(node) === operation.afterNodeId);
    return insertAt(current, afterIndex >= 0 ? afterIndex + 1 : current.length, nextNode);
  }
  return [...current, nextNode];
}

function appendTextToNode(node: unknown, operation: Extract<SparcProgressiveNodeOperation, { type: 'append-text' }>): unknown {
  if (!isRecord(node)) {
    return node;
  }
  if (nodeId(node) === operation.nodeId) {
    const currentValue = typeof node.value === 'string' ? node.value : '';
    if (currentValue.includes(operation.text)) {
      return node;
    }
    const separator = operation.separator ?? ' ';
    return {
      ...node,
      value: currentValue ? `${currentValue}${separator}${operation.text}` : operation.text,
    };
  }
  if (Array.isArray(node.children)) {
    return {
      ...node,
      children: node.children.map((child) => appendTextToNode(child, operation)),
    };
  }
  return node;
}

function appendText(nodes: readonly unknown[], operation: Extract<SparcProgressiveNodeOperation, { type: 'append-text' }>): unknown[] {
  return nodes.map((node) => appendTextToNode(node, operation));
}

export function collectSparcProgressiveNodeOperations(
  transitions: readonly TransitionLike[],
): readonly SparcProgressiveNodeOperation[] {
  const operations: SparcProgressiveNodeOperation[] = [];
  for (const transition of transitions) {
    for (const write of transition.writes ?? []) {
      if (write.key !== SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY) {
        continue;
      }
      const operation = normalizeOperation(write.value);
      if (operation) {
        operations.push(operation);
      }
    }
  }
  return operations;
}

export function applySparcProgressiveNodeOperations(
  nodes: readonly unknown[],
  operations: readonly SparcProgressiveNodeOperation[],
): readonly unknown[] {
  return operations.reduce<readonly unknown[]>((current, operation) => {
    if (operation.type === 'append-node') {
      return appendNode(current, operation);
    }
    if (operation.type === 'append-node-if-missing') {
      return appendNodeIfMissing(current, operation);
    }
    if (operation.type === 'append-text') {
      return appendText(current, operation);
    }
    return insertNode(current, operation);
  }, nodes);
}
