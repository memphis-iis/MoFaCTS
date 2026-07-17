<script>
  import { tick } from 'svelte';
  import { getActiveUiLocale } from '../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../lib/interfaceI18n';

  export let activeNode = null;
  export let activeParentNode = null;
  export let htmlEditorElement = null;
  export let showRichTextSource = false;
  export let isImageHtmlSelected = false;
  export let selectedImageSrc = '';
  export let selectedImageAlt = '';
  export let selectedImageTitle = '';
  export let selectedHtmlMedia = null;
  export let onSelectParentNode = () => {};
  export let onRemoveActiveNode = () => {};
  export let deleteConfirmation = null;
  export let onCancelDeleteConfirmation = () => {};
  export let onConfirmDeleteNode = () => {};
  export let onUpdateField = () => {};
  export let onUpdateFirstImageAttribute = () => {};
  export let onUpdateFirstHtmlMediaAttribute = () => {};
  export let onUpdateRichTextSource = () => {};
  export let onUpdateOptions = () => {};

  const sparcText = (key) => translatePlatformString(getActiveUiLocale(), key);
  const deleteConfirmationId = 'sparc-delete-node-confirmation';
  let deleteButton;
  let cancelDeleteButton;

  async function openDeleteConfirmation() {
    onRemoveActiveNode();
    await tick();
    cancelDeleteButton?.focus();
  }

  async function cancelDelete() {
    onCancelDeleteConfirmation();
    await tick();
    deleteButton?.focus();
  }

  async function confirmDelete() {
    onConfirmDeleteNode();
    await tick();
    deleteButton?.focus();
  }

  function handleDeleteConfirmationKeydown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cancelDelete();
  }
</script>

