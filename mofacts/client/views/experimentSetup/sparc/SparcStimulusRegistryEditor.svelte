<script>
  import { stringifyLooseValue } from './sparcAuthoringEditPrimitives';

  export let stimulusRegistry = [];
  export let activeStimulusIndex = 0;
  export let activeStimulus = null;
  export let onAddStimulusRegistryEntry = () => {};
  export let onRemoveStimulusRegistryEntry = () => {};
  export let onUpdateStimulusField = () => {};
  export let onUpdateStimulusResponseField = () => {};
</script>

<section class="sparc-rule-editor">
  <div class="sparc-panel-header">
    <h2>Stimulus Registry</h2>
    <button type="button" class="btn btn-primary btn-sm" on:click={onAddStimulusRegistryEntry}>Add Stimulus</button>
  </div>
  <div class="sparc-rule-layout">
    <div class="sparc-rule-list">
      {#each stimulusRegistry as stimulus, index}
        <button
          type="button"
          class="sparc-rule-row"
          class:selected={index === activeStimulusIndex}
          on:click={() => activeStimulusIndex = index}
        >
          <span>{stimulus.label || stimulus.stimulusId || `Stimulus ${index + 1}`}</span>
          <small>{stimulus.stimulusKC || 'missing stimulusKC'}</small>
        </button>
      {/each}
      {#if stimulusRegistry.length === 0}
        <p class="sparc-muted">No model stimuli are defined for this SPARC display.</p>
      {/if}
    </div>
    <div class="sparc-rule-detail">
      {#if activeStimulus}
        <div class="sparc-inline-actions">
          <button type="button" class="btn btn-outline-danger btn-sm" on:click={() => onRemoveStimulusRegistryEntry(activeStimulusIndex)}>Delete Stimulus</button>
        </div>
        <div class="sparc-expression-grid">
          <label>
            Stimulus ID
            <input value={activeStimulus.stimulusId || ''} on:input={(event) => onUpdateStimulusField('stimulusId', event.currentTarget.value)} />
          </label>
          <label>
            Label
            <input value={activeStimulus.label || ''} on:input={(event) => onUpdateStimulusField('label', event.currentTarget.value)} />
          </label>
          <label>
            Stimuli Set ID
            <input value={stringifyLooseValue(activeStimulus.stimuliSetId)} on:input={(event) => onUpdateStimulusField('stimuliSetId', event.currentTarget.value)} />
          </label>
          <label>
            Stimulus KC
            <input value={stringifyLooseValue(activeStimulus.stimulusKC)} on:input={(event) => onUpdateStimulusField('stimulusKC', event.currentTarget.value)} />
          </label>
          <label>
            Cluster KC
            <input value={stringifyLooseValue(activeStimulus.clusterKC)} on:input={(event) => onUpdateStimulusField('clusterKC', event.currentTarget.value)} />
          </label>
          <label>
            KC ID
            <input value={stringifyLooseValue(activeStimulus.KCId)} on:input={(event) => onUpdateStimulusField('KCId', event.currentTarget.value)} />
          </label>
          <label>
            KC Default
            <input value={stringifyLooseValue(activeStimulus.KCDefault)} on:input={(event) => onUpdateStimulusField('KCDefault', event.currentTarget.value)} />
          </label>
          <label>
            KC Cluster
            <input value={stringifyLooseValue(activeStimulus.KCCluster)} on:input={(event) => onUpdateStimulusField('KCCluster', event.currentTarget.value)} />
          </label>
          <label>
            Response KC
            <input value={stringifyLooseValue(activeStimulus.response?.responseKC || '')} on:input={(event) => onUpdateStimulusResponseField('responseKC', event.currentTarget.value)} />
          </label>
          <label>
            Response Key
            <input value={activeStimulus.response?.responseKey || ''} on:input={(event) => onUpdateStimulusResponseField('responseKey', event.currentTarget.value)} />
          </label>
        </div>
      {:else}
        <p class="sparc-muted">Add a stimulus before attaching nodes to model identities.</p>
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

  .sparc-rule-layout {
    display: grid;
    grid-template-columns: minmax(190px, 260px) minmax(0, 1fr);
    gap: var(--sparc-editor-gap-md);
    margin-top: var(--sparc-editor-gap-sm);
  }

  .sparc-rule-list,
  .sparc-rule-detail {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
    min-width: 0;
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

  input {
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
