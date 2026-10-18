<script>
  import { onDestroy } from 'svelte';
  import { meteorCallAsync } from '../../..';
  import { getErrorMessage } from '../../../lib/errorUtils';
  import SparcLibraryRaster from './SparcLibraryRaster.svelte';
  import SparcLibraryDelete from './SparcLibraryDelete.svelte';
  import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../../../common/lib/sparcPromptImage';
  export let image;
  export let onDeleted = () => {};
  export let onReplacement = () => {};
  let alive = true;
  let saving = false;
  let saveError = '';
  let saveMessage = '';
  let editing = false;
  let replacing = false;
  let replacementDescription = '';
  let replacementFile;
  let replacementDataUrl = '';
  let replacementError = '';
  let reading = false;
  let fileGeneration = 0;
  function openReplacement() {
    editing = true; replacementDescription = image.description; replacementFile = undefined;
    replacementDataUrl = ''; replacementError = ''; saveMessage = '';
  }
  async function selectFile(event) {
    const generation = ++fileGeneration;
    const file = event.currentTarget.files?.[0];
    replacementFile = undefined; replacementDataUrl = ''; replacementError = ''; reading = false;
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > SPARC_PROMPT_IMAGE_SETTINGS.maxBytes || !file.size) {
      replacementError = 'Choose a PNG, JPEG or WebP image of at most 8 MB.'; return;
    }
    reading = true;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
      });
      const preview = new Image(); preview.src = dataUrl;
      await preview.decode();
      if (alive && generation === fileGeneration) { replacementFile = file; replacementDataUrl = dataUrl; }
    } catch (failure) { if (alive && generation === fileGeneration) replacementError = 'Could not read the selected image. Choose a valid raster image.'; }
    finally { if (alive && generation === fileGeneration) reading = false; }
  }
  async function replace() {
    if (!replacementFile || reading || replacing || saving || !alive) return;
    replacing = true; replacementError = ''; saveMessage = '';
    try {
      const replacement = await meteorCallAsync('replaceSparcLibraryImage', { assetId: image.assetId, description: replacementDescription, mediaType: replacementFile.type,
        base64: replacementDataUrl.slice(replacementDataUrl.indexOf(',') + 1) });
      onReplacement(replacement);
      if (alive) {
        editing = false; replacementFile = undefined; replacementDataUrl = '';
        saveMessage = 'Revision saved.';
      }
    } catch (failure) { if (alive) replacementError = getErrorMessage(failure); }
    finally { if (alive) replacing = false; }
  }
  onDestroy(() => { alive = false; fileGeneration++; });
</script>

<div class="image-card">
  <div class="curation-control">
    <SparcLibraryDelete id={image.assetId} disabled={saving || replacing} {onDeleted} />
    <span role="status">{saveMessage}</span>
  </div>
  {#if saveError}<p role="alert">{saveError}</p>{/if}
  <div class="version-controls">
    <button type="button" class="btn btn-outline-secondary" disabled={saving || replacing || editing} on:click={openReplacement}>Revise image</button>
  </div>
  {#if editing}
    <form on:submit|preventDefault={replace}>
      <p>Replace this image for the same teaching situation. Only the current image is kept.</p>
      <label for={`replacement-file-${image.assetId}`}>Replacement image</label>
      <input id={`replacement-file-${image.assetId}`} class="form-control" type="file" accept="image/png,image/jpeg,image/webp" disabled={replacing} on:change={selectFile} />
      {#if reading}<p role="status">Reading image…</p>{/if}
      {#if replacementDataUrl}<img class="preview" src={replacementDataUrl} alt="Selected replacement preview" />{/if}
      <label for={`replacement-description-${image.assetId}`}>Description of the replacement image</label>
      <textarea id={`replacement-description-${image.assetId}`} class="form-control" bind:value={replacementDescription} required maxlength="2048" rows="4" disabled={replacing}></textarea>
      <p>This description helps future questions refer accurately to the image.</p>
      {#if replacementError}<p role="alert">{replacementError}</p>{/if}
      <button type="submit" class="btn btn-primary" disabled={!replacementFile || reading || replacing || saving}>{replacing ? 'Saving revision…' : 'Save revision'}</button>
      <button type="button" class="btn btn-outline-secondary" disabled={replacing} on:click={() => { editing = false; fileGeneration++; replacementDataUrl = ''; replacementFile = undefined; reading = false; }}>Cancel</button>
    </form>
  {/if}
  <figure>
  {#key image}<SparcLibraryRaster assetId={image.assetId} description={image.description} />{/key}
  <figcaption>
    <p>{image.description}</p>
    {#if image.createdAt}<small>Created {new Date(image.createdAt).toLocaleString()}</small>{/if}
    {#if image.model}<small>{image.model}</small>{/if}
  </figcaption>
  </figure>

</div>

<style>
  .image-card { padding: var(--app-space-3-px); border: 1px solid var(--border-color); border-radius: var(--app-border-radius-lg); background: var(--learning-card-surface-color); color: var(--app-text-color); }
  figure { margin: 0; }
  .curation-control { display: flex; flex-wrap: wrap; align-items: center; gap: var(--app-space-3-px); margin-bottom: var(--app-space-3-px); }
  label { display: inline-flex; align-items: center; gap: var(--app-space-2-px); }
  figcaption p { margin-top: var(--app-space-3-px); white-space: pre-wrap; }
  small { display: block; color: var(--app-secondary-text-color); overflow-wrap: anywhere; font-size: calc(var(--app-font-size-base) * .875); }
  .version-controls { display: flex; flex-wrap: wrap; gap: var(--app-space-2-px); margin-bottom: var(--app-space-3-px); }
  form, .history { padding: var(--app-space-3-px); border: 1px solid var(--border-color); border-radius: var(--app-border-radius-sm); background: var(--learning-card-surface-color); margin-bottom: var(--app-space-3-px); }
  form label, input[type="file"], textarea { display: block; width: 100%; margin-bottom: var(--app-space-2-px); }
  textarea.form-control { border-radius: var(--app-border-radius-sm); min-height: var(--app-text-input-height); }
  .preview { display: block; width: 100%; height: auto; margin-bottom: var(--app-space-3-px); }
  h3 { font-family: var(--app-heading-font-family); color: var(--app-page-header-text-color); font-size: calc(var(--app-font-size-base) * 1.1); font-weight: var(--app-font-weight-semibold); line-height: var(--app-line-height-tight); margin-top: 0; margin-bottom: var(--app-space-3-px); }
  article + article { border-top: 1px solid var(--border-color); padding-top: var(--app-space-3-px); margin-top: var(--app-space-3-px); }
</style>
