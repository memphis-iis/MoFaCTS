<script>
  import { ensureTarget, stringifyLooseValue } from './sparcAuthoringEditPrimitives';
  import SparcRuleExpressionEditor from './SparcRuleExpressionEditor.svelte';

  export let productionRules = [];
  export let activeProductionRuleIndex = 0;
  export let activeProductionRule = null;
  export let productionConditionTypes = [];
  export let productionEffectTypes = [];
  export let comparisonOps = [];
  export let classifyOutcomes = [];
  export let messageTypes = [];
  export let clusterChoices = [];
  export let ruleExpressionTypes = [];
  export let functionNames = [];
  export let variableExpression = (name) => ({ type: 'variable', name });
  export let onAddProductionRule = () => {};
  export let onRemoveProductionRule = () => {};
  export let onMoveProductionRule = () => {};
  export let onUpdateProductionRuleField = () => {};
  export let onAddProductionCondition = () => {};
  export let onRemoveProductionCondition = () => {};
  export let productionConditionKind = () => 'fact-pattern';
  export let onChangeProductionConditionKind = () => {};
  export let productionConditionPattern = () => null;
  export let onUpdateProductionConditionFactType = () => {};
  export let onAddFactSlot = () => {};
  export let onRemoveFactSlot = () => {};
  export let onRenameFactSlot = () => {};
  export let onUpdateFactSlotType = () => {};
  export let onUpdateFactSlotValue = () => {};
  export let onAddProductionTest = () => {};
  export let onRemoveProductionTest = () => {};
  export let onUpdateProductionTestField = () => {};
  export let onAddProductionEffect = () => {};
  export let onRemoveProductionEffect = () => {};
  export let onChangeProductionEffectType = () => {};
  export let onUpdateEffectField = () => {};
  export let onUpdateOptionalEffectField = () => {};
  export let onUpdateEffectBoolean = () => {};
  export let onAddEffectFactSlot = () => {};
  export let onRemoveEffectFactSlot = () => {};
  export let onRenameEffectFactSlot = () => {};
  export let onUpdateAddressTemplate = () => {};
  export let ensureEffectExpression = () => null;
  export let onUpdateProgressiveNodeTemplate = () => {};
  export let onUpdateRuleExpression = () => {};
  export let onAddExpressionArg = () => {};
  export let onRemoveExpressionArg = () => {};
  export let onMarkChanged = () => {};
</script>

