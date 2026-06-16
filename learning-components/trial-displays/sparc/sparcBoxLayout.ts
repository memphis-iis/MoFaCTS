import type {
  SparcBoxedNodeGroup,
  SparcLayoutZone,
  SparcTrialDisplay,
} from './SparcTrialDisplayAdapter';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function placementRegion(node: unknown): string {
  if (!isRecord(node) || !isRecord(node.placement)) {
    return '';
  }
  return typeof node.placement.region === 'string' ? node.placement.region.trim() : '';
}

function placementOrder(node: unknown): number | undefined {
  if (!isRecord(node) || !isRecord(node.placement)) {
    return undefined;
  }
  const rawOrder = node.placement.order;
  if (rawOrder === undefined || rawOrder === null || rawOrder === '') {
    return undefined;
  }
  const order = Number(rawOrder);
  return Number.isFinite(order) ? order : undefined;
}

function comparePlacementOrder(
  left: { readonly node: unknown; readonly index: number },
  right: { readonly node: unknown; readonly index: number },
): number {
  const leftOrder = placementOrder(left.node);
  const rightOrder = placementOrder(right.node);
  if (leftOrder !== undefined && rightOrder !== undefined) {
    return leftOrder - rightOrder || left.index - right.index;
  }
  if (leftOrder !== undefined) {
    return -1;
  }
  if (rightOrder !== undefined) {
    return 1;
  }
  return left.index - right.index;
}

export function getSparcLayoutZones(display: SparcTrialDisplay): readonly SparcLayoutZone[] {
  if (!isRecord(display.layout) || !Array.isArray(display.layout.zones)) {
    return [];
  }
  return display.layout.zones
    .filter(isRecord)
    .map((zone) => ({
      ...zone,
      id: typeof zone.id === 'string' ? zone.id.trim() : '',
    }))
    .filter((zone) => zone.id.length > 0);
}

export function buildSparcBoxedNodeGroups(display: SparcTrialDisplay): readonly SparcBoxedNodeGroup[] {
  const zones = getSparcLayoutZones(display);
  if (zones.length === 0) {
    return [];
  }
  const topLevelNodes = Array.isArray(display.nodes) ? display.nodes : [];
  return zones.map((box) => ({
    box,
    nodes: topLevelNodes
      .map((node, index) => ({ node, index }))
      .filter((entry) => placementRegion(entry.node) === box.id)
      .sort(comparePlacementOrder)
      .map((entry) => entry.node),
  }));
}
