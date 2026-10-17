<script>
  import DOMPurify from 'dompurify';
  import { renderSparcInstructionMarkdown } from '../../experiment/svelte/services/sparcInstructionMarkdown';
  import SparcLibraryRaster from './SparcLibraryRaster.svelte';
  export let entry;
  export let onSelect;
  export let selectionLabel;
  $: figure = entry.image ?? entry.content?.figure;
</script>

{#if figure}
  <SparcLibraryRaster assetId={figure.assetId} description={figure.description} thumbnail={true} {onSelect} {selectionLabel} />
{:else}
  <button type="button" class="component-preview" aria-label={selectionLabel} on:click={onSelect}>
    <div aria-hidden="true">{@html renderSparcInstructionMarkdown(entry.content.text.slice(0, 600), DOMPurify.sanitize.bind(DOMPurify))}</div>
  </button>
{/if}

<style>
  .component-preview { display: block; width: 100%; height: calc(160px * var(--app-density-scale)); overflow: hidden; text-align: left; color: var(--app-text-color); background: var(--learning-card-surface-color); border: 1px solid var(--border-color); border-radius: var(--app-border-radius-lg); padding: var(--app-space-2-px); cursor: pointer; font: inherit; }
  .component-preview:focus-visible { outline: 2px solid var(--app-info-color); outline-offset: 2px; }
  .component-preview div { overflow: hidden; max-height: 100%; font-size: calc(var(--app-font-size-base) * .85); }
</style>
