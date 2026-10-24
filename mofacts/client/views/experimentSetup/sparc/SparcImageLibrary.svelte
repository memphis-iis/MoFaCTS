<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { meteorCallAsync } from '../../..';
  import { getErrorMessage } from '../../../lib/errorUtils';
  import { createTemplateLifetime } from '../../../lib/adminUi/templateLifetime';
  import SparcLibraryImage from './SparcLibraryImage.svelte';
  import SparcLibraryComponent from './SparcLibraryComponent.svelte';
  import SparcLibraryComponentPreview from './SparcLibraryComponentPreview.svelte';
  const lifetime = createTemplateLifetime();
  const labels = { instruction: 'Instruction', image: 'Image', feedback: 'Feedback', explanation: 'Explanation', richContent: 'Support', question: 'Question', video: 'Video passage' };
  let overview, selectedTopic, selectedCluster, selectedId, selectedPanel;
  let view = 'groups', entries = [], nextCursor = null, loading = false, error = '', initialized = false;
  $: selected = entries.find(entry => entry.id === selectedId);
  async function selectEntry(id) { selectedId = id; await tick(); if (!lifetime.isDestroyed()) selectedPanel?.scrollIntoView({ block: 'start', behavior: 'instant' }); }
  async function load() {
    if (loading || lifetime.isDestroyed()) return;
    const generation = lifetime.begin(); loading = true; error = '';
    try {
      if (!overview) {
        const result = await meteorCallAsync('getSparcLibraryClusters');
        if (!lifetime.isCurrent(generation)) return; overview = result;
      }
      if (view === 'cluster') {
        const params = { snapshotId: overview.snapshotId, clusterId: selectedCluster.id, ...(nextCursor ? { cursor: nextCursor } : {}) };
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
  onMount(() => { void load().then(() => {
    const topicId = new URLSearchParams(window.location.search).get('topic');
    if (!topicId || lifetime.isDestroyed() || !overview) return;
    const topic = overview.clusters.find(item => item.id === topicId);
    if (!topic) { error = 'This instructional topic is no longer available. Reopen Topics to refresh it.'; return; }
    changeView('subgroups', topic);
  }); }); onDestroy(() => lifetime.destroy());
</script>

<div class="instructional-library">
  <header class="sparc-library-header">
    <h1>Instructional content library</h1>
    <nav class="sparc-library-breadcrumb" aria-label="Library location">
      <ol>
        <li>{#if view === 'groups'}<span aria-current="page">Topics</span>{:else}<a href="/sparcImageLibrary" on:click|preventDefault={() => changeView('groups')}>Topics</a>{/if}</li>
        {#if selectedTopic}
          <li><span class="breadcrumb-separator" aria-hidden="true">/</span>
            {#if view === 'cluster'}<a href={'/sparcImageLibrary?topic=' + selectedTopic.id} on:click|preventDefault={() => changeView('subgroups', selectedTopic)}>{selectedTopic.label}</a>
            {:else}<span aria-current="page">{selectedTopic.label}</span>{/if}
          </li>
        {/if}
        {#if view === 'cluster'}<li><span class="breadcrumb-separator" aria-hidden="true">/</span><span aria-current="page">{selectedCluster.label}</span></li>{/if}
      </ol>
    </nav>
  </header>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if loading}<p role="status">{view === 'groups' ? 'Organizing instructional components…' : 'Loading instructional components…'}</p>{/if}
  {#if (view === 'groups' && overview) || view === 'subgroups'}
    <div class="thumbnail-grid" aria-label={view === 'groups' ? 'Instructional content topics' : 'Instructional content subgroups'}>
      {#each (view === 'groups' ? overview.clusters : selectedTopic.subclusters) as cluster (cluster.id)}
        <article class="cluster-card">
          <SparcLibraryComponentPreview entry={cluster.representative} onSelect={() => changeView(view === 'groups' ? 'subgroups' : 'cluster', cluster)} selectionLabel={'Open ' + cluster.label + (view === 'groups' ? ' topic' : ' subgroup')} />
          <div class="sparc-library-caption">
            <button type="button" class="sparc-library-group-link" on:click={() => changeView(view === 'groups' ? 'subgroups' : 'cluster', cluster)}>{cluster.label}</button>
            <span>{cluster.count} components{view === 'groups' ? ' · ' + cluster.subclusters.length + (cluster.subclusters.length === 1 ? ' subgroup' : ' subgroups') : ''}</span>
          </div>
        </article>
      {/each}
    </div>
  {/if}
  {#if view === 'cluster' && entries.length}
    {#if selected}
      <section class="selected-image" bind:this={selectedPanel} aria-label="Selected instructional component">
        {#key selected.id}
          {#if selected.kind === 'image'}<SparcLibraryImage image={selected.image} onDeleted={() => changeView('groups')} onReplacement={() => changeView('groups')} />
          {:else}<SparcLibraryComponent entry={selected} onChanged={() => changeView('groups')} />{/if}
        {/key}
      </section>
    {/if}
    <div class="thumbnail-grid" aria-label="Components in this group">
      {#each entries as entry, index (entry.id)}
        <div class="thumbnail-card" class:selected={selectedId === entry.id}>
          <SparcLibraryComponentPreview {entry} selected={selectedId === entry.id} onSelect={() => selectEntry(entry.id)} selectionLabel={'Inspect ' + labels[entry.kind].toLowerCase() + ' ' + (index + 1)} />
          <div class="sparc-library-caption">
            <span>{labels[entry.kind]}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
  {#if initialized && !loading && (view === 'groups' ? !overview?.total : view === 'cluster' && !entries.length)}<p>No instructional components have been added yet.</p>{/if}
  {#if error || nextCursor}<button type="button" class="btn btn-outline-primary" disabled={loading} on:click={load}>{error ? 'Retry' : 'Show more components'}</button>{/if}
</div>

<style>
  .instructional-library { padding: var(--app-space-4-px); font-family: var(--app-font-family); font-size: var(--app-font-size-base); color: var(--app-text-color); line-height: var(--app-line-height-normal); }
  .cluster-card { min-width: 0; }
  .selected-image { max-width: calc(960px * var(--app-density-scale)); margin-bottom: var(--app-space-4-px); scroll-margin-top: calc(var(--home-header-height) + var(--app-space-3-px)); }
  .thumbnail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(160px * var(--app-density-scale))), 1fr)); gap: var(--app-space-3-px); margin-bottom: var(--app-space-4-px); }
  .thumbnail-card { min-width: 0; }
</style>
