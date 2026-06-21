<script>
  import DOMPurify from 'dompurify';
  import LearningProgressChart from './LearningProgressChart.svelte';
  import { sanitizeSparcRichHtml } from '../services/sparcRichHtml';

  export let node;
  export let nodeValues = {};
  export let learningProgressSnapshot = null;
  export let authoringSelectedNodeId = '';
  export let authoringSelectOnly = false;
  export let onNodeValueChange = () => {};
  export let onNodeCommit = () => {};
  export let onNodeFocus = () => {};
  export let onButtonActivate = () => {};

  let activeTabId = '';
  let activePanelId = '';

  function sortByPlacementOrder(values = []) {
    return values.slice().sort((left, right) => {
      const leftOrder = Number(left?.placement?.order ?? 0);
      const rightOrder = Number(right?.placement?.order ?? 0);
      return leftOrder - rightOrder;
    });
  }

  function buildRenderItems(children = []) {
    const items = [];
    const orderedChildren = sortByPlacementOrder(children);
    for (let index = 0; index < orderedChildren.length; index += 1) {
      const current = orderedChildren[index];
      items.push({ kind: 'node', node: current, key: current?.id || `node-${index}` });
    }
    return items;
  }

  function getNodeValue(candidate) {
    if (!candidate?.id) {
      return '';
    }
    if (Object.prototype.hasOwnProperty.call(nodeValues, candidate.id)) {
      return nodeValues[candidate.id];
    }
    if (candidate.atomType === 'dropdown') {
      return candidate.selected ?? candidate.value ?? '';
    }
    if (candidate.atomType === 'checkbox') {
      return candidate.checked === true;
    }
    return candidate.value ?? '';
  }

  function getNodeCorrectness(candidate) {
    if (!candidate?.id) {
      return '';
    }
    const value = nodeValues[`${candidate.id}::correctness`];
    return typeof value === 'string' ? value : '';
  }

  function correctnessClass(candidate) {
    const correctness = getNodeCorrectness(candidate);
    return correctness ? `sparc-correctness-${correctness}` : '';
  }

  function updateNodeValue(candidate, nextValue) {
    if (!candidate?.id || candidate?.readOnly) {
      return;
    }
    onNodeValueChange(candidate.id, nextValue);
  }

  function commitNodeValue(candidate, nextValue) {
    if (!candidate?.id || candidate?.readOnly) {
      return;
    }
    onNodeCommit(candidate.id, nextValue);
  }

  function isPlainTextAuthoringNode(candidate) {
    return candidate?.atomType === 'text-block'
      || candidate?.atomType === 'text'
      || candidate?.atomType === 'header-cell'
      || candidate?.atomType === 'operator'
      || candidate?.atomType === 'fraction-box';
  }

  function handlePlainTextAuthoringInput(candidate, element) {
    updateNodeValue(candidate, element.textContent || '');
  }

  function handlePlainTextAuthoringPaste(candidate, element) {
    setTimeout(() => handlePlainTextAuthoringInput(candidate, element), 0);
  }

  function handlePlainTextAuthoringCommit(candidate) {
    commitNodeValue(candidate, candidate.value || '');
  }

  function handleHtmlAuthoringInput(candidate, element) {
    updateNodeValue(candidate, element.innerHTML || '');
  }

  function handleHtmlAuthoringPaste(candidate, element) {
    setTimeout(() => handleHtmlAuthoringInput(candidate, element), 0);
  }

  function handleHtmlAuthoringCommit(candidate) {
    commitNodeValue(candidate, candidate.value || '');
  }

  function buttonLabel(candidate) {
    return String(candidate?.label || candidate?.value || '').trim();
  }

  function sanitizeSparcHtml(value) {
    return sanitizeSparcRichHtml(value, DOMPurify.sanitize.bind(DOMPurify));
  }

  function skillBarFill(candidate) {
    const fill = Number(candidate?.fill ?? 0);
    if (!Number.isFinite(fill)) {
      return 0;
    }
    return Math.max(0, Math.min(100, fill));
  }

  function layoutString(candidate, key) {
    const value = candidate?.layout?.[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  function glueString(candidate) {
    const glue = candidate?.layout?.glue;
    if (typeof glue === 'string') {
      return glue.trim();
    }
    const mode = glue?.mode;
    return typeof mode === 'string' ? mode.trim() : '';
  }

  function nodeLayoutRole(candidate) {
    return layoutString(candidate, 'role');
  }

  function isHeaderFeedbackNode(candidate) {
    return nodeLayoutRole(candidate) === 'header-feedback';
  }

  function isChoiceTabsGroup(candidate) {
    return candidate?.nodeType === 'group'
      && (candidate?.groupType === 'choice-tabs' || glueString(candidate) === 'choice-tabs');
  }

  function isFractionGroup(candidate) {
    return candidate?.nodeType === 'group' && candidate?.groupType === 'fraction';
  }

  function fractionRole(candidate) {
    const role = candidate?.fractionRole || candidate?.role || candidate?.layout?.role || '';
    return typeof role === 'string' ? role.trim() : '';
  }

  function fractionChild(candidate, role) {
    return (candidate?.children || []).find((child) => fractionRole(child) === role) || null;
  }

  $: headerFeedbackNode = node?.nodeType === 'group'
    ? (node.children || []).find(isHeaderFeedbackNode)
    : null;
  $: bodyChildren = node?.nodeType === 'group'
    ? (node.children || []).filter((child) => !isHeaderFeedbackNode(child))
    : [];
  $: renderItems = node?.nodeType === 'group' ? buildRenderItems(bodyChildren) : [];
  $: isChoiceTabs = isChoiceTabsGroup(node);
  $: isFraction = isFractionGroup(node);
  $: fractionNumerator = isFraction ? fractionChild(node, 'numerator') : null;
  $: fractionDenominator = isFraction ? fractionChild(node, 'denominator') : null;
  $: tabChildren = isChoiceTabs ? sortByPlacementOrder(bodyChildren) : [];
  $: if (isChoiceTabs && tabChildren.length > 0 && !tabChildren.some((child) => child?.id === activeTabId)) {
    activeTabId = tabChildren[0]?.id || '';
  }
  $: activeTabNode = tabChildren.find((child) => child?.id === activeTabId) || tabChildren[0] || null;
  $: panelSelectorPanels = node?.atomType === 'panel-selector' ? sortByPlacementOrder(node.panels || []) : [];
  $: if (node?.atomType === 'panel-selector' && panelSelectorPanels.length > 0 && !panelSelectorPanels.some((panel) => panel?.id === activePanelId)) {
    activePanelId = node.selectedPanelId || panelSelectorPanels[0]?.id || '';
  }
  $: activePanel = panelSelectorPanels.find((panel) => panel?.id === activePanelId) || panelSelectorPanels[0] || null;
  $: activePanelItems = activePanel ? buildRenderItems(activePanel.children || []) : [];
</script>

{#if node?.nodeType === 'group'}
  <div
    class={`sparc-group sparc-group-${node.groupType || 'generic'}`}
    class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
    data-node-id={node.id}
    data-sparc-layout-mode={layoutString(node, 'layoutMode')}
    data-sparc-visual-preset={layoutString(node, 'visualPreset')}
    data-sparc-glue={glueString(node)}
  >
    {#if isFraction}
      {#if fractionNumerator && fractionDenominator}
        <div class="sparc-fraction">
          <div class="sparc-fraction-top">
            <svelte:self
              node={fractionNumerator}
              {nodeValues}
              {learningProgressSnapshot}
              {authoringSelectedNodeId}
              {authoringSelectOnly}
              {onNodeValueChange}
              {onNodeCommit}
              {onNodeFocus}
              {onButtonActivate}
            />
          </div>
          <div class="sparc-fraction-divider"></div>
          <div class="sparc-fraction-bottom">
            <svelte:self
              node={fractionDenominator}
              {nodeValues}
              {learningProgressSnapshot}
              {authoringSelectedNodeId}
              {authoringSelectOnly}
              {onNodeValueChange}
              {onNodeCommit}
              {onNodeFocus}
              {onButtonActivate}
            />
          </div>
        </div>
      {:else}
        <div class="sparc-unknown">Invalid fraction: missing numerator or denominator</div>
      {/if}
    {:else if headerFeedbackNode}
      <div class="sparc-group-header">
        <div class="sparc-group-header-feedback">
          <svelte:self
            node={headerFeedbackNode}
            {nodeValues}
            {learningProgressSnapshot}
            {authoringSelectedNodeId}
            {authoringSelectOnly}
            {onNodeValueChange}
            {onNodeCommit}
            {onNodeFocus}
            {onButtonActivate}
          />
        </div>
      </div>
    {/if}
    {#if !isFraction}
      <div class="sparc-group-body">
      {#if isChoiceTabs}
        <div class="sparc-choice-tabs" role="tablist">
          {#each tabChildren as tab}
            <button
              type="button"
              class:active={tab.id === activeTabId}
              class="sparc-choice-tab"
              role="tab"
              aria-selected={tab.id === activeTabId}
              on:click={() => {
                activeTabId = tab.id;
              }}
            >
              {tab.label || tab.id}
            </button>
          {/each}
        </div>
        {#if activeTabNode}
          <div class="sparc-choice-tab-panel" role="tabpanel">
            <svelte:self
              node={activeTabNode}
              {nodeValues}
              {learningProgressSnapshot}
              {authoringSelectedNodeId}
              {authoringSelectOnly}
              {onNodeValueChange}
              {onNodeCommit}
              {onNodeFocus}
              {onButtonActivate}
            />
          </div>
        {/if}
      {:else}
        {#each renderItems as item (item.key)}
          <svelte:self
            node={item.node}
            {nodeValues}
            {learningProgressSnapshot}
            {authoringSelectedNodeId}
            {authoringSelectOnly}
            {onNodeValueChange}
            {onNodeCommit}
            {onNodeFocus}
            {onButtonActivate}
          />
        {/each}
      {/if}
      </div>
    {/if}
  </div>
{:else if node?.nodeType === 'atomic'}
  {#if isPlainTextAuthoringNode(node)}
    {#if authoringSelectOnly}
      <div
        class={`sparc-atom sparc-${node.atomType} sparc-authoring-inline-edit`}
        class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
        data-node-id={node.id}
        contenteditable="plaintext-only"
        role="textbox"
        tabindex="0"
        bind:textContent={node.value}
        on:focus={() => onNodeFocus(node.id)}
        on:input={(event) => handlePlainTextAuthoringInput(node, event.currentTarget)}
        on:keyup={(event) => handlePlainTextAuthoringInput(node, event.currentTarget)}
        on:paste={(event) => handlePlainTextAuthoringPaste(node, event.currentTarget)}
        on:blur={() => handlePlainTextAuthoringCommit(node)}
      ></div>
    {:else}
      <div class={`sparc-atom sparc-${node.atomType}`} class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{getNodeValue(node)}</div>
    {/if}
  {:else if node.atomType === 'html-block'}
    {#if authoringSelectOnly}
      <div
        class="sparc-atom sparc-html-block sparc-authoring-inline-edit"
        class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
        data-node-id={node.id}
        contenteditable="true"
        role="textbox"
        tabindex="0"
        bind:innerHTML={node.value}
        on:focus={() => onNodeFocus(node.id)}
        on:input={(event) => handleHtmlAuthoringInput(node, event.currentTarget)}
        on:keyup={(event) => handleHtmlAuthoringInput(node, event.currentTarget)}
        on:paste={(event) => handleHtmlAuthoringPaste(node, event.currentTarget)}
        on:blur={() => handleHtmlAuthoringCommit(node)}
      ></div>
    {:else}
      <div class="sparc-atom sparc-html-block" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{@html sanitizeSparcHtml(getNodeValue(node))}</div>
    {/if}
  {:else if node.atomType === 'panel-selector'}
    <div class="sparc-atom sparc-panel-selector" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>
      {#if node.label}
        <div class="sparc-panel-selector-label">{node.label}</div>
      {/if}
      <div class="sparc-panel-tabs" role="tablist">
        {#each panelSelectorPanels as panel}
          <button
            type="button"
            class:active={panel.id === activePanelId}
            class="sparc-panel-tab"
            role="tab"
            aria-selected={panel.id === activePanelId}
            on:click={() => {
              activePanelId = panel.id;
            }}
          >
            {panel.label || panel.id}
          </button>
        {/each}
      </div>
      {#if activePanel}
        <div class="sparc-panel-selector-panel" role="tabpanel">
          {#each activePanelItems as item (item.key)}
            <svelte:self
              node={item.node}
              {nodeValues}
              {learningProgressSnapshot}
              {authoringSelectedNodeId}
              {authoringSelectOnly}
              {onNodeValueChange}
              {onNodeCommit}
              {onNodeFocus}
              {onButtonActivate}
            />
          {/each}
        </div>
      {/if}
    </div>
  {:else if node.atomType === 'message-box'}
    {#if authoringSelectOnly || String(getNodeValue(node) || '').trim()}
      {#if authoringSelectOnly}
        <div
          class="sparc-atom sparc-message-box sparc-authoring-inline-edit"
          class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
          data-node-id={node.id}
          contenteditable="true"
          role="textbox"
          tabindex="0"
          bind:innerHTML={node.value}
          on:focus={() => onNodeFocus(node.id)}
          on:input={(event) => handleHtmlAuthoringInput(node, event.currentTarget)}
          on:keyup={(event) => handleHtmlAuthoringInput(node, event.currentTarget)}
          on:paste={(event) => handleHtmlAuthoringPaste(node, event.currentTarget)}
          on:blur={() => handleHtmlAuthoringCommit(node)}
        ></div>
      {:else}
        <div class="sparc-atom sparc-message-box" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{@html sanitizeSparcHtml(getNodeValue(node))}</div>
      {/if}
    {/if}
  {:else if node.atomType === 'skill-bar'}
    <div class="sparc-atom sparc-skill-bar" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id} aria-label={node.label || ''}>
      <div class="sparc-skill-track">
        <div class="sparc-skill-fill" style={`width: ${skillBarFill(node)}%;`}></div>
      </div>
      {#if node.label}
        <span class="sparc-skill-label">{node.label}</span>
      {/if}
    </div>
  {:else if node.atomType === 'learning-progress'}
    <div class="sparc-atom sparc-learning-progress" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id} aria-label={node.label || 'Learning progress'}>
      {#if node.label}
        <div class="sparc-learning-progress-label">{node.label}</div>
      {/if}
      <LearningProgressChart
        snapshot={learningProgressSnapshot}
        showReferenceLines={false}
        compact={true}
      />
    </div>
  {:else if node.atomType === 'operator'}
    <div class="sparc-atom sparc-operator" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{node.value || ''}</div>
  {:else if node.atomType === 'fraction-box'}
    <div class={`sparc-atom sparc-fraction-box ${node.style ? `sparc-style-${node.style}` : ''}`} class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{getNodeValue(node)}</div>
  {:else if node.atomType === 'fraction-input' || node.atomType === 'text-input'}
    <input
      class={`sparc-atom sparc-input sparc-input-${node.atomType}`}
      class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
      class:sparc-correctness-correct={getNodeCorrectness(node) === 'correct'}
      class:sparc-correctness-incorrect={getNodeCorrectness(node) === 'incorrect' || getNodeCorrectness(node) === 'buggy'}
      data-node-id={node.id}
      type="text"
      value={getNodeValue(node)}
      maxlength={node.maxlength}
      placeholder={node.hint || ''}
      readonly={node.readOnly === true}
      on:focus={() => onNodeFocus(node.id)}
      on:input={(event) => updateNodeValue(node, event.currentTarget.value)}
      on:blur={(event) => commitNodeValue(node, event.currentTarget.value)}
      on:keydown={(event) => {
        if (event.key === 'Enter') {
          commitNodeValue(node, event.currentTarget.value);
        }
      }}
    />
  {:else if node.atomType === 'dropdown'}
    <select
      class="sparc-atom sparc-select"
      class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
      class:sparc-correctness-correct={getNodeCorrectness(node) === 'correct'}
      class:sparc-correctness-incorrect={getNodeCorrectness(node) === 'incorrect' || getNodeCorrectness(node) === 'buggy'}
      data-node-id={node.id}
      disabled={node.readOnly === true}
      value={getNodeValue(node)}
      on:focus={() => onNodeFocus(node.id)}
      on:change={(event) => {
        updateNodeValue(node, event.currentTarget.value);
        commitNodeValue(node, event.currentTarget.value);
      }}
    >
      {#each node.options || [] as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
  {:else if node.atomType === 'checkbox'}
    <label class={`sparc-atom sparc-checkbox ${correctnessClass(node)}`} class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>
      <input
        data-node-id={node.id}
        type="checkbox"
        checked={Boolean(getNodeValue(node))}
        disabled={node.readOnly === true}
        on:focus={() => onNodeFocus(node.id)}
        on:change={(event) => {
          updateNodeValue(node, event.currentTarget.checked);
          commitNodeValue(node, event.currentTarget.checked);
        }}
      />
    </label>
  {:else if node.atomType === 'button'}
    <button
      type="button"
      class={`sparc-atom sparc-button ${node.variant ? `sparc-button-${node.variant}` : ''}`}
      class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
      class:sparc-correctness-correct={getNodeCorrectness(node) === 'correct'}
      class:sparc-correctness-incorrect={getNodeCorrectness(node) === 'incorrect' || getNodeCorrectness(node) === 'buggy'}
      data-node-id={node.id}
      on:click={() => authoringSelectOnly ? onNodeFocus(node.id) : onButtonActivate(node)}
    >
      {buttonLabel(node)}
    </button>
  {:else}
    <div class="sparc-atom sparc-unknown" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{node.atomType || 'unknown'}</div>
  {/if}
{/if}

<style>
  .sparc-group {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--sparc-space-2);
    color: var(--sparc-text-color);
    font-family: var(--sparc-font-family);
    font-size: var(--sparc-font-size-base);
  }

  .sparc-authoring-selected {
    outline: 2px solid var(--sparc-accent-color);
    outline-offset: 2px;
  }

  .sparc-group-label {
    color: var(--sparc-text-color);
    font-weight: var(--app-font-weight-semibold, 600);
  }

  .sparc-group-header {
    display: flex;
    align-items: center;
    gap: var(--sparc-space-2);
    width: 100%;
  }

  :global(.sparc-group-header .sparc-group-label) {
    flex: 0 1 auto;
  }

  .sparc-group-fraction {
    width: auto;
    display: inline-flex;
  }

  .sparc-group-header-feedback {
    flex: 0 0 calc(var(--sparc-feedback-width-max) / 5);
    min-width: calc(var(--sparc-feedback-width-min) / 5);
  }

  :global(.sparc-group-header-feedback .sparc-message-box) {
    width: 100%;
    min-width: 0;
    text-align: center;
  }

  .sparc-group-body {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--sparc-space-2);
  }

  .sparc-group-text-panel {
    gap: var(--sparc-space-1);
  }

  :global(.sparc-group-text-panel > .sparc-group-label),
  :global(.sparc-group[data-sparc-visual-preset="dimensional-analysis"] > .sparc-group-label),
  :global(.sparc-group-term-table > .sparc-group-label) {
    color: var(--sparc-heading-color);
    font-size: calc(var(--sparc-font-size-base) * 0.95);
  }

  :global(.sparc-group-text-panel .sparc-text-block),
  :global(.sparc-group-text-panel .sparc-html-block),
  :global(.sparc-group[data-sparc-visual-preset="corner-hint"] .sparc-text-block),
  :global(.sparc-group[data-sparc-visual-preset="corner-hint"] .sparc-html-block),
  :global(.sparc-group-hint-panel .sparc-text-block),
  :global(.sparc-group-hint-panel .sparc-html-block) {
    border: 0;
    border-radius: 0;
    padding: 0;
    background: transparent;
  }

  .sparc-group[data-sparc-glue="multiple-choice"],
  .sparc-group-multiple-choice {
    width: min(100%, var(--sparc-multiple-choice-width));
  }

  .sparc-group[data-sparc-glue="multiple-choice"] > .sparc-group-body,
  .sparc-group-multiple-choice > .sparc-group-body {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--sparc-space-2);
  }

  :global(.sparc-group[data-sparc-glue="multiple-choice"] > .sparc-group-body > .sparc-text-block),
  :global(.sparc-group[data-sparc-glue="multiple-choice"] > .sparc-group-body > .sparc-html-block),
  :global(.sparc-group-multiple-choice > .sparc-group-body > .sparc-text-block),
  :global(.sparc-group-multiple-choice > .sparc-group-body > .sparc-html-block) {
    width: 100%;
    text-align: left;
  }

  :global(.sparc-group[data-sparc-glue="multiple-choice"] > .sparc-group-body > .sparc-group-answer-list),
  :global(.sparc-group-multiple-choice > .sparc-group-body > .sparc-group-answer-list) {
    width: min(100%, var(--sparc-answer-list-width));
    align-self: center;
    align-items: stretch;
  }

  .sparc-group[data-sparc-glue="intro-feedback"] > .sparc-group-body,
  .sparc-group-intro-feedback-row > .sparc-group-body {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--sparc-space-3);
  }

  :global(.sparc-group[data-sparc-glue="intro-feedback"] > .sparc-group-body > .sparc-text-block),
  :global(.sparc-group[data-sparc-glue="intro-feedback"] > .sparc-group-body > .sparc-html-block),
  :global(.sparc-group-intro-feedback-row > .sparc-group-body > .sparc-text-block),
  :global(.sparc-group-intro-feedback-row > .sparc-group-body > .sparc-html-block) {
    flex: var(--sparc-primary-flex-grow) 1 var(--sparc-answer-list-width);
  }

  :global(.sparc-group[data-sparc-glue="intro-feedback"] > .sparc-group-body > .sparc-group-feedback-panel),
  :global(.sparc-group-intro-feedback-row > .sparc-group-body > .sparc-group-feedback-panel) {
    flex: 1 1 var(--sparc-feedback-width-min);
    max-width: var(--sparc-feedback-width-max);
  }

  :global(.sparc-group[data-sparc-glue="intro-feedback"] .sparc-message-box),
  :global(.sparc-group-intro-feedback-row .sparc-message-box) {
    width: 100%;
    min-width: 0;
    height: 100%;
  }

  .sparc-group[data-sparc-visual-preset="example"],
  .sparc-group-oli-example {
    border: var(--sparc-border-width) solid var(--sparc-border-color);
    border-radius: var(--sparc-border-radius-sm);
    padding: var(--sparc-space-3);
    background: color-mix(in srgb, var(--sparc-accent-color) 6%, var(--sparc-control-surface-color));
  }

  .sparc-group[data-sparc-visual-preset="example"] > .sparc-group-body,
  .sparc-group-oli-example > .sparc-group-body {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    justify-content: flex-start;
  }

  :global(.sparc-group[data-sparc-visual-preset="example"] > .sparc-group-body > .sparc-html-block:first-child),
  :global(.sparc-group[data-sparc-visual-preset="example"] > .sparc-group-body > .sparc-text-block:first-child),
  :global(.sparc-group-oli-example > .sparc-group-body > .sparc-html-block:first-child),
  :global(.sparc-group-oli-example > .sparc-group-body > .sparc-text-block:first-child) {
    font-weight: var(--app-font-weight-bold, 700);
  }

  .sparc-group-choice-tabs {
    width: 100%;
  }

  .sparc-group-choice-tabs > .sparc-group-body {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--sparc-space-3);
  }

  .sparc-choice-tabs,
  .sparc-panel-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sparc-space-1);
    border-bottom: var(--sparc-border-width) solid var(--sparc-border-color);
  }

  .sparc-choice-tab,
  .sparc-panel-tab {
    border: var(--sparc-border-width) solid transparent;
    border-bottom: 0;
    border-radius: var(--sparc-border-radius-sm) var(--sparc-border-radius-sm) 0 0;
    padding: var(--sparc-space-2) var(--sparc-space-3);
    background: transparent;
    color: var(--sparc-secondary-text-color);
    cursor: pointer;
    font: inherit;
    font-weight: var(--app-font-weight-semibold, 600);
  }

  .sparc-choice-tab:hover,
  .sparc-panel-tab:hover {
    background: var(--app-state-hover-surface-color, color-mix(in srgb, var(--sparc-accent-color) 10%, transparent));
    color: var(--sparc-text-color);
  }

  .sparc-choice-tab.active,
  .sparc-panel-tab.active {
    border-color: var(--sparc-border-color);
    background: var(--sparc-control-surface-color);
    color: var(--sparc-text-color);
  }

  .sparc-panel-selector {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-space-3);
    width: 100%;
  }

  .sparc-panel-selector-label {
    color: var(--sparc-text-color);
    font-weight: var(--app-font-weight-semibold, 600);
  }

  .sparc-panel-selector-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-space-2);
    align-items: stretch;
    justify-content: flex-start;
    width: 100%;
  }

  .sparc-choice-tab-panel,
  :global(.sparc-choice-tab-panel > .sparc-group-alternative-panel),
  :global(.sparc-group-alternative-panel > .sparc-group-body) {
    width: 100%;
  }

  .sparc-group-alternative-panel > .sparc-group-body {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    justify-content: flex-start;
  }

  .sparc-group-activity-row,
  .sparc-group-remediation-panel,
  .sparc-group[data-sparc-glue="fill-in"] {
    width: min(100%, var(--sparc-multiple-choice-width));
  }

  .sparc-group-activity-row > .sparc-group-body,
  .sparc-group-remediation-panel > .sparc-group-body,
  .sparc-group[data-sparc-glue="fill-in"] > .sparc-group-body {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    justify-content: flex-start;
  }

  :global(.sparc-group-activity-row .sparc-text-block),
  :global(.sparc-group-activity-row .sparc-html-block),
  :global(.sparc-group-activity-row .sparc-input-text-input),
  :global(.sparc-group-remediation-panel .sparc-text-block),
  :global(.sparc-group-remediation-panel .sparc-html-block),
  :global(.sparc-group[data-sparc-glue="fill-in"] .sparc-text-block),
  :global(.sparc-group[data-sparc-glue="fill-in"] .sparc-html-block),
  :global(.sparc-group[data-sparc-glue="fill-in"] .sparc-input-text-input) {
    width: 100%;
    min-height: var(--app-text-input-height);
  }

  .sparc-group[data-sparc-visual-preset="dimensional-analysis"],
  .sparc-group-term-table {
    gap: var(--sparc-space-1);
    overflow-x: auto;
    padding-bottom: var(--sparc-space-1);
  }

  .sparc-group[data-sparc-visual-preset="dimensional-analysis"] > .sparc-group-body,
  .sparc-group-term-table > .sparc-group-body {
    display: grid;
    grid-template-columns:
      minmax(var(--sparc-term-column-width-wide), 1.05fr)
      minmax(var(--sparc-term-column-width-medium), 1.12fr)
      minmax(var(--sparc-term-column-width-narrow), 1fr)
      minmax(var(--sparc-term-column-width-narrow), 1fr)
      minmax(var(--sparc-term-column-width-medium), 1.12fr);
    gap: var(--sparc-space-2);
    align-items: end;
    min-width: var(--sparc-term-table-min-width);
  }

  .sparc-group-term-header-row {
    display: none;
  }

  .sparc-group[data-sparc-glue="term-column"],
  .sparc-group-term-row {
    gap: var(--sparc-space-1);
    min-width: 0;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-label),
  :global(.sparc-group-term-row > .sparc-group-label) {
    color: var(--sparc-heading-color);
    font-size: var(--sparc-font-size-small);
    line-height: 1.1;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body,
  .sparc-group-term-row > .sparc-group-body {
    display: grid;
    grid-template-columns: minmax(var(--sparc-term-value-width), 1fr) minmax(var(--sparc-term-unit-width), var(--sparc-term-unit-flex-ratio)) minmax(var(--sparc-term-substance-width), 1fr) var(--sparc-term-cancel-width);
    grid-template-areas:
      "numValue numUnits numSubstance numCancel"
      "denValue denUnits denSubstance denCancel"
      "reason reason reason reason";
    gap: var(--sparc-space-1);
    align-items: center;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(1)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(1)) {
    display: none;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(2)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(2)) {
    grid-area: reason;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(3)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(3)) {
    grid-area: numValue;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(4)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(4)) {
    grid-area: numUnits;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(5)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(5)) {
    grid-area: numSubstance;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(6)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(6)) {
    grid-area: numCancel;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(7)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(7)) {
    grid-area: denValue;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(8)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(8)) {
    grid-area: denUnits;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(9)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(9)) {
    grid-area: denSubstance;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(10)),
  :global(.sparc-group-term-row > .sparc-group-body > :nth-child(10)) {
    grid-area: denCancel;
  }

  :global(.sparc-group[data-sparc-glue="term-column"] .sparc-text),
  :global(.sparc-group-term-row .sparc-text) {
    text-align: center;
    font-weight: 700;
  }

  :global(.sparc-group-result-row > .sparc-group-label),
  :global(.sparc-group-term-row:nth-last-child(1) > .sparc-group-label) {
    text-align: left;
  }

  .sparc-group[data-sparc-visual-preset="corner-hint"],
  .sparc-group-hint-panel {
    position: relative;
    min-height: var(--sparc-hint-min-height);
    padding-top: var(--sparc-space-1);
  }

  .sparc-group[data-sparc-visual-preset="corner-hint"] > .sparc-group-header,
  .sparc-group-hint-panel > .sparc-group-header {
    display: none;
  }

  .sparc-group[data-sparc-visual-preset="corner-hint"] > .sparc-group-body,
  .sparc-group-hint-panel > .sparc-group-body {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
  }

  :global(.sparc-group[data-sparc-visual-preset="corner-hint"] .sparc-button-yellow),
  :global(.sparc-group-hint-panel .sparc-button-yellow) {
    min-width: var(--sparc-hint-button-min-width);
    border-color: var(--sparc-primary-action-surface-color);
    border-radius: 0 0 0 var(--sparc-border-radius-lg);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--sparc-primary-action-surface-color) 14%, var(--sparc-control-surface-color)) 0%,
      var(--sparc-primary-action-surface-color) 70%
    );
    color: var(--sparc-primary-action-text-color);
    justify-self: end;
  }

  .sparc-group[data-sparc-glue="footer-actions"] > .sparc-group-header,
  .sparc-group-action-row > .sparc-group-header {
    display: none;
  }

  .sparc-group[data-sparc-glue="footer-actions"] > .sparc-group-body,
  .sparc-group-action-row > .sparc-group-body {
    justify-content: flex-end;
  }

  .sparc-group[data-sparc-glue="answer-list"] > .sparc-group-body,
  .sparc-group-answer-list > .sparc-group-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sparc-space-2);
  }

  :global(.sparc-group[data-sparc-glue="answer-list"] .sparc-button),
  :global(.sparc-group-answer-list .sparc-button) {
    width: min(100%, var(--sparc-answer-list-width));
    text-align: center;
  }

  .sparc-group-table-layout,
  .sparc-group-table-header-row,
  .sparc-group-table-row,
  .sparc-group-result-row,
  .sparc-group-reason-row {
    width: 100%;
  }

  .sparc-group-table-layout > .sparc-group-body {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
  }

  .sparc-group-table-header-row > .sparc-group-body,
  .sparc-group-table-row > .sparc-group-body,
  .sparc-group-result-row > .sparc-group-body,
  .sparc-group-reason-row > .sparc-group-body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(var(--sparc-table-column-min-width), 1fr));
    align-items: stretch;
  }

  .sparc-fraction {
    display: inline-flex;
    flex-direction: column;
    align-items: stretch;
    min-width: var(--sparc-fraction-min-width);
  }

  .sparc-fraction-divider {
    border-top: var(--app-space-1-px) solid var(--sparc-text-color);
    margin: var(--sparc-space-1) 0;
  }

  .sparc-atom {
    box-sizing: border-box;
  }

  .sparc-authoring-inline-edit {
    cursor: text;
    min-width: 2.5rem;
    min-height: calc(var(--sparc-control-line-height) * 1em + (var(--sparc-control-padding-y) * 2));
  }

  .sparc-authoring-inline-edit:focus {
    outline: 2px solid var(--sparc-accent-color);
    outline-offset: 2px;
  }

  .sparc-text-block,
  .sparc-html-block,
  .sparc-text,
  .sparc-header-cell,
  .sparc-message-box,
  .sparc-fraction-box,
  .sparc-input,
  .sparc-select,
  .sparc-button {
    border: var(--sparc-border-width) solid var(--sparc-border-color);
    border-radius: var(--sparc-border-radius-sm);
    padding: var(--sparc-control-padding-y) var(--sparc-control-padding-x);
    background: var(--sparc-control-surface-color);
    color: var(--sparc-text-color);
    font: inherit;
    line-height: var(--sparc-control-line-height);
  }

  .sparc-header-cell {
    font-weight: var(--app-font-weight-semibold, 600);
    text-align: center;
  }

  :global(.sparc-html-block p) {
    margin: 0 0 var(--sparc-space-2);
  }

  :global(.sparc-html-block p:last-child),
  :global(.sparc-message-box p:last-child) {
    margin-bottom: 0;
  }

  :global(.sparc-html-block .oli-definition),
  :global(.sparc-html-block .oli-callout),
  :global(.sparc-html-block .oli-popup),
  :global(.sparc-html-block .oli-embed),
  :global(.sparc-html-block .oli-missing-reference) {
    display: block;
    margin: 0 0 var(--sparc-space-3);
  }

  :global(.sparc-html-block .oli-definition) {
    border-left: calc(var(--sparc-border-width) * 3) solid var(--sparc-accent-color);
    padding-left: var(--sparc-space-3);
  }

  :global(.sparc-html-block blockquote) {
    margin: 0 0 var(--sparc-space-2);
    border-left: calc(var(--sparc-border-width) * 3) solid var(--sparc-accent-color);
    padding: var(--sparc-space-1) 0 var(--sparc-space-1) var(--sparc-space-3);
    color: var(--sparc-secondary-text-color);
  }

  :global(.sparc-html-block hr) {
    border: 0;
    border-top: var(--sparc-border-width) solid var(--sparc-border-color);
    margin: var(--sparc-space-3) 0;
  }

  :global(.sparc-html-block .oli-callout) {
    border-left: calc(var(--sparc-border-width) * 3) solid var(--sparc-primary-action-surface-color);
    padding-left: var(--sparc-space-3);
  }

  :global(.sparc-html-block .oli-missing-reference) {
    border-left: calc(var(--sparc-border-width) * 3) solid var(--sparc-error-color);
    padding: var(--sparc-space-2) 0 var(--sparc-space-2) var(--sparc-space-3);
    color: var(--sparc-error-color);
  }

  :global(.sparc-html-block .oli-popup summary) {
    cursor: pointer;
    color: var(--sparc-link-color);
    font-weight: var(--app-font-weight-bold, 700);
  }

  :global(.sparc-html-block .oli-embed iframe) {
    display: block;
    max-width: 100%;
    margin-inline: auto;
    border: var(--sparc-border-width) solid var(--sparc-border-color);
    border-radius: var(--sparc-border-radius-sm);
  }

  :global(.sparc-html-block figcaption) {
    margin-top: var(--sparc-space-1);
    color: var(--sparc-muted-text-color);
    font-size: calc(var(--sparc-font-size-base) * 0.9);
  }

  :global(.sparc-html-block ul),
  :global(.sparc-html-block ol) {
    margin: 0 0 var(--sparc-space-2);
    padding-left: 1.5rem;
  }

  :global(.sparc-html-block h1),
  :global(.sparc-html-block h2),
  :global(.sparc-html-block h3),
  :global(.sparc-html-block h4),
  :global(.sparc-html-block h5) {
    margin: 0 0 var(--sparc-space-2);
    color: var(--sparc-heading-color);
    line-height: 1.2;
  }

  :global(.sparc-html-block h1) {
    font-size: calc(var(--sparc-font-size-base) * 1.35);
  }

  :global(.sparc-html-block h2) {
    font-size: calc(var(--sparc-font-size-base) * 1.2);
  }

  :global(.sparc-html-block h3),
  :global(.sparc-html-block h4),
  :global(.sparc-html-block h5) {
    font-size: calc(var(--sparc-font-size-base) * 1.05);
  }

  :global(.sparc-html-block code) {
    border-radius: var(--sparc-border-radius-sm);
    padding: 0 var(--sparc-space-1);
    background: color-mix(in srgb, var(--sparc-text-color) 8%, var(--sparc-control-surface-color));
    font-family: var(--sparc-monospace-font-family);
    font-size: 0.95em;
  }

  :global(.sparc-html-block pre) {
    margin: 0 0 var(--sparc-space-2);
    overflow-x: auto;
    border: var(--sparc-border-width) solid var(--sparc-border-color);
    border-radius: var(--sparc-border-radius-sm);
    padding: var(--sparc-space-3);
    background: color-mix(in srgb, var(--sparc-text-color) 6%, var(--sparc-control-surface-color));
  }

  :global(.sparc-html-block pre code) {
    display: block;
    padding: 0;
    background: transparent;
    white-space: pre-wrap;
  }

  :global(.sparc-html-block table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 var(--sparc-space-2);
    table-layout: fixed;
  }

  :global(.sparc-html-block th),
  :global(.sparc-html-block td) {
    border: var(--sparc-border-width) solid var(--sparc-border-color);
    padding: var(--sparc-space-1) var(--sparc-space-2);
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }

  :global(.sparc-html-block th) {
    background: color-mix(in srgb, var(--sparc-text-color) 7%, var(--sparc-control-surface-color));
    font-weight: var(--app-font-weight-semibold, 600);
  }

  :global(.sparc-html-block [data-sparc-callout]) {
    margin: var(--sparc-space-3) 0;
    padding: var(--sparc-space-2) var(--sparc-space-3);
    border: var(--sparc-border-width) solid var(--sparc-border-color);
    border-left-width: 4px;
    border-radius: var(--sparc-border-radius-sm);
    background: color-mix(in srgb, var(--sparc-text-color) 5%, var(--sparc-control-surface-color));
  }

  :global(.sparc-html-block [data-sparc-callout="correct"]) {
    border-left-color: var(--sparc-correct-color);
  }

  :global(.sparc-html-block [data-sparc-callout="warning"]) {
    border-left-color: var(--sparc-warning-color);
  }

  :global(.sparc-html-block [data-sparc-callout="error"]) {
    border-left-color: var(--sparc-error-color);
  }

  :global(.sparc-html-block [data-align="left"]),
  :global(.sparc-html-block .sparc-align-left) {
    text-align: left;
  }

  :global(.sparc-html-block [data-align="center"]),
  :global(.sparc-html-block .sparc-align-center) {
    text-align: center;
  }

  :global(.sparc-html-block [data-align="right"]),
  :global(.sparc-html-block .sparc-align-right) {
    text-align: right;
  }

  :global(.sparc-html-block [data-align="justify"]),
  :global(.sparc-html-block .sparc-align-justify) {
    text-align: justify;
  }

  :global(.sparc-html-block .sparc-color-accent) {
    color: var(--sparc-accent-color);
  }

  :global(.sparc-html-block .sparc-color-correct) {
    color: var(--sparc-correct-color);
  }

  :global(.sparc-html-block .sparc-color-warning) {
    color: var(--sparc-warning-color);
  }

  :global(.sparc-html-block .sparc-color-error) {
    color: var(--sparc-error-color);
  }

  :global(.sparc-html-block .sparc-color-muted) {
    color: var(--sparc-muted-text-color);
  }

  :global(.sparc-html-block mark),
  :global(.sparc-html-block .sparc-highlight) {
    border-radius: var(--sparc-border-radius-sm);
    padding: 0 var(--sparc-space-1);
    background: color-mix(in srgb, var(--sparc-warning-color) 24%, var(--sparc-control-surface-color));
    color: var(--sparc-text-color);
  }

  :global(.sparc-html-block ul[data-type="taskList"]) {
    list-style: none;
    padding-left: 0;
  }

  :global(.sparc-html-block li[data-type="taskItem"]) {
    display: flex;
    align-items: flex-start;
    gap: var(--sparc-space-2);
  }

  :global(.sparc-html-block li[data-type="taskItem"] input[type="checkbox"]) {
    margin-top: 0.35em;
    pointer-events: none;
  }

  :global(.sparc-html-block a),
  :global(.sparc-message-box a) {
    color: var(--sparc-link-color);
  }

  :global(.sparc-html-block img) {
    display: block;
    max-width: 100%;
    height: auto;
    margin-inline: auto;
  }

  .sparc-operator {
    color: var(--sparc-text-color);
    font-size: calc(var(--sparc-font-size-base) * 1.25);
    font-weight: var(--app-font-weight-bold, 700);
    min-width: var(--sparc-operator-min-width);
    text-align: center;
  }

  .sparc-input,
  .sparc-select {
    width: 100%;
    height: var(--app-text-input-height);
    min-height: var(--app-text-input-height);
    border-width: calc(var(--sparc-border-width) * 3);
    outline: none;
    box-shadow: none;
  }

  .sparc-input:focus,
  .sparc-select:focus,
  .sparc-button:focus {
    outline: none;
    box-shadow: none;
  }

  .sparc-input.sparc-correctness-correct,
  .sparc-select.sparc-correctness-correct,
  .sparc-input.sparc-correctness-correct:focus,
  .sparc-select.sparc-correctness-correct:focus {
    color: var(--sparc-correct-color);
    border: calc(var(--sparc-border-width) * 3) solid var(--sparc-correct-color);
  }

  .sparc-input.sparc-correctness-incorrect,
  .sparc-select.sparc-correctness-incorrect,
  .sparc-input.sparc-correctness-incorrect:focus,
  .sparc-select.sparc-correctness-incorrect:focus {
    color: var(--sparc-error-color);
    border: calc(var(--sparc-border-width) * 3) solid var(--sparc-error-color);
  }

  .sparc-checkbox.sparc-correctness-correct {
    box-shadow: 0 0 var(--sparc-feedback-glow-radius) 0 var(--sparc-correct-color);
  }

  .sparc-checkbox.sparc-correctness-incorrect,
  .sparc-checkbox.sparc-correctness-buggy {
    box-shadow: 0 0 var(--sparc-feedback-glow-radius) 0 var(--sparc-error-color);
  }

  .sparc-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: var(--app-text-input-height);
  }

  .sparc-message-box {
    min-width: var(--sparc-message-min-width);
    min-height: var(--app-text-input-height);
  }

  .sparc-skill-bar {
    display: grid;
    grid-template-columns: minmax(var(--sparc-skill-track-min-width), var(--sparc-skill-track-max-width)) max-content;
    gap: var(--sparc-space-2);
    align-items: center;
    min-width: var(--sparc-skill-bar-min-width);
  }

  .sparc-skill-track {
    height: var(--sparc-skill-track-height);
    border: var(--sparc-border-width) solid var(--sparc-border-color);
    border-radius: var(--sparc-border-radius-pill);
    background: var(--sparc-control-surface-color);
    overflow: hidden;
  }

  .sparc-skill-fill {
    height: 100%;
    background: var(--sparc-warning-color);
  }

  .sparc-skill-label {
    color: var(--sparc-secondary-text-color);
    font-size: calc(var(--sparc-font-size-base) * 0.8);
    line-height: 1.1;
  }

  .sparc-learning-progress {
    --progress-border-color: var(--sparc-border-color);
    --progress-muted-bar: color-mix(in srgb, var(--sparc-control-surface-color) 82%, var(--sparc-surface-color));
    --progress-target-color: var(--sparc-correct-color);
    --progress-below-color: var(--sparc-warning-color);
    --progress-bar-density-scale: max(0.5, min(var(--app-density-scale), 2));
    --progress-bar-height: calc(6px * var(--progress-bar-density-scale));
    --progress-bar-gap: calc(3px * var(--progress-bar-density-scale));
    --progress-scrollbar-gutter: 0px;
    --progress-panel-padding-x: 0px;
    --progress-panel-padding-y: 0px;
    --progress-panel-gap: var(--sparc-space-1);

    display: flex;
    flex-direction: column;
    gap: var(--sparc-space-1);
    width: min(100%, var(--sparc-skill-track-max-width));
    min-width: var(--sparc-skill-track-min-width);
    border: var(--sparc-border-width) solid var(--sparc-border-color);
    border-radius: var(--sparc-border-radius-sm);
    padding: var(--sparc-space-2);
    background: var(--sparc-control-surface-color);
  }

  .sparc-learning-progress-label {
    color: var(--sparc-secondary-text-color);
    font-size: calc(var(--sparc-font-size-base) * 0.8);
    font-weight: var(--app-font-weight-semibold, 600);
    line-height: 1.1;
  }

  .sparc-button {
    cursor: pointer;
    font-weight: var(--app-font-weight-semibold, 600);
    min-height: var(--app-text-input-height);
  }

  .sparc-button:hover {
    background: var(--app-state-hover-surface-color, color-mix(in srgb, var(--sparc-accent-color) 12%, var(--sparc-control-surface-color)));
  }

  .sparc-button-green,
  .sparc-button.sparc-correctness-correct {
    background: color-mix(in srgb, var(--sparc-correct-color) 14%, var(--sparc-control-surface-color));
    border-color: var(--sparc-correct-color);
  }

  .sparc-button-yellow {
    background: color-mix(in srgb, var(--sparc-warning-color) 18%, var(--sparc-control-surface-color));
  }

  .sparc-button.sparc-correctness-incorrect {
    background: color-mix(in srgb, var(--sparc-error-color) 12%, var(--sparc-control-surface-color));
    border-color: var(--sparc-error-color);
  }

  .sparc-style-green {
    background: color-mix(in srgb, var(--sparc-correct-color) 10%, var(--sparc-control-surface-color));
  }
</style>
