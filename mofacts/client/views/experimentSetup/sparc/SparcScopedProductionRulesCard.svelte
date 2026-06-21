<script>
  import { stringifyLooseValue } from './sparcAuthoringEditPrimitives';
  import SparcRuleExpressionEditor from './SparcRuleExpressionEditor.svelte';

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
  export let clusterChoices = [];
  export let ruleExpressionTypes = [];
  export let functionNames = [];
  export let variableExpression = (name) => ({ type: 'variable', name });
  export let onCreateScopedProductionRule = () => {};
  export let onSelectScopedProductionRule = () => {};
  export let onUpdateScopedProductionRuleField = () => {};
  export let onAddCatalogPartToActiveRule = () => {};
  export let stringifyProductionRule = (rule) => JSON.stringify(rule || {}, null, 2);
  export let onUpdateScopedProductionRuleJson = () => {};
  export let onChangeScopedRulePrimaryEffectType = () => {};
  export let onUpdateEffectField = () => {};
  export let onUpdateOptionalEffectField = () => {};
  export let ensureEffectExpression = () => null;
  export let onUpdateRuleExpression = () => {};
  export let onAddExpressionArg = () => {};
  export let onRemoveExpressionArg = () => {};
</script>

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
  <button type="button" class="btn btn-primary btn-sm" on:click={() => onCreateScopedProductionRule(activeVisualRuleTemplateId)}>
    Add Rule For Selection
  </button>
  <div class="sparc-scoped-rule-list">
    {#each activeNodeProductionRuleEntries as entry}
      <button
        type="button"
        class="sparc-rule-row"
        class:selected={entry.index === activeProductionRuleIndex}
        on:click={() => onSelectScopedProductionRule(entry.index)}
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
      <input value={activeNodeProductionRule.id || ''} on:input={(event) => onUpdateScopedProductionRuleField('id', event.currentTarget.value)} />
    </label>
    <label>
      Module
      <input value={activeNodeProductionRule.module || ''} on:input={(event) => onUpdateScopedProductionRuleField('module', event.currentTarget.value)} />
    </label>
    <label>
      Add catalog part
      <select on:change={(event) => { onAddCatalogPartToActiveRule(event.currentTarget.value); event.currentTarget.value = ''; }}>
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
        on:change={(event) => onUpdateScopedProductionRuleJson(event.currentTarget.value)}
      ></textarea>
    </label>
    {#if activeNodeRuleEffect}
      <div class="sparc-rule-card">
        <div class="sparc-inline-actions">
          <strong>{activeNodeRuleEffect.type}</strong>
          <select value={activeNodeRuleEffect.type} on:change={(event) => onChangeScopedRulePrimaryEffectType(event.currentTarget.value)}>
            {#each productionEffectTypes as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>
        {#if activeNodeRuleEffect.type === 'classify'}
          <label>
            Outcome
            <select value={activeNodeRuleEffect.outcome} on:change={(event) => onUpdateEffectField(activeNodeRuleEffect, 'outcome', event.currentTarget.value)}>
              {#each classifyOutcomes as outcome}
                <option value={outcome}>{outcome}</option>
              {/each}
            </select>
          </label>
        {:else if activeNodeRuleEffect.type === 'message'}
          <label>
            Message Type
            <select value={activeNodeRuleEffect.messageType} on:change={(event) => onUpdateEffectField(activeNodeRuleEffect, 'messageType', event.currentTarget.value)}>
              {#each messageTypes as type}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </label>
          <label>
            Template
            <textarea rows="3" value={activeNodeRuleEffect.template || ''} on:input={(event) => onUpdateEffectField(activeNodeRuleEffect, 'template', event.currentTarget.value)}></textarea>
          </label>
        {:else if activeNodeRuleEffect.type === 'write-state'}
          <label>
            State Key
            <input value={activeNodeRuleEffect.write?.key || ''} on:input={(event) => onUpdateEffectField(activeNodeRuleEffect.write, 'key', event.currentTarget.value)} />
          </label>
          <label>
            Value
            <SparcRuleExpressionEditor
              expression={activeNodeRuleEffect.write.value}
              label="Value"
              {ruleExpressionTypes}
              {functionNames}
              onUpdateRuleExpression={onUpdateRuleExpression}
              onAddExpressionArg={onAddExpressionArg}
              onRemoveExpressionArg={onRemoveExpressionArg}
            />
          </label>
        {:else if activeNodeRuleEffect.type === 'credit'}
          <label>
            KC
            <input value={activeNodeRuleEffect.kc || ''} on:input={(event) => onUpdateEffectField(activeNodeRuleEffect, 'kc', event.currentTarget.value)} />
          </label>
        {:else if activeNodeRuleEffect.type === 'model-practice'}
          <label>
            Outcome
            <select value={activeNodeRuleEffect.outcome} on:change={(event) => onUpdateEffectField(activeNodeRuleEffect, 'outcome', event.currentTarget.value)}>
              {#each classifyOutcomes.filter((outcome) => outcome !== 'buggy') as outcome}
                <option value={outcome}>{outcome}</option>
              {/each}
            </select>
          </label>
          <label>
            Explicit Cluster
            <select value={activeNodeRuleEffect.clusterIndex ?? ''} on:change={(event) => onUpdateOptionalEffectField(activeNodeRuleEffect, 'clusterIndex', event.currentTarget.value)}>
              <option value="">Resolve from selected node attachment</option>
              {#each clusterChoices as cluster}
                <option value={cluster.clusterIndex} disabled={!cluster.hasFirstStimulus}>{cluster.clusterIndex}: {cluster.label}</option>
              {/each}
            </select>
          </label>
          <label>
            Node ID
            <input value={stringifyLooseValue(activeNodeRuleEffect.nodeId || '')} on:input={(event) => onUpdateOptionalEffectField(activeNodeRuleEffect, 'nodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
          </label>
          <label>
            Response Value
            <SparcRuleExpressionEditor
              expression={ensureEffectExpression(activeNodeRuleEffect, 'responseValue', '')}
              label="Response Value"
              {ruleExpressionTypes}
              {functionNames}
              onUpdateRuleExpression={onUpdateRuleExpression}
              onAddExpressionArg={onAddExpressionArg}
              onRemoveExpressionArg={onRemoveExpressionArg}
            />
          </label>
        {:else}
          <p class="sparc-muted">Use Rule JSON above to edit every field for this effect.</p>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .sparc-context-card,
  .sparc-scoped-rule-list,
  .sparc-rule-card {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-context-card {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
  }

  .sparc-production-rules-card {
    gap: var(--sparc-editor-gap-sm);
    padding-top: var(--sparc-editor-card-padding);
    padding-bottom: var(--sparc-editor-card-padding);
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

  .sparc-panel-header {
    min-height: 0;
    margin: 0;
  }

  .sparc-panel-header h3 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 1.1);
    line-height: 1.1;
  }

  .sparc-rule-card {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
  }

  .sparc-rule-row {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-gap-xs) var(--sparc-editor-gap-sm);
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: calc(2px * var(--app-density-scale));
  }

  .sparc-rule-row.selected {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-rule-row small,
  .sparc-muted {
    color: var(--app-secondary-text-color);
  }

  .sparc-compact-empty-state {
    margin: 0;
    line-height: 1.15;
  }

  .sparc-rule-json-editor {
    font-family: var(--sparc-editor-monospace-font-family);
    font-size: calc(var(--app-font-size-base) * 0.9);
    line-height: 1.35;
    white-space: pre;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-xs);
    font-size: calc(var(--app-font-size-base) * 0.85);
  }

  input,
  textarea,
  select {
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-input-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }
</style>
