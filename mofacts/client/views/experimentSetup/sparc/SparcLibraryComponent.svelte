<script>
  import DOMPurify from 'dompurify';
  import { meteorCallAsync } from '../../..';
  import { getErrorMessage } from '../../../lib/errorUtils';
  import { renderSparcInstructionMarkdown } from '../../experiment/svelte/services/sparcInstructionMarkdown';
  import SparcLibraryRaster from './SparcLibraryRaster.svelte';
  export let entry;
  export let onChanged = () => {};
  export let onReuseChanged = () => {};
  let draft, saving = false, error = '', notice = '';
  const labels = { feedback: 'Feedback', explanation: 'Explanation', richContent: 'Support', question: 'Question' };
  function edit() { draft = JSON.parse(JSON.stringify(entry.content)); error = ''; notice = ''; }
  async function reuse() {
    saving = true; error = '';
    try { await meteorCallAsync('setSparcMoveReusable', entry.id, !entry.reusable); entry = { ...entry, reusable: !entry.reusable }; onReuseChanged(entry.id, entry.reusable); notice = 'Reuse status saved.'; }
    catch (failure) { error = getErrorMessage(failure); } finally { saving = false; }
  }
  async function save() {
    saving = true; error = '';
    try { await meteorCallAsync('reviseSparcPrimitive', entry.id, draft); draft = undefined; onChanged(); }
    catch (failure) { error = getErrorMessage(failure); } finally { saving = false; }
  }
</script>

<article aria-label="Selected instructional component">
  <h2>{labels[entry.kind]}{entry.reusable ? '' : ' · Excluded'}</h2>
  <p>{entry.move} · {entry.target}</p>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if draft}
    <form on:submit|preventDefault={save}>
      <label>Instructional text (Markdown)<textarea class="form-control" rows="8" bind:value={draft.text} maxlength="2048" required></textarea></label>
      {#if draft.supportHeading !== undefined}<label>Support heading<input class="form-control" bind:value={draft.supportHeading} maxlength="60" /></label>{/if}
      {#each draft.choices ?? [] as choice, index}
        <label>Option {index + 1}<input class="form-control" bind:value={choice.label} maxlength="240" required /></label>
        <label><input type="checkbox" bind:checked={choice.correct} /> Correct answer</label>
      {/each}
      <button class="btn btn-primary" disabled={saving} type="submit">Save revision</button>
      <button class="btn btn-outline-secondary" disabled={saving} type="button" on:click={() => draft = undefined}>Cancel</button>
    </form>
  {:else}
    <div class="component-content">{@html renderSparcInstructionMarkdown(entry.content.text, DOMPurify.sanitize.bind(DOMPurify))}</div>
    {#if entry.content.figure}<SparcLibraryRaster assetId={entry.content.figure.assetId} description={entry.content.figure.description} />{/if}
    {#if entry.content.choices}<ol>{#each entry.content.choices as choice}<li>{choice.label}{choice.correct ? ' (correct)' : ''}</li>{/each}</ol>{/if}
    <button class="btn btn-outline-primary" type="button" disabled={saving} on:click={edit}>Revise</button>
    <button class="btn btn-outline-secondary" type="button" disabled={saving} on:click={reuse}>{entry.reusable ? 'Exclude from reuse' : 'Allow reuse'}</button>
  {/if}
</article>

<style>
  article { padding: var(--app-space-4-px); border: 1px solid var(--border-color); border-radius: var(--app-border-radius-lg); background: var(--learning-card-surface-color); }
  h2 { font-size: calc(var(--app-font-size-base) * 1.25); }
  label { display: block; margin-block: var(--app-space-2-px); }
  .btn { margin-block: var(--app-space-2-px); }
  .component-content { overflow-x: auto; }
  .component-content :global(table) { border-collapse: collapse; }
  .component-content :global(th), .component-content :global(td) { padding: var(--app-space-2-px); border: 1px solid var(--border-color); }
</style>
