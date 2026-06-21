<script>
  import {
    SPARC_RICH_TEXT_COLORS,
  } from '../../experiment/svelte/services/sparcRichHtml';
  import SparcNodePalette from './SparcNodePalette.svelte';
  import SparcRichTextToolbar from './SparcRichTextToolbar.svelte';
  import SparcScopedProductionRulesCard from './SparcScopedProductionRulesCard.svelte';
  import SparcSelectedNodeCard from './SparcSelectedNodeCard.svelte';
  import SparcStimulusAttachmentsCard from './SparcStimulusAttachmentsCard.svelte';
  import SparcVisualSurface from './SparcVisualSurface.svelte';

  export let paletteEntries = [];
  export let paletteIconClass = () => '';
  export let activeDisplay = null;
  export let activeNodeId = '';
  export let activeNode = null;
  export let activeParentNode = null;
  export let htmlEditorElement = null;
  export let showNodeHierarchy = false;
  export let showRichTextSource = false;
  export let richTextLinkHref = '';
  export let richTextImageSrc = '';
  export let richTextImageAlt = '';
  export let richTextEmbedSrc = '';
  export let isRichTextSelected = false;
  export let isImageHtmlSelected = false;
  export let selectedImageSrc = '';
  export let selectedImageAlt = '';
  export let selectedImageTitle = '';
  export let selectedHtmlMedia = null;
  export let stimulusRegistry = [];
  export let dropTarget = null;
  export let dropMarkerStyle = '';
  export let flatNodes = [];
  export let visualEditorValueBridge = () => {};
  export let activeVisualRuleTemplateId = 'rule.effect.classify';
  export let activeProductionRuleIndex = 0;
  export let activeNodeProductionRuleEntries = [];
  export let activeNodeProductionRule = null;
  export let activeNodeRuleEffect = null;
  export let productionRuleCatalogEntries = [];
  export let productionConditionCatalogEntries = [];
  export let productionTestCatalogEntries = [];
  export let productionEffectCatalogEntries = [];
  export let productionEffectTypes = [];
  export let classifyOutcomes = [];
  export let messageTypes = [];
  export let ruleExpressionTypes = [];
  export let functionNames = [];
  export let variableExpression = (name) => ({ type: 'variable', name });
  export let ensureEffectExpression = () => null;
  export let stringifyProductionRule = (rule) => JSON.stringify(rule || {}, null, 2);
  export let commandActive = () => false;
  export let alignmentActive = () => false;
  export let runRichTextCommand = () => {};
  export let onToolbarMouseDown = () => {};
  export let onAddNode = () => {};
  export let onStartPaletteDrag = () => {};
  export let onClearDropState = () => {};
  export let onEditorClick = () => {};
  export let onRememberRichTextSelection = () => {};
  export let onVisualDragOver = () => {};
  export let onVisualDrop = () => {};
  export let onVisualDragLeave = () => {};
  export let onNodeAuthoredValueChange = () => {};
  export let onNodeFocus = () => {};
  export let onRemoveActiveNode = () => {};
  export let onUpdateField = () => {};
  export let onUpdateFirstImageAttribute = () => {};
  export let onUpdateFirstHtmlMediaAttribute = () => {};
  export let onUpdateRichTextSource = () => {};
  export let onUpdateOptions = () => {};
  export let onToggleNodeStimulus = () => {};
  export let onCreateScopedProductionRule = () => {};
  export let onSelectScopedProductionRule = () => {};
  export let onUpdateScopedProductionRuleField = () => {};
  export let onAddCatalogPartToActiveRule = () => {};
  export let onUpdateScopedProductionRuleJson = () => {};
  export let onChangeScopedRulePrimaryEffectType = () => {};
  export let onUpdateEffectField = () => {};
  export let onUpdateOptionalEffectField = () => {};
  export let onUpdateRuleExpression = () => {};
  export let onAddExpressionArg = () => {};
  export let onRemoveExpressionArg = () => {};
</script>

