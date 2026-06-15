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

function placementOrder(node: unknown): number {
  if (!isRecord(node) || !isRecord(node.placement)) {
    return 0;
  }
  const order = Number(node.placement.order ?? 0);
  return Number.isFinite(order) ? order : 0;
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
      .filter((node) => placementRegion(node) === box.id)
      .sort((left, right) => placementOrder(left) - placementOrder(right)),
  }));
}
