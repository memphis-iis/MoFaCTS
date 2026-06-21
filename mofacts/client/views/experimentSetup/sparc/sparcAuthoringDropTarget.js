import {
  markerFromRect,
  nearestCandidate,
  targetLabel,
} from './sparcAuthoringDragDrop';
import { ensurePanelSelectorPanel } from './sparcAuthoringNodeActions';

function candidateElementEntries(surface, predicate, findNodeEntry) {
  return Array.from(surface.querySelectorAll('[data-node-id]'))
    .map((element) => {
      const nodeId = element.getAttribute('data-node-id');
      const entry = findNodeEntry(nodeId);
      return entry ? { element, entry } : null;
    })
    .filter((entry) => entry && predicate(entry.entry, entry.element));
}

export function computeDropTarget(event, findNodeEntry) {
  const surface = event.currentTarget;
  const clientX = event.clientX;
  const clientY = event.clientY;
  const eventElement = event.target?.closest?.('*');
  if (!surface || !eventElement || !surface.contains(eventElement)) {
    return { target: null, markerStyle: '' };
  }

  const directNodeElement = eventElement.closest('[data-node-id]');
  const directNodeId = directNodeElement?.getAttribute('data-node-id') || '';
  const directEntry = findNodeEntry(directNodeId);

  if (directEntry?.node?.nodeType === 'group') {
    const groupCandidates = candidateElementEntries(surface, (entry) => entry.parent === directEntry.node.id, findNodeEntry);
    const nearest = nearestCandidate(groupCandidates, clientX, clientY);
    const rect = directNodeElement.getBoundingClientRect();
    return {
      target: {
        kind: 'group',
        groupId: directEntry.node.id,
        anchorNodeId: nearest?.anchorNodeId || '',
        position: nearest?.position || 'inside',
        label: targetLabel({ kind: 'group', groupId: directEntry.node.id }),
      },
      markerStyle: markerFromRect(surface, nearest?.rect || rect, nearest?.position || 'inside'),
    };
  }

  if (directEntry?.node?.atomType === 'panel-selector') {
    const panel = ensurePanelSelectorPanel(directEntry.node);
    const panelCandidates = candidateElementEntries(surface, (entry) => entry.parent === panel.id, findNodeEntry);
    const nearest = nearestCandidate(panelCandidates, clientX, clientY);
    const rect = directNodeElement.getBoundingClientRect();
    return {
      target: {
        kind: 'panel',
        panelId: panel.id,
        anchorNodeId: nearest?.anchorNodeId || '',
        position: nearest?.position || 'inside',
        label: targetLabel({ kind: 'panel', panelId: panel.id }),
      },
      markerStyle: markerFromRect(surface, nearest?.rect || rect, nearest?.position || 'inside'),
    };
  }

  const anchorEntry = directEntry || null;
  if (anchorEntry?.parent) {
    const parentEntry = findNodeEntry(anchorEntry.parent);
    const parentCandidates = candidateElementEntries(surface, (entry) => entry.parent === anchorEntry.parent, findNodeEntry);
    const nearest = nearestCandidate(parentCandidates, clientX, clientY);
    const kind = parentEntry?.node?.nodeType === 'group' ? 'group' : 'panel';
    const target = kind === 'group'
      ? { kind, groupId: anchorEntry.parent, anchorNodeId: nearest?.anchorNodeId || anchorEntry.node.id, position: nearest?.position || 'after' }
      : { kind, panelId: anchorEntry.parent, anchorNodeId: nearest?.anchorNodeId || anchorEntry.node.id, position: nearest?.position || 'after' };
    target.label = targetLabel(target);
    return {
      target,
      markerStyle: nearest ? markerFromRect(surface, nearest.rect, nearest.position) : '',
    };
  }

  const boxElement = eventElement.closest('.sparc-box[data-sparc-box-id]');
  if (boxElement) {
    const boxId = boxElement.getAttribute('data-sparc-box-id');
    const boxCandidates = candidateElementEntries(surface, (entry, element) => (
      !entry.parent && element.closest('.sparc-box[data-sparc-box-id]') === boxElement
    ), findNodeEntry);
    const nearest = nearestCandidate(boxCandidates, clientX, clientY);
    const target = {
      kind: 'top-level-box',
      boxId,
      anchorNodeId: nearest?.anchorNodeId || '',
      position: nearest?.position || 'inside',
    };
    target.label = targetLabel(target);
    return {
      target,
      markerStyle: markerFromRect(surface, nearest?.rect || boxElement.getBoundingClientRect(), nearest?.position || 'inside'),
    };
  }

  const flowCandidates = candidateElementEntries(surface, (entry, element) => (
    !entry.parent && !element.closest('.sparc-box[data-sparc-box-id]')
  ), findNodeEntry);
  if (surface.querySelector('.sparc-box[data-sparc-box-id]') && flowCandidates.length === 0) {
    return { target: null, markerStyle: '' };
  }
  const nearest = nearestCandidate(flowCandidates, clientX, clientY);
  const target = {
    kind: 'top-level-flow',
    anchorNodeId: nearest?.anchorNodeId || '',
    position: nearest?.position || 'inside',
  };
  target.label = targetLabel(target);
  return {
    target,
    markerStyle: nearest
      ? markerFromRect(surface, nearest.rect, nearest.position)
      : markerFromRect(surface, surface.getBoundingClientRect(), 'inside'),
  };
}
