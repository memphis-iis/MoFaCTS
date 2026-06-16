<script>
  export let node;
  export let nodeValues = {};
  export let onNodeValueChange = () => {};
  export let onNodeCommit = () => {};
  export let onNodeFocus = () => {};
  export let onButtonActivate = () => {};

  const FRACTION_ATOM_TYPES = new Set(['fraction-box', 'fraction-input']);

  function sortByPlacementOrder(values = []) {
    return values.slice().sort((left, right) => {
      const leftOrder = Number(left?.placement?.order ?? 0);
      const rightOrder = Number(right?.placement?.order ?? 0);
      return leftOrder - rightOrder;
    });
  }

  function isFractionAtom(candidate) {
    return candidate?.nodeType === 'atomic' && FRACTION_ATOM_TYPES.has(candidate?.atomType);
  }

  function buildRenderItems(children = []) {
    const items = [];
    const orderedChildren = sortByPlacementOrder(children);
    for (let index = 0; index < orderedChildren.length; index += 1) {
      const current = orderedChildren[index];
      const next = orderedChildren[index + 1];
      if (isFractionAtom(current) && current?.position === 'top' && isFractionAtom(next) && next?.position === 'bottom') {
        items.push({ kind: 'fraction', top: current, bottom: next, key: `${current.id}-${next.id}` });
        index += 1;
      } else {
        items.push({ kind: 'node', node: current, key: current?.id || `node-${index}` });
      }
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

  function buttonLabel(candidate) {
    return String(candidate?.label || candidate?.value || '').trim();
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

  $: headerFeedbackNode = node?.nodeType === 'group'
    ? (node.children || []).find(isHeaderFeedbackNode)
    : null;
  $: bodyChildren = node?.nodeType === 'group'
    ? (node.children || []).filter((child) => !isHeaderFeedbackNode(child))
    : [];
  $: renderItems = node?.nodeType === 'group' ? buildRenderItems(bodyChildren) : [];
</script>

{#if node?.nodeType === 'group'}
  <div
    class={`sparc-group sparc-group-${node.groupType || 'generic'}`}
    data-node-id={node.id}
    data-sparc-layout-mode={layoutString(node, 'layoutMode')}
    data-sparc-visual-preset={layoutString(node, 'visualPreset')}
    data-sparc-glue={glueString(node)}
  >
    {#if node.label || headerFeedbackNode}
      <div class="sparc-group-header">
        {#if node.label}
          <div class="sparc-group-label">{node.label}</div>
        {/if}
        {#if headerFeedbackNode}
          <div class="sparc-group-header-feedback">
            <svelte:self
              node={headerFeedbackNode}
              {nodeValues}
              {onNodeValueChange}
              {onNodeCommit}
              {onNodeFocus}
              {onButtonActivate}
            />
          </div>
        {/if}
      </div>
    {/if}
    <div class="sparc-group-body">
      {#each renderItems as item (item.key)}
        {#if item.kind === 'fraction'}
          <div class="sparc-fraction">
            <div class="sparc-fraction-top">
              <svelte:self
                node={item.top}
                {nodeValues}
                {onNodeValueChange}
                {onNodeCommit}
                {onNodeFocus}
                {onButtonActivate}
              />
            </div>
            <div class="sparc-fraction-divider"></div>
            <div class="sparc-fraction-bottom">
              <svelte:self
                node={item.bottom}
                {nodeValues}
                {onNodeValueChange}
                {onNodeCommit}
                {onNodeFocus}
                {onButtonActivate}
              />
            </div>
          </div>
        {:else}
          <svelte:self
            node={item.node}
            {nodeValues}
            {onNodeValueChange}
            {onNodeCommit}
            {onNodeFocus}
            {onButtonActivate}
          />
        {/if}
      {/each}
    </div>
  </div>
{:else if node?.nodeType === 'atomic'}
  {#if node.atomType === 'text-block' || node.atomType === 'text' || node.atomType === 'header-cell'}
    <div class={`sparc-atom sparc-${node.atomType}`} data-node-id={node.id}>{getNodeValue(node)}</div>
  {:else if node.atomType === 'message-box'}
    <div class="sparc-atom sparc-message-box" data-node-id={node.id}>{getNodeValue(node)}</div>
  {:else if node.atomType === 'skill-bar'}
    <div class="sparc-atom sparc-skill-bar" data-node-id={node.id} aria-label={node.label || ''}>
      <div class="sparc-skill-track">
        <div class="sparc-skill-fill" style={`width: ${skillBarFill(node)}%;`}></div>
      </div>
      {#if node.label}
        <span class="sparc-skill-label">{node.label}</span>
      {/if}
    </div>
  {:else if node.atomType === 'operator'}
    <div class="sparc-atom sparc-operator" data-node-id={node.id}>{node.value || ''}</div>
  {:else if node.atomType === 'fraction-box'}
    <div class={`sparc-atom sparc-fraction-box ${node.style ? `sparc-style-${node.style}` : ''}`} data-node-id={node.id}>{getNodeValue(node)}</div>
  {:else if node.atomType === 'fraction-input' || node.atomType === 'text-input'}
    <input
      class={`sparc-atom sparc-input sparc-input-${node.atomType}`}
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
    <label class={`sparc-atom sparc-checkbox ${correctnessClass(node)}`} data-node-id={node.id}>
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
      class:sparc-correctness-correct={getNodeCorrectness(node) === 'correct'}
      class:sparc-correctness-incorrect={getNodeCorrectness(node) === 'incorrect' || getNodeCorrectness(node) === 'buggy'}
      data-node-id={node.id}
      on:click={() => onButtonActivate(node)}
    >
      {buttonLabel(node)}
    </button>
  {:else}
    <div class="sparc-atom sparc-unknown" data-node-id={node.id}>{node.atomType || 'unknown'}</div>
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

  .sparc-group-header .sparc-group-label {
    flex: 0 1 auto;
  }

  .sparc-group-header-feedback {
    flex: 0 0 calc(var(--sparc-feedback-width-max) / 5);
    min-width: calc(var(--sparc-feedback-width-min) / 5);
  }

  .sparc-group-header-feedback .sparc-message-box {
    width: 100%;
    min-width: 0;
    text-align: center;
  }

  .sparc-group-body {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sparc-space-2);
  }

  .sparc-group-text-panel {
    gap: var(--sparc-space-1);
  }

  .sparc-group-text-panel > .sparc-group-label,
  .sparc-group[data-sparc-visual-preset="dimensional-analysis"] > .sparc-group-label,
  .sparc-group-term-table > .sparc-group-label {
    color: var(--sparc-heading-color);
    font-size: calc(var(--sparc-font-size-base) * 0.95);
  }

  .sparc-group-text-panel .sparc-text-block,
  .sparc-group[data-sparc-visual-preset="corner-hint"] .sparc-text-block,
  .sparc-group-hint-panel .sparc-text-block {
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

  .sparc-group[data-sparc-glue="multiple-choice"] > .sparc-group-body > .sparc-text-block,
  .sparc-group-multiple-choice > .sparc-group-body > .sparc-text-block {
    width: 100%;
    text-align: left;
  }

  .sparc-group[data-sparc-glue="multiple-choice"] > .sparc-group-body > .sparc-group-answer-list,
  .sparc-group-multiple-choice > .sparc-group-body > .sparc-group-answer-list {
    width: min(100%, var(--sparc-answer-list-width));
    align-self: center;
    align-items: stretch;
  }

  .sparc-group[data-sparc-glue="intro-feedback"] > .sparc-group-body,
  .sparc-group-intro-feedback-row > .sparc-group-body {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: var(--sparc-space-3);
  }

  .sparc-group[data-sparc-glue="intro-feedback"] > .sparc-group-body > .sparc-text-block,
  .sparc-group-intro-feedback-row > .sparc-group-body > .sparc-text-block {
    flex: var(--sparc-primary-flex-grow) 1 var(--sparc-answer-list-width);
  }

  .sparc-group[data-sparc-glue="intro-feedback"] > .sparc-group-body > .sparc-group-feedback-panel,
  .sparc-group-intro-feedback-row > .sparc-group-body > .sparc-group-feedback-panel {
    flex: 1 1 var(--sparc-feedback-width-min);
    max-width: var(--sparc-feedback-width-max);
  }

  .sparc-group[data-sparc-glue="intro-feedback"] .sparc-message-box,
  .sparc-group-intro-feedback-row .sparc-message-box {
    width: 100%;
    min-width: 0;
    height: 100%;
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
  }

  .sparc-group-activity-row .sparc-text-block,
  .sparc-group-activity-row .sparc-input-text-input,
  .sparc-group-remediation-panel .sparc-text-block,
  .sparc-group[data-sparc-glue="fill-in"] .sparc-text-block,
  .sparc-group[data-sparc-glue="fill-in"] .sparc-input-text-input {
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

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-label,
  .sparc-group-term-row > .sparc-group-label {
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

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(1),
  .sparc-group-term-row > .sparc-group-body > :nth-child(1) {
    display: none;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(2),
  .sparc-group-term-row > .sparc-group-body > :nth-child(2) {
    grid-area: reason;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(3),
  .sparc-group-term-row > .sparc-group-body > :nth-child(3) {
    grid-area: numValue;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(4),
  .sparc-group-term-row > .sparc-group-body > :nth-child(4) {
    grid-area: numUnits;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(5),
  .sparc-group-term-row > .sparc-group-body > :nth-child(5) {
    grid-area: numSubstance;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(6),
  .sparc-group-term-row > .sparc-group-body > :nth-child(6) {
    grid-area: numCancel;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(7),
  .sparc-group-term-row > .sparc-group-body > :nth-child(7) {
    grid-area: denValue;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(8),
  .sparc-group-term-row > .sparc-group-body > :nth-child(8) {
    grid-area: denUnits;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(9),
  .sparc-group-term-row > .sparc-group-body > :nth-child(9) {
    grid-area: denSubstance;
  }

  .sparc-group[data-sparc-glue="term-column"] > .sparc-group-body > :nth-child(10),
  .sparc-group-term-row > .sparc-group-body > :nth-child(10) {
    grid-area: denCancel;
  }

  .sparc-group[data-sparc-glue="term-column"] .sparc-text,
  .sparc-group-term-row .sparc-text {
    text-align: center;
    font-weight: 700;
  }

  .sparc-group-result-row > .sparc-group-label,
  .sparc-group-term-row:nth-last-child(1) > .sparc-group-label {
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

  .sparc-group[data-sparc-visual-preset="corner-hint"] .sparc-button-yellow,
  .sparc-group-hint-panel .sparc-button-yellow {
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

  .sparc-group[data-sparc-glue="answer-list"] .sparc-button,
  .sparc-group-answer-list .sparc-button {
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

  .sparc-text-block,
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
  }

  .sparc-input.sparc-correctness-correct,
  .sparc-select.sparc-correctness-correct {
    color: var(--sparc-correct-color);
    border-color: var(--sparc-correct-color);
  }

  .sparc-input.sparc-correctness-incorrect,
  .sparc-select.sparc-correctness-incorrect {
    color: var(--sparc-error-color);
    border-color: var(--sparc-error-color);
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
