<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { meteorCallAsync } from '../../..';
  import { getErrorMessage } from '../../../lib/errorUtils';
  import SparcLibraryImage from './SparcLibraryImage.svelte';
  import SparcLibraryRaster from './SparcLibraryRaster.svelte';
  import { createTemplateLifetime } from '../../../lib/adminUi/templateLifetime';
  const lifetime = createTemplateLifetime();
  let overview;
  let view = 'groups';
  let selectedCluster;
  let selectedLibraryId;
  let selectedPanel;
  let images = [];
  let nextCursor = null;
  let loading = false;
  let error = '';
  let initialized = false;
  $: selectedImage = images.find(image => image.libraryId === selectedLibraryId);
  async function selectImage(libraryId) {
    selectedLibraryId = libraryId;
    await tick();
    if (!lifetime.isDestroyed() && view !== 'groups' && selectedLibraryId === libraryId) {
      selectedPanel?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
  function onReuseChanged(assetId, reusable) {
    if (lifetime.isDestroyed()) return;
    images = images.map(image => image.libraryId === assetId ? { ...image, reusable } : image);
  }
  function onReplacement(replacement) {
    if (lifetime.isDestroyed()) return;
    images = images.map(image => image.libraryId === replacement.libraryId ? replacement : image);
  }
  async function load() {
    if (loading || lifetime.isDestroyed()) return;
    const generation = lifetime.begin();
    loading = true;
    error = '';
    try {
      if (view === 'groups') {
        const result = await meteorCallAsync('getSparcLibraryClusters');
        if (!lifetime.isCurrent(generation)) return;
        overview = result;
      } else {
        const params = view === 'cluster' ? { snapshotId: overview.snapshotId, clusterId: selectedCluster.id,
          ...(nextCursor ? { cursor: nextCursor } : {}) } : (nextCursor ? { afterId: nextCursor } : {});
        const page = await meteorCallAsync('listSparcLibraryImages', params);
        if (!lifetime.isCurrent(generation)) return;
        images = [...images, ...page.images]; nextCursor = page.nextCursor;
      }
      initialized = true;
    } catch (failure) { if (lifetime.isCurrent(generation)) error = getErrorMessage(failure); }
    finally { if (lifetime.isCurrent(generation)) loading = false; }
  }
  function changeView(nextView, cluster = undefined) {
    lifetime.supersede(); loading = false; view = nextView; selectedCluster = cluster;
    images = []; selectedLibraryId = undefined; nextCursor = null; error = ''; initialized = false;
    if (view === 'groups') overview = undefined;
    void load();
  }
  onMount(() => { void load(); });
  onDestroy(() => { lifetime.destroy(); });
</script>

<div class="image-library">
  <a class="btn btn-outline-secondary" href="/contentUpload">Back to content</a>
  <h1>Shared image library</h1>
  <p>Teaching figures from all systems. Any system can reuse a suitable figure when its instructional situation matches.</p>
  <div class="browse-controls" aria-label="Image library views">
    <button type="button" class="btn btn-outline-primary" aria-pressed={view === 'groups'} on:click={() => changeView('groups')}>Groups</button>
    <button type="button" class="btn btn-outline-primary" aria-pressed={view === 'all'} on:click={() => changeView('all')}>All images</button>
  </div>
  {#if view === 'cluster'}<h2>{selectedCluster.label}</h2><p>{selectedCluster.count} images, ordered from the group’s center outward.</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if loading}<p role="status">{view === 'groups' ? 'Organizing images…' : 'Loading images…'}</p>{/if}
  {#if view === 'groups' && overview}
    <p>{overview.total} images in {overview.clusters.length} {overview.clusters.length === 1 ? 'group' : 'groups'}.</p>
    <div class="thumbnail-grid" aria-label="Image groups">
      {#each overview.clusters as cluster (cluster.id)}
        <article class="cluster-card">
          {#key cluster.representativeAssetId}
            <SparcLibraryRaster assetId={cluster.representativeAssetId} description={`Representative figure for ${cluster.label}`}
              thumbnail={true} onSelect={() => changeView('cluster', cluster)} selectionLabel={`Open ${cluster.label} group`} />
          {/key}
          <button type="button" class="btn btn-outline-primary cluster-select" on:click={() => changeView('cluster', cluster)}>{cluster.label} · {cluster.count} images</button>
        </article>
      {/each}
    </div>
  {/if}
  {#if view !== 'groups' && images.length}
    <section class="selected-image" id="selected-library-image" bind:this={selectedPanel} aria-label="Selected image">
      {#if selectedImage}
        {#key selectedImage.libraryId}<SparcLibraryImage image={selectedImage} {onReuseChanged} {onReplacement} />{/key}
      {:else}<p>Select a thumbnail to display its image above the grid.</p>{/if}
    </section>
    <div class="thumbnail-grid" aria-label={view === 'cluster' ? 'Images in this group' : 'All library images'}>
      {#each images as image, index (image.libraryId)}
        <div class="thumbnail-card" class:selected={selectedLibraryId === image.libraryId}>
          {#key image.assetId}
            <SparcLibraryRaster assetId={image.assetId} description={image.description} thumbnail={true}
              onSelect={() => selectImage(image.libraryId)} selected={selectedLibraryId === image.libraryId}
              selectionLabel={`Show image ${index + 1}`} controlsId="selected-library-image" />
          {/key}
          <span>Image {index + 1}{image.reusable ? '' : ' · Deprecated'}</span>
        </div>
      {/each}
    </div>
  {/if}
  {#if initialized && !loading && (view === 'groups' ? !overview?.total : !images.length)}<p>No teaching figures have been added to the shared library yet.</p>{/if}
  {#if error || nextCursor}
    <button type="button" class="btn btn-outline-primary" disabled={loading} on:click={load}>{error ? 'Retry' : 'Show more images'}</button>
  {/if}
</div>

<style>
  .image-library { padding: var(--app-space-4-px); font-family: var(--app-font-family); font-size: var(--app-font-size-base); color: var(--app-text-color); line-height: var(--app-line-height-normal); }
  h1, h2 { font-family: var(--app-heading-font-family); color: var(--app-page-header-text-color); font-weight: var(--app-font-weight-bold); line-height: var(--app-line-height-tight); }
  /* Match the shared app header's theme-relative title size, rather than the global hero h1. */
  h1 { font-size: calc(var(--app-font-size-base) * 1.5); margin-top: var(--app-space-4-px); margin-bottom: var(--app-space-3-px); }
  h2 { font-size: calc(var(--app-font-size-base) * 1.25); margin-top: var(--app-space-4-px); margin-bottom: var(--app-space-2-px); }
  .browse-controls { display: flex; gap: var(--app-space-3-px); margin-bottom: var(--app-space-4-px); }
  .cluster-card { min-width: 0; padding: var(--app-space-2-px); border: 1px solid var(--border-color); border-radius: var(--app-border-radius-lg); background: var(--learning-card-surface-color); }
  .cluster-select { width: 100%; margin-top: var(--app-space-2-px); white-space: normal; overflow-wrap: anywhere; font-size: calc(var(--app-font-size-base) * .85); }
  .selected-image { max-width: calc(960px * var(--app-density-scale)); margin-bottom: var(--app-space-4-px); scroll-margin-top: calc(var(--home-header-height) + var(--app-space-3-px)); }
  .thumbnail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(160px * var(--app-density-scale))), 1fr)); gap: var(--app-space-3-px); margin-bottom: var(--app-space-4-px); }
  .thumbnail-card { min-width: 0; padding: var(--app-space-2-px); border: 2px solid var(--border-color); border-radius: var(--app-border-radius-lg); background: var(--learning-card-surface-color); }
  .thumbnail-card.selected { border-color: var(--app-info-color); }
  .thumbnail-card span { display: block; margin-top: var(--app-space-2-px); font-size: calc(var(--app-font-size-base) * .85); }
</style>
