<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { TextAlign } from '@tiptap/extension-text-align';
  import { Underline } from '@tiptap/extension-underline';
  import { Strike } from '@tiptap/extension-strike';
  import { Highlight } from '@tiptap/extension-highlight';
  import { Color } from '@tiptap/extension-color';
  import { TextStyle } from '@tiptap/extension-text-style';
  import { Typography } from '@tiptap/extension-typography';
  import { Subscript } from '@tiptap/extension-subscript';
  import { Superscript } from '@tiptap/extension-superscript';
  import { Table } from '@tiptap/extension-table';
  import { TableRow } from '@tiptap/extension-table-row';
  import { TableCell } from '@tiptap/extension-table-cell';
  import { TableHeader } from '@tiptap/extension-table-header';
  import { Image } from '@tiptap/extension-image';
  import { TaskList } from '@tiptap/extension-task-list';
  import { TaskItem } from '@tiptap/extension-task-item';
  import Link from '@tiptap/extension-link';
  import Placeholder from '@tiptap/extension-placeholder';
  import {
    SPARC_RICH_TEXT_COLORS,
    normalizeSparcRichHtml,
    validateSparcRichHtml,
  } from '../../experiment/svelte/services/sparcRichHtml';
  import {
    defaultProductionCondition,
    defaultProductionEffect,
    defaultProductionRule,
    defaultProductionTest,
    defaultReactiveCondition,
    defaultReactiveRule,
    defaultSparcStimulusRegistryEntry,
    defaultStateWrite,
    getRenderedSparcPaletteEntries,
    literalExpression,
    variableExpression,
  } from '../../../../../learning-components/units/sparcsession/sparcAuthoringEditorModel';
  import { SPARC_RULE_CATALOG } from '../../../../../learning-components/units/sparcsession/sparcAuthoringCatalog';
  import SparcTrialSurface from '../../experiment/svelte/components/SparcTrialSurface.svelte';

  export let tdfId = '';
  export let initialTdf = null;
  export let queryParams = {};
  export let onSave = async () => {};
  export let onCancel = () => {};

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const paletteEntries = getRenderedSparcPaletteEntries();
  const ruleCatalogEntries = SPARC_RULE_CATALOG;
  const productionRuleCatalogEntries = ruleCatalogEntries.filter((entry) => entry.category.startsWith('production-rule-'));
  const productionConditionCatalogEntries = ruleCatalogEntries.filter((entry) => entry.category === 'production-rule-condition');
  const productionTestCatalogEntries = ruleCatalogEntries.filter((entry) => entry.category === 'production-rule-test');
  const productionEffectCatalogEntries = ruleCatalogEntries.filter((entry) => entry.category === 'production-rule-effect');
  const productionEffectTypes = [
    'classify',
    'assert-fact',
    'write-state',
    'message',
    'credit',
    'model-practice',
    'append-node',
    'append-node-if-missing',
    'insert-node',
    'append-text',
  ];
  const productionConditionTypes = ['fact-pattern', 'not-fact-pattern'];
  const reactiveConditionTypes = ['state', 'model', 'all', 'any', 'not'];
  const ruleExpressionTypes = ['literal', 'variable', 'function'];
  const comparisonOps = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];
  const reactiveComparisonOps = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy'];
  const classifyOutcomes = ['correct', 'incorrect', 'partial', 'study', 'skipped', 'unknown', 'buggy'];
  const messageTypes = ['hint', 'buggy', 'success', 'feedback'];
  const functionNames = ['add', 'subtract', 'multiply', 'divide', 'mod', 'gcd', 'lcm'];

  let rawStimuliFile = clone(initialTdf?.rawStimuliFile || { setspec: { clusters: [] } });
  let clusters = rawStimuliFile?.setspec?.clusters || [];
  let sparcTargets = findSparcTargets(clusters);
  let activeTargetKey = sparcTargets[0]?.key || '';
  let activeNodeId = '';
  let htmlEditorElement;
  let htmlEditor = null;
  let htmlToolbarRevision = 0;
  let richTextLinkHref = '';
  let richTextImageSrc = '';
  let richTextImageAlt = '';
  let richTextEmbedSrc = '';
  let showRichTextSource = false;
  let savedVisualRichTextRange = null;
  let activeVisualRuleTemplateId = 'rule.effect.classify';
  let saving = false;
  let errorText = '';
  let saveMessage = '';
  let activeEditorTab = 'visual';
  let showAdvancedEditors = false;
  let showNodeHierarchy = false;
  let activeProductionRuleIndex = 0;
  let activeScopedProductionRuleIndex = -1;
  let activeReactiveRuleIndex = 0;
  let activeStimulusIndex = 0;
  let draggedPaletteEntryId = '';
  let dropTarget = null;
  let dropMarkerStyle = '';
  let dropStateContextKey = '';

  $: activeTarget = sparcTargets.find((target) => target.key === activeTargetKey) || sparcTargets[0] || null;
  $: activeDisplay = activeTarget ? clusters[activeTarget.clusterIndex]?.stims?.[activeTarget.stimIndex]?.display : null;
  $: selectedStimFile = queryParams?.stimFile ? String(queryParams.stimFile) : '';
  $: displayNodes = Array.isArray(activeDisplay?.nodes) ? activeDisplay.nodes : [];
  $: productionRules = Array.isArray(activeDisplay?.productionRules) ? activeDisplay.productionRules : [];
  $: reactiveRules = Array.isArray(activeDisplay?.reactiveRules) ? activeDisplay.reactiveRules : [];
  $: stimulusRegistry = Array.isArray(activeDisplay?.stimulusRegistry) ? activeDisplay.stimulusRegistry : [];
  $: activeProductionRule = productionRules[activeProductionRuleIndex] || productionRules[0] || null;
  $: activeReactiveRule = reactiveRules[activeReactiveRuleIndex] || reactiveRules[0] || null;
  $: activeStimulus = stimulusRegistry[activeStimulusIndex] || stimulusRegistry[0] || null;
  $: flatNodes = flattenNodes(displayNodes);
  $: if (flatNodes.length > 0 && !flatNodes.some((entry) => entry.node?.id === activeNodeId)) {
    activeNodeId = flatNodes[0].node.id;
  }
  $: activeNodeEntry = flatNodes.find((entry) => entry.node?.id === activeNodeId) || flatNodes[0] || null;
  $: activeNode = activeNodeEntry?.node || displayNodes[0] || null;
  $: activeParentNode = parentNodeForEntry(activeNodeEntry);
  $: activeNodeProductionRuleEntries = productionRules
    .map((rule, index) => ({ rule, index }))
    .filter((entry) => productionRuleReferencesNode(entry.rule, activeNodeId));
  $: selectedScopedProductionRuleEntry = activeNodeProductionRuleEntries.find((entry) => entry.index === activeScopedProductionRuleIndex)
    || activeNodeProductionRuleEntries[0]
    || null;
  $: activeNodeProductionRule = selectedScopedProductionRuleEntry?.rule || null;
  $: activeNodeProductionRuleIndex = selectedScopedProductionRuleEntry?.index ?? -1;
  $: activeNodeRuleEffect = activeNodeProductionRule?.then?.[0] || null;
  $: {
    const nextDropStateContextKey = `${activeTargetKey}:${activeEditorTab}`;
    if (dropStateContextKey && dropStateContextKey !== nextDropStateContextKey) {
      clearDropState();
    }
    dropStateContextKey = nextDropStateContextKey;
  }
  $: isImageHtmlSelected = isImageHtmlNode(activeNode);
  $: selectedImageSrc = getFirstImageAttribute(activeNode, 'src');
  $: selectedImageAlt = getFirstImageAttribute(activeNode, 'alt');
  $: selectedImageTitle = getFirstImageAttribute(activeNode, 'title');
  $: selectedHtmlMedia = getHtmlMediaSummary(activeNode);
  $: isRichTextSelected = isRichTextNode(activeNode);
  $: materializeBehaviorModelTargetsForNode(activeNode);
  $: htmlToolbarRevision;
  $: if (!showAdvancedEditors && activeEditorTab !== 'visual') {
    activeEditorTab = 'visual';
  }
  $: maintainHtmlEditor(activeNode, htmlEditorElement);
  $: syncHtmlEditor(activeNode);

  function findSparcTargets(candidateClusters) {
    const targets = [];
    (candidateClusters || []).forEach((cluster, clusterIndex) => {
      (cluster?.stims || []).forEach((stim, stimIndex) => {
        if (stim?.display?.type === 'sparc' && Array.isArray(stim.display.nodes)) {
          targets.push({
            key: `${clusterIndex}:${stimIndex}`,
            clusterIndex,
            stimIndex,
            label: stim.display.documentId || cluster.clustername || `Cluster ${clusterIndex + 1}, Stim ${stimIndex + 1}`,
          });
        }
      });
    });
    return targets;
  }

  function flattenNodes(nodes, depth = 0, parent = null) {
    const results = [];
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') continue;
      results.push({ node, depth, parent });
      if (node.nodeType === 'group') {
        results.push(...flattenNodes(node.children || [], depth + 1, node.id));
      }
      if (node.atomType === 'panel-selector') {
        for (const panel of node.panels || []) {
          results.push(...flattenNodes(panel.children || [], depth + 1, panel.id));
        }
      }
    }
    return results;
  }

  function parentNodeForEntry(entry) {
    if (!entry?.parent) {
      return null;
    }
    const parentEntry = flatNodes.find((candidate) => candidate.node?.id === entry.parent);
    if (parentEntry?.node) {
      return parentEntry.node;
    }
    return findPanelById(entry.parent)?.owner || null;
  }

  function makeNodeId(entry) {
    const suffix = Math.random().toString(36).slice(2, 8);
    return `node-${entry.id.replace('.', '-')}-${suffix}`;
  }

  function createNode(entry) {
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

  function seedVisiblePaletteNode(node, entry) {
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

  function scopeDefaultChildNodeIds(node, parentId) {
    if (!node || typeof node !== 'object') {
      return;
    }
    for (const [index, child] of (node.children || []).entries()) {
      const childKey = child?.id ? String(child.id) : `child-${index + 1}`;
      child.id = `${parentId}-${childKey}`;
      scopeDefaultChildNodeIds(child, child.id);
    }
  }

  function paletteEntryById(entryId) {
    return paletteEntries.find((entry) => entry.id === entryId) || null;
  }

  function paletteIconClass(entry) {
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

  function activeChildren() {
    if (!activeDisplay) {
      throw new Error('No active SPARC display is selected.');
    }
    if (activeNode?.nodeType === 'group') {
      activeNode.children = Array.isArray(activeNode.children) ? activeNode.children : [];
      return activeNode.children;
    }
    if (activeNode?.atomType === 'panel-selector') {
      activeNode.panels = Array.isArray(activeNode.panels) && activeNode.panels.length
        ? activeNode.panels
        : [{
          id: `${activeNode.id || 'panel-selector'}-panel-1`,
          label: 'Panel 1',
          children: [],
        }];
      const selectedPanel = activeNode.panels.find((panel) => panel.id === activeNode.selectedPanelId)
        || activeNode.panels[0];
      activeNode.selectedPanelId = selectedPanel.id;
      selectedPanel.children = Array.isArray(selectedPanel.children) ? selectedPanel.children : [];
      return selectedPanel.children;
    }
    return activeDisplay.nodes;
  }

  function addNode(entry) {
    try {
      const node = createNode(entry);
      activeChildren().push(node);
      activeNodeId = node.id;
      markChanged();
    } catch (error) {
      errorText = error.message || String(error);
    }
  }

  function findNodeEntry(nodeId) {
    return flatNodes.find((entry) => entry.node?.id === nodeId) || null;
  }

  function findPanelById(panelId, nodes = displayNodes) {
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

  function ensurePanelSelectorPanel(node) {
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

  function insertAtAnchor(nodes, node, anchorNodeId, position) {
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

  function normalizePlacementOrder(nodes, predicate = () => true) {
    let order = 1;
    for (const node of nodes || []) {
      if (!predicate(node)) continue;
      node.placement = node.placement && typeof node.placement === 'object' ? node.placement : {};
      node.placement.order = order;
      order += 1;
    }
  }

  function nodeIsInRegion(node, region) {
    return (node?.placement?.region || '') === region;
  }

  function nodeIsTopLevelFlow(node) {
    return !node?.placement?.region;
  }

  function topLevelFlowUsesOrder() {
    return (activeDisplay?.nodes || []).some((node) => (
      nodeIsTopLevelFlow(node) && Number.isFinite(Number(node?.placement?.order))
    ));
  }

  function insertPaletteNode(entry, target) {
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
      const shouldNormalizeFlowOrder = topLevelFlowUsesOrder();
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
      const panelEntry = findPanelById(target.panelId);
      if (!panelEntry?.panel) {
        throw new Error(`Drop target panel "${target.panelId}" was not found.`);
      }
      panelEntry.panel.children = Array.isArray(panelEntry.panel.children) ? panelEntry.panel.children : [];
      insertAtAnchor(panelEntry.panel.children, node, target.anchorNodeId, target.position);
      normalizePlacementOrder(panelEntry.panel.children);
    } else {
      throw new Error(`Unsupported Visual Editor drop target "${target.kind}".`);
    }

    activeNodeId = node.id;
    markChanged();
  }

  function startPaletteDrag(event, entry) {
    draggedPaletteEntryId = entry.id;
    dropTarget = null;
    dropMarkerStyle = '';
    event.dataTransfer?.setData('text/plain', entry.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  function clearDropState() {
    draggedPaletteEntryId = '';
    dropTarget = null;
    dropMarkerStyle = '';
  }

  function candidateElementEntries(surface, predicate) {
    return Array.from(surface.querySelectorAll('[data-node-id]'))
      .map((element) => {
        const nodeId = element.getAttribute('data-node-id');
        const entry = findNodeEntry(nodeId);
        return entry ? { element, entry } : null;
      })
      .filter((entry) => entry && predicate(entry.entry, entry.element));
  }

  function nearestCandidate(candidates, clientX, clientY) {
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

  function markerFromRect(surface, rect, position) {
    const surfaceRect = surface.getBoundingClientRect();
    if (position === 'inside') {
      return `left: ${rect.left - surfaceRect.left + surface.scrollLeft}px; top: ${rect.top - surfaceRect.top + surface.scrollTop}px; width: ${rect.width}px; height: ${rect.height}px;`;
    }
    const top = (position === 'after' ? rect.bottom : rect.top) - surfaceRect.top + surface.scrollTop;
    return `left: ${rect.left - surfaceRect.left + surface.scrollLeft}px; top: ${top}px; width: ${rect.width}px;`;
  }

  function targetLabel(target) {
    if (!target) return '';
    if (target.kind === 'top-level-box') return target.boxId ? `box ${target.boxId}` : 'layout box';
    if (target.kind === 'group') return `group ${target.groupId}`;
    if (target.kind === 'panel') return 'active panel';
    return 'top-level flow';
  }

  function computeDropTarget(event) {
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
      const groupCandidates = candidateElementEntries(surface, (entry) => entry.parent === directEntry.node.id);
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
      const panelCandidates = candidateElementEntries(surface, (entry) => entry.parent === panel.id);
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
      const parentCandidates = candidateElementEntries(surface, (entry) => entry.parent === anchorEntry.parent);
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
      ));
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
    ));
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

  function handleVisualDragOver(event) {
    const transferTypes = event.dataTransfer?.types;
    const hasPaletteTransfer = draggedPaletteEntryId
      || transferTypes?.includes?.('text/plain')
      || transferTypes?.contains?.('text/plain');
    if (!hasPaletteTransfer) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    const computed = computeDropTarget(event);
    dropTarget = computed.target;
    dropMarkerStyle = computed.markerStyle;
  }

  function handleVisualDrop(event) {
    event.preventDefault();
    try {
      const entryId = event.dataTransfer?.getData('text/plain') || draggedPaletteEntryId;
      const entry = paletteEntryById(entryId);
      const computed = computeDropTarget(event);
      insertPaletteNode(entry, computed.target || dropTarget);
    } catch (error) {
      errorText = error.message || String(error);
    } finally {
      clearDropState();
    }
  }

  function handleVisualDragLeave(event) {
    if (!event.currentTarget?.contains?.(event.relatedTarget)) {
      clearDropState();
    }
  }

  function updateField(fieldName, value) {
    if (!activeNode) return;
    const oldId = activeNode.id;
    activeNode[fieldName] = value;
    if (fieldName === 'id') {
      activeNodeId = value;
    }
    markChanged();
  }

  function parseHtmlFragment(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    return template;
  }

  function isImageHtmlNode(node) {
    if (!node || (node.atomType !== 'html-block' && node.atomType !== 'message-box')) {
      return false;
    }
    const value = String(node.value || '');
    return /<img[\s>]/i.test(value);
  }

  function getFirstImageAttribute(node, attributeName) {
    if (!isImageHtmlNode(node)) {
      return '';
    }
    const template = parseHtmlFragment(node.value);
    return template.content.querySelector('img')?.getAttribute(attributeName) || '';
  }

  function isHtmlMediaNode(node) {
    if (!node || (node.atomType !== 'html-block' && node.atomType !== 'message-box')) {
      return false;
    }
    const value = String(node.value || '');
    return /<(iframe|video|audio|source|embed|object)\b/i.test(value);
  }

  function getHtmlMediaSummary(node) {
    if (!isHtmlMediaNode(node)) {
      return null;
    }
    const template = parseHtmlFragment(node.value);
    const element = template.content.querySelector('iframe, video, audio, source, embed, object');
    if (!element) {
      return null;
    }
    const tagName = element.tagName.toLowerCase();
    const src = element.getAttribute('src') || element.getAttribute('data') || '';
    const title = element.getAttribute('title') || '';
    const width = element.getAttribute('width') || '';
    const height = element.getAttribute('height') || '';
    return {
      tagName,
      src,
      title,
      width,
      height,
      hasLocalhostUrl: /\blocalhost\b|127\.0\.0\.1|\[::1\]/i.test(src),
    };
  }

  function updateFirstImageAttribute(attributeName, value) {
    if (!activeNode || !isImageHtmlNode(activeNode)) {
      return;
    }
    const template = parseHtmlFragment(activeNode.value);
    let image = template.content.querySelector('img');
    if (!image) {
      image = document.createElement('img');
      template.content.appendChild(image);
    }
    const normalized = String(value || '').trim();
    if (normalized) {
      image.setAttribute(attributeName, normalized);
    } else {
      image.removeAttribute(attributeName);
    }
    activeNode.value = template.innerHTML;
    markChanged();
  }

  function updateFirstHtmlMediaAttribute(attributeName, value) {
    if (!activeNode || !isHtmlMediaNode(activeNode)) {
      return;
    }
    const template = parseHtmlFragment(activeNode.value);
    const element = template.content.querySelector('iframe, video, audio, source, embed, object');
    if (!element) {
      return;
    }
    const normalized = String(value || '').trim();
    const targetAttribute = attributeName === 'src' && element.tagName.toLowerCase() === 'object'
      ? 'data'
      : attributeName;
    if (normalized) {
      element.setAttribute(targetAttribute, normalized);
    } else {
      element.removeAttribute(targetAttribute);
    }
    activeNode.value = template.innerHTML;
    markChanged();
  }

  function selectVisualNode(nodeId) {
    if (!nodeId || !flatNodes.some((entry) => entry.node?.id === nodeId)) {
      return;
    }
    activeNodeId = nodeId;
  }

  function handleVisualEditorClick(event) {
    const nodeElement = event.target?.closest?.('[data-node-id]');
    selectVisualNode(nodeElement?.getAttribute('data-node-id'));
  }

  function targetAcceptsTextInput(target) {
    const tagName = target?.tagName?.toLowerCase?.() || '';
    return target?.isContentEditable
      || tagName === 'input'
      || tagName === 'textarea'
      || tagName === 'select'
      || Boolean(target?.closest?.('[contenteditable="true"]'));
  }

  function handleEditorDeleteKey(event) {
    if (
      event.defaultPrevented
      || event.key !== 'Delete'
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || activeEditorTab !== 'visual'
      || !activeNode
      || targetAcceptsTextInput(event.target)
    ) {
      return;
    }
    event.preventDefault();
    removeActiveNode();
  }

  function handleRichTextToolbarMouseDown(event) {
    if (event.target?.closest?.('button')) {
      event.preventDefault();
      rememberVisualRichTextSelection();
    }
  }

  function readVisualEditorEventValue(event, node) {
    const target = event.target;
    if (!target || !node) {
      return undefined;
    }
    if (node.atomType === 'checkbox') {
      return target.checked === true;
    }
    if (node.atomType === 'dropdown' || node.atomType === 'text-input' || node.atomType === 'fraction-input') {
      return target.value;
    }
    if (node.atomType === 'html-block' || node.atomType === 'message-box') {
      return target.innerHTML;
    }
    return target.textContent;
  }

  function handleVisualEditorValueEvent(event) {
    const nodeElement = event.target?.closest?.('[data-node-id]');
    const nodeId = nodeElement?.getAttribute('data-node-id');
    const node = flatNodes.find((entry) => entry.node?.id === nodeId)?.node;
    if (!node || node.nodeType !== 'atomic') {
      return;
    }
    updateNodeAuthoredValue(node.id, readVisualEditorEventValue(event, node));
  }

  function visualEditorValueBridge(element) {
    const eventNames = ['input', 'keyup', 'focusout', 'change'];
    for (const eventName of eventNames) {
      element.addEventListener(eventName, handleVisualEditorValueEvent);
    }
    return {
      destroy() {
        for (const eventName of eventNames) {
          element.removeEventListener(eventName, handleVisualEditorValueEvent);
        }
      },
    };
  }

  function updateNodeAuthoredValue(nodeId, value) {
    const target = flatNodes.find((entry) => entry.node?.id === nodeId)?.node;
    if (!target || target.nodeType !== 'atomic') {
      return;
    }
    activeNodeId = nodeId;
    if (target.atomType === 'dropdown') {
      target.selected = value;
    } else if (target.atomType === 'checkbox') {
      target.checked = value === true;
    } else {
      target.value = value;
    }
    markChanged();
  }

  function activeVisualRichTextElement() {
    if (!activeNode?.id || !isRichTextSelected) {
      return null;
    }
    return Array.from(document.querySelectorAll('.sparc-visual-editor-surface [data-node-id][contenteditable="true"]'))
      .find((element) => element.getAttribute('data-node-id') === activeNode.id) || null;
  }

  function selectionIsInsideElement(selection, element) {
    return Boolean(selection?.rangeCount && element?.contains(selection.anchorNode) && element.contains(selection.focusNode));
  }

  function rememberVisualRichTextSelection() {
    const element = activeVisualRichTextElement();
    const selection = window.getSelection?.();
    if (!element || !selectionIsInsideElement(selection, element)) {
      return;
    }
    savedVisualRichTextRange = selection.getRangeAt(0).cloneRange();
  }

  function restoreVisualRichTextSelection(element) {
    const selection = window.getSelection?.();
    if (!selection || !element) {
      return false;
    }
    if (savedVisualRichTextRange && element.contains(savedVisualRichTextRange.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(savedVisualRichTextRange);
      return true;
    }
    if (!selectionIsInsideElement(selection, element)) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return true;
  }

  function setActiveVisualRichTextHtml(element) {
    if (!activeNode || !element) {
      return;
    }
    activeNode.value = normalizeSparcRichHtml(element.innerHTML || '<p></p>');
    element.innerHTML = activeNode.value;
    if (htmlEditor) {
      htmlEditor.commands.setContent(activeNode.value || '<p></p>', false);
    }
    markChanged();
    rememberVisualRichTextSelection();
    htmlToolbarRevision += 1;
  }

  function insertHtmlAtVisualSelection(html) {
    document.execCommand('insertHTML', false, html);
  }

  function activeTableCell() {
    const selection = window.getSelection?.();
    const node = selection?.anchorNode;
    return (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest?.('td, th') || null;
  }

  function runVisualTableCommand(command) {
    const cell = activeTableCell();
    if (!cell) {
      return false;
    }
    const row = cell.closest('tr');
    const table = cell.closest('table');
    if (!row || !table) {
      return false;
    }
    if (command === 'table-add-row') {
      const clone = row.cloneNode(true);
      clone.querySelectorAll('th, td').forEach((entry) => {
        entry.innerHTML = '<p></p>';
      });
      row.after(clone);
      return true;
    }
    if (command === 'table-add-column') {
      const index = Array.from(row.children).indexOf(cell);
      table.querySelectorAll('tr').forEach((candidateRow) => {
        const referenceCell = candidateRow.children[index] || candidateRow.lastElementChild;
        const clone = (referenceCell || cell).cloneNode(false);
        clone.innerHTML = '<p></p>';
        referenceCell?.after(clone);
      });
      return true;
    }
    if (command === 'table-delete-row') {
      row.remove();
      if (!table.querySelector('tr')) {
        table.remove();
      }
      return true;
    }
    if (command === 'table-delete-column') {
      const index = Array.from(row.children).indexOf(cell);
      table.querySelectorAll('tr').forEach((candidateRow) => {
        candidateRow.children[index]?.remove();
      });
      if (!table.querySelector('td, th')) {
        table.remove();
      }
      return true;
    }
    if (command === 'table-delete') {
      table.remove();
      return true;
    }
    return false;
  }

  function runVisualRichTextCommand(command, value = undefined) {
    const element = activeVisualRichTextElement();
    if (!element || !restoreVisualRichTextSelection(element)) {
      return false;
    }
    element.focus();
    if (command === 'bold') {
      document.execCommand('bold');
    } else if (command === 'italic') {
      document.execCommand('italic');
    } else if (command === 'underline') {
      document.execCommand('underline');
    } else if (command === 'strike') {
      document.execCommand('strikeThrough');
    } else if (command === 'subscript') {
      document.execCommand('subscript');
    } else if (command === 'superscript') {
      document.execCommand('superscript');
    } else if (command === 'paragraph') {
      document.execCommand('formatBlock', false, 'p');
    } else if (command === 'heading') {
      document.execCommand('formatBlock', false, `h${Number(value) || 2}`);
    } else if (command === 'align') {
      const alignCommand = value === 'center' ? 'justifyCenter'
        : value === 'right' ? 'justifyRight'
          : value === 'justify' ? 'justifyFull'
            : 'justifyLeft';
      document.execCommand(alignCommand);
    } else if (command === 'color') {
      const color = SPARC_RICH_TEXT_COLORS.find((entry) => entry.token === value);
      if (color) {
        insertHtmlAtVisualSelection(`<span class="sparc-color-${color.token}" data-color="${color.token}">${window.getSelection()?.toString() || ''}</span>`);
      } else {
        document.execCommand('removeFormat');
      }
    } else if (command === 'highlight') {
      insertHtmlAtVisualSelection(`<mark class="sparc-highlight">${window.getSelection()?.toString() || ''}</mark>`);
    } else if (command === 'bullet-list') {
      document.execCommand('insertUnorderedList');
    } else if (command === 'ordered-list') {
      document.execCommand('insertOrderedList');
    } else if (command === 'blockquote') {
      document.execCommand('formatBlock', false, 'blockquote');
    } else if (command === 'code-block') {
      document.execCommand('formatBlock', false, 'pre');
    } else if (command === 'horizontal-rule') {
      document.execCommand('insertHorizontalRule');
    } else if (command === 'link') {
      const href = String(value || '').trim();
      if (href) {
        document.execCommand('createLink', false, href);
      } else {
        document.execCommand('unlink');
      }
    } else if (command === 'image') {
      const src = String(value?.src || '').trim();
      if (!validHttpsUrl(src)) {
        errorText = 'Image URL must be a valid https URL.';
        return true;
      }
      insertHtmlAtVisualSelection(`<img src="${src}" alt="${String(value?.alt || '').replace(/"/g, '&quot;')}">`);
    } else if (command === 'embed') {
      const src = String(value || '').trim();
      if (!validHttpsUrl(src)) {
        errorText = 'Embed URL must be a valid https URL.';
        return true;
      }
      insertHtmlAtVisualSelection(`<figure class="oli-embed"><iframe src="${src}" title="embed" width="100%" height="360" loading="lazy" allowfullscreen></iframe><figcaption></figcaption></figure>`);
    } else if (command === 'table') {
      insertHtmlAtVisualSelection('<table><tbody><tr><th><p></p></th><th><p></p></th><th><p></p></th></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table>');
    } else if (command.startsWith('table-')) {
      if (!runVisualTableCommand(command)) {
        return true;
      }
    } else if (command === 'task-list') {
      insertHtmlAtVisualSelection('<ul data-type="taskList"><li data-type="taskItem"><label><input type="checkbox" disabled="disabled"> <span>Task</span></label></li></ul>');
    } else {
      return false;
    }
    setActiveVisualRichTextHtml(element);
    return true;
  }

  function setActiveRichTextHtml(value) {
    if (!activeNode || (activeNode.atomType !== 'html-block' && activeNode.atomType !== 'message-box')) {
      return;
    }
    activeNode.value = normalizeSparcRichHtml(value || '<p></p>');
    markChanged();
  }

  function applyEditorHtmlUpdate(editor) {
    if (!activeNode || (activeNode.atomType !== 'html-block' && activeNode.atomType !== 'message-box')) {
      return;
    }
    activeNode.value = normalizeSparcRichHtml(editor.getHTML());
    markChanged();
  }

  function validHttpsUrl(value) {
    try {
      return new URL(String(value || '').trim()).protocol === 'https:';
    } catch (_error) {
      return false;
    }
  }

  function runRichTextCommand(command, value = undefined) {
    if (!htmlEditor || !isRichTextSelected) {
      return;
    }
    if (runVisualRichTextCommand(command, value)) {
      return;
    }
    const chain = htmlEditor.chain().focus();
    if (command === 'bold') {
      chain.toggleBold().run();
    } else if (command === 'italic') {
      chain.toggleItalic().run();
    } else if (command === 'underline') {
      chain.toggleUnderline().run();
    } else if (command === 'strike') {
      chain.toggleStrike().run();
    } else if (command === 'highlight') {
      chain.toggleHighlight().run();
    } else if (command === 'subscript') {
      chain.toggleSubscript().run();
    } else if (command === 'superscript') {
      chain.toggleSuperscript().run();
    } else if (command === 'paragraph') {
      chain.setParagraph().run();
    } else if (command === 'heading') {
      chain.toggleHeading({ level: value }).run();
    } else if (command === 'align') {
      chain.setTextAlign(value).run();
    } else if (command === 'color') {
      const color = SPARC_RICH_TEXT_COLORS.find((entry) => entry.token === value);
      if (color) {
        chain.setColor(color.cssValue).run();
      } else {
        chain.unsetColor().run();
      }
    } else if (command === 'bullet-list') {
      chain.toggleBulletList().run();
    } else if (command === 'ordered-list') {
      chain.toggleOrderedList().run();
    } else if (command === 'task-list') {
      chain.toggleTaskList().run();
    } else if (command === 'blockquote') {
      chain.toggleBlockquote().run();
    } else if (command === 'code-block') {
      chain.toggleCodeBlock().run();
    } else if (command === 'horizontal-rule') {
      chain.setHorizontalRule().run();
    } else if (command === 'table') {
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    } else if (command === 'table-add-row') {
      chain.addRowAfter().run();
    } else if (command === 'table-add-column') {
      chain.addColumnAfter().run();
    } else if (command === 'table-delete-row') {
      chain.deleteRow().run();
    } else if (command === 'table-delete-column') {
      chain.deleteColumn().run();
    } else if (command === 'table-delete') {
      chain.deleteTable().run();
    } else if (command === 'image') {
      const src = String(value?.src || '').trim();
      if (validHttpsUrl(src)) {
        chain.setImage({ src, alt: String(value?.alt || '') }).run();
      } else {
        errorText = 'Image URL must be a valid https URL.';
      }
    } else if (command === 'embed') {
      const src = String(value || '').trim();
      if (validHttpsUrl(src)) {
        chain.insertContent(`<figure class="oli-embed"><iframe src="${src}" title="embed" width="100%" height="360" loading="lazy" allowfullscreen></iframe><figcaption></figcaption></figure>`).run();
      } else {
        errorText = 'Embed URL must be a valid https URL.';
      }
    } else if (command === 'undo') {
      chain.undo().run();
    } else if (command === 'redo') {
      chain.redo().run();
    } else if (command === 'link') {
      const href = String(value || '').trim();
      if (href) {
        chain.extendMarkRange('link').setLink({ href }).run();
      } else {
        chain.extendMarkRange('link').unsetLink().run();
      }
    }
    applyEditorHtmlUpdate(htmlEditor);
    htmlToolbarRevision += 1;
  }

  function richTextCommandActive(command, attrs = undefined) {
    htmlToolbarRevision;
    if (!htmlEditor || !isRichTextSelected) {
      return false;
    }
    return attrs ? htmlEditor.isActive(command, attrs) : htmlEditor.isActive(command);
  }

  function richTextAlignmentActive(value) {
    htmlToolbarRevision;
    return Boolean(htmlEditor?.isActive({ textAlign: value }));
  }

  function updateRichTextSource(value) {
    setActiveRichTextHtml(value);
    if (htmlEditor) {
      htmlEditor.commands.setContent(activeNode?.value || '<p></p>', false);
    }
  }

  function selectedNodeBehaviorKeys(nodeId) {
    const keys = new Set();
    if (nodeId) {
      keys.add(nodeId);
      keys.add(`node:${nodeId}`);
    }
    const behaviorRefs = activeDisplay?.behaviorRefs;
    if (behaviorRefs && typeof behaviorRefs === 'object') {
      for (const [refName, refNodeId] of Object.entries(behaviorRefs)) {
        if (refNodeId === nodeId) {
          keys.add(refName);
        }
      }
    }
    const behavior = activeDisplay?.behavior;
    for (const step of behavior?.steps || []) {
      for (const response of step?.responses || []) {
        if (response?.nodeRef === nodeId && response.selection) {
          keys.add(response.selection);
        }
      }
    }
    for (const path of behavior?.paths || []) {
      for (const response of path?.responses || []) {
        if (response?.nodeRef === nodeId && response.selection) {
          keys.add(response.selection);
        }
      }
    }
    return keys;
  }

  function valueContainsBehaviorKey(value, keys) {
    if (!keys?.size) {
      return false;
    }
    if (typeof value === 'string' && keys.has(value)) {
      return true;
    }
    if (Array.isArray(value)) {
      return value.some((entry) => valueContainsBehaviorKey(entry, keys));
    }
    if (value && typeof value === 'object') {
      return Object.values(value).some((entry) => valueContainsBehaviorKey(entry, keys));
    }
    return false;
  }

  function productionRuleReferencesNode(rule, nodeId) {
    if (!rule || !nodeId) {
      return false;
    }
    return valueContainsBehaviorKey(rule, selectedNodeBehaviorKeys(nodeId));
  }

  function scopedConditionForNode(nodeId) {
    return {
      factType: 'interface-event',
      slots: {
        selection: { type: 'literal', value: nodeId },
        action: { type: 'bind', variable: 'action' },
        input: { type: 'bind', variable: 'value' },
      },
    };
  }

  function ruleTypeFromCatalogEntry(entryId) {
    if (entryId === 'rule.condition.fact-pattern') return 'condition:fact-pattern';
    if (entryId === 'rule.condition.not-fact-pattern') return 'condition:not-fact-pattern';
    if (entryId === 'rule.test.comparison') return 'test:comparison';
    if (entryId === 'rule.effect.assert-fact') return 'effect:assert-fact';
    if (entryId === 'rule.effect.write-state') return 'effect:write-state';
    if (entryId === 'rule.effect.message') return 'effect:message';
    if (entryId === 'rule.effect.classify') return 'effect:classify';
    if (entryId === 'rule.effect.credit') return 'effect:credit';
    if (entryId === 'rule.effect.model-practice') return 'effect:model-practice';
    if (entryId === 'rule.effect.progressive-node-operation') return 'effect:append-node';
    return 'effect:classify';
  }

  function createScopedProductionRule(entryId = activeVisualRuleTemplateId) {
    if (!activeDisplay || !activeNode?.id) {
      return;
    }
    const rules = ensureProductionRules();
    const rule = defaultProductionRule(rules.length);
    const nodeId = activeNode.id;
    rule.id = `${nodeId}.${entryId.replace(/^rule\./, '').replace(/\./g, '-')}.${rules.length + 1}`;
    rule.module = nodeId;
    rule.when = [scopedConditionForNode(nodeId)];
    const ruleType = ruleTypeFromCatalogEntry(entryId);
    if (ruleType.startsWith('condition:')) {
      rule.when.push(defaultProductionCondition(ruleType.slice('condition:'.length)));
      rule.then = [defaultProductionEffect('classify')];
    } else if (ruleType === 'test:comparison') {
      rule.tests = [defaultProductionTest()];
      rule.then = [defaultProductionEffect('classify')];
    } else if (ruleType.startsWith('effect:')) {
      rule.then = [defaultProductionEffect(ruleType.slice('effect:'.length))];
    }
    rules.push(rule);
    activeProductionRuleIndex = rules.length - 1;
    activeScopedProductionRuleIndex = rules.length - 1;
    markChanged();
  }

  function selectScopedProductionRule(index) {
    if (index < 0 || index >= productionRules.length) {
      return;
    }
    activeScopedProductionRuleIndex = index;
    activeProductionRuleIndex = index;
  }

  function updateScopedProductionRuleField(fieldName, value) {
    if (!activeNodeProductionRule) return;
    if (value === '' && fieldName === 'module') {
      delete activeNodeProductionRule.module;
    } else {
      activeNodeProductionRule[fieldName] = value;
    }
    markChanged();
  }

  function stringifyProductionRule(rule) {
    return JSON.stringify(rule || {}, null, 2);
  }

  function updateScopedProductionRuleJson(value) {
    if (!activeNodeProductionRule) return;
    try {
      const nextRule = JSON.parse(value);
      if (!nextRule || typeof nextRule !== 'object' || Array.isArray(nextRule)) {
        throw new Error('Production rule JSON must be an object.');
      }
      if (!Array.isArray(nextRule.when)) {
        throw new Error('Production rule JSON must include a when array.');
      }
      if (!Array.isArray(nextRule.then)) {
        throw new Error('Production rule JSON must include a then array.');
      }
      replaceObjectContents(activeNodeProductionRule, nextRule);
      errorText = '';
      markChanged();
    } catch (error) {
      errorText = error.message || String(error);
    }
  }

  function changeScopedRulePrimaryEffectType(type) {
    if (!activeNodeProductionRule) return;
    activeNodeProductionRule.then = Array.isArray(activeNodeProductionRule.then) ? activeNodeProductionRule.then : [];
    activeNodeProductionRule.then[0] = defaultProductionEffect(type);
    markChanged();
  }

  function addCatalogPartToActiveRule(entryId) {
    const targetRule = activeNodeProductionRule || activeProductionRule;
    if (!targetRule) {
      createScopedProductionRule(entryId);
      return;
    }
    const ruleType = ruleTypeFromCatalogEntry(entryId);
    if (ruleType.startsWith('condition:')) {
      targetRule.when = Array.isArray(targetRule.when) ? targetRule.when : [];
      targetRule.when.push(defaultProductionCondition(ruleType.slice('condition:'.length)));
      markChanged();
    } else if (ruleType === 'test:comparison') {
      targetRule.tests = Array.isArray(targetRule.tests) ? targetRule.tests : [];
      targetRule.tests.push(defaultProductionTest());
      markChanged();
    } else if (ruleType.startsWith('effect:')) {
      targetRule.then = Array.isArray(targetRule.then) ? targetRule.then : [];
      targetRule.then.push(defaultProductionEffect(ruleType.slice('effect:'.length)));
      markChanged();
    }
  }

  function updateOptions(value) {
    updateField('options', value.split('\n').map((option) => option.trim()).filter(Boolean));
  }

  function parseLooseValue(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') return '';
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    const numberValue = Number(trimmed);
    if (Number.isFinite(numberValue) && trimmed === String(numberValue)) {
      return numberValue;
    }
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return value;
    }
  }

  function stringifyLooseValue(value) {
    if (typeof value === 'string') return value;
    if (value === undefined) return '';
    return JSON.stringify(value);
  }

  function ensureProductionRules() {
    if (!activeDisplay) throw new Error('No active SPARC display is selected.');
    activeDisplay.productionRules = Array.isArray(activeDisplay.productionRules) ? activeDisplay.productionRules : [];
    return activeDisplay.productionRules;
  }

  function ensureReactiveRules() {
    if (!activeDisplay) throw new Error('No active SPARC display is selected.');
    activeDisplay.reactiveRules = Array.isArray(activeDisplay.reactiveRules) ? activeDisplay.reactiveRules : [];
    return activeDisplay.reactiveRules;
  }

  function ensureStimulusRegistry() {
    if (!activeDisplay) throw new Error('No active SPARC display is selected.');
    activeDisplay.stimulusRegistry = Array.isArray(activeDisplay.stimulusRegistry) ? activeDisplay.stimulusRegistry : [];
    return activeDisplay.stimulusRegistry;
  }

  function addStimulusRegistryEntry() {
    try {
      const registry = ensureStimulusRegistry();
      registry.push(defaultSparcStimulusRegistryEntry(registry.length));
      activeStimulusIndex = registry.length - 1;
      markChanged();
    } catch (error) {
      errorText = error.message || String(error);
    }
  }

  function removeStimulusRegistryEntry(index) {
    const registry = ensureStimulusRegistry();
    const removed = registry[index]?.stimulusId;
    registry.splice(index, 1);
    if (removed) {
      for (const entry of flatNodes) {
        const ids = Array.isArray(entry.node.stimulusIds) ? entry.node.stimulusIds : [];
        entry.node.stimulusIds = ids.filter((id) => id !== removed);
      }
    }
    activeStimulusIndex = Math.max(0, Math.min(activeStimulusIndex, registry.length - 1));
    markChanged();
  }

  function updateStimulusField(fieldName, value) {
    if (!activeStimulus) return;
    activeStimulus[fieldName] = fieldName === 'stimulusId' || fieldName === 'label'
      ? String(value)
      : parseLooseValue(value);
    if (fieldName === 'stimulusKC') {
      activeStimulus.KCId = activeStimulus.KCId || activeStimulus.stimulusKC;
      activeStimulus.KCDefault = activeStimulus.KCDefault || activeStimulus.stimulusKC;
    }
    if (fieldName === 'clusterKC') {
      activeStimulus.KCCluster = activeStimulus.KCCluster || activeStimulus.clusterKC;
    }
    markChanged();
  }

  function updateStimulusResponseField(fieldName, value) {
    if (!activeStimulus) return;
    if (!value && fieldName === 'responseKC' && !activeStimulus.response?.responseKey) {
      delete activeStimulus.response;
      markChanged();
      return;
    }
    activeStimulus.response = activeStimulus.response && typeof activeStimulus.response === 'object'
      ? activeStimulus.response
      : { responseKC: '', responseKey: '' };
    activeStimulus.response[fieldName] = fieldName === 'responseKey' ? String(value) : parseLooseValue(value);
    if (!activeStimulus.response.responseKC && !activeStimulus.response.responseKey) {
      delete activeStimulus.response;
    }
    markChanged();
  }

  function nodeStimulusIds(node) {
    return Array.isArray(node?.stimulusIds) ? node.stimulusIds : [];
  }

  function behaviorModelTargetIdsForNode(nodeId) {
    const ids = new Set();
    if (!nodeId) {
      return ids;
    }
    const behavior = activeDisplay?.behavior;
    for (const step of behavior?.steps || []) {
      for (const response of step?.responses || []) {
        if (response?.nodeRef === nodeId && typeof response.modelTarget === 'string' && response.modelTarget.trim()) {
          ids.add(response.modelTarget.trim());
        }
      }
    }
    for (const path of behavior?.paths || []) {
      for (const response of path?.responses || []) {
        if (response?.nodeRef === nodeId && typeof response.modelTarget === 'string' && response.modelTarget.trim()) {
          ids.add(response.modelTarget.trim());
        }
      }
    }
    return ids;
  }

  function materializeBehaviorModelTargetsForNode(node) {
    if (!node?.id || !activeDisplay) {
      return;
    }
    const behaviorTargetIds = behaviorModelTargetIdsForNode(node.id);
    if (behaviorTargetIds.size === 0) {
      return;
    }
    const registryIds = stimulusRegistryIdsForDisplay(activeDisplay);
    const existingIds = new Set(nodeStimulusIds(node));
    let changed = false;
    for (const id of behaviorTargetIds) {
      if (registryIds.has(id) && !existingIds.has(id)) {
        existingIds.add(id);
        changed = true;
      }
    }
    if (changed) {
      node.stimulusIds = [...existingIds];
      markChanged();
    }
  }

  function toggleNodeStimulus(stimulusId, checked) {
    if (!activeNode) return;
    const ids = new Set(nodeStimulusIds(activeNode));
    if (checked) ids.add(stimulusId);
    else ids.delete(stimulusId);
    activeNode.stimulusIds = [...ids];
    markChanged();
  }

  function updateProductionRuleField(fieldName, value) {
    if (!activeProductionRule) return;
    if (value === '' && fieldName === 'module') {
      delete activeProductionRule.module;
    } else {
      activeProductionRule[fieldName] = value;
    }
    markChanged();
  }

  function addProductionRule() {
    try {
      const rules = ensureProductionRules();
      rules.push(defaultProductionRule(rules.length));
      activeProductionRuleIndex = rules.length - 1;
      markChanged();
    } catch (error) {
      errorText = error.message || String(error);
    }
  }

  function removeProductionRule(index) {
    const rules = ensureProductionRules();
    rules.splice(index, 1);
    activeProductionRuleIndex = Math.max(0, Math.min(activeProductionRuleIndex, rules.length - 1));
    markChanged();
  }

  function moveProductionRule(index, delta) {
    const rules = ensureProductionRules();
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= rules.length) return;
    const [rule] = rules.splice(index, 1);
    rules.splice(nextIndex, 0, rule);
    activeProductionRuleIndex = nextIndex;
    markChanged();
  }

  function addProductionCondition(kind = 'fact-pattern') {
    if (!activeProductionRule) return;
    activeProductionRule.when = Array.isArray(activeProductionRule.when) ? activeProductionRule.when : [];
    activeProductionRule.when.push(defaultProductionCondition(kind));
    markChanged();
  }

  function removeProductionCondition(index) {
    if (!activeProductionRule?.when) return;
    activeProductionRule.when.splice(index, 1);
    markChanged();
  }

  function productionConditionKind(condition) {
    return condition?.type === 'not' ? 'not-fact-pattern' : 'fact-pattern';
  }

  function changeProductionConditionKind(index, kind) {
    if (!activeProductionRule?.when) return;
    activeProductionRule.when[index] = defaultProductionCondition(kind);
    markChanged();
  }

  function productionConditionPattern(condition) {
    return condition?.type === 'not' ? condition.pattern : condition;
  }

  function updateProductionConditionFactType(condition, value) {
    const pattern = productionConditionPattern(condition);
    if (!pattern) return;
    pattern.factType = value;
    markChanged();
  }

  function addFactSlot(condition) {
    const pattern = productionConditionPattern(condition);
    if (!pattern) return;
    pattern.slots = pattern.slots && typeof pattern.slots === 'object' ? pattern.slots : {};
    let index = Object.keys(pattern.slots).length + 1;
    let key = `slot${index}`;
    while (Object.prototype.hasOwnProperty.call(pattern.slots, key)) {
      index += 1;
      key = `slot${index}`;
    }
    pattern.slots[key] = { type: 'literal', value: '' };
    markChanged();
  }

  function removeFactSlot(condition, key) {
    const pattern = productionConditionPattern(condition);
    if (!pattern?.slots) return;
    delete pattern.slots[key];
    markChanged();
  }

  function renameFactSlot(condition, oldKey, newKey) {
    const pattern = productionConditionPattern(condition);
    const normalized = String(newKey || '').trim();
    if (!pattern?.slots || !normalized || normalized === oldKey) return;
    pattern.slots[normalized] = pattern.slots[oldKey];
    delete pattern.slots[oldKey];
    markChanged();
  }

  function updateFactSlotType(slot, type) {
    if (!slot) return;
    if (type === 'literal') {
      slot.type = 'literal';
      slot.value = '';
      delete slot.variable;
    } else {
      slot.type = type;
      slot.variable = slot.variable || 'value';
      delete slot.value;
    }
    markChanged();
  }

  function updateFactSlotValue(slot, value) {
    if (!slot) return;
    if (slot.type === 'literal') {
      slot.value = parseLooseValue(value);
    } else {
      slot.variable = value;
    }
    markChanged();
  }

  function addProductionTest() {
    if (!activeProductionRule) return;
    activeProductionRule.tests = Array.isArray(activeProductionRule.tests) ? activeProductionRule.tests : [];
    activeProductionRule.tests.push(defaultProductionTest());
    markChanged();
  }

  function removeProductionTest(index) {
    if (!activeProductionRule?.tests) return;
    activeProductionRule.tests.splice(index, 1);
    markChanged();
  }

  function updateRuleExpression(expression, fieldName, value) {
    if (!expression) return;
    if (fieldName === 'type') {
      if (value === 'literal') {
        expression.type = 'literal';
        expression.value = '';
        delete expression.name;
        delete expression.args;
      } else if (value === 'variable') {
        expression.type = 'variable';
        expression.name = 'value';
        delete expression.value;
        delete expression.args;
      } else if (value === 'function') {
        expression.type = 'function';
        expression.name = 'add';
        expression.args = [literalExpression(0), literalExpression(0)];
        delete expression.value;
      }
    } else if (fieldName === 'value') {
      expression.value = parseLooseValue(value);
    } else {
      expression[fieldName] = value;
    }
    markChanged();
  }

  function replaceObjectContents(target, nextValue) {
    if (!target || !nextValue || typeof nextValue !== 'object') return;
    for (const key of Object.keys(target)) {
      delete target[key];
    }
    Object.assign(target, nextValue);
  }

  function addExpressionArg(expression) {
    if (!expression || expression.type !== 'function') return;
    expression.args = Array.isArray(expression.args) ? expression.args : [];
    expression.args.push(literalExpression(0));
    markChanged();
  }

  function removeExpressionArg(expression, index) {
    if (!expression?.args) return;
    expression.args.splice(index, 1);
    markChanged();
  }

  function updateProductionTestField(test, fieldName, value) {
    if (!test) return;
    test[fieldName] = value;
    markChanged();
  }

  function addProductionEffect(type = 'classify') {
    if (!activeProductionRule) return;
    activeProductionRule.then = Array.isArray(activeProductionRule.then) ? activeProductionRule.then : [];
    activeProductionRule.then.push(defaultProductionEffect(type));
    markChanged();
  }

  function removeProductionEffect(index) {
    if (!activeProductionRule?.then) return;
    activeProductionRule.then.splice(index, 1);
    markChanged();
  }

  function changeProductionEffectType(index, type) {
    if (!activeProductionRule?.then) return;
    activeProductionRule.then[index] = defaultProductionEffect(type);
    markChanged();
  }

  function updateEffectField(effect, fieldName, value) {
    if (!effect) return;
    effect[fieldName] = value;
    markChanged();
  }

  function updateOptionalEffectField(effect, fieldName, value) {
    if (!effect) return;
    if (value === undefined || value === '') {
      delete effect[fieldName];
    } else {
      effect[fieldName] = value;
    }
    markChanged();
  }

  function ensureEffectExpression(effect, fieldName, defaultValue = '') {
    if (!effect[fieldName]) {
      effect[fieldName] = literalExpression(defaultValue);
    }
    return effect[fieldName];
  }

  function updateEffectBoolean(effect, fieldName, checked) {
    if (!effect) return;
    effect[fieldName] = checked;
    markChanged();
  }

  function ensureEffectFactSlots(effect) {
    effect.fact = effect.fact && typeof effect.fact === 'object' ? effect.fact : { factType: 'model', slots: {} };
    effect.fact.slots = effect.fact.slots && typeof effect.fact.slots === 'object' ? effect.fact.slots : {};
    return effect.fact.slots;
  }

  function addEffectFactSlot(effect) {
    const slots = ensureEffectFactSlots(effect);
    let index = Object.keys(slots).length + 1;
    let key = `slot${index}`;
    while (Object.prototype.hasOwnProperty.call(slots, key)) {
      index += 1;
      key = `slot${index}`;
    }
    slots[key] = literalExpression('');
    markChanged();
  }

  function removeEffectFactSlot(effect, key) {
    const slots = ensureEffectFactSlots(effect);
    delete slots[key];
    markChanged();
  }

  function renameEffectFactSlot(effect, oldKey, newKey) {
    const slots = ensureEffectFactSlots(effect);
    const normalized = String(newKey || '').trim();
    if (!normalized || normalized === oldKey) return;
    slots[normalized] = slots[oldKey];
    delete slots[oldKey];
    markChanged();
  }

  function ensureTarget(target) {
    target.documentId = target.documentId || '';
    target.nodeId = target.nodeId || '';
    return target;
  }

  function updateAddressTemplate(target, fieldName, value) {
    if (!target) return;
    target[fieldName] = value.startsWith?.('?') ? variableExpression(value.slice(1)) : value;
    markChanged();
  }

  function updateStateWrite(write, fieldName, value) {
    if (!write) return;
    if (fieldName === 'value') {
      write.value = parseLooseValue(value);
    } else {
      write[fieldName] = value;
    }
    markChanged();
  }

  function addReactiveRule() {
    try {
      const rules = ensureReactiveRules();
      rules.push(defaultReactiveRule(rules.length));
      activeReactiveRuleIndex = rules.length - 1;
      markChanged();
    } catch (error) {
      errorText = error.message || String(error);
    }
  }

  function removeReactiveRule(index) {
    const rules = ensureReactiveRules();
    rules.splice(index, 1);
    activeReactiveRuleIndex = Math.max(0, Math.min(activeReactiveRuleIndex, rules.length - 1));
    markChanged();
  }

  function moveReactiveRule(index, delta) {
    const rules = ensureReactiveRules();
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= rules.length) return;
    const [rule] = rules.splice(index, 1);
    rules.splice(nextIndex, 0, rule);
    activeReactiveRuleIndex = nextIndex;
    markChanged();
  }

  function updateReactiveRuleField(fieldName, value) {
    if (!activeReactiveRule) return;
    activeReactiveRule[fieldName] = value;
    markChanged();
  }

  function setReactiveCondition(type) {
    if (!activeReactiveRule) return;
    activeReactiveRule.when = defaultReactiveCondition(type);
    markChanged();
  }

  function updateReactiveCondition(condition, path, value) {
    if (!condition) return;
    if (path === 'compare') {
      condition.compare = value;
    } else if (path === 'value') {
      condition.value = parseLooseValue(value);
    } else if (path === 'query.key') {
      condition.query = condition.query || {};
      condition.query.key = value;
    } else if (path === 'query.target.documentId') {
      condition.query = condition.query || {};
      condition.query.target = ensureTarget(condition.query.target || {});
      condition.query.target.documentId = value;
    } else if (path === 'query.target.nodeId') {
      condition.query = condition.query || {};
      condition.query.target = ensureTarget(condition.query.target || {});
      condition.query.target.nodeId = value;
    } else if (path === 'query.metric') {
      condition.query = condition.query || {};
      condition.query.metric = value;
    } else if (path.startsWith('query.target.')) {
      const fieldName = path.slice('query.target.'.length);
      condition.query = condition.query || {};
      condition.query.target = condition.query.target || {};
      condition.query.target[fieldName] = value;
    }
    markChanged();
  }

  function changeReactiveCondition(condition, type) {
    if (!condition) return;
    replaceObjectContents(condition, defaultReactiveCondition(type));
    markChanged();
  }

  function addReactiveConditionChild(condition) {
    if (!condition || (condition.type !== 'all' && condition.type !== 'any')) return;
    condition.conditions = Array.isArray(condition.conditions) ? condition.conditions : [];
    condition.conditions.push(defaultReactiveCondition('state'));
    markChanged();
  }

  function removeReactiveConditionChild(condition, index) {
    if (!condition?.conditions) return;
    condition.conditions.splice(index, 1);
    markChanged();
  }

  function ensureNegatedReactiveCondition(condition) {
    if (!condition || condition.type !== 'not') return null;
    condition.condition = condition.condition || defaultReactiveCondition('state');
    return condition.condition;
  }

  function updateProgressiveNodeTemplate(effect, fieldName, value) {
    if (!effect) return;
    effect.node = effect.node && typeof effect.node === 'object' ? effect.node : {};
    if (fieldName === 'value') {
      effect.node.value = parseLooseValue(value);
    } else if (fieldName === 'nodeType') {
      effect.node.nodeType = value;
      if (value === 'group') {
        delete effect.node.atomType;
        effect.node.groupType = effect.node.groupType || 'section';
        effect.node.children = Array.isArray(effect.node.children) ? effect.node.children : [];
      } else {
        delete effect.node.groupType;
        delete effect.node.children;
        effect.node.atomType = effect.node.atomType || 'text-block';
      }
    } else {
      effect.node[fieldName] = value;
    }
    markChanged();
  }

  function addReactiveWrite() {
    if (!activeReactiveRule) return;
    activeReactiveRule.writes = Array.isArray(activeReactiveRule.writes) ? activeReactiveRule.writes : [];
    activeReactiveRule.writes.push(defaultStateWrite(activeDisplay?.documentId || '', activeNodeId || ''));
    markChanged();
  }

  function removeReactiveWrite(index) {
    if (!activeReactiveRule?.writes) return;
    activeReactiveRule.writes.splice(index, 1);
    markChanged();
  }

  function removeActiveNode() {
    if (!activeDisplay || !activeNode) return;
    if (!confirm(`Delete "${activeNode.id}"?`)) return;
    const nextPreferredNodeId = activeParentNode?.id || '';
    if (removeNodeFromList(activeDisplay.nodes, activeNode.id)) {
      const remainingNodes = flattenNodes(activeDisplay.nodes);
      activeNodeId = remainingNodes.some((entry) => entry.node?.id === nextPreferredNodeId)
        ? nextPreferredNodeId
        : remainingNodes[0]?.node?.id || '';
      markChanged();
    }
  }

  function removeNodeFromList(nodes, id) {
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

  function markChanged() {
    rawStimuliFile = rawStimuliFile;
    clusters = clusters;
    sparcTargets = findSparcTargets(clusters);
    saveMessage = '';
  }

  function syncHtmlEditor(node) {
    if (!htmlEditor || !isRichTextNode(node)) {
      return;
    }
    const current = htmlEditor.getHTML();
    const next = normalizeSparcRichHtml(node.value || '<p></p>');
    if (current !== next) {
      htmlEditor.commands.setContent(next, false);
    }
  }

  function isRichTextNode(node) {
    return node && !isImageHtmlNode(node) && (node.atomType === 'html-block' || node.atomType === 'message-box');
  }

  function maintainHtmlEditor(node) {
    if (!isRichTextNode(node)) {
      if (htmlEditor) {
        htmlEditor.destroy();
        htmlEditor = null;
      }
      return;
    }
    ensureHtmlEditor();
  }

  function ensureHtmlEditor() {
    if (!htmlEditorElement || htmlEditor) return;
    htmlEditor = new Editor({
      element: htmlEditorElement,
      extensions: [
        StarterKit.configure({
          strike: false,
        }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Underline,
        Strike,
        Highlight,
        Color,
        TextStyle,
        Typography,
        Subscript,
        Superscript,
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        Image.configure({ inline: false, allowBase64: false }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder: 'Write formatted SPARC content...' }),
      ],
      content: normalizeSparcRichHtml(activeNode?.value || '<p></p>'),
      onUpdate: ({ editor }) => {
        applyEditorHtmlUpdate(editor);
        htmlToolbarRevision += 1;
      },
      onSelectionUpdate: () => {
        htmlToolbarRevision += 1;
      },
      onTransaction: () => {
        htmlToolbarRevision += 1;
      },
    });
  }

  async function handleSave() {
    saving = true;
    errorText = '';
    saveMessage = '';
    try {
      validateBeforeSave();
      await onSave(clone(rawStimuliFile));
      saveMessage = 'Saved.';
    } catch (error) {
      errorText = error.reason || error.message || String(error);
    } finally {
      saving = false;
    }
  }

  function validateBeforeSave() {
    for (const target of sparcTargets) {
      const display = clusters[target.clusterIndex]?.stims?.[target.stimIndex]?.display;
      removeDeprecatedGroupLabels(display?.nodes || []);
      const seen = new Set();
      const stimulusRegistryIds = stimulusRegistryIdsForDisplay(display);
      for (const entry of flattenNodes(display?.nodes || [])) {
        const node = entry.node;
        if (!node.id || typeof node.id !== 'string') {
          throw new Error(`Every SPARC node in "${target.label}" must have a non-empty string id.`);
        }
        if (seen.has(node.id)) {
          throw new Error(`Duplicate SPARC node id "${node.id}" in "${target.label}".`);
        }
        seen.add(node.id);
        for (const stimulusId of node.stimulusIds || []) {
          if (!stimulusRegistryIds.has(stimulusId)) {
            throw new Error(`Node "${node.id}" in "${target.label}" attaches unknown stimulus "${stimulusId}".`);
          }
        }
        if (node.atomType === 'html-block' || node.atomType === 'message-box') {
          node.value = normalizeSparcRichHtml(node.value || '');
          const richHtmlIssues = validateSparcRichHtml(node.value, `${target.label} node "${node.id}"`);
          if (richHtmlIssues.length > 0) {
            throw new Error(richHtmlIssues.join('; '));
          }
        }
      }
      validateStimulusRegistryBeforeSave(display, target.label);
      validateRulesBeforeSave(display, target.label);
    }
  }

  function removeDeprecatedGroupLabels(nodes, parentGroupType = '') {
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      if (node.nodeType === 'group') {
        if (parentGroupType !== 'choice-tabs') {
          delete node.label;
        }
        removeDeprecatedGroupLabels(node.children || [], node.groupType || '');
      }
      if (node.atomType === 'panel-selector') {
        for (const panel of node.panels || []) {
          removeDeprecatedGroupLabels(panel.children || [], '');
        }
      }
    }
  }

  function stimulusRegistryIdsForDisplay(display) {
    return new Set((display?.stimulusRegistry || []).map((entry) => entry?.stimulusId).filter(Boolean));
  }

  function validateStimulusRegistryBeforeSave(display, label) {
    const seen = new Set();
    for (const [index, stimulus] of (display?.stimulusRegistry || []).entries()) {
      requireNonBlankString(stimulus?.stimulusId, `${label} stimulusRegistry[${index}] stimulusId`);
      if (seen.has(stimulus.stimulusId)) {
        throw new Error(`${label} has duplicate stimulusId "${stimulus.stimulusId}".`);
      }
      seen.add(stimulus.stimulusId);
      for (const fieldName of ['stimuliSetId', 'stimulusKC', 'clusterKC', 'KCId', 'KCDefault', 'KCCluster']) {
        if (stimulus?.[fieldName] === undefined || stimulus?.[fieldName] === null || String(stimulus[fieldName]).trim() === '') {
          throw new Error(`${label} stimulus "${stimulus.stimulusId}" is missing ${fieldName}.`);
        }
      }
      if (String(stimulus.KCId) !== String(stimulus.stimulusKC)) {
        throw new Error(`${label} stimulus "${stimulus.stimulusId}" must have KCId equal stimulusKC.`);
      }
      if (String(stimulus.KCDefault) !== String(stimulus.stimulusKC)) {
        throw new Error(`${label} stimulus "${stimulus.stimulusId}" must have KCDefault equal stimulusKC.`);
      }
      if (String(stimulus.KCCluster) !== String(stimulus.clusterKC)) {
        throw new Error(`${label} stimulus "${stimulus.stimulusId}" must have KCCluster equal clusterKC.`);
      }
      if (stimulus.response) {
        if (stimulus.response.responseKC === undefined || stimulus.response.responseKC === null || String(stimulus.response.responseKC).trim() === '') {
          throw new Error(`${label} stimulus "${stimulus.stimulusId}" responseKC is required when response identity is used.`);
        }
        requireNonBlankString(stimulus.response.responseKey, `${label} stimulus "${stimulus.stimulusId}" responseKey`);
      }
    }
  }

  function requireNonBlankString(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${label} is required.`);
    }
  }

  function validateRuleExpression(expression, label) {
    if (!expression || typeof expression !== 'object') {
      throw new Error(`${label} must be a rule expression.`);
    }
    if (expression.type === 'literal') {
      return;
    }
    if (expression.type === 'variable') {
      requireNonBlankString(expression.name, `${label} variable name`);
      return;
    }
    if (expression.type === 'function') {
      requireNonBlankString(expression.name, `${label} function name`);
      if (!Array.isArray(expression.args)) {
        throw new Error(`${label} function args must be an array.`);
      }
      expression.args.forEach((arg, index) => validateRuleExpression(arg, `${label} arg[${index}]`));
      return;
    }
    throw new Error(`${label} has unsupported expression type "${String(expression.type)}".`);
  }

  function validateFactPattern(pattern, label) {
    requireNonBlankString(pattern?.factType, `${label} factType`);
    for (const [slotName, slot] of Object.entries(pattern.slots || {})) {
      requireNonBlankString(slotName, `${label} slot name`);
      if (slot?.type === 'literal') {
        continue;
      }
      if (slot?.type === 'bind' || slot?.type === 'bound') {
        requireNonBlankString(slot.variable, `${label} slot "${slotName}" variable`);
        continue;
      }
      throw new Error(`${label} slot "${slotName}" has unsupported pattern type "${String(slot?.type)}".`);
    }
  }

  function validateAddressTemplate(target, label) {
    if (!target || typeof target !== 'object') {
      throw new Error(`${label} target is required.`);
    }
    for (const fieldName of ['documentId', 'nodeId']) {
      const value = target[fieldName];
      if (value && typeof value === 'object') {
        validateRuleExpression(value, `${label} target ${fieldName}`);
      } else {
        requireNonBlankString(value, `${label} target ${fieldName}`);
      }
    }
  }

  function validateProductionEffect(effect, label) {
    switch (effect?.type) {
      case 'assert-fact':
        requireNonBlankString(effect.fact?.factType, `${label} asserted factType`);
        for (const [slotName, expression] of Object.entries(effect.fact?.slots || {})) {
          requireNonBlankString(slotName, `${label} asserted slot name`);
          validateRuleExpression(expression, `${label} asserted slot "${slotName}"`);
        }
        break;
      case 'write-state':
        validateAddressTemplate(effect.write?.target, `${label} write`);
        requireNonBlankString(effect.write?.key, `${label} write key`);
        validateRuleExpression(effect.write?.value, `${label} write value`);
        break;
      case 'message':
        requireNonBlankString(effect.messageType, `${label} messageType`);
        requireNonBlankString(effect.template, `${label} template`);
        if (effect.target) {
          validateAddressTemplate(effect.target, `${label} message`);
        }
        break;
      case 'classify':
        requireNonBlankString(effect.outcome, `${label} outcome`);
        break;
      case 'credit':
        requireNonBlankString(effect.kc, `${label} kc`);
        break;
      case 'model-practice':
        requireNonBlankString(effect.outcome, `${label} outcome`);
        if (effect.stimulusId && typeof effect.stimulusId === 'object') validateRuleExpression(effect.stimulusId, `${label} stimulusId`);
        if (effect.nodeId && typeof effect.nodeId === 'object') validateRuleExpression(effect.nodeId, `${label} nodeId`);
        if (effect.responseValue !== undefined) validateRuleExpression(effect.responseValue, `${label} responseValue`);
        if (effect.input !== undefined) validateRuleExpression(effect.input, `${label} input`);
        break;
      case 'append-node':
      case 'append-node-if-missing':
        if (effect.boxId && typeof effect.boxId === 'object') validateRuleExpression(effect.boxId, `${label} boxId`);
        else requireNonBlankString(effect.boxId, `${label} boxId`);
        if (!effect.node || typeof effect.node !== 'object') throw new Error(`${label} node template is required.`);
        requireNonBlankString(effect.node.id, `${label} node id`);
        break;
      case 'insert-node':
        if (!effect.node || typeof effect.node !== 'object') throw new Error(`${label} node template is required.`);
        requireNonBlankString(effect.node.id, `${label} node id`);
        break;
      case 'append-text':
        if (effect.nodeId && typeof effect.nodeId === 'object') validateRuleExpression(effect.nodeId, `${label} nodeId`);
        else requireNonBlankString(effect.nodeId, `${label} nodeId`);
        if (effect.text && typeof effect.text === 'object') validateRuleExpression(effect.text, `${label} text`);
        else requireNonBlankString(effect.text, `${label} text`);
        break;
      default:
        throw new Error(`${label} has unsupported effect type "${String(effect?.type)}".`);
    }
  }

  function validateReactiveCondition(condition, label) {
    switch (condition?.type) {
      case 'state':
        requireNonBlankString(condition.query?.target?.documentId, `${label} state documentId`);
        requireNonBlankString(condition.query?.target?.nodeId, `${label} state nodeId`);
        requireNonBlankString(condition.query?.key, `${label} state key`);
        requireNonBlankString(condition.compare, `${label} compare`);
        break;
      case 'model':
        requireNonBlankString(condition.query?.target?.sparcDocumentId, `${label} model sparcDocumentId`);
        requireNonBlankString(condition.query?.target?.sparcNodeId, `${label} model sparcNodeId`);
        requireNonBlankString(condition.query?.metric, `${label} model metric`);
        requireNonBlankString(condition.compare, `${label} compare`);
        break;
      case 'all':
      case 'any':
        if (!Array.isArray(condition.conditions)) {
          throw new Error(`${label} ${condition.type} conditions must be an array.`);
        }
        condition.conditions.forEach((child, index) => validateReactiveCondition(child, `${label} ${condition.type}[${index}]`));
        break;
      case 'not':
        validateReactiveCondition(condition.condition, `${label} not`);
        break;
      default:
        throw new Error(`${label} has unsupported condition type "${String(condition?.type)}".`);
    }
  }

  function validateRulesBeforeSave(display, label) {
    const stimulusRegistryIds = stimulusRegistryIdsForDisplay(display);
    const nodesById = new Map(flattenNodes(display?.nodes || []).map((entry) => [entry.node.id, entry.node]));
    for (const [index, rule] of (display?.productionRules || []).entries()) {
      requireNonBlankString(rule.id, `${label} productionRules[${index}] id`);
      if (!Array.isArray(rule.when) || rule.when.length === 0) {
        throw new Error(`${label} productionRules[${index}] requires at least one when condition.`);
      }
      rule.when.forEach((condition, conditionIndex) => {
        if (condition?.type === 'not') {
          validateFactPattern(condition.pattern, `${label} productionRules[${index}].when[${conditionIndex}].not`);
        } else {
          validateFactPattern(condition, `${label} productionRules[${index}].when[${conditionIndex}]`);
        }
      });
      for (const [testIndex, test] of (rule.tests || []).entries()) {
        requireNonBlankString(test.op, `${label} productionRules[${index}].tests[${testIndex}] op`);
        validateRuleExpression(test.left, `${label} productionRules[${index}].tests[${testIndex}] left`);
        validateRuleExpression(test.right, `${label} productionRules[${index}].tests[${testIndex}] right`);
      }
      if (!Array.isArray(rule.then)) {
        throw new Error(`${label} productionRules[${index}].then must be an array.`);
      }
      rule.then.forEach((effect, effectIndex) => {
        validateProductionEffect(effect, `${label} productionRules[${index}].then[${effectIndex}]`);
        if (effect?.type !== 'model-practice') {
          return;
        }
        if (typeof effect.stimulusId === 'string' && effect.stimulusId.trim() && !stimulusRegistryIds.has(effect.stimulusId)) {
          throw new Error(`${label} productionRules[${index}].then[${effectIndex}] targets unknown stimulus "${effect.stimulusId}".`);
        }
        if (!effect.stimulusId && typeof effect.nodeId === 'string' && effect.nodeId.trim()) {
          const node = nodesById.get(effect.nodeId);
          if (!node) {
            throw new Error(`${label} productionRules[${index}].then[${effectIndex}] targets unknown node "${effect.nodeId}".`);
          }
          const ids = nodeStimulusIds(node);
          if (ids.length !== 1) {
            throw new Error(`${label} productionRules[${index}].then[${effectIndex}] node "${effect.nodeId}" must have exactly one stimulus attachment.`);
          }
        }
      });
    }

    for (const [index, rule] of (display?.reactiveRules || []).entries()) {
      requireNonBlankString(rule.id, `${label} reactiveRules[${index}] id`);
      if (rule.when) {
        validateReactiveCondition(rule.when, `${label} reactiveRules[${index}].when`);
      }
      if (!Array.isArray(rule.writes)) {
        throw new Error(`${label} reactiveRules[${index}].writes must be an array.`);
      }
      for (const [writeIndex, write] of rule.writes.entries()) {
        requireNonBlankString(write.target?.documentId, `${label} reactiveRules[${index}].writes[${writeIndex}] documentId`);
        requireNonBlankString(write.target?.nodeId, `${label} reactiveRules[${index}].writes[${writeIndex}] nodeId`);
        requireNonBlankString(write.key, `${label} reactiveRules[${index}].writes[${writeIndex}] key`);
      }
    }
  }

  onMount(async () => {
    window.addEventListener('keydown', handleEditorDeleteKey);
    document.addEventListener('selectionchange', rememberVisualRichTextSelection);
    await tick();
    ensureHtmlEditor();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleEditorDeleteKey);
    document.removeEventListener('selectionchange', rememberVisualRichTextSelection);
    htmlEditor?.destroy();
    htmlEditor = null;
  });
</script>

{#snippet ruleExpressionEditor(expression, label = 'Expression')}
  {#if expression}
    <div class="sparc-expression-editor">
      <div class="sparc-panel-header">
        <h4>{label}</h4>
        <select value={expression.type} on:change={(event) => updateRuleExpression(expression, 'type', event.currentTarget.value)}>
          {#each ruleExpressionTypes as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </div>
      {#if expression.type === 'literal'}
        <label>
          Literal Value
          <input value={stringifyLooseValue(expression.value)} on:input={(event) => updateRuleExpression(expression, 'value', event.currentTarget.value)} />
        </label>
      {:else if expression.type === 'variable'}
        <label>
          Variable Name
          <input value={expression.name || ''} on:input={(event) => updateRuleExpression(expression, 'name', event.currentTarget.value)} />
        </label>
      {:else if expression.type === 'function'}
        <label>
          Function
          <select value={expression.name} on:change={(event) => updateRuleExpression(expression, 'name', event.currentTarget.value)}>
            {#each functionNames as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </label>
        <div class="sparc-panel-header">
          <h4>Arguments</h4>
          <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => addExpressionArg(expression)}>Add Argument</button>
        </div>
        {#each expression.args || [] as arg, argIndex}
          <div class="sparc-nested-rule-card">
            <div class="sparc-inline-actions">
              <strong>Argument {argIndex + 1}</strong>
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeExpressionArg(expression, argIndex)}>Remove</button>
            </div>
            {@render ruleExpressionEditor(arg, `Argument ${argIndex + 1}`)}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet reactiveConditionEditor(condition, label = 'Condition')}
  {#if condition}
    <div class="sparc-condition-editor">
      <div class="sparc-panel-header">
        <h4>{label}</h4>
        <select value={condition.type} on:change={(event) => changeReactiveCondition(condition, event.currentTarget.value)}>
          {#each reactiveConditionTypes as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </div>
      {#if condition.type === 'state'}
        <div class="sparc-expression-grid">
          <label>
            Document
            <input value={condition.query?.target?.documentId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.documentId', event.currentTarget.value)} />
          </label>
          <label>
            Node
            <input value={condition.query?.target?.nodeId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.nodeId', event.currentTarget.value)} />
          </label>
        </div>
        <label>
          Key
          <input value={condition.query?.key || ''} on:input={(event) => updateReactiveCondition(condition, 'query.key', event.currentTarget.value)} />
        </label>
        <label>
          Compare
          <select value={condition.compare} on:change={(event) => updateReactiveCondition(condition, 'compare', event.currentTarget.value)}>
            {#each reactiveComparisonOps as op}
              <option value={op}>{op}</option>
            {/each}
          </select>
        </label>
        <label>
          Value
          <input value={stringifyLooseValue(condition.value)} on:input={(event) => updateReactiveCondition(condition, 'value', event.currentTarget.value)} />
        </label>
      {:else if condition.type === 'model'}
        <div class="sparc-expression-grid">
          <label>
            SPARC Document ID
            <input value={condition.query?.target?.sparcDocumentId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.sparcDocumentId', event.currentTarget.value)} />
          </label>
          <label>
            SPARC Node ID
            <input value={condition.query?.target?.sparcNodeId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.sparcNodeId', event.currentTarget.value)} />
          </label>
          <label>
            Stimuli Set ID
            <input value={condition.query?.target?.stimuliSetId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.stimuliSetId', event.currentTarget.value)} />
          </label>
          <label>
            Stimulus KC
            <input value={condition.query?.target?.stimulusKC || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.stimulusKC', event.currentTarget.value)} />
          </label>
          <label>
            Cluster KC
            <input value={condition.query?.target?.clusterKC || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.clusterKC', event.currentTarget.value)} />
          </label>
          <label>
            KC ID
            <input value={condition.query?.target?.KCId || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.KCId', event.currentTarget.value)} />
          </label>
          <label>
            KC Default
            <input value={condition.query?.target?.KCDefault || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.KCDefault', event.currentTarget.value)} />
          </label>
          <label>
            KC Cluster
            <input value={condition.query?.target?.KCCluster || ''} on:input={(event) => updateReactiveCondition(condition, 'query.target.KCCluster', event.currentTarget.value)} />
          </label>
        </div>
        <label>
          Metric
          <select value={condition.query?.metric || 'probability'} on:change={(event) => updateReactiveCondition(condition, 'query.metric', event.currentTarget.value)}>
            <option value="probability">probability</option>
            <option value="priorCorrect">priorCorrect</option>
            <option value="priorIncorrect">priorIncorrect</option>
            <option value="priorStudy">priorStudy</option>
            <option value="totalPracticeDuration">totalPracticeDuration</option>
            <option value="lastOutcome">lastOutcome</option>
          </select>
        </label>
        <label>
          Compare
          <select value={condition.compare} on:change={(event) => updateReactiveCondition(condition, 'compare', event.currentTarget.value)}>
            {#each reactiveComparisonOps as op}
              <option value={op}>{op}</option>
            {/each}
          </select>
        </label>
        <label>
          Value
          <input value={stringifyLooseValue(condition.value)} on:input={(event) => updateReactiveCondition(condition, 'value', event.currentTarget.value)} />
        </label>
      {:else if condition.type === 'all' || condition.type === 'any'}
        <div class="sparc-panel-header">
          <h4>{condition.type === 'all' ? 'All Conditions' : 'Any Conditions'}</h4>
          <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => addReactiveConditionChild(condition)}>Add Child</button>
        </div>
        {#each condition.conditions || [] as child, childIndex}
          <div class="sparc-nested-rule-card">
            <div class="sparc-inline-actions">
              <strong>Child {childIndex + 1}</strong>
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeReactiveConditionChild(condition, childIndex)}>Remove</button>
            </div>
            {@render reactiveConditionEditor(child, `Child ${childIndex + 1}`)}
          </div>
        {/each}
      {:else if condition.type === 'not'}
        <div class="sparc-nested-rule-card">
          {@render reactiveConditionEditor(ensureNegatedReactiveCondition(condition), 'Negated Condition')}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<div class="sparc-editor-shell">
  <header class="sparc-editor-header">
    <div>
      <h1>Sparc Visual Editor</h1>
      <div class="sparc-editor-subtitle">{initialTdf?.content?.tdfs?.tutor?.setspec?.lessonname || tdfId}</div>
      {#if selectedStimFile}
        <div class="sparc-editor-subtitle">{selectedStimFile}</div>
      {/if}
    </div>
    <div class="sparc-editor-actions">
      <label class="sparc-advanced-toggle">
        <input type="checkbox" bind:checked={showAdvancedEditors} />
        Advanced editors
      </label>
      {#if saveMessage}<span class="sparc-save-message">{saveMessage}</span>{/if}
      <button type="button" class="btn btn-secondary" on:click={onCancel}>Cancel</button>
      <button type="button" class="btn btn-primary" on:click={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save SPARC Content'}
      </button>
    </div>
  </header>

  {#if errorText}
    <div class="alert alert-danger">{errorText}</div>
  {/if}

  {#if sparcTargets.length > 1}
    <div class="sparc-target-row">
      <label for="sparc-target-select">SPARC display</label>
      <select id="sparc-target-select" bind:value={activeTargetKey}>
        {#each sparcTargets as target}
          <option value={target.key}>{target.label}</option>
        {/each}
      </select>
    </div>
  {/if}

  {#if showAdvancedEditors}
    <div class="sparc-editor-tabs" role="tablist" aria-label="SPARC editor sections">
      <button type="button" class:active={activeEditorTab === 'visual'} on:click={() => activeEditorTab = 'visual'}>Visual Editor</button>
      <button type="button" class:active={activeEditorTab === 'model'} on:click={() => activeEditorTab = 'model'}>Stimuli</button>
      <button type="button" class:active={activeEditorTab === 'production'} on:click={() => activeEditorTab = 'production'}>Advanced Rules</button>
      <button type="button" class:active={activeEditorTab === 'reactive'} on:click={() => activeEditorTab = 'reactive'}>Reactive Rules</button>
    </div>
  {/if}

  {#if activeEditorTab === 'visual'}
  <div class="sparc-editor-grid">
    <aside class="sparc-palette" aria-label="SPARC node palette">
      <div class="sparc-panel-header">
        <h2>Palette</h2>
      </div>
      <div class="sparc-palette-grid">
        {#each paletteEntries as entry}
          <button
            type="button"
            class="sparc-palette-item"
            draggable="true"
            on:click={() => addNode(entry)}
            on:dragstart={(event) => startPaletteDrag(event, entry)}
            on:dragend={clearDropState}
          >
            <span class={`fa ${paletteIconClass(entry)} sparc-palette-icon`} aria-hidden="true"></span>
            <span class="sparc-palette-text">
              <span>{entry.label}</span>
              <small>{entry.category}</small>
            </span>
          </button>
        {/each}
      </div>
    </aside>

    <main class="sparc-canvas" class:sparc-canvas-hierarchy-visible={showNodeHierarchy}>
      <div class="sparc-rich-text-toolbar" aria-label="SPARC visual editor tools" on:mousedown={handleRichTextToolbarMouseDown}>
        <label class="sparc-advanced-toggle sparc-toolbar-toggle">
          <input type="checkbox" bind:checked={showNodeHierarchy} />
          Show node hierarchy
        </label>
        {#if isRichTextSelected}
          <div class="sparc-toolbar-divider" aria-hidden="true"></div>
          <div class="sparc-toolbar-group" aria-label="Inline formatting">
            <button type="button" class:active={richTextCommandActive('bold')} title="Bold" on:click={() => runRichTextCommand('bold')}>B</button>
            <button type="button" class:active={richTextCommandActive('italic')} title="Italic" on:click={() => runRichTextCommand('italic')}>I</button>
            <button type="button" class:active={richTextCommandActive('underline')} title="Underline" on:click={() => runRichTextCommand('underline')}>U</button>
            <button type="button" class:active={richTextCommandActive('strike')} title="Strikethrough" on:click={() => runRichTextCommand('strike')}>S</button>
            <button type="button" class:active={richTextCommandActive('highlight')} title="Highlight" on:click={() => runRichTextCommand('highlight')}>HL</button>
            <button type="button" class:active={richTextCommandActive('subscript')} title="Subscript" on:click={() => runRichTextCommand('subscript')}>x2</button>
            <button type="button" class:active={richTextCommandActive('superscript')} title="Superscript" on:click={() => runRichTextCommand('superscript')}>x^2</button>
          </div>
          <div class="sparc-toolbar-group" aria-label="Blocks and lists">
            <button type="button" class:active={richTextCommandActive('paragraph')} on:click={() => runRichTextCommand('paragraph')}>Paragraph</button>
            <button type="button" class:active={richTextCommandActive('heading', { level: 2 })} on:click={() => runRichTextCommand('heading', 2)}>H2</button>
            <button type="button" class:active={richTextCommandActive('heading', { level: 3 })} on:click={() => runRichTextCommand('heading', 3)}>H3</button>
            <button type="button" class:active={richTextCommandActive('bulletList')} on:click={() => runRichTextCommand('bullet-list')}>Bullets</button>
            <button type="button" class:active={richTextCommandActive('orderedList')} on:click={() => runRichTextCommand('ordered-list')}>Numbers</button>
            <button type="button" class:active={richTextCommandActive('taskList')} on:click={() => runRichTextCommand('task-list')}>Tasks</button>
            <button type="button" class:active={richTextCommandActive('blockquote')} on:click={() => runRichTextCommand('blockquote')}>Quote</button>
            <button type="button" class:active={richTextCommandActive('codeBlock')} on:click={() => runRichTextCommand('code-block')}>Code</button>
            <button type="button" on:click={() => runRichTextCommand('horizontal-rule')}>Rule</button>
          </div>
          <div class="sparc-toolbar-group" aria-label="Alignment">
            <button type="button" class:active={richTextAlignmentActive('left')} on:click={() => runRichTextCommand('align', 'left')}>Left</button>
            <button type="button" class:active={richTextAlignmentActive('center')} on:click={() => runRichTextCommand('align', 'center')}>Center</button>
            <button type="button" class:active={richTextAlignmentActive('right')} on:click={() => runRichTextCommand('align', 'right')}>Right</button>
            <button type="button" class:active={richTextAlignmentActive('justify')} on:click={() => runRichTextCommand('align', 'justify')}>Justify</button>
          </div>
          <div class="sparc-toolbar-group" aria-label="Color">
            {#each SPARC_RICH_TEXT_COLORS as color}
              <button
                type="button"
                class="sparc-color-button"
                style={`--sparc-toolbar-swatch: ${color.cssValue}`}
                title={color.label}
                on:click={() => runRichTextCommand('color', color.token)}
              >
                {color.label}
              </button>
            {/each}
            <button type="button" on:click={() => runRichTextCommand('color', '')}>Clear</button>
          </div>
          <div class="sparc-toolbar-group" aria-label="Links and media">
            <input class="sparc-link-input" placeholder="https://..." bind:value={richTextLinkHref} aria-label="Link URL" />
            <button type="button" class:active={richTextCommandActive('link')} on:click={() => runRichTextCommand('link', richTextLinkHref)}>Link</button>
            <button type="button" on:click={() => runRichTextCommand('link', '')}>Unlink</button>
            <input class="sparc-link-input" placeholder="Image URL" bind:value={richTextImageSrc} aria-label="Image URL" />
            <input class="sparc-short-input" placeholder="Alt" bind:value={richTextImageAlt} aria-label="Image alt text" />
            <button type="button" on:click={() => runRichTextCommand('image', { src: richTextImageSrc, alt: richTextImageAlt })}>Image</button>
            <input class="sparc-link-input" placeholder="Embed URL" bind:value={richTextEmbedSrc} aria-label="Embed URL" />
            <button type="button" on:click={() => runRichTextCommand('embed', richTextEmbedSrc)}>Embed</button>
          </div>
          <div class="sparc-toolbar-group" aria-label="Table controls">
            <button type="button" on:click={() => runRichTextCommand('table')}>Table</button>
            <button type="button" on:click={() => runRichTextCommand('table-add-row')}>Row+</button>
            <button type="button" on:click={() => runRichTextCommand('table-add-column')}>Col+</button>
            <button type="button" on:click={() => runRichTextCommand('table-delete-row')}>Row-</button>
            <button type="button" on:click={() => runRichTextCommand('table-delete-column')}>Col-</button>
            <button type="button" on:click={() => runRichTextCommand('table-delete')}>Delete Table</button>
          </div>
          <div class="sparc-toolbar-group" aria-label="History and source">
            <button type="button" on:click={() => runRichTextCommand('undo')}>Undo</button>
            <button type="button" on:click={() => runRichTextCommand('redo')}>Redo</button>
            <button type="button" class:active={showRichTextSource} on:click={() => showRichTextSource = !showRichTextSource}>HTML</button>
          </div>
        {/if}
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="sparc-visual-editor-surface"
        class:sparc-drop-active={dropTarget}
        aria-label="SPARC Visual Editor drop surface"
        use:visualEditorValueBridge
        on:click={handleVisualEditorClick}
        on:keyup={rememberVisualRichTextSelection}
        on:mouseup={rememberVisualRichTextSelection}
        on:dragover={handleVisualDragOver}
        on:drop={handleVisualDrop}
        on:dragleave={handleVisualDragLeave}
      >
        {#if dropMarkerStyle}
          <div
            class="sparc-drop-marker"
            class:sparc-drop-marker-inside={dropTarget?.position === 'inside'}
            style={dropMarkerStyle}
            aria-hidden="true"
          ></div>
        {/if}
        {#if dropTarget?.position === 'inside'}
          <div class="sparc-drop-label" aria-live="polite">Drop into {dropTarget.label}</div>
        {/if}
        {#if activeDisplay}
          <SparcTrialSurface
            display={activeDisplay}
            runtimeNodeValues={{}}
            authoringSelectedNodeId={activeNodeId}
            authoringSelectOnly={true}
            onAuthoringNodeValueChange={updateNodeAuthoredValue}
            onAuthoringNodeFocus={selectVisualNode}
          />
        {/if}
      </div>
      {#if showNodeHierarchy}
        <div class="sparc-node-list sparc-node-list-bottom" aria-label="SPARC node hierarchy">
          {#each flatNodes as entry}
            <button
              type="button"
              class:selected={entry.node.id === activeNodeId}
              class="sparc-node-row"
              style={`padding-left: ${12 + (entry.depth || 0) * 18}px`}
              on:click={() => activeNodeId = entry.node.id}
            >
              <span>{entry.node.id}</span>
              <small>{entry.node.nodeType === 'group' ? entry.node.groupType : entry.node.atomType}</small>
            </button>
          {/each}
        </div>
      {/if}
    </main>

    <section class="sparc-context-panel">
      {#if activeNode}
        <div class="sparc-context-card">
          <h2>Selection</h2>
          <div class="sparc-selection-summary">
            <strong>{activeNode.id}</strong>
          </div>
          <div class="sparc-node-action-row">
            {#if activeParentNode}
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => activeNodeId = activeParentNode.id}>
                Select Parent Node
              </button>
            {/if}
            <button type="button" class="btn btn-outline-danger btn-sm" on:click={removeActiveNode}>
              Delete Node
            </button>
          </div>
          <label>
            Node ID
            <input value={activeNode.id || ''} on:input={(event) => updateField('id', event.currentTarget.value)} />
          </label>
          {#if activeNode.nodeType === 'group'}
            <label>
              Node Type
              <input value={activeNode.groupType || ''} on:input={(event) => updateField('groupType', event.currentTarget.value)} />
            </label>
          {:else}
            <label>
              Node Type
              <input value={activeNode.atomType || ''} readonly />
            </label>
            {#if isImageHtmlSelected}
              <div class="sparc-image-editor">
                <div class="sparc-image-preview">
                  {@html activeNode.value || ''}
                </div>
                <label>
                  Image file or URL
                  <input value={selectedImageSrc} on:input={(event) => updateFirstImageAttribute('src', event.currentTarget.value)} />
                </label>
                <label>
                  Alt text
                  <input value={selectedImageAlt} on:input={(event) => updateFirstImageAttribute('alt', event.currentTarget.value)} />
                </label>
                <label>
                  Title
                  <input value={selectedImageTitle} on:input={(event) => updateFirstImageAttribute('title', event.currentTarget.value)} />
                </label>
              </div>
            {:else if selectedHtmlMedia}
              <div class="sparc-media-editor">
                <div class="sparc-selection-summary sparc-media-summary">
                  <strong>{selectedHtmlMedia.tagName}</strong>
                  <small>{selectedHtmlMedia.src || 'No media URL'}</small>
                </div>
                {#if selectedHtmlMedia.hasLocalhostUrl}
                  <div class="sparc-media-warning">
                    This embed points at a local host URL. If the referenced service is not running on the same host and port, the frame will refuse to connect.
                  </div>
                {/if}
                <label>
                  Media URL
                  <input value={selectedHtmlMedia.src} on:input={(event) => updateFirstHtmlMediaAttribute('src', event.currentTarget.value)} />
                </label>
                {#if selectedHtmlMedia.tagName === 'iframe'}
                  <label>
                    Frame title
                    <input value={selectedHtmlMedia.title} on:input={(event) => updateFirstHtmlMediaAttribute('title', event.currentTarget.value)} />
                  </label>
                {/if}
                <div class="sparc-media-size-fields">
                  <label>
                    Width
                    <input value={selectedHtmlMedia.width} on:input={(event) => updateFirstHtmlMediaAttribute('width', event.currentTarget.value)} />
                  </label>
                  <label>
                    Height
                    <input value={selectedHtmlMedia.height} on:input={(event) => updateFirstHtmlMediaAttribute('height', event.currentTarget.value)} />
                  </label>
                </div>
                <label>
                  HTML
                  <textarea rows="8" value={activeNode.value || ''} on:input={(event) => updateField('value', event.currentTarget.value)}></textarea>
                </label>
              </div>
            {:else if activeNode.atomType === 'html-block' || activeNode.atomType === 'message-box'}
              <div class="sparc-rich-text-editor" bind:this={htmlEditorElement}></div>
              {#if showRichTextSource}
                <label>
                  HTML Source
                  <textarea
                    class="sparc-rich-text-source"
                    rows="10"
                    value={activeNode.value || ''}
                    on:input={(event) => updateRichTextSource(event.currentTarget.value)}
                  ></textarea>
                </label>
              {/if}
            {:else if activeNode.atomType === 'dropdown'}
              <label>
                Selected
                <input value={activeNode.selected || ''} on:input={(event) => updateField('selected', event.currentTarget.value)} />
              </label>
              <label>
                Options
                <textarea rows="6" value={(activeNode.options || []).join('\n')} on:input={(event) => updateOptions(event.currentTarget.value)}></textarea>
              </label>
            {:else if activeNode.atomType === 'button'}
              <label>
                Label
                <input value={activeNode.label || ''} on:input={(event) => updateField('label', event.currentTarget.value)} />
              </label>
              <label>
                Value
                <input value={activeNode.value || ''} on:input={(event) => updateField('value', event.currentTarget.value)} />
              </label>
            {:else if activeNode.atomType === 'learning-progress'}
              <label>
                Label
                <input value={activeNode.label || ''} on:input={(event) => updateField('label', event.currentTarget.value)} />
              </label>
            {:else if activeNode.atomType === 'panel-selector'}
              <label>
                Label
                <input value={activeNode.label || ''} on:input={(event) => updateField('label', event.currentTarget.value)} />
              </label>
              <label>
                Selected Panel ID
                <input value={activeNode.selectedPanelId || ''} on:input={(event) => updateField('selectedPanelId', event.currentTarget.value)} />
              </label>
            {:else}
              <label>
                Value
                <textarea rows="5" value={activeNode.value || ''} on:input={(event) => updateField('value', event.currentTarget.value)}></textarea>
              </label>
            {/if}
          {/if}
        </div>

        {#if stimulusRegistry.length > 0}
          <div class="sparc-context-card sparc-stimulus-attachments-card">
            <div class="sparc-panel-header">
              <h3>Stimulus Attachments</h3>
            </div>
            <table class="sparc-stimulus-attachment-table">
              <tbody>
                {#each stimulusRegistry as stimulus}
                  <tr>
                    <td class="sparc-stimulus-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={nodeStimulusIds(activeNode).includes(stimulus.stimulusId)}
                        on:change={(event) => toggleNodeStimulus(stimulus.stimulusId, event.currentTarget.checked)}
                        aria-label={`Attach ${stimulus.label || stimulus.stimulusId}`}
                      />
                    </td>
                    <td class="sparc-stimulus-definition-cell">
                      <span class="sparc-stimulus-id">{stimulus.stimulusId}</span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        <div class="sparc-context-card sparc-production-rules-card">
          <div class="sparc-panel-header">
            <h3>Production Rules</h3>
          </div>
          <label>
            Rule template
            <select bind:value={activeVisualRuleTemplateId}>
              {#each productionRuleCatalogEntries as entry}
                <option value={entry.id}>{entry.label} ({entry.category.replace('production-rule-', '')})</option>
              {/each}
            </select>
          </label>
          <button type="button" class="btn btn-primary btn-sm" on:click={() => createScopedProductionRule(activeVisualRuleTemplateId)}>
            Add Rule For Selection
          </button>
          <div class="sparc-scoped-rule-list">
            {#each activeNodeProductionRuleEntries as entry}
              <button
                type="button"
                class="sparc-rule-row"
                class:selected={entry.index === activeProductionRuleIndex}
                on:click={() => selectScopedProductionRule(entry.index)}
              >
                <span>{entry.rule.id}</span>
                <small>{entry.rule.when?.length || 0} when / {entry.rule.then?.length || 0} then</small>
              </button>
            {/each}
            {#if activeNodeProductionRuleEntries.length === 0}
              <p class="sparc-muted sparc-compact-empty-state">No production rules target this selection yet.</p>
            {/if}
          </div>

          {#if activeNodeProductionRule}
            <label>
              Selected Rule ID
              <input value={activeNodeProductionRule.id || ''} on:input={(event) => updateScopedProductionRuleField('id', event.currentTarget.value)} />
            </label>
            <label>
              Module
              <input value={activeNodeProductionRule.module || ''} on:input={(event) => updateScopedProductionRuleField('module', event.currentTarget.value)} />
            </label>
            <label>
              Add catalog part
              <select on:change={(event) => { addCatalogPartToActiveRule(event.currentTarget.value); event.currentTarget.value = ''; }}>
                <option value="">Choose condition, test, or effect...</option>
                <optgroup label="Conditions">
                  {#each productionConditionCatalogEntries as entry}
                    <option value={entry.id}>{entry.label}</option>
                  {/each}
                </optgroup>
                <optgroup label="Tests">
                  {#each productionTestCatalogEntries as entry}
                    <option value={entry.id}>{entry.label}</option>
                  {/each}
                </optgroup>
                <optgroup label="Effects">
                  {#each productionEffectCatalogEntries as entry}
                    <option value={entry.id}>{entry.label}</option>
                  {/each}
                </optgroup>
              </select>
            </label>
            <label>
              Rule JSON
              <textarea
                class="sparc-rule-json-editor"
                rows="18"
                spellcheck="false"
                value={stringifyProductionRule(activeNodeProductionRule)}
                on:change={(event) => updateScopedProductionRuleJson(event.currentTarget.value)}
              ></textarea>
            </label>
            {#if activeNodeRuleEffect}
              <div class="sparc-rule-card">
                <div class="sparc-inline-actions">
                  <strong>{activeNodeRuleEffect.type}</strong>
                  <select value={activeNodeRuleEffect.type} on:change={(event) => changeScopedRulePrimaryEffectType(event.currentTarget.value)}>
                    {#each productionEffectTypes as type}
                      <option value={type}>{type}</option>
                    {/each}
                  </select>
                </div>
                {#if activeNodeRuleEffect.type === 'classify'}
                  <label>
                    Outcome
                    <select value={activeNodeRuleEffect.outcome} on:change={(event) => updateEffectField(activeNodeRuleEffect, 'outcome', event.currentTarget.value)}>
                      {#each classifyOutcomes as outcome}
                        <option value={outcome}>{outcome}</option>
                      {/each}
                    </select>
                  </label>
                {:else if activeNodeRuleEffect.type === 'message'}
                  <label>
                    Message Type
                    <select value={activeNodeRuleEffect.messageType} on:change={(event) => updateEffectField(activeNodeRuleEffect, 'messageType', event.currentTarget.value)}>
                      {#each messageTypes as type}
                        <option value={type}>{type}</option>
                      {/each}
                    </select>
                  </label>
                  <label>
                    Template
                    <textarea rows="3" value={activeNodeRuleEffect.template || ''} on:input={(event) => updateEffectField(activeNodeRuleEffect, 'template', event.currentTarget.value)}></textarea>
                  </label>
                {:else if activeNodeRuleEffect.type === 'write-state'}
                  <label>
                    State Key
                    <input value={activeNodeRuleEffect.write?.key || ''} on:input={(event) => updateEffectField(activeNodeRuleEffect.write, 'key', event.currentTarget.value)} />
                  </label>
                  <label>
                    Value
                    {@render ruleExpressionEditor(activeNodeRuleEffect.write.value, 'Value')}
                  </label>
                {:else if activeNodeRuleEffect.type === 'credit'}
                  <label>
                    KC
                    <input value={activeNodeRuleEffect.kc || ''} on:input={(event) => updateEffectField(activeNodeRuleEffect, 'kc', event.currentTarget.value)} />
                  </label>
                {:else if activeNodeRuleEffect.type === 'model-practice'}
                  <label>
                    Outcome
                    <select value={activeNodeRuleEffect.outcome} on:change={(event) => updateEffectField(activeNodeRuleEffect, 'outcome', event.currentTarget.value)}>
                      {#each classifyOutcomes.filter((outcome) => outcome !== 'buggy') as outcome}
                        <option value={outcome}>{outcome}</option>
                      {/each}
                    </select>
                  </label>
                  <label>
                    Explicit Stimulus
                    <select value={typeof activeNodeRuleEffect.stimulusId === 'string' ? activeNodeRuleEffect.stimulusId : ''} on:change={(event) => updateOptionalEffectField(activeNodeRuleEffect, 'stimulusId', event.currentTarget.value)}>
                      <option value="">Resolve from selected node attachment</option>
                      {#each stimulusRegistry as stimulus}
                        <option value={stimulus.stimulusId}>{stimulus.label || stimulus.stimulusId}</option>
                      {/each}
                    </select>
                  </label>
                  <label>
                    Node ID
                    <input value={stringifyLooseValue(activeNodeRuleEffect.nodeId || '')} on:input={(event) => updateOptionalEffectField(activeNodeRuleEffect, 'nodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                  </label>
                  <label>
                    Response Value
                    {@render ruleExpressionEditor(ensureEffectExpression(activeNodeRuleEffect, 'responseValue', ''), 'Response Value')}
                  </label>
                {:else}
                  <p class="sparc-muted">Use Rule JSON above to edit every field for this effect.</p>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      {:else}
        <p class="sparc-muted">Select a node or add one from the palette.</p>
      {/if}
    </section>
  </div>
  {:else if activeEditorTab === 'model'}
    <section class="sparc-rule-editor">
      <div class="sparc-panel-header">
        <h2>Stimulus Registry</h2>
        <button type="button" class="btn btn-primary btn-sm" on:click={addStimulusRegistryEntry}>Add Stimulus</button>
      </div>
      <div class="sparc-rule-layout">
        <div class="sparc-rule-list">
          {#each stimulusRegistry as stimulus, index}
            <button
              type="button"
              class="sparc-rule-row"
              class:selected={index === activeStimulusIndex}
              on:click={() => activeStimulusIndex = index}
            >
              <span>{stimulus.label || stimulus.stimulusId || `Stimulus ${index + 1}`}</span>
              <small>{stimulus.stimulusKC || 'missing stimulusKC'}</small>
            </button>
          {/each}
          {#if stimulusRegistry.length === 0}
            <p class="sparc-muted">No model stimuli are defined for this SPARC display.</p>
          {/if}
        </div>
        <div class="sparc-rule-detail">
          {#if activeStimulus}
            <div class="sparc-inline-actions">
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeStimulusRegistryEntry(activeStimulusIndex)}>Delete Stimulus</button>
            </div>
            <div class="sparc-expression-grid">
              <label>
                Stimulus ID
                <input value={activeStimulus.stimulusId || ''} on:input={(event) => updateStimulusField('stimulusId', event.currentTarget.value)} />
              </label>
              <label>
                Label
                <input value={activeStimulus.label || ''} on:input={(event) => updateStimulusField('label', event.currentTarget.value)} />
              </label>
              <label>
                Stimuli Set ID
                <input value={stringifyLooseValue(activeStimulus.stimuliSetId)} on:input={(event) => updateStimulusField('stimuliSetId', event.currentTarget.value)} />
              </label>
              <label>
                Stimulus KC
                <input value={stringifyLooseValue(activeStimulus.stimulusKC)} on:input={(event) => updateStimulusField('stimulusKC', event.currentTarget.value)} />
              </label>
              <label>
                Cluster KC
                <input value={stringifyLooseValue(activeStimulus.clusterKC)} on:input={(event) => updateStimulusField('clusterKC', event.currentTarget.value)} />
              </label>
              <label>
                KC ID
                <input value={stringifyLooseValue(activeStimulus.KCId)} on:input={(event) => updateStimulusField('KCId', event.currentTarget.value)} />
              </label>
              <label>
                KC Default
                <input value={stringifyLooseValue(activeStimulus.KCDefault)} on:input={(event) => updateStimulusField('KCDefault', event.currentTarget.value)} />
              </label>
              <label>
                KC Cluster
                <input value={stringifyLooseValue(activeStimulus.KCCluster)} on:input={(event) => updateStimulusField('KCCluster', event.currentTarget.value)} />
              </label>
              <label>
                Response KC
                <input value={stringifyLooseValue(activeStimulus.response?.responseKC || '')} on:input={(event) => updateStimulusResponseField('responseKC', event.currentTarget.value)} />
              </label>
              <label>
                Response Key
                <input value={activeStimulus.response?.responseKey || ''} on:input={(event) => updateStimulusResponseField('responseKey', event.currentTarget.value)} />
              </label>
            </div>
          {:else}
            <p class="sparc-muted">Add a stimulus before attaching nodes to model identities.</p>
          {/if}
        </div>
      </div>
    </section>
  {:else if activeEditorTab === 'production'}
    <section class="sparc-rule-editor">
      <div class="sparc-panel-header">
        <h2>Advanced Production Rules</h2>
        <button type="button" class="btn btn-primary btn-sm" on:click={addProductionRule}>Add Rule</button>
      </div>
      <div class="sparc-rule-layout">
        <div class="sparc-rule-list">
          {#each productionRules as rule, index}
            <button
              type="button"
              class="sparc-rule-row"
              class:selected={index === activeProductionRuleIndex}
              on:click={() => activeProductionRuleIndex = index}
            >
              <span>{rule.id || `Rule ${index + 1}`}</span>
              <small>{rule.when?.length || 0} when / {rule.then?.length || 0} then</small>
            </button>
          {/each}
          {#if productionRules.length === 0}
            <p class="sparc-muted">No production rules on this SPARC display.</p>
          {/if}
        </div>

        <div class="sparc-rule-detail">
          {#if activeProductionRule}
            <div class="sparc-inline-actions">
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => moveProductionRule(activeProductionRuleIndex, -1)} disabled={activeProductionRuleIndex === 0}>Move Up</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => moveProductionRule(activeProductionRuleIndex, 1)} disabled={activeProductionRuleIndex >= productionRules.length - 1}>Move Down</button>
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeProductionRule(activeProductionRuleIndex)}>Delete Rule</button>
            </div>
            <label>
              Rule ID
              <input value={activeProductionRule.id || ''} on:input={(event) => updateProductionRuleField('id', event.currentTarget.value)} />
            </label>
            <label>
              Module
              <input value={activeProductionRule.module || ''} on:input={(event) => updateProductionRuleField('module', event.currentTarget.value)} />
            </label>

            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>When</h3>
                <select on:change={(event) => addProductionCondition(event.currentTarget.value)}>
                  <option value="">Add condition...</option>
                  {#each productionConditionTypes as type}
                    <option value={type}>{type}</option>
                  {/each}
                </select>
              </div>
              {#each activeProductionRule.when || [] as condition, index}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <select value={productionConditionKind(condition)} on:change={(event) => changeProductionConditionKind(index, event.currentTarget.value)}>
                      {#each productionConditionTypes as type}
                        <option value={type}>{type}</option>
                      {/each}
                    </select>
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeProductionCondition(index)}>Remove</button>
                  </div>
                  <label>
                    Fact Type
                    <input value={productionConditionPattern(condition)?.factType || ''} on:input={(event) => updateProductionConditionFactType(condition, event.currentTarget.value)} />
                  </label>
                  <div class="sparc-panel-header">
                    <h4>Slots</h4>
                    <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => addFactSlot(condition)}>Add Slot</button>
                  </div>
                  {#each Object.entries(productionConditionPattern(condition)?.slots || {}) as [slotKey, slot]}
                    <div class="sparc-slot-row">
                      <input value={slotKey} on:change={(event) => renameFactSlot(condition, slotKey, event.currentTarget.value)} aria-label="slot name" />
                      <select value={slot.type} on:change={(event) => updateFactSlotType(slot, event.currentTarget.value)} aria-label="slot pattern type">
                        <option value="literal">literal</option>
                        <option value="bind">bind</option>
                        <option value="bound">bound</option>
                      </select>
                      <input value={slot.type === 'literal' ? stringifyLooseValue(slot.value) : slot.variable || ''} on:input={(event) => updateFactSlotValue(slot, event.currentTarget.value)} aria-label="slot value" />
                      <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeFactSlot(condition, slotKey)}>Remove</button>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>

            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>Tests</h3>
                <button type="button" class="btn btn-outline-secondary btn-sm" on:click={addProductionTest}>Add Test</button>
              </div>
              {#each activeProductionRule.tests || [] as test, index}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <select value={test.op} on:change={(event) => updateProductionTestField(test, 'op', event.currentTarget.value)}>
                      {#each comparisonOps as op}
                        <option value={op}>{op}</option>
                      {/each}
                    </select>
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeProductionTest(index)}>Remove</button>
                  </div>
                  <div class="sparc-expression-grid">
                    <div>
                      {@render ruleExpressionEditor(test.left, 'Left Expression')}
                    </div>
                    <div>
                      {@render ruleExpressionEditor(test.right, 'Right Expression')}
                    </div>
                  </div>
                </div>
              {/each}
            </div>

            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>Then</h3>
                <select on:change={(event) => addProductionEffect(event.currentTarget.value)}>
                  <option value="">Add effect...</option>
                  {#each productionEffectTypes as type}
                    <option value={type}>{type}</option>
                  {/each}
                </select>
              </div>
              {#each activeProductionRule.then || [] as effect, index}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <select value={effect.type} on:change={(event) => changeProductionEffectType(index, event.currentTarget.value)}>
                      {#each productionEffectTypes as type}
                        <option value={type}>{type}</option>
                      {/each}
                    </select>
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeProductionEffect(index)}>Remove</button>
                  </div>
                  {#if effect.type === 'classify'}
                    <label>
                      Outcome
                      <select value={effect.outcome} on:change={(event) => updateEffectField(effect, 'outcome', event.currentTarget.value)}>
                        {#each classifyOutcomes as outcome}
                          <option value={outcome}>{outcome}</option>
                        {/each}
                      </select>
                    </label>
                  {:else if effect.type === 'message'}
                    <label>
                      Message Type
                      <select value={effect.messageType} on:change={(event) => updateEffectField(effect, 'messageType', event.currentTarget.value)}>
                        {#each messageTypes as type}
                          <option value={type}>{type}</option>
                        {/each}
                      </select>
                    </label>
                    <label>
                      Template
                      <textarea rows="3" value={effect.template || ''} on:input={(event) => updateEffectField(effect, 'template', event.currentTarget.value)}></textarea>
                    </label>
                    <div class="sparc-expression-grid">
                      <label>
                        Target Document
                        <input value={stringifyLooseValue(effect.target?.documentId || '')} on:input={(event) => { effect.target = ensureTarget(effect.target || {}); updateAddressTemplate(effect.target, 'documentId', event.currentTarget.value); }} />
                      </label>
                      <label>
                        Target Node
                        <input value={stringifyLooseValue(effect.target?.nodeId || '')} on:input={(event) => { effect.target = ensureTarget(effect.target || {}); updateAddressTemplate(effect.target, 'nodeId', event.currentTarget.value); }} />
                      </label>
                    </div>
                  {:else if effect.type === 'write-state'}
                    <div class="sparc-expression-grid">
                      <label>
                        Target Document
                        <input value={stringifyLooseValue(effect.write?.target?.documentId || '')} on:input={(event) => updateAddressTemplate(effect.write.target, 'documentId', event.currentTarget.value)} />
                      </label>
                      <label>
                        Target Node
                        <input value={stringifyLooseValue(effect.write?.target?.nodeId || '')} on:input={(event) => updateAddressTemplate(effect.write.target, 'nodeId', event.currentTarget.value)} />
                      </label>
                    </div>
                    <label>
                      Key
                      <input value={effect.write?.key || ''} on:input={(event) => updateEffectField(effect.write, 'key', event.currentTarget.value)} />
                    </label>
                    <label>
                      Value Expression
                      {@render ruleExpressionEditor(effect.write.value, 'Value Expression')}
                    </label>
                  {:else if effect.type === 'assert-fact'}
                    <label>
                      Fact Type
                      <input value={effect.fact?.factType || ''} on:input={(event) => { effect.fact = effect.fact || { slots: {} }; effect.fact.factType = event.currentTarget.value; markChanged(); }} />
                    </label>
                    <label>
                      Persist
                      <input type="checkbox" checked={effect.persist !== false} on:change={(event) => updateEffectBoolean(effect, 'persist', event.currentTarget.checked)} />
                    </label>
                    <div class="sparc-panel-header">
                      <h4>Fact Slots</h4>
                      <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => addEffectFactSlot(effect)}>Add Slot</button>
                    </div>
                    {#each Object.entries(effect.fact?.slots || {}) as [slotKey, expression]}
                      <div class="sparc-slot-row">
                        <input value={slotKey} on:change={(event) => renameEffectFactSlot(effect, slotKey, event.currentTarget.value)} />
                        <div class="sparc-slot-expression">
                          {@render ruleExpressionEditor(expression, slotKey)}
                        </div>
                        <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeEffectFactSlot(effect, slotKey)}>Remove</button>
                      </div>
                    {/each}
                  {:else if effect.type === 'credit'}
                    <label>
                      KC
                      <input value={effect.kc || ''} on:input={(event) => updateEffectField(effect, 'kc', event.currentTarget.value)} />
                    </label>
                  {:else if effect.type === 'model-practice'}
                    <label>
                      Outcome
                      <select value={effect.outcome} on:change={(event) => updateEffectField(effect, 'outcome', event.currentTarget.value)}>
                        {#each classifyOutcomes.filter((outcome) => outcome !== 'buggy') as outcome}
                          <option value={outcome}>{outcome}</option>
                        {/each}
                      </select>
                    </label>
                    <div class="sparc-expression-grid">
                      <label>
                        Explicit Stimulus
                        <select value={typeof effect.stimulusId === 'string' ? effect.stimulusId : ''} on:change={(event) => updateOptionalEffectField(effect, 'stimulusId', event.currentTarget.value)}>
                          <option value="">Resolve from node attachment</option>
                          {#each stimulusRegistry as stimulus}
                            <option value={stimulus.stimulusId}>{stimulus.label || stimulus.stimulusId}</option>
                          {/each}
                        </select>
                      </label>
                      <label>
                        Node ID
                        <input value={stringifyLooseValue(effect.nodeId || '')} on:input={(event) => updateOptionalEffectField(effect, 'nodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                      </label>
                    </div>
                    <div class="sparc-expression-grid">
                      <label>
                        Response Value
                        {@render ruleExpressionEditor(ensureEffectExpression(effect, 'responseValue', ''), 'Response Value')}
                      </label>
                      <label>
                        Input
                        {@render ruleExpressionEditor(ensureEffectExpression(effect, 'input', ''), 'Input')}
                      </label>
                    </div>
                  {:else if effect.type === 'append-text'}
                    <label>
                      Node ID
                      <input value={stringifyLooseValue(effect.nodeId)} on:input={(event) => updateEffectField(effect, 'nodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                    </label>
                    <label>
                      Text
                      <input value={stringifyLooseValue(effect.text)} on:input={(event) => updateEffectField(effect, 'text', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                    </label>
                    <label>
                      Separator
                      <input value={stringifyLooseValue(effect.separator || '')} on:input={(event) => updateEffectField(effect, 'separator', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                    </label>
                  {:else}
                    <div class="sparc-expression-grid">
                      <label>
                        Box ID
                        <input value={stringifyLooseValue(effect.boxId || '')} on:input={(event) => updateEffectField(effect, 'boxId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                      </label>
                      {#if effect.type === 'append-node' || effect.type === 'append-node-if-missing'}
                        <label>
                          Frontier
                          <input value={stringifyLooseValue(effect.frontier || '')} on:input={(event) => updateEffectField(effect, 'frontier', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                        </label>
                      {/if}
                      {#if effect.type === 'append-node-if-missing' || effect.type === 'insert-node'}
                        <label>
                          Before Node ID
                          <input value={stringifyLooseValue(effect.beforeNodeId || '')} on:input={(event) => updateEffectField(effect, 'beforeNodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                        </label>
                        <label>
                          After Node ID
                          <input value={stringifyLooseValue(effect.afterNodeId || '')} on:input={(event) => updateEffectField(effect, 'afterNodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                        </label>
                      {/if}
                    </div>
                    <div class="sparc-expression-grid">
                      <label>
                        Node ID
                        <input value={effect.node?.id || ''} on:input={(event) => updateProgressiveNodeTemplate(effect, 'id', event.currentTarget.value)} />
                      </label>
                      <label>
                        Node Type
                        <select value={effect.node?.nodeType || 'atomic'} on:change={(event) => updateProgressiveNodeTemplate(effect, 'nodeType', event.currentTarget.value)}>
                          <option value="atomic">atomic</option>
                          <option value="group">group</option>
                        </select>
                      </label>
                      {#if effect.node?.nodeType === 'group'}
                        <label>
                          Group Type
                          <input value={effect.node?.groupType || ''} on:input={(event) => updateProgressiveNodeTemplate(effect, 'groupType', event.currentTarget.value)} />
                        </label>
                      {:else}
                        <label>
                          Atom Type
                          <input value={effect.node?.atomType || ''} on:input={(event) => updateProgressiveNodeTemplate(effect, 'atomType', event.currentTarget.value)} />
                        </label>
                        <label>
                          Value
                          <input value={stringifyLooseValue(effect.node?.value)} on:input={(event) => updateProgressiveNodeTemplate(effect, 'value', event.currentTarget.value)} />
                        </label>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="sparc-muted">Add a production rule to edit rule conditions and effects.</p>
          {/if}
        </div>
      </div>
    </section>
  {:else if activeEditorTab === 'reactive'}
    <section class="sparc-rule-editor">
      <div class="sparc-panel-header">
        <h2>Reactive Rules</h2>
        <button type="button" class="btn btn-primary btn-sm" on:click={addReactiveRule}>Add Rule</button>
      </div>
      <div class="sparc-rule-layout">
        <div class="sparc-rule-list">
          {#each reactiveRules as rule, index}
            <button
              type="button"
              class="sparc-rule-row"
              class:selected={index === activeReactiveRuleIndex}
              on:click={() => activeReactiveRuleIndex = index}
            >
              <span>{rule.id || `Rule ${index + 1}`}</span>
              <small>{rule.when?.type || 'always'} / {rule.writes?.length || 0} writes</small>
            </button>
          {/each}
          {#if reactiveRules.length === 0}
            <p class="sparc-muted">No reactive rules on this SPARC display.</p>
          {/if}
        </div>
        <div class="sparc-rule-detail">
          {#if activeReactiveRule}
            <div class="sparc-inline-actions">
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => moveReactiveRule(activeReactiveRuleIndex, -1)} disabled={activeReactiveRuleIndex === 0}>Move Up</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => moveReactiveRule(activeReactiveRuleIndex, 1)} disabled={activeReactiveRuleIndex >= reactiveRules.length - 1}>Move Down</button>
              <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeReactiveRule(activeReactiveRuleIndex)}>Delete Rule</button>
            </div>
            <label>
              Rule ID
              <input value={activeReactiveRule.id || ''} on:input={(event) => updateReactiveRuleField('id', event.currentTarget.value)} />
            </label>
            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>When</h3>
                {#if !activeReactiveRule.when}
                  <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => setReactiveCondition('state')}>Add Condition</button>
                {/if}
              </div>
              {#if activeReactiveRule.when}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => { delete activeReactiveRule.when; markChanged(); }}>Remove Condition</button>
                  </div>
                  {@render reactiveConditionEditor(activeReactiveRule.when, 'When')}
                </div>
              {/if}
            </div>

            <div class="sparc-rule-section">
              <div class="sparc-panel-header">
                <h3>Writes</h3>
                <button type="button" class="btn btn-outline-secondary btn-sm" on:click={addReactiveWrite}>Add Write</button>
              </div>
              {#each activeReactiveRule.writes || [] as write, index}
                <div class="sparc-rule-card">
                  <div class="sparc-inline-actions">
                    <strong>Write {index + 1}</strong>
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => removeReactiveWrite(index)}>Remove</button>
                  </div>
                  <div class="sparc-expression-grid">
                    <label>
                      Target Document
                      <input value={write.target?.documentId || ''} on:input={(event) => { write.target = ensureTarget(write.target || {}); write.target.documentId = event.currentTarget.value; markChanged(); }} />
                    </label>
                    <label>
                      Target Node
                      <input value={write.target?.nodeId || ''} on:input={(event) => { write.target = ensureTarget(write.target || {}); write.target.nodeId = event.currentTarget.value; markChanged(); }} />
                    </label>
                  </div>
                  <label>
                    Key
                    <input value={write.key || ''} on:input={(event) => updateStateWrite(write, 'key', event.currentTarget.value)} />
                  </label>
                  <label>
                    Value
                    <input value={stringifyLooseValue(write.value)} on:input={(event) => updateStateWrite(write, 'value', event.currentTarget.value)} />
                  </label>
                </div>
              {/each}
            </div>
          {:else}
            <p class="sparc-muted">Add a reactive rule to edit state/model conditions and writes.</p>
          {/if}
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .sparc-editor-shell {
    --sparc-editor-panel-surface: var(--learning-card-surface-color);
    --sparc-editor-control-surface: var(--learning-card-surface-color);
    --sparc-editor-input-surface: var(--learning-card-stimulus-surface-color);
    --sparc-editor-subtle-surface: var(--app-subtle-surface-color);
    --sparc-editor-strong-text-color: var(--app-page-header-text-color);
    --sparc-editor-monospace-font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    --sparc-editor-border-radius-sm: var(--app-border-radius-sm);
    --sparc-editor-border-radius-lg: var(--app-border-radius-lg);
    --sparc-editor-gap-xs: var(--app-space-1-px);
    --sparc-editor-gap-sm: var(--app-space-2-px);
    --sparc-editor-gap-md: var(--app-space-3-px);
    --sparc-editor-control-padding-y: var(--app-space-1-px);
    --sparc-editor-control-padding-x: var(--app-space-2-px);
    --sparc-editor-panel-padding: var(--app-space-2-px);
    --sparc-editor-card-padding: var(--app-space-2-px);
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-md);
    color: var(--app-text-color);
    font-family: var(--app-font-family);
    font-size: var(--app-font-size-base);
    height: calc(100vh - var(--app-space-4-px, 16px));
    min-height: 0;
    overflow: hidden;
  }

  .sparc-editor-header,
  .sparc-panel-header,
  .sparc-editor-actions,
  .sparc-target-row {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-editor-header {
    justify-content: space-between;
    padding: var(--app-space-3-px) var(--app-space-0);
  }

  .sparc-editor-actions {
    justify-content: flex-end;
  }

  .sparc-advanced-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
    margin-right: var(--sparc-editor-gap-sm);
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.85);
    white-space: nowrap;
  }

  .sparc-advanced-toggle input {
    margin: 0;
  }

  .sparc-editor-header h1,
  .sparc-palette h2,
  .sparc-canvas h2,
  .sparc-context-panel h2,
  .sparc-context-card h3 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 1.1);
  }

  .sparc-editor-subtitle,
  .sparc-muted,
  .sparc-palette-item small,
  .sparc-node-row small {
    color: var(--app-secondary-text-color);
  }

  .sparc-compact-empty-state {
    margin: 0;
    line-height: 1.15;
  }

  .sparc-editor-grid {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(220px, 1fr) minmax(250px, 340px);
    grid-template-rows: minmax(0, 1fr);
    gap: var(--sparc-editor-gap-md);
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .sparc-palette > .sparc-panel-header {
    justify-content: space-between;
  }

  .sparc-palette-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sparc-editor-gap-xs);
  }

  .sparc-editor-tabs,
  .sparc-inline-actions {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-sm);
    flex-wrap: wrap;
  }

  .sparc-editor-tabs button {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }

  .sparc-editor-tabs button.active {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-palette,
  .sparc-canvas,
  .sparc-context-panel,
  .sparc-rule-editor {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-panel-surface);
    border-radius: var(--sparc-editor-border-radius-lg);
    padding: var(--sparc-editor-panel-padding);
    min-width: 0;
    min-height: 0;
  }

  .sparc-palette,
  .sparc-context-panel,
  .sparc-rule-editor {
    overflow: auto;
  }

  .sparc-canvas {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
    overflow: hidden;
  }

  .sparc-palette,
  .sparc-node-list,
  .sparc-context-panel,
  .sparc-context-card,
  .sparc-scoped-rule-list,
  .sparc-rule-list,
  .sparc-rule-detail,
  .sparc-rule-section {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-node-list-bottom {
    flex: 1 1 50%;
    min-height: 120px;
    overflow: auto;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-panel-surface);
    border-radius: var(--sparc-editor-border-radius-lg);
    padding: var(--sparc-editor-panel-padding);
  }

  .sparc-node-row,
  .sparc-rule-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(2px * var(--app-density-scale));
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
    text-align: left;
  }

  .sparc-palette-item {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
    text-align: left;
    cursor: grab;
    min-height: var(--app-button-height);
  }

  .sparc-palette-item:active {
    cursor: grabbing;
  }

  .sparc-palette-icon {
    flex: 0 0 14px;
    width: 14px;
    text-align: center;
    color: var(--sparc-editor-strong-text-color);
    opacity: 0.95;
    font-size: calc(var(--app-font-size-base) * 0.82);
  }

  .sparc-palette-text {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    line-height: 1.1;
  }

  .sparc-palette-text span,
  .sparc-palette-text small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sparc-palette-text span {
    font-size: calc(var(--app-font-size-base) * 0.78);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .sparc-palette-text small {
    font-size: calc(var(--app-font-size-base) * 0.68);
    white-space: nowrap;
  }

  .sparc-node-row.selected {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-rule-row.selected {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-media-editor {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-media-summary small {
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .sparc-media-warning {
    border: 1px solid color-mix(in srgb, var(--app-warning-color) 45%, var(--border-color));
    border-radius: var(--sparc-editor-border-radius-sm);
    background: color-mix(in srgb, var(--app-warning-color) 12%, var(--sparc-editor-panel-surface));
    color: var(--app-text-color);
    padding: var(--sparc-editor-gap-xs) var(--sparc-editor-gap-sm);
    font-size: calc(var(--app-font-size-base) * 0.8);
    line-height: 1.25;
  }

  .sparc-media-size-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-context-panel label,
  .sparc-rule-detail label {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-xs);
    font-size: calc(var(--app-font-size-base) * 0.85);
  }

  .sparc-context-panel input,
  .sparc-context-panel textarea,
  .sparc-context-panel select,
  .sparc-target-row select,
  .sparc-rule-editor input,
  .sparc-rule-editor textarea,
  .sparc-rule-editor select {
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-input-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }

  .sparc-checkbox-row input,
  .sparc-stimulus-checkbox-cell input {
    width: auto;
  }

  .sparc-stimulus-attachment-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .sparc-stimulus-attachments-card {
    gap: var(--sparc-editor-gap-sm);
    padding-top: var(--sparc-editor-card-padding);
    padding-bottom: var(--sparc-editor-card-padding);
  }

  .sparc-stimulus-attachments-card .sparc-panel-header {
    min-height: 0;
    margin: 0;
  }

  .sparc-stimulus-attachments-card h3 {
    margin: 0;
    line-height: 1.1;
  }

  .sparc-production-rules-card {
    gap: var(--sparc-editor-gap-sm);
    padding-top: var(--sparc-editor-card-padding);
    padding-bottom: var(--sparc-editor-card-padding);
  }

  .sparc-production-rules-card .sparc-panel-header {
    min-height: 0;
    margin: 0;
  }

  .sparc-production-rules-card h3 {
    margin: 0;
    line-height: 1.1;
  }

  .sparc-production-rules-card .sparc-scoped-rule-list {
    gap: var(--sparc-editor-gap-xs);
  }

  .sparc-stimulus-checkbox-cell,
  .sparc-stimulus-definition-cell {
    padding: calc(1px * var(--app-density-scale)) var(--app-space-0);
    vertical-align: middle;
    font-size: calc(var(--app-font-size-base) * 0.8);
    line-height: 1.1;
  }

  .sparc-stimulus-checkbox-cell {
    width: 22px;
    text-align: left;
  }

  .sparc-stimulus-definition-cell {
    width: auto;
  }

  .sparc-stimulus-id {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    display: block;
    font-family: var(--sparc-editor-monospace-font-family);
    font-weight: var(--app-font-weight-semibold, 600);
  }

  .sparc-rule-layout {
    display: grid;
    grid-template-columns: minmax(190px, 260px) minmax(0, 1fr);
    gap: var(--sparc-editor-gap-md);
    margin-top: var(--sparc-editor-gap-sm);
  }

  .sparc-rule-card {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
  }

  .sparc-rule-section {
    margin-top: var(--sparc-editor-gap-sm);
  }

  .sparc-rule-section h3,
  .sparc-rule-card h4 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 0.95);
  }

  .sparc-rule-json-editor {
    font-family: var(--sparc-editor-monospace-font-family);
    font-size: calc(var(--app-font-size-base) * 0.9);
    line-height: 1.35;
    white-space: pre;
  }

  .sparc-expression-grid,
  .sparc-slot-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-slot-row {
    grid-template-columns: minmax(90px, 1fr) minmax(95px, 120px) minmax(110px, 1.4fr) auto;
    align-items: center;
  }

  .sparc-rich-text-editor {
    min-height: 150px;
    border: 1px solid var(--border-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
    background: var(--sparc-editor-subtle-surface);
  }

  .sparc-rich-text-editor :global(.ProseMirror) {
    min-height: 130px;
    outline: none;
  }

  .sparc-rich-text-source {
    font-family: var(--sparc-editor-monospace-font-family);
    font-size: calc(var(--app-font-size-base) * 0.78);
  }

  .sparc-image-editor,
  .sparc-image-preview {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-image-preview {
    align-items: flex-start;
    overflow: auto;
    max-height: 220px;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-control-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
  }

  .sparc-image-preview :global(img) {
    max-width: 100%;
    height: auto;
  }

  .sparc-rich-text-toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
    flex-wrap: wrap;
    padding: var(--sparc-editor-card-padding);
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
  }

  .sparc-toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
    padding-right: var(--sparc-editor-gap-sm);
    border-right: 1px solid var(--border-color);
  }

  .sparc-toolbar-group:last-child {
    border-right: 0;
  }

  .sparc-rich-text-toolbar button {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-control-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
    white-space: nowrap;
  }

  .sparc-rich-text-toolbar .sparc-color-button {
    display: inline-flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
  }

  .sparc-rich-text-toolbar .sparc-color-button::before {
    content: "";
    width: 0.75rem;
    height: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 50%;
    background: var(--sparc-toolbar-swatch);
  }

  .sparc-rich-text-toolbar button.active {
    border-color: var(--app-primary-action-surface-color);
    background: var(--app-primary-action-surface-color);
    color: var(--app-primary-action-text-color);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-primary-action-text-color) 35%, transparent);
  }

  .sparc-toolbar-toggle {
    margin-right: 0;
  }

  .sparc-toolbar-divider {
    align-self: stretch;
    width: 1px;
    min-height: var(--app-button-height);
    background: var(--border-color);
  }

  .sparc-rich-text-toolbar .sparc-link-input {
    min-width: 150px;
    max-width: 230px;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-input-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }

  .sparc-rich-text-toolbar .sparc-short-input {
    width: 5rem;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-input-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }

  .sparc-context-card {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
  }

  .sparc-selection-summary {
    display: flex;
    flex-direction: column;
    gap: calc(2px * var(--app-density-scale));
  }

  .sparc-node-action-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sparc-editor-gap-sm);
    align-self: flex-start;
  }

  .sparc-visual-editor-surface {
    flex: 1 1 auto;
    position: relative;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-panel-padding);
  }

  .sparc-canvas-hierarchy-visible .sparc-visual-editor-surface {
    flex: 1 1 50%;
  }

  .sparc-visual-editor-surface.sparc-drop-active {
    border-color: var(--app-info-color);
    box-shadow: inset 0 0 0 1px var(--app-info-color);
  }

  .sparc-visual-editor-surface :global([data-node-id]) {
    cursor: pointer;
  }

  .sparc-drop-marker {
    position: absolute;
    height: 3px;
    min-width: 28px;
    background: var(--app-info-color);
    border-radius: var(--border-radius-pill);
    box-shadow: 0 0 0 2px var(--sparc-editor-control-surface);
    pointer-events: none;
    z-index: 20;
  }

  .sparc-drop-marker-inside {
    height: auto;
    min-width: 0;
    background: transparent;
    border: 2px dashed var(--app-info-color);
    border-radius: var(--sparc-editor-border-radius-lg);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--app-info-color) 20%, transparent);
  }

  .sparc-drop-label {
    position: sticky;
    top: 0;
    z-index: 21;
    width: fit-content;
    max-width: min(320px, 100%);
    margin: var(--app-space-0) var(--app-space-0) var(--sparc-editor-gap-sm) auto;
    border: 1px solid var(--app-info-color);
    background: var(--app-info-surface-color);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
    font-size: calc(var(--app-font-size-base) * 0.8);
    pointer-events: none;
  }

  .sparc-save-message {
    color: var(--app-success-color);
  }

  @media (max-width: 1000px) {
    .sparc-editor-shell {
      height: auto;
      overflow: visible;
    }

    .sparc-editor-grid {
      grid-template-columns: 1fr;
      overflow: visible;
    }

    .sparc-palette,
    .sparc-canvas,
    .sparc-context-panel,
    .sparc-rule-editor {
      overflow: visible;
    }

    .sparc-visual-editor-surface {
      min-height: 320px;
    }

    .sparc-rule-layout,
    .sparc-expression-grid,
    .sparc-slot-row {
      grid-template-columns: 1fr;
    }

    .sparc-editor-header {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
