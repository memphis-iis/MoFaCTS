<script>
  import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../lib/interfaceI18n';
  import SparcSessionSurface from '../../experiment/svelte/components/SparcSessionSurface.svelte';

  export let activeDisplay = null;
  export let activeNodeId = '';
  export let dropTarget = null;
  export let dropMarkerStyle = '';
  export let showNodeHierarchy = false;
  export let flatNodes = [];
  export let visualEditorValueBridge = () => {};
  export let onEditorClick = () => {};
  export let onRememberRichTextSelection = () => {};
  export let onVisualDragOver = () => {};
  export let onVisualDrop = () => {};
  export let onVisualDragLeave = () => {};
  export let onNodeAuthoredValueChange = () => {};
  export let onNodeFocus = () => {};

  const sparcText = (key, values) => translatePlatformString(getActiveUiLocale(), key, values);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="sparc-visual-editor-surface"
  class:sparc-drop-active={dropTarget}
  class:sparc-hierarchy-visible={showNodeHierarchy}
  aria-label={sparcText('sparc.visualEditorDropSurface')}
  use:visualEditorValueBridge
  on:click={onEditorClick}
  on:keyup={onRememberRichTextSelection}
  on:mouseup={onRememberRichTextSelection}
  on:dragover={onVisualDragOver}
  on:drop={onVisualDrop}
  on:dragleave={onVisualDragLeave}
>
  {#if dropMarkerStyle}
    <div
      class="sparc-drop-marker"
      class:sparc-drop-marker-inside={dropTarget?.position === 'inside'}
      style={dropMarkerStyle}
      aria-hidden="true"
    ></div>
  {/if}
  {#if dropTarget?.position === 'inside'}
    <div class="sparc-drop-label" aria-live="polite">{sparcText('sparc.dropInto', { target: dropTarget.label })}</div>
  {/if}
  {#if activeDisplay}
    <SparcSessionSurface
      display={activeDisplay}
      runtimeNodeValues={{}}
      authoringSelectedNodeId={activeNodeId}
      authoringSelectOnly={true}
      onAuthoringNodeValueChange={onNodeAuthoredValueChange}
      onAuthoringNodeFocus={onNodeFocus}
    />
  {/if}
</div>

{#if showNodeHierarchy}
  <div class="sparc-node-list sparc-node-list-bottom" aria-label={sparcText('sparc.nodeHierarchy')}>
    {#each flatNodes as entry}
      <button
        type="button"
        class:selected={entry.node.id === activeNodeId}
        class="sparc-node-row"
        style={`padding-left: ${12 + (entry.depth || 0) * 18}px`}
        on:click={() => activeNodeId = entry.node.id}
      >
        <span>{entry.node.id}</span>
        <small>{entry.node.nodeType === 'group' ? entry.node.groupType : entry.node.atomType}</small>
      </button>
    {/each}
  </div>
{/if}

<style>
  .sparc-visual-editor-surface {
    flex: 1 1 auto;
    position: relative;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-panel-padding);
  }

  .sparc-visual-editor-surface.sparc-hierarchy-visible {
    flex: 1 1 50%;
  }

  .sparc-visual-editor-surface.sparc-drop-active {
    border-color: var(--app-info-color);
    box-shadow: inset 0 0 0 1px var(--app-info-color);
  }

  .sparc-visual-editor-surface :global([data-node-id]) {
    cursor: pointer;
  }

  .sparc-drop-marker {
    position: absolute;
    height: 3px;
    min-width: 28px;
    background: var(--app-info-color);
    border-radius: var(--border-radius-pill);
    box-shadow: 0 0 0 2px var(--sparc-editor-control-surface);
    pointer-events: none;
    z-index: 20;
  }

  .sparc-drop-marker-inside {
    height: auto;
    min-width: 0;
    background: transparent;
    border: 2px dashed var(--app-info-color);
    border-radius: var(--sparc-editor-border-radius-lg);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--app-info-color) 20%, transparent);
  }

  .sparc-drop-label {
    position: sticky;
    top: 0;
    z-index: 21;
    width: fit-content;
    max-width: min(320px, 100%);
    margin: var(--app-space-0) var(--app-space-0) var(--sparc-editor-gap-sm) auto;
    border: 1px solid var(--app-info-color);
    background: var(--app-info-surface-color);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
    font-size: calc(var(--app-font-size-base) * 0.8);
    pointer-events: none;
  }

  .sparc-node-list-bottom {
    flex: 1 1 50%;
    min-height: 120px;
    overflow: auto;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-panel-surface);
    border-radius: var(--sparc-editor-border-radius-lg);
    padding: var(--sparc-editor-panel-padding);
  }

  .sparc-node-list {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-node-row {
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

  .sparc-node-row.selected {
    border-color: var(--app-info-color);
    background: var(--app-info-surface-color);
  }

  .sparc-node-row small {
    color: var(--app-secondary-text-color);
  }

  @media (max-width: 1000px) {
    .sparc-visual-editor-surface {
      min-height: 320px;
    }
  }
</style>
