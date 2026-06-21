<script>
  import { stringifyLooseValue } from './sparcAuthoringEditPrimitives';

  export let expression = null;
  export let label = 'Expression';
  export let ruleExpressionTypes = [];
  export let functionNames = [];
  export let onUpdateRuleExpression = () => {};
  export let onAddExpressionArg = () => {};
  export let onRemoveExpressionArg = () => {};
</script>

{#if expression}
  <div class="sparc-expression-editor">
    <div class="sparc-panel-header">
      <h4>{label}</h4>
      <select value={expression.type} on:change={(event) => onUpdateRuleExpression(expression, 'type', event.currentTarget.value)}>
        {#each ruleExpressionTypes as type}
          <option value={type}>{type}</option>
        {/each}
      </select>
    </div>
    {#if expression.type === 'literal'}
      <label>
        Literal Value
        <input value={stringifyLooseValue(expression.value)} on:input={(event) => onUpdateRuleExpression(expression, 'value', event.currentTarget.value)} />
      </label>
    {:else if expression.type === 'variable'}
      <label>
        Variable Name
        <input value={expression.name || ''} on:input={(event) => onUpdateRuleExpression(expression, 'name', event.currentTarget.value)} />
      </label>
    {:else if expression.type === 'function'}
      <label>
        Function
        <select value={expression.name} on:change={(event) => onUpdateRuleExpression(expression, 'name', event.currentTarget.value)}>
          {#each functionNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </label>
      <div class="sparc-panel-header">
        <h4>Arguments</h4>
        <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onAddExpressionArg(expression)}>Add Argument</button>
      </div>
      {#each expression.args || [] as arg, argIndex}
        <div class="sparc-nested-rule-card">
          <div class="sparc-inline-actions">
            <strong>Argument {argIndex + 1}</strong>
            <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveExpressionArg(expression, argIndex)}>Remove</button>
          </div>
          <svelte:self
            expression={arg}
            label={`Argument ${argIndex + 1}`}
            {ruleExpressionTypes}
            {functionNames}
            {onUpdateRuleExpression}
            {onAddExpressionArg}
            {onRemoveExpressionArg}
          />
        </div>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .sparc-expression-editor,
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
</style>
