import type { SparcTrialDisplay } from './SparcTrialDisplayAdapter';

export type SparcDisplayContentReadinessIssue = {
  readonly kind:
    | 'duplicate-node-id'
    | 'missing-node-id'
    | 'missing-scored-node'
    | 'missing-intent'
    | 'missing-behavior-ref-node'
    | 'missing-path-intent-node'
    | 'missing-layout-zone';
  readonly message: string;
  readonly nodeId?: string;
};

export type SparcDisplayContentReadinessResult = {
  readonly ready: boolean;
  readonly issues: readonly SparcDisplayContentReadinessIssue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectNodeIds(
  nodes: readonly unknown[],
  nodeIds: Set<string>,
  issues: SparcDisplayContentReadinessIssue[],
): void {
  for (const node of nodes) {
    if (!isRecord(node)) {
      issues.push({
        kind: 'missing-node-id',
        message: 'SPARC display node must be an object with a non-empty id',
      });
      continue;
    }
    const nodeId = typeof node.id === 'string' ? node.id.trim() : '';
    if (!nodeId) {
      issues.push({
        kind: 'missing-node-id',
        message: 'SPARC display node must declare a non-empty id',
      });
    } else if (nodeIds.has(nodeId)) {
      issues.push({
        kind: 'duplicate-node-id',
        nodeId,
        message: `SPARC display node id "${nodeId}" is duplicated`,
      });
    } else {
      nodeIds.add(nodeId);
    }
    if (Array.isArray(node.children)) {
      collectNodeIds(node.children, nodeIds, issues);
    }
  }
}

function collectLayoutZoneIds(display: SparcTrialDisplay): Set<string> {
  if (!isRecord(display.layout) || !Array.isArray(display.layout.zones)) {
    return new Set();
  }
  return new Set(
    display.layout.zones
      .filter(isRecord)
      .map((zone) => typeof zone.id === 'string' ? zone.id.trim() : '')
      .filter((zoneId) => zoneId.length > 0),
  );
}

function validatePlacements(
  nodes: readonly unknown[],
  zoneIds: ReadonlySet<string>,
  issues: SparcDisplayContentReadinessIssue[],
): void {
  for (const node of nodes) {
    if (!isRecord(node)) {
      continue;
    }
    const nodeId = typeof node.id === 'string' ? node.id.trim() : undefined;
    if (isRecord(node.placement) && typeof node.placement.region === 'string') {
      const zoneId = node.placement.region.trim();
      if (zoneId && !zoneIds.has(zoneId)) {
        issues.push({
          kind: 'missing-layout-zone',
          ...(nodeId ? { nodeId } : {}),
          message: `SPARC display node "${nodeId ?? '<unknown>'}" placement references missing layout zone "${zoneId}"`,
        });
      }
    }
    if (Array.isArray(node.children)) {
      validatePlacements(node.children, zoneIds, issues);
    }
  }
}

function collectIntentNodes(display: SparcTrialDisplay): Set<string> {
  const intentNodes = new Set((display.response?.intentByNode ?? []).map((intent) => intent.node));
  for (const pathEntry of display.response?.intentByPath ?? []) {
    for (const intent of pathEntry.intentByNode ?? []) {
      intentNodes.add(intent.node);
    }
  }
  return intentNodes;
}

function validatePathIntents(
  display: SparcTrialDisplay,
  nodeIds: ReadonlySet<string>,
  issues: SparcDisplayContentReadinessIssue[],
): void {
  for (const pathEntry of display.response?.intentByPath ?? []) {
    for (const intent of pathEntry.intentByNode ?? []) {
      if (!nodeIds.has(intent.node)) {
        issues.push({
          kind: 'missing-path-intent-node',
          nodeId: intent.node,
          message: `SPARC path intent node "${intent.node}" is not declared in display nodes`,
        });
      }
    }
  }
}

function validateBehaviorRefs(
  display: SparcTrialDisplay,
  nodeIds: ReadonlySet<string>,
  issues: SparcDisplayContentReadinessIssue[],
): void {
  if (!isRecord(display.behaviorRefs)) {
    return;
  }
  for (const [refName, nodeId] of Object.entries(display.behaviorRefs)) {
    if (typeof nodeId !== 'string' || !nodeIds.has(nodeId)) {
      issues.push({
        kind: 'missing-behavior-ref-node',
        ...(typeof nodeId === 'string' ? { nodeId } : {}),
        message: `SPARC behaviorRef "${refName}" references missing node "${String(nodeId)}"`,
      });
    }
  }
}

export function validateSparcDisplayContentReadiness(
  display: SparcTrialDisplay,
): SparcDisplayContentReadinessResult {
  const issues: SparcDisplayContentReadinessIssue[] = [];
  const nodeIds = new Set<string>();
  collectNodeIds(display.nodes, nodeIds, issues);

  const intentNodes = collectIntentNodes(display);
  for (const nodeId of display.response?.scoredNodes ?? []) {
    if (!nodeIds.has(nodeId)) {
      issues.push({
        kind: 'missing-scored-node',
        nodeId,
        message: `SPARC scored node "${nodeId}" is not declared in display nodes`,
      });
    }
    if (!intentNodes.has(nodeId)) {
      issues.push({
        kind: 'missing-intent',
        nodeId,
        message: `SPARC scored node "${nodeId}" is missing intent metadata`,
      });
    }
  }

  validatePathIntents(display, nodeIds, issues);
  validateBehaviorRefs(display, nodeIds, issues);
  validatePlacements(display.nodes, collectLayoutZoneIds(display), issues);

  return {
    ready: issues.length === 0,
    issues,
  };
}

export function assertSparcDisplayContentReady(display: SparcTrialDisplay): void {
  const result = validateSparcDisplayContentReadiness(display);
  if (result.ready) {
    return;
  }
  throw new Error(result.issues.map((issue) => issue.message).join('; '));
}
