export function insertAtAnchor(nodes, node, anchorNodeId, position) {
  if (!anchorNodeId || position === 'inside') {
    nodes.push(node);
    return;
  }
  const anchorIndex = nodes.findIndex((candidate) => candidate?.id === anchorNodeId);
  if (anchorIndex < 0) {
    throw new Error(`Drop target anchor "${anchorNodeId}" is not in the destination container.`);
  }
  nodes.splice(position === 'after' ? anchorIndex + 1 : anchorIndex, 0, node);
}

export function normalizePlacementOrder(nodes, predicate = () => true) {
  let order = 1;
  for (const node of nodes || []) {
    if (!predicate(node)) continue;
    node.placement = node.placement && typeof node.placement === 'object' ? node.placement : {};
    node.placement.order = order;
    order += 1;
  }
}

export function nodeIsInRegion(node, region) {
  return (node?.placement?.region || '') === region;
}

export function nodeIsTopLevelFlow(node) {
  return !node?.placement?.region;
}

export function topLevelFlowUsesOrder(nodes) {
  return (nodes || []).some((node) => (
    nodeIsTopLevelFlow(node) && Number.isFinite(Number(node?.placement?.order))
  ));
}

export function nearestCandidate(candidates, clientX, clientY) {
  let best = null;
  for (const candidate of candidates) {
    const rect = candidate.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(clientY - centerY) * 2 + Math.abs(clientX - centerX);
    if (!best || distance < best.distance) {
      best = { ...candidate, rect, distance };
    }
  }
  if (!best) return null;
  return {
    anchorNodeId: best.entry.node.id,
    position: clientY > best.rect.top + best.rect.height / 2 ? 'after' : 'before',
    rect: best.rect,
  };
}

export function markerFromRect(surface, rect, position) {
  const surfaceRect = surface.getBoundingClientRect();
  if (position === 'inside') {
    return `left: ${rect.left - surfaceRect.left + surface.scrollLeft}px; top: ${rect.top - surfaceRect.top + surface.scrollTop}px; width: ${rect.width}px; height: ${rect.height}px;`;
  }
  const top = (position === 'after' ? rect.bottom : rect.top) - surfaceRect.top + surface.scrollTop;
  return `left: ${rect.left - surfaceRect.left + surface.scrollLeft}px; top: ${top}px; width: ${rect.width}px;`;
}

export function targetLabel(target) {
  if (!target) return '';
  if (target.kind === 'top-level-box') return target.boxId ? `box ${target.boxId}` : 'layout box';
  if (target.kind === 'group') return `group ${target.groupId}`;
  if (target.kind === 'panel') return 'active panel';
  return 'top-level flow';
}
