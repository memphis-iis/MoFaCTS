<script>
  import SparcNode from '../../experiment/svelte/components/SparcNode.svelte';
  import { sparcLibraryPreviewNode } from './sparcLibraryPreview';
  import SparcLibraryRaster from './SparcLibraryRaster.svelte';
  export let entry;
  export let onSelect;
  export let selectionLabel;
  $: figure = entry.image ?? entry.content?.figure;
  $: previewNode = entry.kind !== 'image' ? sparcLibraryPreviewNode(entry, 'thumbnail') : undefined;
</script>

{#if figure}
  <SparcLibraryRaster assetId={figure.assetId} description={figure.description} displayWidth={figure.displayWidth} thumbnail={true} {onSelect} {selectionLabel} />
{:else}
  <div class="sparc-library-thumbnail">
    <div class="sparc-library-thumbnail-content" aria-hidden="true" inert><SparcNode node={previewNode} /></div>
    <button type="button" class="sparc-library-thumbnail-select" aria-label={selectionLabel} on:click={onSelect}></button>
  </div>
{/if}
