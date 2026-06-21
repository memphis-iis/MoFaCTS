<script>
  import { ensureTarget, stringifyLooseValue } from './sparcAuthoringEditPrimitives';
  import SparcReactiveConditionEditor from './SparcReactiveConditionEditor.svelte';

  export let reactiveRules = [];
  export let activeReactiveRuleIndex = 0;
  export let activeReactiveRule = null;
  export let reactiveConditionTypes = [];
  export let reactiveComparisonOps = [];
  export let onAddReactiveRule = () => {};
  export let onRemoveReactiveRule = () => {};
  export let onMoveReactiveRule = () => {};
  export let onUpdateReactiveRuleField = () => {};
  export let onSetReactiveCondition = () => {};
  export let onRemoveReactiveCondition = () => {};
  export let onChangeReactiveCondition = () => {};
  export let onUpdateReactiveCondition = () => {};
  export let onAddReactiveConditionChild = () => {};
  export let onRemoveReactiveConditionChild = () => {};
  export let ensureNegatedReactiveCondition = () => null;
  export let onAddReactiveWrite = () => {};
  export let onRemoveReactiveWrite = () => {};
  export let onUpdateStateWrite = () => {};
  export let onMarkChanged = () => {};
</script>

<section class="sparc-rule-editor">
  <div class="sparc-panel-header">
    <h2>Reactive Rules</h2>
    <button type="button" class="btn btn-primary btn-sm" on:click={onAddReactiveRule}>Add Rule</button>
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
          <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onMoveReactiveRule(activeReactiveRuleIndex, -1)} disabled={activeReactiveRuleIndex === 0}>Move Up</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onMoveReactiveRule(activeReactiveRuleIndex, 1)} disabled={activeReactiveRuleIndex >= reactiveRules.length - 1}>Move Down</button>
          <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveReactiveRule(activeReactiveRuleIndex)}>Delete Rule</button>
        </div>
        <label>
          Rule ID
          <input value={activeReactiveRule.id || ''} on:input={(event) => onUpdateReactiveRuleField('id', event.currentTarget.value)} />
        </label>
        <div class="sparc-rule-section">
          <div class="sparc-panel-header">
            <h3>When</h3>
            {#if !activeReactiveRule.when}
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onSetReactiveCondition('state')}>Add Condition</button>
            {/if}
          </div>
          {#if activeReactiveRule.when}
            <div class="sparc-rule-card">
              <div class="sparc-inline-actions">
                <button type="button" class="btn btn-outline-danger btn-sm" on:click={onRemoveReactiveCondition}>Remove Condition</button>
              </div>
              <SparcReactiveConditionEditor
                condition={activeReactiveRule.when}
                label="When"
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

        <div class="sparc-rule-section">
          <div class="sparc-panel-header">
            <h3>Writes</h3>
            <button type="button" class="btn btn-outline-secondary btn-sm" on:click={onAddReactiveWrite}>Add Write</button>
          </div>
          {#each activeReactiveRule.writes || [] as write, index}
            <div class="sparc-rule-card">
              <div class="sparc-inline-actions">
                <strong>Write {index + 1}</strong>
                <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveReactiveWrite(index)}>Remove</button>
              </div>
              <div class="sparc-expression-grid">
                <label>
                  Target Document
                  <input value={write.target?.documentId || ''} on:input={(event) => { write.target = ensureTarget(write.target || {}); write.target.documentId = event.currentTarget.value; onMarkChanged(); }} />
                </label>
                <label>
                  Target Node
                  <input value={write.target?.nodeId || ''} on:input={(event) => { write.target = ensureTarget(write.target || {}); write.target.nodeId = event.currentTarget.value; onMarkChanged(); }} />
                </label>
              </div>
              <label>
                Key
                <input value={write.key || ''} on:input={(event) => onUpdateStateWrite(write, 'key', event.currentTarget.value)} />
              </label>
              <label>
                Value
                <input value={stringifyLooseValue(write.value)} on:input={(event) => onUpdateStateWrite(write, 'value', event.currentTarget.value)} />
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

<style>
  .sparc-rule-editor {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-panel-surface);
    border-radius: var(--sparc-editor-border-radius-lg);
    padding: var(--sparc-editor-panel-padding);
    min-width: 0;
    min-height: 0;
    overflow: auto;
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

  .sparc-panel-header h2 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 1.1);
  }

  .sparc-rule-section h3 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 0.95);
  }

  .sparc-rule-layout {
    display: grid;
    grid-template-columns: minmax(190px, 260px) minmax(0, 1fr);
    gap: var(--sparc-editor-gap-md);
    margin-top: var(--sparc-editor-gap-sm);
  }

  .sparc-rule-list,
  .sparc-rule-detail,
  .sparc-rule-section,
  .sparc-rule-card {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
    min-width: 0;
  }

  .sparc-rule-section {
    margin-top: var(--sparc-editor-gap-sm);
  }

  .sparc-rule-card {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
  }

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

  .sparc-rule-row.selected {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-rule-row small,
  .sparc-muted {
    color: var(--app-secondary-text-color);
  }

  .sparc-expression-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sparc-editor-gap-sm);
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
    .sparc-rule-editor {
      overflow: visible;
    }

    .sparc-rule-layout,
    .sparc-expression-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
