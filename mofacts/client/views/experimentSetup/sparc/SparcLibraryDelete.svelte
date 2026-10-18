<script>
  import { meteorCallAsync } from '../../..';
  import { getErrorMessage } from '../../../lib/errorUtils';
  export let id;
  export let disabled = false;
  export let onDeleted = () => {};
  let confirming = false, deleting = false, error = '';
  async function remove() {
    deleting = true; error = '';
    try { await meteorCallAsync('deleteSparcInstructionalComponent', id); onDeleted(); }
    catch (failure) { error = getErrorMessage(failure); }
    finally { deleting = false; }
  }
</script>

{#if confirming}
  <p>Delete this component permanently? Saved displays will show “Administrative removal”.</p>
  <button type="button" class="btn btn-danger" disabled={deleting || disabled} on:click={remove}>{deleting ? 'Deleting…' : 'Delete permanently'}</button>
  <button type="button" class="btn btn-outline-secondary" disabled={deleting} on:click={() => confirming = false}>Cancel</button>
{:else}
  <button type="button" class="btn btn-outline-danger" {disabled} on:click={() => confirming = true}>Delete</button>
{/if}
{#if error}<p role="alert">{error}</p>{/if}
