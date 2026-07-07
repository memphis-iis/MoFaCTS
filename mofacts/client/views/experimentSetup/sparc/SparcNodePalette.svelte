<script>
  import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../lib/interfaceI18n';

  export let paletteEntries = [];
  export let paletteIconClass = () => '';
  export let onAddNode = () => {};
  export let onStartPaletteDrag = () => {};
  export let onClearDropState = () => {};

  const sparcText = (key) => translatePlatformString(getActiveUiLocale(), key);
</script>

<aside class="sparc-palette" aria-label={sparcText('sparc.nodePalette')}>
  <div class="sparc-panel-header">
    <h2>{sparcText('sparc.palette')}</h2>
  </div>
  <div class="sparc-palette-grid">
    {#each paletteEntries as entry}
      <button
        type="button"
        class="sparc-palette-item"
        draggable="true"
        on:click={() => onAddNode(entry)}
        on:dragstart={(event) => onStartPaletteDrag(event, entry)}
        on:dragend={onClearDropState}
      >
        <span class={`fa ${paletteIconClass(entry)} sparc-palette-icon`} aria-hidden="true"></span>
        <span class="sparc-palette-text">
          <span>{entry.label}</span>
          <small>{entry.category}</small>
        </span>
      </button>
    {/each}
  </div>
</aside>

<style>
  .sparc-palette {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-panel-surface);
    border-radius: var(--sparc-editor-border-radius-lg);
    padding: var(--sparc-editor-panel-padding);
    min-width: 0;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-panel-header {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-sm);
    justify-content: space-between;
  }

  .sparc-panel-header h2 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 1.1);
  }

  .sparc-palette-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sparc-editor-gap-xs);
  }

  .sparc-palette-item {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
    text-align: left;
    cursor: grab;
    min-height: var(--app-button-height);
  }

  .sparc-palette-item:active {
    cursor: grabbing;
  }

  .sparc-palette-icon {
    flex: 0 0 14px;
    width: 14px;
    text-align: center;
    color: var(--sparc-editor-strong-text-color);
    opacity: 0.95;
    font-size: calc(var(--app-font-size-base) * 0.82);
  }

  .sparc-palette-text {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    line-height: 1.1;
  }

  .sparc-palette-text span,
  .sparc-palette-text small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sparc-palette-text span {
    font-size: calc(var(--app-font-size-base) * 0.78);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .sparc-palette-text small {
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.68);
    white-space: nowrap;
  }
</style>
