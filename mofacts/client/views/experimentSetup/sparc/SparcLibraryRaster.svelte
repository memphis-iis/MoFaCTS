<script>
  import { onMount } from 'svelte';
  import SparcFigure from '../../experiment/svelte/components/SparcFigure.svelte';
  import { readSparcPromptImage } from '../../experiment/svelte/services/sparcPromptImage';
  import { getErrorMessage } from '../../../lib/errorUtils';
  import { SPARC_ADMINISTRATIVE_REMOVAL_TEXT } from '../../../../../learning-components/runtime/sparcAdministrativeRemoval';
  export let assetId;
  export let description;
  export let displayWidth = undefined;
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
  let removed = false;
  let loading = false;
  let alive = true;
  $: figure = { assetId, description, ...(displayWidth !== undefined ? { displayWidth } : {}) };
  $: image = Promise.resolve({ dataUrl });
  async function load() {
    if (loading || dataUrl || !alive) return;
    loading = true; error = '';
    try {
      const result = await readSparcPromptImage(assetId);
      if (result.administrativeRemoval) { if (alive) removed = true; return; }
      if (alive) {
        if (interactive && !onSelect) {
          // The authorized read validates this data URL; decode it without a CSP-governed fetch.
          const [metadata, encoded] = result.dataUrl.split(',');
          const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
          const raster = new Blob([bytes.buffer], { type: metadata.slice(5, metadata.indexOf(';')) });
          fullSizeUrl = URL.createObjectURL(raster);
        }
        dataUrl = result.dataUrl;
      }
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

<div class="sparc-library-raster" class:sparc-library-raster-thumbnail={thumbnail} bind:this={container} aria-busy={loading}>
  {#if removed}<p>{SPARC_ADMINISTRATIVE_REMOVAL_TEXT}</p>
  {:else if dataUrl}
    {#if onSelect}<div class="sparc-library-thumbnail">
      <div class="sparc-library-thumbnail-content" aria-hidden="true" inert><SparcFigure {figure} {image} compact={true} /></div>
      <button type="button" class="sparc-library-thumbnail-select" aria-label={selectionLabel} aria-pressed={selected} aria-controls={controlsId} on:click={onSelect}></button>
    </div>
    {:else if interactive}<a href={fullSizeUrl} target="_blank" rel="noopener" aria-label="Open full-size image"><SparcFigure {figure} {image} /></a>
    {:else}<SparcFigure {figure} {image} />{/if}
  {:else if error}
    <p role="alert">{error}</p>
    <button type="button" class="btn btn-outline-secondary" on:click={load}>Retry image</button>
  {:else}<p role="status">Loading image…</p>{/if}
  {#if onSelect && !dataUrl && !removed}
    <!-- Inspect the catalog entry independently of its image file, so curation
         remains available while the file is loading or cannot be read. -->
    <button type="button" class="btn btn-outline-primary" aria-pressed={selected} aria-controls={controlsId} on:click={onSelect}>{selectionLabel}</button>
  {/if}
</div>
