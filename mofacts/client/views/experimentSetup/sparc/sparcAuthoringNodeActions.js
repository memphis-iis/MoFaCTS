import {
  insertAtAnchor,
  nodeIsInRegion,
  nodeIsTopLevelFlow,
  normalizePlacementOrder,
  topLevelFlowUsesOrder,
} from './sparcAuthoringDragDrop';
import { flattenNodes } from './sparcAuthoringTargets';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function makeNodeId(entry) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `node-${entry.id.replace('.', '-')}-${suffix}`;
}

export function scopeDefaultChildNodeIds(node, parentId) {
  if (!node || typeof node !== 'object') {
    return;
  }
  for (const [index, child] of (node.children || []).entries()) {
    const childKey = child?.id ? String(child.id) : `child-${index + 1}`;
    child.id = `${parentId}-${childKey}`;
    scopeDefaultChildNodeIds(child, child.id);
  }
}

export function seedVisiblePaletteNode(node, entry) {
  const label = entry?.label || node.atomType || node.groupType || 'Node';
  if (node.nodeType === 'group') {
    return;
  }
  if (node.atomType === 'html-block' && !String(node.value || '').replace(/<[^>]*>/g, '').trim()) {
    node.value = `<p>${label}</p>`;
  } else if (node.atomType === 'text-block' || node.atomType === 'header-cell' || node.atomType === 'text') {
    node.value = node.value || label;
  } else if (node.atomType === 'message-box') {
    node.value = node.value || label;
  } else if (node.atomType === 'text-input') {
    node.value = node.value || '';
    node.hint = node.hint || label;
  } else if (node.atomType === 'dropdown' || node.atomType === 'select') {
    node.options = Array.isArray(node.options) && node.options.some((option) => String(option).trim())
      ? node.options
      : [label];
  }
}

export function createNode(entry) {
  const node = entry.defaultValue === undefined
    ? {
      nodeType: entry.schema?.properties?.nodeType?.const || (entry.id.startsWith('group.') ? 'group' : 'atomic'),
      ...(entry.id.startsWith('group.') ? { groupType: entry.schema?.properties?.groupType?.const } : {}),
      ...(entry.id.startsWith('atomic.') ? { atomType: entry.schema?.properties?.atomType?.const } : {}),
    }
    : clone(entry.defaultValue);
  node.id = makeNodeId(entry);
  scopeDefaultChildNodeIds(node, node.id);
  if (node.nodeType === 'group') {
    node.children = Array.isArray(node.children) ? node.children : [];
  }
  if (node.atomType === 'panel-selector') {
    node.panels = Array.isArray(node.panels) && node.panels.length
      ? node.panels
      : [{
        id: `${node.id}-panel-1`,
        label: 'Panel 1',
        children: [],
      }];
    node.selectedPanelId = node.selectedPanelId || node.panels[0].id;
  }
  seedVisiblePaletteNode(node, entry);
  return node;
}

export function paletteIconClass(entry) {
  const id = entry?.id || '';
  const atomType = entry?.defaultValue?.atomType || entry?.schema?.properties?.atomType?.const || '';
  const groupType = entry?.defaultValue?.groupType || entry?.schema?.properties?.groupType?.const || '';
  const groupIcons = {
    section: 'fa-file-text-o',
    'multiple-choice': 'fa-list-ul',
    'answer-list': 'fa-list-ol',
    'targeted-cata': 'fa-check-square-o',
    'checkbox-choice': 'fa-check-square-o',
    'dropdown-exercise': 'fa-caret-square-o-down',
    'dropdown-row': 'fa-caret-square-o-down',
    'text-input-exercise': 'fa-pencil-square-o',
    'text-input-row': 'fa-i-cursor',
    'short-answer': 'fa-keyboard-o',
    'choice-tabs': 'fa-folder-open-o',
    fraction: 'fa-slash',
    'alternative-panel': 'fa-columns',
    'oli-group': 'fa-object-group',
  };
  const atomIcons = {
    'html-block': 'fa-code',
    'text-block': 'fa-align-left',
    'message-box': 'fa-commenting-o',
    button: 'fa-hand-pointer-o',
    'text-input': 'fa-keyboard-o',
    dropdown: 'fa-caret-square-o-down',
    select: 'fa-caret-square-o-down',
    checkbox: 'fa-check-square-o',
    'panel-selector': 'fa-columns',
    'skill-bar': 'fa-tasks',
    'learning-progress': 'fa-line-chart',
    operator: 'fa-plus',
    'fraction-box': 'fa-slash',
    'fraction-input': 'fa-pencil-square-o',
    'header-cell': 'fa-header',
    text: 'fa-font',
  };
  if (groupType) return groupIcons[groupType] || 'fa-object-group';
  if (atomType) return atomIcons[atomType] || 'fa-cube';
  if (id === 'semantic.multiple-choice') return 'fa-list-ul';
  return 'fa-cube';
}

