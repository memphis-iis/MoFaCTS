<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    SPARC_RICH_TEXT_COLORS,
    normalizeSparcRichHtml,
  } from '../../experiment/svelte/services/sparcRichHtml';
  import {
    clusterChoicesForAuthoring,
    findSparcTargets,
    flattenNodes,
  } from './sparcAuthoringTargets';
  import {
    productionRuleReferencesNode,
  } from './sparcAuthoringRuleModel';
  import {
    addCatalogPartToProductionRule,
    addProductionCondition as addProductionConditionAction,
    addProductionEffect as addProductionEffectAction,
    addProductionRule as addProductionRuleAction,
    addProductionTest as addProductionTestAction,
    addEffectFactSlot as addEffectFactSlotAction,
    addExpressionArg as addExpressionArgAction,
    addFactSlot as addFactSlotAction,
    changeProductionConditionKind as changeProductionConditionKindAction,
    changeProductionEffectType as changeProductionEffectTypeAction,
    createScopedProductionRule as createScopedProductionRuleAction,
    ensureEffectExpression,
    productionConditionKind,
    productionConditionPattern,
    removeEffectFactSlot as removeEffectFactSlotAction,
    removeExpressionArg as removeExpressionArgAction,
    removeFactSlot as removeFactSlotAction,
    removeProductionCondition as removeProductionConditionAction,
    removeProductionEffect as removeProductionEffectAction,
    removeProductionRule as removeProductionRuleAction,
    removeProductionTest as removeProductionTestAction,
    renameEffectFactSlot as renameEffectFactSlotAction,
    renameFactSlot as renameFactSlotAction,
    moveRule,
    updateAddressTemplate as updateAddressTemplateAction,
    updateEffectBoolean as updateEffectBooleanAction,
    updateEffectField as updateEffectFieldAction,
    updateFactSlotType as updateFactSlotTypeAction,
    updateFactSlotValue as updateFactSlotValueAction,
    updateOptionalEffectField as updateOptionalEffectFieldAction,
    updateProductionConditionFactType as updateProductionConditionFactTypeAction,
    updateProductionTestField as updateProductionTestFieldAction,
    updateProgressiveNodeTemplate as updateProgressiveNodeTemplateAction,
    updateRuleExpression as updateRuleExpressionAction,
    updateScopedProductionRuleJson as updateScopedProductionRuleJsonAction,
  } from './sparcAuthoringRuleActions';
  import { computeDropTarget as computeSparcDropTarget } from './sparcAuthoringDropTarget';
  import { createSparcAuthoringControllerAdapters } from './sparcAuthoringControllerAdapters';
  import {
    activeChildrenForSelection,
    createNode,
    findPanelById,
    insertPaletteNode as insertPaletteNodeAction,
    nextActiveNodeIdAfterRemoval,
    paletteIconClass,
    updateNodeAuthoredValue as updateNodeAuthoredValueAction,
  } from './sparcAuthoringNodeActions';
  import {
    createSparcRichTextController,
  } from './sparcRichTextEditorBridge';
  import {
    getFirstImageAttribute,
    getHtmlMediaSummary,
    isImageHtmlNode,
    isRichTextNode,
    updateHtmlMediaAttribute,
    updateImageHtmlAttribute,
  } from './sparcAuthoringMedia';
  import {
    materializeBehaviorClusterTargetsForNode as materializeBehaviorClusterTargetsForNodeAction,
    toggleNodeCluster as toggleNodeClusterAction,
  } from './sparcAuthoringStimulusActions';
  import {
    createVisualEditorValueBridge,
    readVisualEditorEventValue,
    targetAcceptsTextInput,
  } from './sparcVisualEditorEvents';
  import { validateSparcDisplaysBeforeSave } from './sparcAuthoringValidation';
  import {
    defaultProductionEffect,
    getRenderedSparcPaletteEntries,
    variableExpression,
  } from '../../../../../learning-components/units/sparcsession/sparcAuthoringEditorModel';
  import { SPARC_RULE_CATALOG } from '../../../../../learning-components/units/sparcsession/sparcAuthoringCatalog';
  import SparcAuthoringHeader from './SparcAuthoringHeader.svelte';
  import SparcProductionRulesEditor from './SparcProductionRulesEditor.svelte';
  import SparcVisualEditorTab from './SparcVisualEditorTab.svelte';

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
  const ruleExpressionTypes = ['literal', 'variable', 'function'];
  const comparisonOps = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy'];
  const classifyOutcomes = ['correct', 'incorrect', 'partial', 'study', 'skipped', 'unknown', 'buggy'];
  const messageTypes = ['hint', 'buggy', 'success', 'feedback'];
  const functionNames = ['add', 'subtract', 'multiply', 'divide', 'mod', 'gcd', 'lcm'];

  let rawStimuliFile = clone(initialTdf?.rawStimuliFile || { setspec: { clusters: [] } });
  let clusters = rawStimuliFile?.setspec?.clusters || [];
  let sparcPages = rawStimuliFile?.setspec?.sparcPages || [];
  let sparcTargets = findSparcTargets(sparcPages);
  let clusterChoices = clusterChoicesForAuthoring(clusters);
  let activeTargetKey = sparcTargets[0]?.key || '';
  let activeNodeId = '';
  let htmlEditorElement;
  let htmlToolbarRevision = 0;
  let richTextLinkHref = '';
  let richTextImageSrc = '';
  let richTextImageAlt = '';
  let richTextEmbedSrc = '';
  let showRichTextSource = false;
  let activeVisualRuleTemplateId = 'rule.effect.classify';
  let saving = false;
  let errorText = '';
  let saveMessage = '';
  let activeEditorTab = 'visual';
  let showAdvancedEditors = false;
  let showNodeHierarchy = false;
  let activeProductionRuleIndex = 0;
  let activeScopedProductionRuleIndex = -1;
  let draggedPaletteEntryId = '';
  let dropTarget = null;
  let dropMarkerStyle = '';
  let dropStateContextKey = '';

  $: activeTarget = sparcTargets.find((target) => target.key === activeTargetKey) || sparcTargets[0] || null;
  $: activeDisplay = activeTarget ? sparcPages[activeTarget.pageIndex]?.display : null;
  $: selectedStimFile = queryParams?.stimFile ? String(queryParams.stimFile) : '';
  $: displayNodes = Array.isArray(activeDisplay?.nodes) ? activeDisplay.nodes : [];
  $: productionRules = Array.isArray(activeDisplay?.productionRules) ? activeDisplay.productionRules : [];
  $: activeProductionRule = productionRules[activeProductionRuleIndex] || productionRules[0] || null;
  $: flatNodes = flattenNodes(displayNodes);
  $: if (flatNodes.length > 0 && !flatNodes.some((entry) => entry.node?.id === activeNodeId)) {
    activeNodeId = flatNodes[0].node.id;
  }
  $: activeNodeEntry = flatNodes.find((entry) => entry.node?.id === activeNodeId) || flatNodes[0] || null;
  $: activeNode = activeNodeEntry?.node || displayNodes[0] || null;
  $: activeParentNode = parentNodeForEntry(activeNodeEntry);
  $: activeNodeProductionRuleEntries = productionRules
    .map((rule, index) => ({ rule, index }))
    .filter((entry) => productionRuleReferencesNode(activeDisplay, entry.rule, activeNodeId));
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
  $: controllerActions.materializeBehaviorModelTargetsForNode(activeNode);
  $: htmlToolbarRevision;
  $: if (!showAdvancedEditors && activeEditorTab !== 'visual') {
    activeEditorTab = 'visual';
  }
  $: if (activeEditorTab === 'model' || activeEditorTab === 'reactive') {
    activeEditorTab = 'visual';
  }
  $: richTextController.maintainHtmlEditor(activeNode, htmlEditorElement);
  $: richTextController.syncHtmlEditor(activeNode);

  const controllerActions = createSparcAuthoringControllerAdapters({
    getActiveDisplay: () => activeDisplay,
    getActiveNode: () => activeNode,
    getActiveProductionRule: () => activeProductionRule,
    getFlatNodes: () => flatNodes,
    setActiveProductionRuleIndex: (index) => { activeProductionRuleIndex = index; },
    setErrorText: (value) => { errorText = value; },
    markChanged,
    ensureProductionRules,
    getClusterChoices: () => clusterChoices,
    actions: {
      materializeBehaviorClusterTargetsForNode: materializeBehaviorClusterTargetsForNodeAction,
      toggleNodeCluster: toggleNodeClusterAction,
      addProductionRule: addProductionRuleAction,
      removeProductionRule: removeProductionRuleAction,
      moveRule,
      addProductionCondition: addProductionConditionAction,
      removeProductionCondition: removeProductionConditionAction,
      changeProductionConditionKind: changeProductionConditionKindAction,
      addProductionTest: addProductionTestAction,
      removeProductionTest: removeProductionTestAction,
      addProductionEffect: addProductionEffectAction,
      removeProductionEffect: removeProductionEffectAction,
      changeProductionEffectType: changeProductionEffectTypeAction,
    },
  });

  const richTextController = createSparcRichTextController({
    colors: SPARC_RICH_TEXT_COLORS,
    getActiveNode: () => activeNode,
    getActiveNodeId: () => activeNode?.id || '',
    getHtmlEditorElement: () => htmlEditorElement,
    getIsRichTextSelected: () => isRichTextSelected,
    isRichTextNode,
    markChanged,
    normalizeHtml: normalizeSparcRichHtml,
    setErrorText: (value) => {
      errorText = value;
    },
    onRevision: () => {
      htmlToolbarRevision += 1;
    },
  });

  function parentNodeForEntry(entry) {
    if (!entry?.parent) {
      return null;
    }
    const parentEntry = flatNodes.find((candidate) => candidate.node?.id === entry.parent);
    if (parentEntry?.node) {
      return parentEntry.node;
    }
    return findPanelById(entry.parent, displayNodes)?.owner || null;
  }

  function paletteEntryById(entryId) {
    return paletteEntries.find((entry) => entry.id === entryId) || null;
  }

  function activeChildren() {
    return activeChildrenForSelection({ activeDisplay, activeNode });
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

  function insertPaletteNode(entry, target) {
    const node = insertPaletteNodeAction({
      activeDisplay,
      entry,
      target,
      findNodeEntry,
    });
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

  function computeDropTarget(event) {
    return computeSparcDropTarget(event, findNodeEntry);
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

  function updateFirstImageAttribute(attributeName, value) {
    if (updateImageHtmlAttribute(activeNode, attributeName, value)) {
      markChanged();
    }
  }

  function updateFirstHtmlMediaAttribute(attributeName, value) {
    if (updateHtmlMediaAttribute(activeNode, attributeName, value)) {
      markChanged();
    }
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
      richTextController.rememberVisualRichTextSelection();
    }
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
    return createVisualEditorValueBridge(element, handleVisualEditorValueEvent);
  }

  function updateNodeAuthoredValue(nodeId, value) {
    const target = flatNodes.find((entry) => entry.node?.id === nodeId)?.node;
    if (updateNodeAuthoredValueAction(target, value)) {
      activeNodeId = nodeId;
      markChanged();
    }
  }

  function createScopedProductionRule(entryId = activeVisualRuleTemplateId) {
    if (!activeDisplay || !activeNode?.id) {
      return;
    }
    const rules = ensureProductionRules();
    const nextIndex = createScopedProductionRuleAction({
      rules,
      nodeId: activeNode.id,
      entryId,
    });
    activeProductionRuleIndex = nextIndex;
    activeScopedProductionRuleIndex = nextIndex;
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
    const result = updateScopedProductionRuleJsonAction(activeNodeProductionRule, value);
    if (result.changed) {
      errorText = '';
      markChanged();
    } else if (result.error) {
      errorText = result.error;
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
    if (addCatalogPartToProductionRule(targetRule, entryId)) {
      markChanged();
    }
  }

  function updateOptions(value) {
    updateField('options', value.split('\n').map((option) => option.trim()).filter(Boolean));
  }

  function ensureProductionRules() {
    if (!activeDisplay) throw new Error('No active SPARC display is selected.');
    activeDisplay.productionRules = Array.isArray(activeDisplay.productionRules) ? activeDisplay.productionRules : [];
    return activeDisplay.productionRules;
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

  function updateProductionConditionFactType(condition, value) {
    if (updateProductionConditionFactTypeAction(condition, value)) markChanged();
  }

  function addFactSlot(condition) {
    if (addFactSlotAction(condition)) markChanged();
  }

  function removeFactSlot(condition, key) {
    if (removeFactSlotAction(condition, key)) markChanged();
  }

  function renameFactSlot(condition, oldKey, newKey) {
    if (renameFactSlotAction(condition, oldKey, newKey)) markChanged();
  }

  function updateFactSlotType(slot, type) {
    if (updateFactSlotTypeAction(slot, type)) markChanged();
  }

  function updateFactSlotValue(slot, value) {
    if (updateFactSlotValueAction(slot, value)) markChanged();
  }

  function updateRuleExpression(expression, fieldName, value) {
    if (updateRuleExpressionAction(expression, fieldName, value)) markChanged();
  }

  function addExpressionArg(expression) {
    if (addExpressionArgAction(expression)) markChanged();
  }

  function removeExpressionArg(expression, index) {
    if (removeExpressionArgAction(expression, index)) markChanged();
  }

  function updateProductionTestField(test, fieldName, value) {
    if (updateProductionTestFieldAction(test, fieldName, value)) markChanged();
  }

  function updateEffectField(effect, fieldName, value) {
    if (updateEffectFieldAction(effect, fieldName, value)) markChanged();
  }

  function updateOptionalEffectField(effect, fieldName, value) {
    if (updateOptionalEffectFieldAction(effect, fieldName, value)) markChanged();
  }

  function updateEffectBoolean(effect, fieldName, checked) {
    if (updateEffectBooleanAction(effect, fieldName, checked)) markChanged();
  }

  function addEffectFactSlot(effect) {
    if (addEffectFactSlotAction(effect)) markChanged();
  }

  function removeEffectFactSlot(effect, key) {
    if (removeEffectFactSlotAction(effect, key)) markChanged();
  }

  function renameEffectFactSlot(effect, oldKey, newKey) {
    if (renameEffectFactSlotAction(effect, oldKey, newKey)) markChanged();
  }

  function updateAddressTemplate(target, fieldName, value) {
    if (updateAddressTemplateAction(target, fieldName, value)) markChanged();
  }

  function updateStateWrite(write, fieldName, value) {
    if (updateStateWriteAction(write, fieldName, value)) markChanged();
  }

  function updateProgressiveNodeTemplate(effect, fieldName, value) {
    if (updateProgressiveNodeTemplateAction(effect, fieldName, value)) markChanged();
  }

  function removeActiveNode() {
    if (!activeDisplay || !activeNode) return;
    if (!confirm(`Delete "${activeNode.id}"?`)) return;
    const nextPreferredNodeId = activeParentNode?.id || '';
    const nextNodeId = nextActiveNodeIdAfterRemoval({
      activeDisplay,
      removedNodeId: activeNode.id,
      preferredNodeId: nextPreferredNodeId,
    });
    if (nextNodeId !== null) {
      activeNodeId = nextNodeId;
      markChanged();
    }
  }

  function markChanged() {
    rawStimuliFile = rawStimuliFile;
    clusters = clusters;
    sparcPages = rawStimuliFile?.setspec?.sparcPages || [];
    sparcTargets = findSparcTargets(sparcPages);
    clusterChoices = clusterChoicesForAuthoring(clusters);
    saveMessage = '';
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
    validateSparcDisplaysBeforeSave({ sparcTargets, sparcPages, clusters });
  }

  onMount(async () => {
    window.addEventListener('keydown', handleEditorDeleteKey);
    document.addEventListener('selectionchange', richTextController.rememberVisualRichTextSelection);
    await tick();
    richTextController.ensureHtmlEditor();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleEditorDeleteKey);
    document.removeEventListener('selectionchange', richTextController.rememberVisualRichTextSelection);
    richTextController.destroy();
  });
</script>

<div class="sparc-editor-shell">
  <SparcAuthoringHeader
    {tdfId}
    {initialTdf}
    {selectedStimFile}
    {sparcTargets}
    bind:activeTargetKey
    bind:showAdvancedEditors
    bind:activeEditorTab
    {saveMessage}
    {saving}
    {errorText}
    {onCancel}
    onSave={handleSave}
  />

  {#if activeEditorTab === 'visual'}
    <SparcVisualEditorTab
      {paletteEntries}
      {paletteIconClass}
      {activeDisplay}
      bind:activeNodeId
      {activeNode}
      {activeParentNode}
      bind:htmlEditorElement
      bind:showNodeHierarchy
      bind:showRichTextSource
      bind:richTextLinkHref
      bind:richTextImageSrc
      bind:richTextImageAlt
      bind:richTextEmbedSrc
      {isRichTextSelected}
      {isImageHtmlSelected}
      {selectedImageSrc}
      {selectedImageAlt}
      {selectedImageTitle}
      {selectedHtmlMedia}
      {clusterChoices}
      {dropTarget}
      {dropMarkerStyle}
      {flatNodes}
      {visualEditorValueBridge}
      bind:activeVisualRuleTemplateId
      {activeProductionRuleIndex}
      {activeNodeProductionRuleEntries}
      {activeNodeProductionRule}
      {activeNodeRuleEffect}
      {productionRuleCatalogEntries}
      {productionConditionCatalogEntries}
      {productionTestCatalogEntries}
      {productionEffectCatalogEntries}
      {productionEffectTypes}
      {classifyOutcomes}
      {messageTypes}
      {ruleExpressionTypes}
      {functionNames}
      {variableExpression}
      {ensureEffectExpression}
      {stringifyProductionRule}
      commandActive={(command, attrs) => {
        htmlToolbarRevision;
        return richTextController.richTextCommandActive(command, attrs);
      }}
      alignmentActive={(value) => {
        htmlToolbarRevision;
        return richTextController.richTextAlignmentActive(value);
      }}
      runRichTextCommand={richTextController.runRichTextCommand}
      onToolbarMouseDown={handleRichTextToolbarMouseDown}
      onAddNode={addNode}
      onStartPaletteDrag={startPaletteDrag}
      onClearDropState={clearDropState}
      onEditorClick={handleVisualEditorClick}
      onRememberRichTextSelection={richTextController.rememberVisualRichTextSelection}
      onVisualDragOver={handleVisualDragOver}
      onVisualDrop={handleVisualDrop}
      onVisualDragLeave={handleVisualDragLeave}
      onNodeAuthoredValueChange={updateNodeAuthoredValue}
      onNodeFocus={selectVisualNode}
      onRemoveActiveNode={removeActiveNode}
      onUpdateField={updateField}
      onUpdateFirstImageAttribute={updateFirstImageAttribute}
      onUpdateFirstHtmlMediaAttribute={updateFirstHtmlMediaAttribute}
      onUpdateRichTextSource={richTextController.updateRichTextSource}
      onUpdateOptions={updateOptions}
      onToggleNodeCluster={controllerActions.toggleNodeCluster}
      onCreateScopedProductionRule={createScopedProductionRule}
      onSelectScopedProductionRule={selectScopedProductionRule}
      onUpdateScopedProductionRuleField={updateScopedProductionRuleField}
      onAddCatalogPartToActiveRule={addCatalogPartToActiveRule}
      onUpdateScopedProductionRuleJson={updateScopedProductionRuleJson}
      onChangeScopedRulePrimaryEffectType={changeScopedRulePrimaryEffectType}
      onUpdateEffectField={updateEffectField}
      onUpdateOptionalEffectField={updateOptionalEffectField}
      onUpdateRuleExpression={updateRuleExpression}
      onAddExpressionArg={addExpressionArg}
      onRemoveExpressionArg={removeExpressionArg}
    />
  {:else if activeEditorTab === 'production'}
    <SparcProductionRulesEditor
      {productionRules}
      bind:activeProductionRuleIndex
      {activeProductionRule}
      {productionConditionTypes}
      {productionEffectTypes}
      {comparisonOps}
      {classifyOutcomes}
      {messageTypes}
      {clusterChoices}
      {ruleExpressionTypes}
      {functionNames}
      {variableExpression}
      onAddProductionRule={controllerActions.addProductionRule}
      onRemoveProductionRule={controllerActions.removeProductionRule}
      onMoveProductionRule={controllerActions.moveProductionRule}
      onUpdateProductionRuleField={updateProductionRuleField}
      onAddProductionCondition={controllerActions.addProductionCondition}
      onRemoveProductionCondition={controllerActions.removeProductionCondition}
      {productionConditionKind}
      onChangeProductionConditionKind={controllerActions.changeProductionConditionKind}
      {productionConditionPattern}
      onUpdateProductionConditionFactType={updateProductionConditionFactType}
      onAddFactSlot={addFactSlot}
      onRemoveFactSlot={removeFactSlot}
      onRenameFactSlot={renameFactSlot}
      onUpdateFactSlotType={updateFactSlotType}
      onUpdateFactSlotValue={updateFactSlotValue}
      onAddProductionTest={controllerActions.addProductionTest}
      onRemoveProductionTest={controllerActions.removeProductionTest}
      onUpdateProductionTestField={updateProductionTestField}
      onAddProductionEffect={controllerActions.addProductionEffect}
      onRemoveProductionEffect={controllerActions.removeProductionEffect}
      onChangeProductionEffectType={controllerActions.changeProductionEffectType}
      onUpdateEffectField={updateEffectField}
      onUpdateOptionalEffectField={updateOptionalEffectField}
      onUpdateEffectBoolean={updateEffectBoolean}
      onAddEffectFactSlot={addEffectFactSlot}
      onRemoveEffectFactSlot={removeEffectFactSlot}
      onRenameEffectFactSlot={renameEffectFactSlot}
      onUpdateAddressTemplate={updateAddressTemplate}
      {ensureEffectExpression}
      onUpdateProgressiveNodeTemplate={updateProgressiveNodeTemplate}
      onUpdateRuleExpression={updateRuleExpression}
      onAddExpressionArg={addExpressionArg}
      onRemoveExpressionArg={removeExpressionArg}
      onMarkChanged={markChanged}
    />
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

  @media (max-width: 1000px) {
    .sparc-editor-shell {
      height: auto;
      overflow: visible;
    }
  }
</style>
