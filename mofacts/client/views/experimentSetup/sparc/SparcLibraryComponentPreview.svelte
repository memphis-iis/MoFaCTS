<script>
  import SparcNode from '../../experiment/svelte/components/SparcNode.svelte';
  import { sparcLibraryPreviewNode } from './sparcLibraryPreview';
  import SparcLibraryRaster from './SparcLibraryRaster.svelte';
  import SparcLibraryThumbnail from './SparcLibraryThumbnail.svelte';
  export let entry;
  export let onSelect;
  export let selectionLabel;
  export let selected = undefined;
  $: previewNode = entry.kind !== 'image' ? sparcLibraryPreviewNode(entry, 'thumbnail') : undefined;
</script>

{#if entry.kind === 'image'}
  <SparcLibraryRaster assetId={entry.image.assetId} description={entry.image.description} displayWidth={entry.image.displayWidth} thumbnail={true} {onSelect} {selectionLabel} {selected} />
{:else}
  <SparcLibraryThumbnail {onSelect} {selectionLabel} {selected}><SparcNode node={previewNode} /></SparcLibraryThumbnail>
{/if}