export function findPanelById(panelId, nodes = []) {
  for (const node of nodes || []) {
    if (node?.atomType === 'panel-selector') {
      const panel = (node.panels || []).find((candidate) => candidate.id === panelId);
      if (panel) return { owner: node, panel };
      for (const candidatePanel of node.panels || []) {
        const nested = findPanelById(panelId, candidatePanel.children || []);
        if (nested) return nested;
      }
    }
    if (node?.nodeType === 'group') {
      const nested = findPanelById(panelId, node.children || []);
      if (nested) return nested;
    }
  }
  return null;
}

export function ensurePanelSelectorPanel(node) {
  node.panels = Array.isArray(node.panels) && node.panels.length
    ? node.panels
    : [{
      id: `${node.id || 'panel-selector'}-panel-1`,
      label: 'Panel 1',
      children: [],
    }];
  const selectedPanel = node.panels.find((panel) => panel.id === node.selectedPanelId)
    || node.panels[0];
  node.selectedPanelId = selectedPanel.id;
  selectedPanel.children = Array.isArray(selectedPanel.children) ? selectedPanel.children : [];
  return selectedPanel;
}

export function activeChildrenForSelection({ activeDisplay, activeNode }) {
  if (!activeDisplay) {
    throw new Error('No active SPARC display is selected.');
  }
  if (activeNode?.nodeType === 'group') {
    activeNode.children = Array.isArray(activeNode.children) ? activeNode.children : [];
    return activeNode.children;
  }
  if (activeNode?.atomType === 'panel-selector') {
    return ensurePanelSelectorPanel(activeNode).children;
  }
  return activeDisplay.nodes;
}

export function insertPaletteNode({ activeDisplay, entry, target, findNodeEntry }) {
  if (!activeDisplay) {
    throw new Error('No active SPARC display is selected.');
  }
  if (!entry) {
    throw new Error('No SPARC palette entry was selected for insertion.');
  }
  if (!target?.kind) {
    throw new Error('No valid Visual Editor drop target was found.');
  }

  activeDisplay.nodes = Array.isArray(activeDisplay.nodes) ? activeDisplay.nodes : [];
  const node = createNode(entry);

  if (target.kind === 'top-level-box') {
    node.placement = node.placement && typeof node.placement === 'object' ? node.placement : {};
    node.placement.region = target.boxId;
    insertAtAnchor(activeDisplay.nodes, node, target.anchorNodeId, target.position);
    normalizePlacementOrder(activeDisplay.nodes, (candidate) => nodeIsInRegion(candidate, target.boxId));
  } else if (target.kind === 'top-level-flow') {
    const shouldNormalizeFlowOrder = topLevelFlowUsesOrder(activeDisplay.nodes);
    insertAtAnchor(activeDisplay.nodes, node, target.anchorNodeId, target.position);
    if (shouldNormalizeFlowOrder) {
      normalizePlacementOrder(activeDisplay.nodes, nodeIsTopLevelFlow);
    }
  } else if (target.kind === 'group') {
    const groupEntry = findNodeEntry(target.groupId);
    if (!groupEntry?.node || groupEntry.node.nodeType !== 'group') {
      throw new Error(`Drop target group "${target.groupId}" was not found.`);
    }
    groupEntry.node.children = Array.isArray(groupEntry.node.children) ? groupEntry.node.children : [];
    insertAtAnchor(groupEntry.node.children, node, target.anchorNodeId, target.position);
    normalizePlacementOrder(groupEntry.node.children);
  } else if (target.kind === 'panel') {
    const panelEntry = findPanelById(target.panelId, activeDisplay.nodes);
    if (!panelEntry?.panel) {
      throw new Error(`Drop target panel "${target.panelId}" was not found.`);
    }
    panelEntry.panel.children = Array.isArray(panelEntry.panel.children) ? panelEntry.panel.children : [];
    insertAtAnchor(panelEntry.panel.children, node, target.anchorNodeId, target.position);
    normalizePlacementOrder(panelEntry.panel.children);
  } else {
    throw new Error(`Unsupported Visual Editor drop target "${target.kind}".`);
  }

  return node;
}

export function removeNodeFromList(nodes, id) {
  const index = nodes.findIndex((node) => node?.id === id);
  if (index >= 0) {
    nodes.splice(index, 1);
    return true;
  }
  for (const node of nodes) {
    if (node?.nodeType === 'group' && Array.isArray(node.children) && removeNodeFromList(node.children, id)) {
      return true;
    }
    if (node?.atomType === 'panel-selector') {
      for (const panel of node.panels || []) {
        if (Array.isArray(panel.children) && removeNodeFromList(panel.children, id)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function nextActiveNodeIdAfterRemoval({ activeDisplay, removedNodeId, preferredNodeId }) {
  if (!removeNodeFromList(activeDisplay.nodes, removedNodeId)) {
    return null;
  }
  const remainingNodes = flattenNodes(activeDisplay.nodes);
  return remainingNodes.some((entry) => entry.node?.id === preferredNodeId)
    ? preferredNodeId
    : remainingNodes[0]?.node?.id || '';
}

export function updateNodeAuthoredValue(node, value) {
  if (!node || node.nodeType !== 'atomic') {
    return false;
  }
  if (node.atomType === 'dropdown') {
    node.selected = value;
  } else if (node.atomType === 'checkbox') {
    node.checked = value === true;
  } else {
    node.value = value;
  }
  return true;
}
