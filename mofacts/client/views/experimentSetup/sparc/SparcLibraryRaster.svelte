<script>
  import { onMount } from 'svelte';
  import { meteorCallAsync } from '../../..';
  import { getErrorMessage } from '../../../lib/errorUtils';
  export let assetId;
  export let description;
  export let interactive = true;
  export let thumbnail = false;
  export let onSelect = undefined;
  export let selected = undefined;
  export let selectionLabel = 'Select image';
  export let controlsId = undefined;
  let container;
  let dataUrl = '';
  let fullSizeUrl = '';
  let error = '';
  let loading = false;
  let alive = true;
  async function load() {
    if (loading || dataUrl || !alive) return;
    loading = true; error = '';
    try {
      const result = await meteorCallAsync('getSparcPromptImage', assetId);
      const raster = interactive && !onSelect ? await (await fetch(result.dataUrl)).blob() : undefined;
      if (alive) { dataUrl = result.dataUrl; if (raster) fullSizeUrl = URL.createObjectURL(raster); }
    } catch (failure) { if (alive) error = getErrorMessage(failure); }
    finally { if (alive) loading = false; }
  }
  onMount(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: '200px' });
    observer.observe(container);
    return () => { alive = false; observer.disconnect(); if (fullSizeUrl) URL.revokeObjectURL(fullSizeUrl); };
  });
</script>

<div class="image" class:thumbnail bind:this={container} aria-busy={loading}>
  {#if dataUrl}
    {#if onSelect}<button type="button" class="thumbnail-select" aria-label={selectionLabel} aria-pressed={selected} aria-controls={controlsId} on:click={onSelect}><img src={dataUrl} alt={description} /></button>
    {:else if interactive}<a href={fullSizeUrl} target="_blank" rel="noopener" aria-label="Open full-size image"><img src={dataUrl} alt={description} /></a>
    {:else}<img src={dataUrl} alt={description} />{/if}
  {:else if error}
    <p role="alert">{error}</p>
    <button type="button" class="btn btn-outline-secondary" on:click={load}>Retry image</button>
  {:else}<p role="status">Loading image…</p>{/if}
</div>

<style>
  .image { min-height: calc(180px * var(--app-density-scale)); display: grid; place-items: center; background: var(--learning-card-stimulus-surface-color); }
  img { display: block; width: 100%; height: auto; }
  .thumbnail { min-height: calc(120px * var(--app-density-scale)); }
  .thumbnail-select { width: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .thumbnail-select:focus-visible { outline: 3px solid var(--focus-ring-color); outline-offset: 3px; }
  .thumbnail img { height: calc(120px * var(--app-density-scale)); object-fit: contain; }
</style>
