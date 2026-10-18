<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { meteorCallAsync } from '../../..';
  import { getErrorMessage } from '../../../lib/errorUtils';
  import { createTemplateLifetime } from '../../../lib/adminUi/templateLifetime';
  import SparcLibraryImage from './SparcLibraryImage.svelte';
  import SparcLibraryComponent from './SparcLibraryComponent.svelte';
  import SparcLibraryComponentPreview from './SparcLibraryComponentPreview.svelte';
  const lifetime = createTemplateLifetime();
  const labels = { image: 'Image', feedback: 'Feedback', explanation: 'Explanation', richContent: 'Support', question: 'Question' };
  let overview, selectedTopic, selectedCluster, selectedId, selectedPanel;
  let view = 'groups', entries = [], nextCursor = null, loading = false, error = '', initialized = false;
  $: selected = entries.find(entry => entry.id === selectedId);
  async function selectEntry(id) { selectedId = id; await tick(); if (!lifetime.isDestroyed()) selectedPanel?.scrollIntoView({ block: 'start', behavior: 'instant' }); }
  function onReuseChanged(id, reusable) { entries = entries.map(entry => entry.id === id ? { ...entry, reusable, ...(entry.kind === 'image' ? { image: { ...entry.image, reusable } } : {}) } : entry); }
  function onReplacement(image) { entries = entries.map(entry => entry.id === image.libraryId ? { ...entry, image } : entry); }
  async function load() {
    if (loading || lifetime.isDestroyed()) return;
    const generation = lifetime.begin(); loading = true; error = '';
    try {
      if (view === 'groups') {
        const result = await meteorCallAsync('getSparcLibraryClusters');
        if (!lifetime.isCurrent(generation)) return; overview = result;
      } else if (view !== 'subgroups') {
        const params = view === 'cluster' ? { snapshotId: overview.snapshotId, clusterId: selectedCluster.id, ...(nextCursor ? { cursor: nextCursor } : {}) } : (nextCursor ? { after: nextCursor } : {});
        const page = await meteorCallAsync('listSparcInstructionalComponents', params);
        if (!lifetime.isCurrent(generation)) return; entries = [...entries, ...page.entries]; nextCursor = page.nextCursor;
      }
      initialized = true;
    } catch (failure) { if (lifetime.isCurrent(generation)) error = getErrorMessage(failure); }
    finally { if (lifetime.isCurrent(generation)) loading = false; }
  }
  function changeView(nextView, cluster = undefined) {
    lifetime.supersede(); loading = false; view = nextView;
    selectedCluster = view === 'cluster' ? cluster : undefined;
    if (view === 'subgroups') selectedTopic = cluster;
    else if (view !== 'cluster') selectedTopic = undefined;
    entries = []; selectedId = undefined; nextCursor = null; error = ''; initialized = false;
    if (view === 'groups') overview = undefined;
    void load();
  }
  onMount(() => { void load(); }); onDestroy(() => lifetime.destroy());
</script>

