<script>
  export let colors = [];
  export let isRichTextSelected = false;
  export let showNodeHierarchy = false;
  export let showRichTextSource = false;
  export let richTextLinkHref = '';
  export let richTextImageSrc = '';
  export let richTextImageAlt = '';
  export let richTextEmbedSrc = '';
  export let commandActive = () => false;
  export let alignmentActive = () => false;
  export let runCommand = () => {};
  export let onToolbarMouseDown = () => {};
</script>

<div class="sparc-rich-text-toolbar" aria-label="SPARC visual editor tools" on:mousedown={onToolbarMouseDown}>
  <label class="sparc-advanced-toggle sparc-toolbar-toggle">
    <input type="checkbox" bind:checked={showNodeHierarchy} />
    Show node hierarchy
  </label>
  {#if isRichTextSelected}
    <div class="sparc-toolbar-divider" aria-hidden="true"></div>
    <div class="sparc-toolbar-group" aria-label="Inline formatting">
      <button type="button" class:active={commandActive('bold')} title="Bold" on:click={() => runCommand('bold')}>B</button>
      <button type="button" class:active={commandActive('italic')} title="Italic" on:click={() => runCommand('italic')}>I</button>
      <button type="button" class:active={commandActive('underline')} title="Underline" on:click={() => runCommand('underline')}>U</button>
      <button type="button" class:active={commandActive('strike')} title="Strikethrough" on:click={() => runCommand('strike')}>S</button>
      <button type="button" class:active={commandActive('highlight')} title="Highlight" on:click={() => runCommand('highlight')}>HL</button>
      <button type="button" class:active={commandActive('subscript')} title="Subscript" on:click={() => runCommand('subscript')}>x2</button>
      <button type="button" class:active={commandActive('superscript')} title="Superscript" on:click={() => runCommand('superscript')}>x^2</button>
    </div>
    <div class="sparc-toolbar-group" aria-label="Blocks and lists">
      <button type="button" class:active={commandActive('paragraph')} on:click={() => runCommand('paragraph')}>Paragraph</button>
      <button type="button" class:active={commandActive('heading', { level: 2 })} on:click={() => runCommand('heading', 2)}>H2</button>
      <button type="button" class:active={commandActive('heading', { level: 3 })} on:click={() => runCommand('heading', 3)}>H3</button>
      <button type="button" class:active={commandActive('bulletList')} on:click={() => runCommand('bullet-list')}>Bullets</button>
      <button type="button" class:active={commandActive('orderedList')} on:click={() => runCommand('ordered-list')}>Numbers</button>
      <button type="button" class:active={commandActive('taskList')} on:click={() => runCommand('task-list')}>Tasks</button>
      <button type="button" class:active={commandActive('blockquote')} on:click={() => runCommand('blockquote')}>Quote</button>
      <button type="button" class:active={commandActive('codeBlock')} on:click={() => runCommand('code-block')}>Code</button>
      <button type="button" on:click={() => runCommand('horizontal-rule')}>Rule</button>
    </div>
    <div class="sparc-toolbar-group" aria-label="Alignment">
      <button type="button" class:active={alignmentActive('left')} on:click={() => runCommand('align', 'left')}>Left</button>
      <button type="button" class:active={alignmentActive('center')} on:click={() => runCommand('align', 'center')}>Center</button>
      <button type="button" class:active={alignmentActive('right')} on:click={() => runCommand('align', 'right')}>Right</button>
      <button type="button" class:active={alignmentActive('justify')} on:click={() => runCommand('align', 'justify')}>Justify</button>
    </div>
    <div class="sparc-toolbar-group" aria-label="Color">
      {#each colors as color}
        <button
          type="button"
          class="sparc-color-button"
          style={`--sparc-toolbar-swatch: ${color.cssValue}`}
          title={color.label}
          on:click={() => runCommand('color', color.token)}
        >
          {color.label}
        </button>
      {/each}
      <button type="button" on:click={() => runCommand('color', '')}>Clear</button>
    </div>
    <div class="sparc-toolbar-group" aria-label="Links and media">
      <input class="sparc-link-input" placeholder="https://..." bind:value={richTextLinkHref} aria-label="Link URL" />
      <button type="button" class:active={commandActive('link')} on:click={() => runCommand('link', richTextLinkHref)}>Link</button>
      <button type="button" on:click={() => runCommand('link', '')}>Unlink</button>
      <input class="sparc-link-input" placeholder="Image URL" bind:value={richTextImageSrc} aria-label="Image URL" />
      <input class="sparc-short-input" placeholder="Alt" bind:value={richTextImageAlt} aria-label="Image alt text" />
      <button type="button" on:click={() => runCommand('image', { src: richTextImageSrc, alt: richTextImageAlt })}>Image</button>
      <input class="sparc-link-input" placeholder="Embed URL" bind:value={richTextEmbedSrc} aria-label="Embed URL" />
      <button type="button" on:click={() => runCommand('embed', richTextEmbedSrc)}>Embed</button>
    </div>
    <div class="sparc-toolbar-group" aria-label="Table controls">
      <button type="button" on:click={() => runCommand('table')}>Table</button>
      <button type="button" on:click={() => runCommand('table-add-row')}>Row+</button>
      <button type="button" on:click={() => runCommand('table-add-column')}>Col+</button>
      <button type="button" on:click={() => runCommand('table-delete-row')}>Row-</button>
      <button type="button" on:click={() => runCommand('table-delete-column')}>Col-</button>
      <button type="button" on:click={() => runCommand('table-delete')}>Delete Table</button>
    </div>
    <div class="sparc-toolbar-group" aria-label="History and source">
      <button type="button" on:click={() => runCommand('undo')}>Undo</button>
      <button type="button" on:click={() => runCommand('redo')}>Redo</button>
      <button type="button" class:active={showRichTextSource} on:click={() => showRichTextSource = !showRichTextSource}>HTML</button>
    </div>
  {/if}
</div>

<style>
  .sparc-rich-text-toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
    flex-wrap: wrap;
    padding: var(--sparc-editor-card-padding);
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-subtle-surface);
    border-radius: var(--sparc-editor-border-radius-sm);
  }

  .sparc-advanced-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
    color: var(--app-secondary-text-color);
    font-size: calc(var(--app-font-size-base) * 0.85);
    white-space: nowrap;
  }

  .sparc-advanced-toggle input {
    margin: 0;
  }

  .sparc-toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
    padding-right: var(--sparc-editor-gap-sm);
    border-right: 1px solid var(--border-color);
  }

  .sparc-toolbar-group:last-child {
    border-right: 0;
  }

  .sparc-rich-text-toolbar button {
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-control-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
    white-space: nowrap;
  }

  .sparc-rich-text-toolbar .sparc-color-button {
    display: inline-flex;
    align-items: center;
    gap: var(--sparc-editor-gap-xs);
  }

  .sparc-rich-text-toolbar .sparc-color-button::before {
    content: "";
    width: 0.75rem;
    height: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 50%;
    background: var(--sparc-toolbar-swatch);
  }

  .sparc-rich-text-toolbar button.active {
    border-color: var(--app-primary-action-surface-color);
    background: var(--app-primary-action-surface-color);
    color: var(--app-primary-action-text-color);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-primary-action-text-color) 35%, transparent);
  }

  .sparc-toolbar-toggle {
    margin-right: 0;
  }

  .sparc-toolbar-divider {
    align-self: stretch;
    width: 1px;
    min-height: var(--app-button-height);
    background: var(--border-color);
  }

  .sparc-rich-text-toolbar .sparc-link-input {
    min-width: 150px;
    max-width: 230px;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-input-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }

  .sparc-rich-text-toolbar .sparc-short-input {
    width: 5rem;
    border: 1px solid var(--border-color);
    background: var(--sparc-editor-input-surface);
    color: var(--app-text-color);
    border-radius: var(--sparc-editor-border-radius-sm);
    padding: var(--sparc-editor-control-padding-y) var(--sparc-editor-control-padding-x);
  }
</style>
