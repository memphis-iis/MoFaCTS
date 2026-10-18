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
{:else if entry.content?.video}
  <div class="sparc-library-thumbnail sparc-library-video-thumbnail">
    <img src={'https://i.ytimg.com/vi/' + entry.content.video.videoId + '/hqdefault.jpg'} alt={entry.content.video.title} loading="lazy" decoding="async" />
    <span class="sparc-library-video-duration" aria-hidden="true">{Math.round(entry.content.video.endSeconds - entry.content.video.startSeconds)} s</span>
    <button type="button" class="sparc-library-thumbnail-select" aria-label={selectionLabel} aria-pressed={selected} title={entry.content.video.title} on:click={onSelect}></button>
  </div>
{:else}
  <SparcLibraryThumbnail {onSelect} {selectionLabel} {selected}><SparcNode node={previewNode} /></SparcLibraryThumbnail>
{/if}