<div class="instructional-library">
  <a class="btn btn-outline-secondary" href="/contentUpload">Back to content</a>
  <h1>Instructional content library</h1>
  <p>Choose a topic, then a subgroup to browse instructional components, including images.</p>
  <div class="browse-controls" aria-label="Instructional library views">
    <button type="button" class="btn btn-outline-primary" aria-pressed={view === 'groups'} on:click={() => changeView('groups')}>Topics</button>
    <button type="button" class="btn btn-outline-primary" aria-pressed={view === 'all'} on:click={() => changeView('all')}>All components</button>
  </div>
  {#if view === 'subgroups' || view === 'cluster'}
    <nav class="browse-path" aria-label="Library location">
      <button type="button" class="btn btn-link" on:click={() => changeView('groups')}>Topics</button>
      <span aria-hidden="true">/</span>
      {#if view === 'cluster'}
        <button type="button" class="btn btn-link" on:click={() => changeView('subgroups', selectedTopic)}>{selectedTopic.label}</button>
        <span aria-hidden="true">/</span><span aria-current="page">{selectedCluster.label}</span>
      {:else}<span aria-current="page">{selectedTopic.label}</span>{/if}
    </nav>
  {/if}
  {#if view === 'subgroups'}<h2>{selectedTopic.label}</h2><p>{selectedTopic.count} components in {selectedTopic.subclusters.length} {selectedTopic.subclusters.length === 1 ? 'subgroup' : 'subgroups'}. Choose a subgroup to view its components.</p>{/if}
  {#if view === 'cluster'}<h2>{selectedCluster.label}</h2><p>{selectedCluster.count} components, sorted by type, then from the group's center outward within each type.</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if loading}<p role="status">{view === 'groups' ? 'Organizing instructional components…' : 'Loading instructional components…'}</p>{/if}
  {#if view === 'groups' && overview}
    <p>{overview.total} components in {overview.clusters.length} {overview.clusters.length === 1 ? 'topic' : 'topics'}.</p>
  {/if}
  {#if (view === 'groups' && overview) || view === 'subgroups'}
    <div class="thumbnail-grid" aria-label={view === 'groups' ? 'Instructional content topics' : 'Instructional content subgroups'}>
      {#each (view === 'groups' ? overview.clusters : selectedTopic.subclusters) as cluster (cluster.id)}
        <article class="cluster-card">
          <SparcLibraryComponentPreview entry={cluster.representative} onSelect={() => changeView(view === 'groups' ? 'subgroups' : 'cluster', cluster)} selectionLabel={'Open ' + cluster.label + (view === 'groups' ? ' topic' : ' subgroup')} />
          <button type="button" class="btn btn-outline-primary cluster-select" on:click={() => changeView(view === 'groups' ? 'subgroups' : 'cluster', cluster)}>{cluster.label} · {cluster.count} components{view === 'groups' ? ' · ' + cluster.subclusters.length + (cluster.subclusters.length === 1 ? ' subgroup' : ' subgroups') : ''}</button>
        </article>
      {/each}
    </div>
  {/if}
  {#if (view === 'cluster' || view === 'all') && entries.length}
    <section class="selected-image" bind:this={selectedPanel} aria-label="Selected instructional component">
      {#if selected}
        {#key selected.id}
          {#if selected.kind === 'image'}<SparcLibraryImage image={selected.image} {onReuseChanged} {onReplacement} />
          {:else}<SparcLibraryComponent entry={selected} {onReuseChanged} onChanged={() => changeView('groups')} />{/if}
        {/key}
      {:else}<p>Select a component to inspect it above the grid.</p>{/if}
    </section>
    <div class="thumbnail-grid" aria-label={view === 'cluster' ? 'Components in this group' : 'All instructional components'}>
      {#each entries as entry, index (entry.id)}
        <div class="thumbnail-card" class:selected={selectedId === entry.id}>
          <SparcLibraryComponentPreview {entry} selected={selectedId === entry.id} onSelect={() => selectEntry(entry.id)} selectionLabel={'Inspect ' + labels[entry.kind].toLowerCase() + ' ' + (index + 1)} />
          <span>{labels[entry.kind]}{entry.reusable ? '' : ' · Excluded'}</span>
        </div>
      {/each}
    </div>
  {/if}
  {#if initialized && !loading && (view === 'groups' ? !overview?.total : (view === 'cluster' || view === 'all') && !entries.length)}<p>No instructional components have been added yet.</p>{/if}
  {#if error || nextCursor}<button type="button" class="btn btn-outline-primary" disabled={loading} on:click={load}>{error ? 'Retry' : 'Show more components'}</button>{/if}
</div>

<style>
  .instructional-library { padding: var(--app-space-4-px); font-family: var(--app-font-family); font-size: var(--app-font-size-base); color: var(--app-text-color); line-height: var(--app-line-height-normal); }
  h1, h2 { font-family: var(--app-heading-font-family); color: var(--app-page-header-text-color); font-weight: var(--app-font-weight-bold); line-height: var(--app-line-height-tight); }
  /* Match the shared app header's theme-relative title size, rather than the global hero h1. */
  h1 { font-size: calc(var(--app-font-size-base) * 1.5); margin-top: var(--app-space-4-px); margin-bottom: var(--app-space-3-px); }
  h2 { font-size: calc(var(--app-font-size-base) * 1.25); margin-top: var(--app-space-4-px); margin-bottom: var(--app-space-2-px); }
  .browse-controls { display: flex; gap: var(--app-space-3-px); margin-bottom: var(--app-space-4-px); }
  .browse-path { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--app-space-2-px); }
  .browse-path .btn { padding-inline: 0; white-space: normal; text-align: start; }
  .cluster-card { min-width: 0; }
  .cluster-select { width: 100%; margin-top: var(--app-space-2-px); white-space: normal; overflow-wrap: anywhere; font-size: calc(var(--app-font-size-base) * .85); }
  .selected-image { max-width: calc(960px * var(--app-density-scale)); margin-bottom: var(--app-space-4-px); scroll-margin-top: calc(var(--home-header-height) + var(--app-space-3-px)); }
  .thumbnail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(160px * var(--app-density-scale))), 1fr)); gap: var(--app-space-3-px); margin-bottom: var(--app-space-4-px); }
  .thumbnail-card { min-width: 0; }
  .thumbnail-card > span { display: block; margin-top: var(--app-space-2-px); font-size: calc(var(--app-font-size-base) * .85); }
</style>
