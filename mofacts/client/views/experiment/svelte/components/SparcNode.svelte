<script>
  export let node;
  export let nodeValues = {};
  export let onNodeValueChange = () => {};
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

  function updateNodeValue(candidate, nextValue) {
    if (!candidate?.id || candidate?.readOnly) {
      return;
    }
    onNodeValueChange(candidate.id, nextValue);
  }

  function buttonLabel(candidate) {
    return String(candidate?.label || candidate?.value || '').trim();
  }

  $: renderItems = node?.nodeType === 'group' ? buildRenderItems(node.children || []) : [];
</script>

{#if node?.nodeType === 'group'}
  <div class={`sparc-group sparc-group-${node.groupType || 'generic'}`} data-node-id={node.id}>
    {#if node.label}
      <div class="sparc-group-label">{node.label}</div>
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
                {onButtonActivate}
              />
            </div>
            <div class="sparc-fraction-divider"></div>
            <div class="sparc-fraction-bottom">
              <svelte:self
                node={item.bottom}
                {nodeValues}
                {onNodeValueChange}
                {onButtonActivate}
              />
            </div>
          </div>
        {:else}
          <svelte:self
            node={item.node}
            {nodeValues}
            {onNodeValueChange}
            {onButtonActivate}
          />
        {/if}
      {/each}
    </div>
  </div>
{:else if node?.nodeType === 'atomic'}
  {#if node.atomType === 'text-block' || node.atomType === 'text' || node.atomType === 'header-cell'}
    <div class={`sparc-atom sparc-${node.atomType}`}>{node.value || ''}</div>
  {:else if node.atomType === 'operator'}
    <div class="sparc-atom sparc-operator">{node.value || ''}</div>
  {:else if node.atomType === 'fraction-box'}
    <div class={`sparc-atom sparc-fraction-box ${node.style ? `sparc-style-${node.style}` : ''}`}>{getNodeValue(node)}</div>
  {:else if node.atomType === 'fraction-input' || node.atomType === 'text-input'}
    <input
      class={`sparc-atom sparc-input sparc-input-${node.atomType}`}
      type="text"
      value={getNodeValue(node)}
      maxlength={node.maxlength}
      placeholder={node.hint || ''}
      readonly={node.readOnly === true}
      on:input={(event) => updateNodeValue(node, event.currentTarget.value)}
    />
  {:else if node.atomType === 'dropdown'}
    <select
      class="sparc-atom sparc-select"
      disabled={node.readOnly === true}
      value={getNodeValue(node)}
      on:change={(event) => updateNodeValue(node, event.currentTarget.value)}
    >
      {#each node.options || [] as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
  {:else if node.atomType === 'checkbox'}
    <label class="sparc-atom sparc-checkbox">
      <input
        type="checkbox"
        checked={Boolean(getNodeValue(node))}
        disabled={node.readOnly === true}
        on:change={(event) => updateNodeValue(node, event.currentTarget.checked)}
      />
    </label>
  {:else if node.atomType === 'button'}
    <button
      type="button"
      class={`sparc-atom sparc-button ${node.variant ? `sparc-button-${node.variant}` : ''}`}
      on:click={() => onButtonActivate(node)}
    >
      {buttonLabel(node)}
    </button>
  {:else}
    <div class="sparc-atom sparc-unknown">{node.atomType || 'unknown'}</div>
  {/if}
{/if}

<style>
  .sparc-group {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sparc-group-label {
    font-weight: 600;
    color: var(--app-text-color);
  }

  .sparc-group-body {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
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
    grid-template-columns: repeat(auto-fit, minmax(4.5rem, 1fr));
    align-items: stretch;
  }

  .sparc-fraction {
    display: inline-flex;
    flex-direction: column;
    align-items: stretch;
    min-width: 3.5rem;
  }

  .sparc-fraction-divider {
    border-top: 2px solid var(--app-text-color);
    margin: 0.125rem 0;
  }

  .sparc-atom {
    box-sizing: border-box;
  }

  .sparc-text-block,
  .sparc-text,
  .sparc-header-cell,
  .sparc-fraction-box,
  .sparc-input,
  .sparc-select,
  .sparc-button {
    border: 1px solid var(--app-secondary-surface-color);
    border-radius: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: var(--app-surface-color, #fff);
  }

  .sparc-header-cell {
    font-weight: 600;
    text-align: center;
  }

  .sparc-operator {
    font-size: 1.25rem;
    font-weight: 700;
    min-width: 1.5rem;
    text-align: center;
  }

  .sparc-input,
  .sparc-select {
    width: 100%;
  }

  .sparc-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2.5rem;
  }

  .sparc-button {
    cursor: pointer;
    font-weight: 600;
  }

  .sparc-button-green {
    background: #dff5dd;
  }

  .sparc-button-yellow {
    background: #fff3c4;
  }

  .sparc-style-green {
    background: #e7f6e7;
  }
</style>