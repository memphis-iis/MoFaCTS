<script>
  import { onDestroy } from 'svelte';
  import { meteorCallAsync } from '../../..';
  import { getErrorMessage } from '../../../lib/errorUtils';
  import SparcLibraryRaster from './SparcLibraryRaster.svelte';
  import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../../../common/lib/sparcPromptImage';
  export let image;
  export let onReuseChanged = () => {};
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
  let historyOpen = false;
  let historyLoading = false;
  let historyError = '';
  let versions = [];
  let historyCursor = null;
  let historyLoaded = false;
  let historyGeneration = 0;
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
      const replacement = await meteorCallAsync('replaceSparcLibraryImage', { libraryId: image.libraryId,
        expectedAssetId: image.assetId, description: replacementDescription, mediaType: replacementFile.type,
        base64: replacementDataUrl.slice(replacementDataUrl.indexOf(',') + 1) });
      onReplacement(replacement);
      if (alive) {
        editing = false; replacementFile = undefined; replacementDataUrl = '';
        historyGeneration++; historyLoading = false;
        historyOpen = false; versions = []; historyLoaded = false; historyCursor = null;
        saveMessage = 'Replacement saved. Previous images are in Old versions.';
      }
    } catch (failure) { if (alive) replacementError = getErrorMessage(failure); }
    finally { if (alive) replacing = false; }
  }
  async function loadHistory() {
    if (historyLoading || !alive) return;
    const generation = ++historyGeneration;
    historyLoading = true; historyError = '';
    try {
      const page = await meteorCallAsync('listSparcLibraryImageVersions', { libraryId: image.libraryId,
        ...(historyCursor === null ? {} : { beforeRevision: historyCursor }) });
      if (alive && generation === historyGeneration) { versions = [...versions, ...page.versions]; historyCursor = page.nextCursor; historyLoaded = true; }
    } catch (failure) { if (alive && generation === historyGeneration) historyError = getErrorMessage(failure); }
    finally { if (alive && generation === historyGeneration) historyLoading = false; }
  }
  function toggleHistory() {
    historyOpen = !historyOpen;
    if (historyOpen && !historyLoaded) void loadHistory();
  }
  async function setDeprecated(event) {
    const checkbox = event.currentTarget;
    if (saving || !alive) return;
    const reusable = !checkbox.checked;
    saving = true;
    saveError = '';
    saveMessage = '';
    try {
      const result = await meteorCallAsync('setSparcLibraryImageReusable', { assetId: image.libraryId, reusable });
      onReuseChanged(result.assetId, result.reusable);
      if (alive) {
        saveMessage = result.reusable ? 'Available for reuse.' : 'Deprecated. Excluded from future reuse.';
      }
    } catch (failure) {
      if (alive) { checkbox.checked = !image.reusable; saveError = getErrorMessage(failure); }
    } finally { if (alive) saving = false; }
  }
  onDestroy(() => { alive = false; fileGeneration++; historyGeneration++; });
</script>

<div class="image-card">
  <div class="deprecation-control">
    <label><input type="checkbox" checked={!image.reusable} disabled={saving || replacing} on:change={setDeprecated} /> Deprecated</label>
    <span role="status">{saving ? 'Saving…' : saveMessage}</span>
  </div>
  {#if saveError}<p role="alert">{saveError}</p>{/if}
  <div class="version-controls">
    <button type="button" class="btn btn-outline-secondary" disabled={saving || replacing || editing} on:click={openReplacement}>Replace image</button>
    {#if image.revision > 0}<button type="button" class="btn btn-link" aria-expanded={historyOpen} disabled={replacing} on:click={toggleHistory}>Old versions ({image.revision})</button>{/if}
  </div>
  {#if editing}
    <form on:submit|preventDefault={replace}>
      <p>Upload a replacement for the same teaching situation. Earlier images will be retained.</p>
      <label for={`replacement-file-${image.libraryId}`}>Replacement image</label>
      <input id={`replacement-file-${image.libraryId}`} class="form-control" type="file" accept="image/png,image/jpeg,image/webp" disabled={replacing} on:change={selectFile} />
      {#if reading}<p role="status">Reading image…</p>{/if}
      {#if replacementDataUrl}<img class="preview" src={replacementDataUrl} alt="Selected replacement preview" />{/if}
      <label for={`replacement-description-${image.libraryId}`}>Description of the replacement image</label>
      <textarea id={`replacement-description-${image.libraryId}`} class="form-control" bind:value={replacementDescription} required maxlength="2048" rows="4" disabled={replacing}></textarea>
      <p>This description helps future questions refer accurately to the image.</p>
      {#if replacementError}<p role="alert">{replacementError}</p>{/if}
      <button type="submit" class="btn btn-primary" disabled={!replacementFile || reading || replacing || saving}>{replacing ? 'Saving replacement…' : 'Save replacement'}</button>
      <button type="button" class="btn btn-outline-secondary" disabled={replacing} on:click={() => { editing = false; fileGeneration++; replacementDataUrl = ''; replacementFile = undefined; reading = false; }}>Cancel</button>
    </form>
  {/if}
  <figure>
  {#key image.assetId}<SparcLibraryRaster assetId={image.assetId} description={image.description} />{/key}
  <figcaption>
    <p>{image.reusable ? 'Available for reuse' : 'Excluded from future reuse'}</p>
    <p>{image.description}</p>
    {#if image.createdAt}<small>Created {new Date(image.createdAt).toLocaleString()}</small>{/if}
    {#if image.model}<small>{image.model}</small>{/if}
  </figcaption>
  </figure>
  {#if historyOpen}
    <div class="history">
      <h3>Old versions</h3>
      {#if historyLoading}<p role="status">Loading old versions…</p>{/if}
      {#if historyError}<p role="alert">{historyError}</p>{/if}
      {#each versions as version (version.assetId)}
        <article>
          <p>{version.revision === 0 ? 'Original image' : `Replacement ${version.revision}`} · {new Date(version.createdAt).toLocaleString()}</p>
          <SparcLibraryRaster assetId={version.assetId} description={version.description} />
          <p>{version.description}</p><small>{version.model}</small>
        </article>
      {/each}
      {#if historyLoaded && !versions.length && !historyLoading}<p>No old versions.</p>{/if}
      {#if historyCursor !== null || historyError}<button type="button" class="btn btn-outline-secondary" disabled={historyLoading} on:click={loadHistory}>{historyError ? 'Retry history' : 'Show more old versions'}</button>{/if}
    </div>
  {/if}
</div>

<style>
  .image-card { padding: var(--app-space-3-px); border: 1px solid var(--border-color); border-radius: var(--app-border-radius-lg); background: var(--learning-card-surface-color); color: var(--app-text-color); }
  figure { margin: 0; }
  .deprecation-control { display: flex; flex-wrap: wrap; align-items: center; gap: var(--app-space-3-px); margin-bottom: var(--app-space-3-px); }
  .deprecation-control input[type="checkbox"] { accent-color: var(--app-accent-color); width: var(--app-font-size-base); height: var(--app-font-size-base); margin: 0; }
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
