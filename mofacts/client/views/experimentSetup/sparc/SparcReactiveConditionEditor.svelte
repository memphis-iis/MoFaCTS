<script>
  import { stringifyLooseValue } from './sparcAuthoringEditPrimitives';

  export let condition = null;
  export let label = 'Condition';
  export let reactiveConditionTypes = [];
  export let reactiveComparisonOps = [];
  export let onChangeReactiveCondition = () => {};
  export let onUpdateReactiveCondition = () => {};
  export let onAddReactiveConditionChild = () => {};
  export let onRemoveReactiveConditionChild = () => {};
  export let ensureNegatedReactiveCondition = () => null;
</script>

{#if condition}
  <div class="sparc-condition-editor">
    <div class="sparc-panel-header">
      <h4>{label}</h4>
      <select value={condition.type} on:change={(event) => onChangeReactiveCondition(condition, event.currentTarget.value)}>
        {#each reactiveConditionTypes as type}
          <option value={type}>{type}</option>
        {/each}
      </select>
    </div>
    {#if condition.type === 'state'}
      <div class="sparc-expression-grid">
        <label>
          Document
          <input value={condition.query?.target?.documentId || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.documentId', event.currentTarget.value)} />
        </label>
        <label>
          Node
          <input value={condition.query?.target?.nodeId || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.nodeId', event.currentTarget.value)} />
        </label>
      </div>
      <label>
        Key
        <input value={condition.query?.key || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.key', event.currentTarget.value)} />
      </label>
      <label>
        Compare
        <select value={condition.compare} on:change={(event) => onUpdateReactiveCondition(condition, 'compare', event.currentTarget.value)}>
          {#each reactiveComparisonOps as op}
            <option value={op}>{op}</option>
          {/each}
        </select>
      </label>
      <label>
        Value
        <input value={stringifyLooseValue(condition.value)} on:input={(event) => onUpdateReactiveCondition(condition, 'value', event.currentTarget.value)} />
      </label>
    {:else if condition.type === 'model'}
      <div class="sparc-expression-grid">
        <label>
          SPARC Document ID
          <input value={condition.query?.target?.sparcDocumentId || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.sparcDocumentId', event.currentTarget.value)} />
        </label>
        <label>
          SPARC Node ID
          <input value={condition.query?.target?.sparcNodeId || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.sparcNodeId', event.currentTarget.value)} />
        </label>
        <label>
          Stimuli Set ID
          <input value={condition.query?.target?.stimuliSetId || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.stimuliSetId', event.currentTarget.value)} />
        </label>
        <label>
          Stimulus KC
          <input value={condition.query?.target?.stimulusKC || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.stimulusKC', event.currentTarget.value)} />
        </label>
        <label>
          Cluster KC
          <input value={condition.query?.target?.clusterKC || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.clusterKC', event.currentTarget.value)} />
        </label>
        <label>
          KC ID
          <input value={condition.query?.target?.KCId || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.KCId', event.currentTarget.value)} />
        </label>
        <label>
          KC Default
          <input value={condition.query?.target?.KCDefault || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.KCDefault', event.currentTarget.value)} />
        </label>
        <label>
          KC Cluster
          <input value={condition.query?.target?.KCCluster || ''} on:input={(event) => onUpdateReactiveCondition(condition, 'query.target.KCCluster', event.currentTarget.value)} />
        </label>
      </div>
      <label>
        Metric
        <select value={condition.query?.metric || 'probability'} on:change={(event) => onUpdateReactiveCondition(condition, 'query.metric', event.currentTarget.value)}>
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
        <select value={condition.compare} on:change={(event) => onUpdateReactiveCondition(condition, 'compare', event.currentTarget.value)}>
          {#each reactiveComparisonOps as op}
            <option value={op}>{op}</option>
          {/each}
        </select>
      </label>
      <label>
        Value
        <input value={stringifyLooseValue(condition.value)} on:input={(event) => onUpdateReactiveCondition(condition, 'value', event.currentTarget.value)} />
      </label>
    {:else if condition.type === 'all' || condition.type === 'any'}
      <div class="sparc-panel-header">
        <h4>{condition.type === 'all' ? 'All Conditions' : 'Any Conditions'}</h4>
        <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onAddReactiveConditionChild(condition)}>Add Child</button>
      </div>
      {#each condition.conditions || [] as child, childIndex}
        <div class="sparc-nested-rule-card">
          <div class="sparc-inline-actions">
            <strong>Child {childIndex + 1}</strong>
            <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveReactiveConditionChild(condition, childIndex)}>Remove</button>
          </div>
          <svelte:self
            condition={child}
            label={`Child ${childIndex + 1}`}
            {reactiveConditionTypes}
            {reactiveComparisonOps}
            {onChangeReactiveCondition}
            {onUpdateReactiveCondition}
            {onAddReactiveConditionChild}
            {onRemoveReactiveConditionChild}
            {ensureNegatedReactiveCondition}
          />
        </div>
      {/each}
    {:else if condition.type === 'not'}
      <div class="sparc-nested-rule-card">
        <svelte:self
          condition={ensureNegatedReactiveCondition(condition)}
          label="Negated Condition"
          {reactiveConditionTypes}
          {reactiveComparisonOps}
          {onChangeReactiveCondition}
          {onUpdateReactiveCondition}
          {onAddReactiveConditionChild}
          {onRemoveReactiveConditionChild}
          {ensureNegatedReactiveCondition}
        />
      </div>
    {/if}
  </div>
{/if}

<style>
  .sparc-condition-editor,
  .sparc-nested-rule-card {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-panel-header,
  .sparc-inline-actions {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-sm);
    justify-content: space-between;
  }

  .sparc-inline-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .sparc-panel-header h4 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 0.95);
  }

  .sparc-expression-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-nested-rule-card {
    border-left: 3px solid var(--border-color);
    padding-left: var(--sparc-editor-gap-sm);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-xs);
    font-size: calc(var(--app-font-size-base) * 0.85);
  }

  input,
  select {
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-input-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }

  @media (max-width: 1000px) {
    .sparc-expression-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
