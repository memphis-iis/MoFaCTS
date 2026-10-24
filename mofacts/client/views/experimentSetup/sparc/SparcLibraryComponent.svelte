<script>
  import { meteorCallAsync } from '../../..';
  import { getErrorMessage } from '../../../lib/errorUtils';
  import SparcNode from '../../experiment/svelte/components/SparcNode.svelte';
  import { sparcLibraryPreviewNode } from './sparcLibraryPreview';
  import SparcLibraryDelete from './SparcLibraryDelete.svelte';
  export let entry;
  export let onChanged = () => {};
  let draft, saving = false, error = '', notice = '';
  $: previewNode = sparcLibraryPreviewNode(entry);
  const labels = { instruction: 'Instruction', feedback: 'Feedback', explanation: 'Explanation', richContent: 'Support', question: 'Question', video: 'Video passage' };
  function edit() { draft = JSON.parse(JSON.stringify(entry.content)); error = ''; notice = ''; }
  async function save() {
    saving = true; error = '';
    try { await meteorCallAsync('reviseSparcPrimitive', entry.id, draft); draft = undefined; onChanged(); }
    catch (failure) { error = getErrorMessage(failure); } finally { saving = false; }
  }
</script>

<article aria-label="Selected instructional component">
  <h2>{labels[entry.kind]}</h2>
  <p>{entry.move} · {entry.target}</p>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if draft}
    <form on:submit|preventDefault={save}>
      {#each draft.support ? [draft, draft.support] : [draft] as part}
      <label>Instructional text (Markdown)<textarea class="form-control" rows="8" bind:value={part.text} maxlength="2048" required></textarea></label>
      {#if part.supportHeading !== undefined}<label>Support heading<input class="form-control" bind:value={part.supportHeading} maxlength="60" /></label>{/if}
      {/each}
      {#each draft.choices ?? [] as choice, index}
        <label>Option {index + 1}<input class="form-control" bind:value={choice.label} maxlength="240" required /></label>
        <label><input type="checkbox" bind:checked={choice.correct} /> Correct answer</label>
      {/each}
      <button class="btn btn-primary" disabled={saving} type="submit">Save revision</button>
      <button class="btn btn-outline-secondary" disabled={saving} type="button" on:click={() => draft = undefined}>Cancel</button>
    </form>
  {:else}
    <SparcNode node={previewNode} />
    {#if entry.content.choices}<p>Correct answer: {entry.content.choices.filter(choice => choice.correct).map(choice => choice.label).join('; ')}</p>{/if}
    {#if entry.kind !== 'video' && !entry.content.video && !entry.content.support?.video}<button class="btn btn-outline-primary" type="button" disabled={saving} on:click={edit}>Revise</button>{/if}
    <SparcLibraryDelete id={entry.id} disabled={saving} onDeleted={onChanged} />
  {/if}
</article>

<style>
  article { padding: var(--app-space-4-px); border: 1px solid var(--border-color); border-radius: var(--app-border-radius-lg); background: var(--learning-card-surface-color); }
  h2 { font-size: calc(var(--app-font-size-base) * 1.25); }
  label { display: block; margin-block: var(--app-space-2-px); }
  .btn { margin-block: var(--app-space-2-px); }
</style>