<div class="sparc-context-card">
  <h2>{sparcText('sparc.selection')}</h2>
  <div class="sparc-selection-summary">
    <strong>{activeNode.id}</strong>
  </div>
  <div class="sparc-node-action-row">
    {#if activeParentNode}
      <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => onSelectParentNode(activeParentNode)}>
        {sparcText('sparc.selectParentNode')}
      </button>
    {/if}
    <button
      bind:this={deleteButton}
      type="button"
      class="btn btn-outline-danger btn-sm"
      aria-controls={deleteConfirmation ? deleteConfirmationId : undefined}
      aria-expanded={deleteConfirmation ? 'true' : undefined}
      on:click={openDeleteConfirmation}>
      {sparcText('sparc.deleteNode')}
    </button>
  </div>
  {#if deleteConfirmation}
    <div
      id={deleteConfirmationId}
      class="admin-inline-confirmation admin-form-row"
      role="group"
      aria-labelledby={`${deleteConfirmationId}-title`}
      aria-describedby={`${deleteConfirmationId}-message`}
      on:keydown={handleDeleteConfirmationKeydown}>
      <i class="fa fa-exclamation-triangle" aria-hidden="true"></i>
      <div>
        <div id={`${deleteConfirmationId}-title`} class="admin-inline-confirmation-title">{deleteConfirmation.title}</div>
        <div id={`${deleteConfirmationId}-message`} class="admin-inline-confirmation-message">{deleteConfirmation.message}</div>
      </div>
      <div class="admin-inline-confirmation-actions">
        <button bind:this={cancelDeleteButton} type="button" class="btn btn-sm btn-outline-secondary" on:click={cancelDelete}>{sparcText('apkg.cancel')}</button>
        <button type="button" class="btn btn-sm btn-danger" on:click={confirmDelete}>
          <i class="fa fa-trash" aria-hidden="true"></i> {sparcText('admin.delete')}
        </button>
      </div>
    </div>
  {/if}
  <label>
    {sparcText('sparc.nodeId')}
    <input value={activeNode.id || ''} on:input={(event) => onUpdateField('id', event.currentTarget.value)} />
  </label>
  {#if activeNode.nodeType === 'group'}
    <label>
      {sparcText('sparc.nodeType')}
      <input value={activeNode.groupType || ''} on:input={(event) => onUpdateField('groupType', event.currentTarget.value)} />
    </label>
  {:else}
    <label>
      {sparcText('sparc.nodeType')}
      <input value={activeNode.atomType || ''} readonly />
    </label>
    {#if isImageHtmlSelected}
      <div class="sparc-image-editor">
        <div class="sparc-image-preview">
          {@html activeNode.value || ''}
        </div>
        <label>
          {sparcText('sparc.imageFileOrUrl')}
          <input value={selectedImageSrc} on:input={(event) => onUpdateFirstImageAttribute('src', event.currentTarget.value)} />
        </label>
        <label>
          {sparcText('sparc.altText')}
          <input value={selectedImageAlt} on:input={(event) => onUpdateFirstImageAttribute('alt', event.currentTarget.value)} />
        </label>
        <label>
          {sparcText('sparc.titleField')}
          <input value={selectedImageTitle} on:input={(event) => onUpdateFirstImageAttribute('title', event.currentTarget.value)} />
        </label>
      </div>
    {:else if selectedHtmlMedia}
      <div class="sparc-media-editor">
        <div class="sparc-selection-summary sparc-media-summary">
          <strong>{selectedHtmlMedia.tagName}</strong>
          <small>{selectedHtmlMedia.src || sparcText('sparc.noMediaUrl')}</small>
        </div>
        {#if selectedHtmlMedia.hasLocalhostUrl}
          <div class="sparc-media-warning">
            {sparcText('sparc.localhostEmbedWarning')}
          </div>
        {/if}
        <label>
          {sparcText('sparc.mediaUrl')}
          <input value={selectedHtmlMedia.src} on:input={(event) => onUpdateFirstHtmlMediaAttribute('src', event.currentTarget.value)} />
        </label>
        {#if selectedHtmlMedia.tagName === 'iframe'}
          <label>
            {sparcText('sparc.frameTitle')}
            <input value={selectedHtmlMedia.title} on:input={(event) => onUpdateFirstHtmlMediaAttribute('title', event.currentTarget.value)} />
          </label>
        {/if}
        <div class="sparc-media-size-fields">
          <label>
            {sparcText('sparc.width')}
            <input value={selectedHtmlMedia.width} on:input={(event) => onUpdateFirstHtmlMediaAttribute('width', event.currentTarget.value)} />
          </label>
          <label>
            {sparcText('sparc.height')}
            <input value={selectedHtmlMedia.height} on:input={(event) => onUpdateFirstHtmlMediaAttribute('height', event.currentTarget.value)} />
          </label>
        </div>
        <label>
          HTML
          <textarea rows="8" value={activeNode.value || ''} on:input={(event) => onUpdateField('value', event.currentTarget.value)}></textarea>
        </label>
      </div>
    {:else if activeNode.atomType === 'html-block' || activeNode.atomType === 'message-box'}
      <div class="sparc-rich-text-editor" bind:this={htmlEditorElement}></div>
      {#if showRichTextSource}
        <label>
          {sparcText('sparc.htmlSource')}
          <textarea
            class="sparc-rich-text-source"
            rows="10"
            value={activeNode.value || ''}
            on:input={(event) => onUpdateRichTextSource(event.currentTarget.value)}
          ></textarea>
        </label>
      {/if}
    {:else if activeNode.atomType === 'dropdown'}
      <label>
        {sparcText('sparc.selected')}
        <input value={activeNode.selected || ''} on:input={(event) => onUpdateField('selected', event.currentTarget.value)} />
      </label>
      <label>
        {sparcText('sparc.options')}
        <textarea rows="6" value={(activeNode.options || []).join('\n')} on:input={(event) => onUpdateOptions(event.currentTarget.value)}></textarea>
      </label>
    {:else if activeNode.atomType === 'button'}
      <label>
        {sparcText('sparc.label')}
        <input value={activeNode.label || ''} on:input={(event) => onUpdateField('label', event.currentTarget.value)} />
      </label>
      <label>
        {sparcText('sparc.value')}
        <input value={activeNode.value || ''} on:input={(event) => onUpdateField('value', event.currentTarget.value)} />
      </label>
    {:else if activeNode.atomType === 'learning-progress'}
      <label>
        {sparcText('sparc.label')}
        <input value={activeNode.label || ''} on:input={(event) => onUpdateField('label', event.currentTarget.value)} />
      </label>
    {:else if activeNode.atomType === 'panel-selector'}
      <label>
        {sparcText('sparc.label')}
        <input value={activeNode.label || ''} on:input={(event) => onUpdateField('label', event.currentTarget.value)} />
      </label>
      <label>
        {sparcText('sparc.selectedPanelId')}
        <input value={activeNode.selectedPanelId || ''} on:input={(event) => onUpdateField('selectedPanelId', event.currentTarget.value)} />
      </label>
    {:else}
      <label>
        {sparcText('sparc.value')}
        <textarea rows="5" value={activeNode.value || ''} on:input={(event) => onUpdateField('value', event.currentTarget.value)}></textarea>
      </label>
    {/if}
  {/if}
</div>

<style>
  .sparc-context-card {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
  }

  .sparc-context-card h2 {
    margin: 0;
    font-size: calc(var(--app-font-size-base) * 1.1);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-xs);
    font-size: calc(var(--app-font-size-base) * 0.85);
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-input-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }

  .sparc-selection-summary {
    display: flex;
    flex-direction: column;
    gap: calc(2px * var(--app-density-scale));
  }

  .sparc-node-action-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sparc-editor-gap-sm);
    align-self: flex-start;
  }

  .sparc-rich-text-editor {
    min-height: 150px;
    border: 1px solid var(--border-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
    background: var(--sparc-editor-subtle-surface);
  }

  .sparc-rich-text-editor :global(.ProseMirror) {
    min-height: 130px;
    outline: none;
  }

  .sparc-rich-text-source {
    font-family: var(--sparc-editor-monospace-font-family);
    font-size: calc(var(--app-font-size-base) * 0.78);
  }

  .sparc-image-editor,
  .sparc-image-preview,
  .sparc-media-editor {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-editor-gap-sm);
  }

  .sparc-image-preview {
    align-items: flex-start;
    overflow: auto;
    max-height: 220px;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-control-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-card-padding);
  }

  .sparc-image-preview :global(img) {
    max-width: 100%;
    height: auto;
  }

  .sparc-media-summary small {
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .sparc-media-warning {
    border: 1px solid color-mix(in srgb, var(--app-warning-color) 45%, var(--border-color));
    border-radius: var(--sparc-editor-border-radius-sm);
    background: color-mix(in srgb, var(--app-warning-color) 12%, var(--sparc-editor-panel-surface));
    color: var(--app-text-color);
    padding: var(--sparc-editor-gap-xs) var(--sparc-editor-gap-sm);
    font-size: calc(var(--app-font-size-base) * 0.8);
    line-height: 1.25;
  }

  .sparc-media-size-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sparc-editor-gap-sm);
  }

  @media (max-width: 1000px) {
    .sparc-media-size-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