<div class="sparc-editor-grid">
  <SparcNodePalette
    {paletteEntries}
    {paletteIconClass}
    onAddNode={onAddNode}
    onStartPaletteDrag={onStartPaletteDrag}
    onClearDropState={onClearDropState}
  />

  <main class="sparc-canvas" class:sparc-canvas-hierarchy-visible={showNodeHierarchy}>
    <SparcRichTextToolbar
      colors={SPARC_RICH_TEXT_COLORS}
      {isRichTextSelected}
      bind:showNodeHierarchy
      bind:showRichTextSource
      bind:richTextLinkHref
      bind:richTextImageSrc
      bind:richTextImageAlt
      bind:richTextEmbedSrc
      commandActive={commandActive}
      alignmentActive={alignmentActive}
      runCommand={runRichTextCommand}
      {onToolbarMouseDown}
    />
    <SparcVisualSurface
      {activeDisplay}
      bind:activeNodeId
      {dropTarget}
      {dropMarkerStyle}
      {showNodeHierarchy}
      {flatNodes}
      {visualEditorValueBridge}
      onEditorClick={onEditorClick}
      onRememberRichTextSelection={onRememberRichTextSelection}
      onVisualDragOver={onVisualDragOver}
      onVisualDrop={onVisualDrop}
      onVisualDragLeave={onVisualDragLeave}
      onNodeAuthoredValueChange={onNodeAuthoredValueChange}
      onNodeFocus={onNodeFocus}
    />
  </main>

  <section class="sparc-context-panel">
    {#if activeNode}
      <SparcSelectedNodeCard
        {activeNode}
        {activeParentNode}
        bind:htmlEditorElement
        {showRichTextSource}
        {isImageHtmlSelected}
        {selectedImageSrc}
        {selectedImageAlt}
        {selectedImageTitle}
        {selectedHtmlMedia}
        onSelectParentNode={(parentNode) => activeNodeId = parentNode.id}
        onRemoveActiveNode={onRemoveActiveNode}
        onUpdateField={onUpdateField}
        onUpdateFirstImageAttribute={onUpdateFirstImageAttribute}
        onUpdateFirstHtmlMediaAttribute={onUpdateFirstHtmlMediaAttribute}
        onUpdateRichTextSource={onUpdateRichTextSource}
        onUpdateOptions={onUpdateOptions}
      />

      {#if stimulusRegistry.length > 0}
        <SparcStimulusAttachmentsCard
          {activeNode}
          {stimulusRegistry}
          onToggleNodeStimulus={onToggleNodeStimulus}
        />
      {/if}

      <SparcScopedProductionRulesCard
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
        {stimulusRegistry}
        {ruleExpressionTypes}
        {functionNames}
        {variableExpression}
        onCreateScopedProductionRule={onCreateScopedProductionRule}
        onSelectScopedProductionRule={onSelectScopedProductionRule}
        onUpdateScopedProductionRuleField={onUpdateScopedProductionRuleField}
        onAddCatalogPartToActiveRule={onAddCatalogPartToActiveRule}
        {stringifyProductionRule}
        onUpdateScopedProductionRuleJson={onUpdateScopedProductionRuleJson}
        onChangeScopedRulePrimaryEffectType={onChangeScopedRulePrimaryEffectType}
        onUpdateEffectField={onUpdateEffectField}
        onUpdateOptionalEffectField={onUpdateOptionalEffectField}
        {ensureEffectExpression}
        onUpdateRuleExpression={onUpdateRuleExpression}
        onAddExpressionArg={onAddExpressionArg}
        onRemoveExpressionArg={onRemoveExpressionArg}
      />
    {:else}
      <p class="sparc-muted">Select a node or add one from the palette.</p>
    {/if}
  </section>
</div>

<style>
  .sparc-muted {
    color: var(--app-secondary-text-color);
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

  .sparc-canvas,
  .sparc-context-panel {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-panel-surface);
    border-radius: var(--sparc-editor-border-radius-lg);
    padding: var(--sparc-editor-panel-padding);
    min-width: 0;
    min-height: 0;
  }

  .sparc-context-panel {
    overflow: auto;
  }

  .sparc-canvas {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
    overflow: hidden;
  }

  .sparc-context-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
  }

  @media (max-width: 1000px) {
    .sparc-editor-grid {
      grid-template-columns: 1fr;
      overflow: visible;
    }

    .sparc-canvas,
    .sparc-context-panel {
      overflow: visible;
    }
  }
</style>