<section class="sparc-rule-editor">
  <div class="sparc-panel-header">
    <h2>Advanced Production Rules</h2>
    <button type="button" class="btn btn-primary btn-sm" on:click={onAddProductionRule}>Add Rule</button>
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
          <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onMoveProductionRule(activeProductionRuleIndex, -1)} disabled={activeProductionRuleIndex === 0}>Move Up</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onMoveProductionRule(activeProductionRuleIndex, 1)} disabled={activeProductionRuleIndex >= productionRules.length - 1}>Move Down</button>
          <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveProductionRule(activeProductionRuleIndex)}>Delete Rule</button>
        </div>
        <label>
          Rule ID
          <input value={activeProductionRule.id || ''} on:input={(event) => onUpdateProductionRuleField('id', event.currentTarget.value)} />
        </label>
        <label>
          Module
          <input value={activeProductionRule.module || ''} on:input={(event) => onUpdateProductionRuleField('module', event.currentTarget.value)} />
        </label>

        <div class="sparc-rule-section">
          <div class="sparc-panel-header">
            <h3>When</h3>
            <select on:change={(event) => onAddProductionCondition(event.currentTarget.value)}>
              <option value="">Add condition...</option>
              {#each productionConditionTypes as type}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </div>
          {#each activeProductionRule.when || [] as condition, index}
            <div class="sparc-rule-card">
              <div class="sparc-inline-actions">
                <select value={productionConditionKind(condition)} on:change={(event) => onChangeProductionConditionKind(index, event.currentTarget.value)}>
                  {#each productionConditionTypes as type}
                    <option value={type}>{type}</option>
                  {/each}
                </select>
                <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveProductionCondition(index)}>Remove</button>
              </div>
              <label>
                Fact Type
                <input value={productionConditionPattern(condition)?.factType || ''} on:input={(event) => onUpdateProductionConditionFactType(condition, event.currentTarget.value)} />
              </label>
              <div class="sparc-panel-header">
                <h4>Slots</h4>
                <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onAddFactSlot(condition)}>Add Slot</button>
              </div>
              {#each Object.entries(productionConditionPattern(condition)?.slots || {}) as [slotKey, slot]}
                <div class="sparc-slot-row">
                  <input value={slotKey} on:change={(event) => onRenameFactSlot(condition, slotKey, event.currentTarget.value)} aria-label="slot name" />
                  <select value={slot.type} on:change={(event) => onUpdateFactSlotType(slot, event.currentTarget.value)} aria-label="slot pattern type">
                    <option value="literal">literal</option>
                    <option value="bind">bind</option>
                    <option value="bound">bound</option>
                    <option value="range">range</option>
                  </select>
                  {#if slot.type === 'range'}
                    <input value={stringifyLooseValue(slot.min?.value ?? '')} on:input={(event) => { slot.min = { type: 'literal', value: Number(event.currentTarget.value) }; onMarkChanged(); }} aria-label="slot minimum" />
                    <input value={stringifyLooseValue(slot.max?.value ?? '')} on:input={(event) => { slot.max = { type: 'literal', value: Number(event.currentTarget.value) }; onMarkChanged(); }} aria-label="slot maximum" />
                  {:else}
                    <input value={slot.type === 'literal' ? stringifyLooseValue(slot.value) : slot.variable || ''} on:input={(event) => onUpdateFactSlotValue(slot, event.currentTarget.value)} aria-label="slot value" />
                  {/if}
                  <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveFactSlot(condition, slotKey)}>Remove</button>
                </div>
              {/each}
            </div>
          {/each}
        </div>

        <div class="sparc-rule-section">
          <div class="sparc-panel-header">
            <h3>Tests</h3>
            <button type="button" class="btn btn-outline-secondary btn-sm" on:click={onAddProductionTest}>Add Test</button>
          </div>
          {#each activeProductionRule.tests || [] as test, index}
            <div class="sparc-rule-card">
              <div class="sparc-inline-actions">
                <select value={test.op} on:change={(event) => onUpdateProductionTestField(test, 'op', event.currentTarget.value)}>
                  {#each comparisonOps as op}
                    <option value={op}>{op}</option>
                  {/each}
                </select>
                <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveProductionTest(index)}>Remove</button>
              </div>
              <div class="sparc-expression-grid">
                <div>
                  <SparcRuleExpressionEditor
                    expression={test.left}
                    label="Left Expression"
                    {ruleExpressionTypes}
                    {functionNames}
                    onUpdateRuleExpression={onUpdateRuleExpression}
                    onAddExpressionArg={onAddExpressionArg}
                    onRemoveExpressionArg={onRemoveExpressionArg}
                  />
                </div>
                <div>
                  <SparcRuleExpressionEditor
                    expression={test.right}
                    label="Right Expression"
                    {ruleExpressionTypes}
                    {functionNames}
                    onUpdateRuleExpression={onUpdateRuleExpression}
                    onAddExpressionArg={onAddExpressionArg}
                    onRemoveExpressionArg={onRemoveExpressionArg}
                  />
                </div>
              </div>
            </div>
          {/each}
        </div>

        <div class="sparc-rule-section">
          <div class="sparc-panel-header">
            <h3>Then</h3>
            <select on:change={(event) => onAddProductionEffect(event.currentTarget.value)}>
              <option value="">Add effect...</option>
              {#each productionEffectTypes as type}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </div>
          {#each activeProductionRule.then || [] as effect, index}
            <div class="sparc-rule-card">
              <div class="sparc-inline-actions">
                <select value={effect.type} on:change={(event) => onChangeProductionEffectType(index, event.currentTarget.value)}>
                  {#each productionEffectTypes as type}
                    <option value={type}>{type}</option>
                  {/each}
                </select>
                <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveProductionEffect(index)}>Remove</button>
              </div>
              {#if effect.type === 'classify'}
                <label>
                  Outcome
                  <select value={effect.outcome} on:change={(event) => onUpdateEffectField(effect, 'outcome', event.currentTarget.value)}>
                    {#each classifyOutcomes as outcome}
                      <option value={outcome}>{outcome}</option>
                    {/each}
                  </select>
                </label>
              {:else if effect.type === 'message'}
                <label>
                  Message Type
                  <select value={effect.messageType} on:change={(event) => onUpdateEffectField(effect, 'messageType', event.currentTarget.value)}>
                    {#each messageTypes as type}
                      <option value={type}>{type}</option>
                    {/each}
                  </select>
                </label>
                <label>
                  Template
                  <textarea rows="3" value={effect.template || ''} on:input={(event) => onUpdateEffectField(effect, 'template', event.currentTarget.value)}></textarea>
                </label>
                <div class="sparc-expression-grid">
                  <label>
                    Target Document
                    <input value={stringifyLooseValue(effect.target?.documentId || '')} on:input={(event) => { effect.target = ensureTarget(effect.target || {}); onUpdateAddressTemplate(effect.target, 'documentId', event.currentTarget.value); }} />
                  </label>
                  <label>
                    Target Node
                    <input value={stringifyLooseValue(effect.target?.nodeId || '')} on:input={(event) => { effect.target = ensureTarget(effect.target || {}); onUpdateAddressTemplate(effect.target, 'nodeId', event.currentTarget.value); }} />
                  </label>
                </div>
              {:else if effect.type === 'write-state'}
                <div class="sparc-expression-grid">
                  <label>
                    Target Document
                    <input value={stringifyLooseValue(effect.write?.target?.documentId || '')} on:input={(event) => onUpdateAddressTemplate(effect.write.target, 'documentId', event.currentTarget.value)} />
                  </label>
                  <label>
                    Target Node
                    <input value={stringifyLooseValue(effect.write?.target?.nodeId || '')} on:input={(event) => onUpdateAddressTemplate(effect.write.target, 'nodeId', event.currentTarget.value)} />
                  </label>
                </div>
                <label>
                  Key
                  <input value={effect.write?.key || ''} on:input={(event) => onUpdateEffectField(effect.write, 'key', event.currentTarget.value)} />
                </label>
                <label>
                  Value Expression
                  <SparcRuleExpressionEditor
                    expression={effect.write.value}
                    label="Value Expression"
                    {ruleExpressionTypes}
                    {functionNames}
                    onUpdateRuleExpression={onUpdateRuleExpression}
                    onAddExpressionArg={onAddExpressionArg}
                    onRemoveExpressionArg={onRemoveExpressionArg}
                  />
                </label>
              {:else if effect.type === 'assert-fact'}
                <label>
                  Fact Type
                  <input value={effect.fact?.factType || ''} on:input={(event) => { effect.fact = effect.fact || { slots: {} }; effect.fact.factType = event.currentTarget.value; onMarkChanged(); }} />
                </label>
                <label class="sparc-checkbox-row">
                  Persist
                  <input type="checkbox" checked={effect.persist !== false} on:change={(event) => onUpdateEffectBoolean(effect, 'persist', event.currentTarget.checked)} />
                </label>
                <div class="sparc-panel-header">
                  <h4>Fact Slots</h4>
                  <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onAddEffectFactSlot(effect)}>Add Slot</button>
                </div>
                {#each Object.entries(effect.fact?.slots || {}) as [slotKey, expression]}
                  <div class="sparc-slot-row">
                    <input value={slotKey} on:change={(event) => onRenameEffectFactSlot(effect, slotKey, event.currentTarget.value)} />
                    <div class="sparc-slot-expression">
                      <SparcRuleExpressionEditor
                        {expression}
                        label={slotKey}
                        {ruleExpressionTypes}
                        {functionNames}
                        onUpdateRuleExpression={onUpdateRuleExpression}
                        onAddExpressionArg={onAddExpressionArg}
                        onRemoveExpressionArg={onRemoveExpressionArg}
                      />
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveEffectFactSlot(effect, slotKey)}>Remove</button>
                  </div>
                {/each}
              {:else if effect.type === 'credit'}
                <label>
                  KC
                  <input value={effect.kc || ''} on:input={(event) => onUpdateEffectField(effect, 'kc', event.currentTarget.value)} />
                </label>
              {:else if effect.type === 'model-practice'}
                <label>
                  Outcome
                  <select value={effect.outcome} on:change={(event) => onUpdateEffectField(effect, 'outcome', event.currentTarget.value)}>
                    {#each classifyOutcomes.filter((outcome) => outcome !== 'buggy') as outcome}
                      <option value={outcome}>{outcome}</option>
                    {/each}
                  </select>
                </label>
                <div class="sparc-expression-grid">
                  <label>
                    Explicit Cluster
                    <select value={effect.clusterIndex ?? ''} on:change={(event) => onUpdateOptionalEffectField(effect, 'clusterIndex', event.currentTarget.value)}>
                      <option value="">Resolve from node attachment</option>
                      {#each clusterChoices as cluster}
                        <option value={cluster.clusterIndex} disabled={!cluster.hasFirstStimulus}>{cluster.clusterIndex}: {cluster.label}</option>
                      {/each}
                    </select>
                  </label>
                  <label>
                    Node ID
                    <input value={stringifyLooseValue(effect.nodeId || '')} on:input={(event) => onUpdateOptionalEffectField(effect, 'nodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                  </label>
                </div>
                <div class="sparc-expression-grid">
                  <label>
                    Response Value
                    <SparcRuleExpressionEditor
                      expression={ensureEffectExpression(effect, 'responseValue', '')}
                      label="Response Value"
                      {ruleExpressionTypes}
                      {functionNames}
                      onUpdateRuleExpression={onUpdateRuleExpression}
                      onAddExpressionArg={onAddExpressionArg}
                      onRemoveExpressionArg={onRemoveExpressionArg}
                    />
                  </label>
                  <label>
                    Input
                    <SparcRuleExpressionEditor
                      expression={ensureEffectExpression(effect, 'input', '')}
                      label="Input"
                      {ruleExpressionTypes}
                      {functionNames}
                      onUpdateRuleExpression={onUpdateRuleExpression}
                      onAddExpressionArg={onAddExpressionArg}
                      onRemoveExpressionArg={onRemoveExpressionArg}
                    />
                  </label>
                </div>
              {:else if effect.type === 'terminate-production-phase'}
                <label>
                  Reason
                  <input value={effect.reason || ''} on:input={(event) => onUpdateEffectField(effect, 'reason', event.currentTarget.value)} />
                </label>
              {:else if effect.type === 'append-text'}
                <label>
                  Node ID
                  <input value={stringifyLooseValue(effect.nodeId)} on:input={(event) => onUpdateEffectField(effect, 'nodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                </label>
                <label>
                  Text
                  <input value={stringifyLooseValue(effect.text)} on:input={(event) => onUpdateEffectField(effect, 'text', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                </label>
                <label>
                  Separator
                  <input value={stringifyLooseValue(effect.separator || '')} on:input={(event) => onUpdateEffectField(effect, 'separator', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                </label>
              {:else}
                <div class="sparc-expression-grid">
                  <label>
                    Box ID
                    <input value={stringifyLooseValue(effect.boxId || '')} on:input={(event) => onUpdateEffectField(effect, 'boxId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                  </label>
                  {#if effect.type === 'append-node' || effect.type === 'append-node-if-missing'}
                    <label>
                      Frontier
                      <input value={stringifyLooseValue(effect.frontier || '')} on:input={(event) => onUpdateEffectField(effect, 'frontier', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                    </label>
                  {/if}
                  {#if effect.type === 'append-node-if-missing' || effect.type === 'insert-node'}
                    <label>
                      Before Node ID
                      <input value={stringifyLooseValue(effect.beforeNodeId || '')} on:input={(event) => onUpdateEffectField(effect, 'beforeNodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                    </label>
                    <label>
                      After Node ID
                      <input value={stringifyLooseValue(effect.afterNodeId || '')} on:input={(event) => onUpdateEffectField(effect, 'afterNodeId', event.currentTarget.value.startsWith('?') ? variableExpression(event.currentTarget.value.slice(1)) : event.currentTarget.value)} />
                    </label>
                  {/if}
                </div>
                <div class="sparc-expression-grid">
                  <label>
                    Node ID
                    <input value={effect.node?.id || ''} on:input={(event) => onUpdateProgressiveNodeTemplate(effect, 'id', event.currentTarget.value)} />
                  </label>
                  <label>
                    Node Type
                    <select value={effect.node?.nodeType || 'atomic'} on:change={(event) => onUpdateProgressiveNodeTemplate(effect, 'nodeType', event.currentTarget.value)}>
                      <option value="atomic">atomic</option>
                      <option value="group">group</option>
                    </select>
                  </label>
                  {#if effect.node?.nodeType === 'group'}
                    <label>
                      Group Type
                      <input value={effect.node?.groupType || ''} on:input={(event) => onUpdateProgressiveNodeTemplate(effect, 'groupType', event.currentTarget.value)} />
                    </label>
                  {:else}
                    <label>
                      Atom Type
                      <input value={effect.node?.atomType || ''} on:input={(event) => onUpdateProgressiveNodeTemplate(effect, 'atomType', event.currentTarget.value)} />
                    </label>
                    <label>
                      Value
                      <input value={stringifyLooseValue(effect.node?.value)} on:input={(event) => onUpdateProgressiveNodeTemplate(effect, 'value', event.currentTarget.value)} />
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

  .sparc-rule-section h3,
  .sparc-rule-card h4 {
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

  .sparc-checkbox-row input {
    width: auto;
  }

  @media (max-width: 1000px) {
    .sparc-rule-editor {
      overflow: visible;
    }

    .sparc-rule-layout,
    .sparc-expression-grid,
    .sparc-slot-row {
      grid-template-columns: 1fr;
    }
  }
</style>
