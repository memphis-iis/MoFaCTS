<script>
  import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../lib/interfaceI18n';

  export let tdfId = '';
  export let initialTdf = null;
  export let selectedStimFile = '';
  export let sparcTargets = [];
  export let activeTargetKey = '';
  export let showAdvancedEditors = false;
  export let activeEditorTab = 'visual';
  export let saveMessage = '';
  export let saving = false;
  export let errorText = '';
  export let onCancel = () => {};
  export let onSave = () => {};

  const sparcText = (key) => translatePlatformString(getActiveUiLocale(), key);
</script>

<header class="sparc-editor-header">
  <div>
    <h1>{sparcText('sparc.title')}</h1>
    <div class="sparc-editor-subtitle">{initialTdf?.content?.tdfs?.tutor?.setspec?.lessonname || tdfId}</div>
    {#if selectedStimFile}
      <div class="sparc-editor-subtitle">{selectedStimFile}</div>
    {/if}
  </div>
  <div class="sparc-editor-actions">
    <label class="sparc-advanced-toggle">
      <input type="checkbox" bind:checked={showAdvancedEditors} />
      {sparcText('sparc.advancedEditors')}
    </label>
    {#if saveMessage}<span class="sparc-save-message">{saveMessage}</span>{/if}
    <button type="button" class="btn btn-secondary" on:click={onCancel}>{sparcText('apkg.cancel')}</button>
    <button type="button" class="btn btn-primary" on:click={onSave} disabled={saving}>
      {saving ? sparcText('sparc.saving') : sparcText('sparc.saveContent')}
    </button>
  </div>
</header>

{#if errorText}
  <div class="alert alert-danger">{errorText}</div>
{/if}

{#if sparcTargets.length > 1}
  <div class="sparc-target-row">
    <label for="sparc-target-select">{sparcText('sparc.page')}</label>
    <select id="sparc-target-select" bind:value={activeTargetKey}>
      {#each sparcTargets as target}
        <option value={target.key}>{target.label}</option>
      {/each}
    </select>
  </div>
{/if}

{#if showAdvancedEditors}
  <div class="sparc-editor-tabs" role="tablist" aria-label={sparcText('sparc.editorSections')}>
    <button type="button" class:active={activeEditorTab === 'visual'} on:click={() => activeEditorTab = 'visual'}>{sparcText('sparc.visualEditor')}</button>
    <button type="button" class:active={activeEditorTab === 'production'} on:click={() => activeEditorTab = 'production'}>{sparcText('sparc.productionRules')}</button>
  </div>
{/if}

<style>
  .sparc-editor-header,
  .sparc-editor-actions,
  .sparc-target-row,
  .sparc-editor-tabs {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-editor-header {
    justify-content: space-between;
    padding: var(--app-space-3-px) var(--app-space-0);
  }

  .sparc-editor-actions {
    justify-content: flex-end;
  }

  .sparc-advanced-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
    margin-right: var(--sparc-editor-gap-sm);
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.85);
    white-space: nowrap;
  }

  .sparc-advanced-toggle input {
    margin: 0;
  }

  .sparc-editor-header h1 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 1.1);
  }

  .sparc-editor-subtitle {
    color: var(--app-secondary-text-color);
  }

  .sparc-editor-tabs {
    flex-wrap: wrap;
  }

  .sparc-editor-tabs button {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }

  .sparc-editor-tabs button.active {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-target-row select {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-input-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }

  .sparc-save-message {
    color: var(--app-success-color);
    font-weight: 600;
  }
</style>
