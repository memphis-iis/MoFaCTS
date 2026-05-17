<script>
  /**
   * StimulusDisplay Component
   * Displays question/stimulus with support for text, cloze, image, video, and audio
   */
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import { waitForBrowserPaint } from '../utils/paintTiming';
  import H5PFrame from './H5PFrame.svelte';

  const dispatch = createEventDispatcher();

  /** @type {{ text?: string, clozeText?: string, imgSrc?: string, videoSrc?: string, audioSrc?: string, h5p?: object, attribution?: { creatorName?: string, sourceName?: string, sourceUrl?: string, licenseName?: string, licenseUrl?: string } }} */
  export let display = {};

  /** @type {boolean} Whether to show the display */
  export let visible = true;

  /** @type {boolean} Whether question number should be displayed */
  export let showQuestionNumber = false;

  /** @type {number} Current question number */
  export let questionNumber = 0;

  /** @type {'row'|'column'} Orientation of stimulus subcomponents */
  export let componentFlow = 'column';

  /** @type {boolean} Whether audio replay is enabled */
  export let replayEnabled = true;

  /** @type {Set<string>} Tracks image URLs that are already loaded in this runtime */
  const loadedImageCache = new Set();
  let imageReady = true;
  let imageLoadToken = 0;
  let pendingImageSrc = '';
  let imageBlockElement;
  let imageElement;
  let attributionElement;
  let attributionLayoutReady = true;
  let attributionLayoutSequence = 0;
  let imageViewportWidthPx = null;
  let imageViewportHeightPx = null;
  let resizeHandlerAttached = false;
  let imageResizeObserver;
  const attributionGapPx = 6;

  // Sanitize and render HTML content
  $: safeDisplay = display || {};
  $: rawAttribution = safeDisplay?.attribution && typeof safeDisplay.attribution === 'object'
    ? safeDisplay.attribution
    : {};
  $: displayAttribution = {
    creatorName: String(rawAttribution.creatorName || '').trim(),
    sourceName: String(rawAttribution.sourceName || '').trim(),
    sourceUrl: String(rawAttribution.sourceUrl || '').trim(),
    licenseName: String(rawAttribution.licenseName || '').trim(),
    licenseUrl: String(rawAttribution.licenseUrl || '').trim(),
  };
  $: hasAttribution = Object.values(displayAttribution).some(Boolean);
  $: attributionCaption = [
    displayAttribution.creatorName,
    displayAttribution.sourceName,
    displayAttribution.licenseName,
  ].filter(Boolean).join(' | ');
  $: attributionTitle = [
    displayAttribution.creatorName ? `Creator: ${displayAttribution.creatorName}` : '',
    displayAttribution.sourceName ? `Source: ${displayAttribution.sourceName}` : '',
    displayAttribution.licenseName ? `License: ${displayAttribution.licenseName}` : '',
  ].filter(Boolean).join(' | ');
  $: hasCreatorAndAnotherAttributionPart = Boolean(
    displayAttribution.creatorName && (displayAttribution.sourceName || displayAttribution.licenseName)
  );
  $: hasSourceAndLicenseAttribution = Boolean(displayAttribution.sourceName && displayAttribution.licenseName);
  $: attributionLinkSignature = [
    displayAttribution.sourceUrl,
    displayAttribution.licenseUrl,
  ].join('::');
  $: h5pOwnsPrompt = safeDisplay?.h5p?.sourceType === 'self-hosted';
  $: needsImageLayout = Boolean(safeDisplay.imgSrc);
  $: needsAttributedImageLayout = needsImageLayout && hasAttribution && Boolean(attributionCaption);
  $: imageViewportStyle = imageViewportWidthPx === null || imageViewportHeightPx === null
    ? ''
    : `width: ${imageViewportWidthPx}px; height: ${imageViewportHeightPx}px;`;

  // Memoize sanitized content based on actual content changes, not object reference
  let lastTextContent = '';
  let lastClozeContent = '';
  let cachedSanitizedText = '';
  let cachedSanitizedCloze = '';

  $: {
    const currentText = h5pOwnsPrompt ? '' : (safeDisplay.text || '');
    if (currentText !== lastTextContent) {
      lastTextContent = currentText;
      cachedSanitizedText = currentText ? DOMPurify.sanitize(marked.parse(currentText)) : '';
    }
  }

  $: {
    const currentCloze = h5pOwnsPrompt ? '' : (safeDisplay.clozeText || '');
    if (currentCloze !== lastClozeContent) {
      lastClozeContent = currentCloze;
      cachedSanitizedCloze = currentCloze ? DOMPurify.sanitize(marked.parse(currentCloze)) : '';
    }
  }

  $: sanitizedText = cachedSanitizedText;
  $: sanitizedCloze = cachedSanitizedCloze;

  async function preloadDisplayImage(src, token) {
    if (!src || loadedImageCache.has(src)) {
      if (token === imageLoadToken) {
        imageReady = true;
      }
      return;
    }

    imageReady = false;

    await new Promise((resolve) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Decode when supported to avoid rendering partially decoded image frames.
          if (typeof img.decode === 'function') {
            await img.decode();
          }
        } catch {
          // Decode failures are non-fatal if onload has already fired.
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });

    if (token === imageLoadToken) {
      loadedImageCache.add(src);
      imageReady = true;
    }
  }

  $: {
    const src = safeDisplay?.imgSrc || '';
    if (src !== pendingImageSrc) {
      pendingImageSrc = src;
      imageLoadToken += 1;
      const token = imageLoadToken;

      if (!src) {
        imageReady = true;
      } else if (loadedImageCache.has(src)) {
        imageReady = true;
      } else {
        void preloadDisplayImage(src, token);
      }
    }
  }

  function handleReplay() {
    if (replayEnabled && safeDisplay.audioSrc) {
      dispatch('replay', { audioSrc: safeDisplay.audioSrc });
    }
  }

  function handleH5PResult(event) {
    dispatch('h5presult', event.detail);
  }

  $: hasTextContent = !h5pOwnsPrompt && Boolean(safeDisplay.clozeText || safeDisplay.text);
  $: hasVisualContent = Boolean(safeDisplay.imgSrc || safeDisplay.videoSrc || safeDisplay.h5p);
  $: hasH5PContent = Boolean(safeDisplay.h5p);
  $: isAudioOnly = Boolean(safeDisplay.audioSrc) && !hasTextContent && !hasVisualContent;
  $: showTextAttribution = hasTextContent && !safeDisplay.imgSrc && hasAttribution && Boolean(attributionCaption);
  $: waitingForImage = Boolean(safeDisplay.imgSrc) && !imageReady;
  let lastBlockingAssetState = '';
  let blockingAssetSequence = 0;
  let lastAttributionLayoutSignature = '';

  function updateAttributedImageLayout() {
    if (!needsImageLayout) {
      imageViewportWidthPx = null;
      imageViewportHeightPx = null;
      return true;
    }

    if (!imageBlockElement || !imageElement || (needsAttributedImageLayout && !attributionElement)) {
      return false;
    }

    const blockStyle = window.getComputedStyle(imageBlockElement);
    const horizontalPadding = parseFloat(blockStyle.paddingLeft || '0') + parseFloat(blockStyle.paddingRight || '0');
    const verticalPadding = parseFloat(blockStyle.paddingTop || '0') + parseFloat(blockStyle.paddingBottom || '0');
    const availableBlockWidth = imageBlockElement.clientWidth - horizontalPadding;
    const availableBlockHeight = imageBlockElement.clientHeight - verticalPadding;
    const attributionHeight = needsAttributedImageLayout
      ? attributionElement.getBoundingClientRect().height
      : 0;

    if (!availableBlockHeight || !availableBlockWidth || (needsAttributedImageLayout && !attributionHeight)) {
      return false;
    }

    const naturalWidth = Number(imageElement.naturalWidth || 0);
    const naturalHeight = Number(imageElement.naturalHeight || 0);

    if (naturalWidth <= 0 || naturalHeight <= 0) {
      return false;
    }

    const availableWidth = availableBlockWidth;
    const availableHeight = availableBlockHeight - attributionHeight - (needsAttributedImageLayout ? attributionGapPx : 0);

    if (availableWidth <= 0 || availableHeight <= 0) {
      return false;
    }

    const imageAspect = naturalWidth / naturalHeight;
    let nextWidth = availableWidth;
    let nextHeight = nextWidth / imageAspect;

    if (nextHeight > availableHeight) {
      nextHeight = availableHeight;
      nextWidth = nextHeight * imageAspect;
    }

    imageViewportWidthPx = Math.max(0, Math.floor(nextWidth));
    imageViewportHeightPx = Math.max(0, Math.floor(nextHeight));
    return true;
  }

  async function finalizeAttributionLayout(sequence, signature) {
    await tick();
    await waitForBrowserPaint();

    if (sequence !== attributionLayoutSequence || signature !== lastAttributionLayoutSignature) {
      return;
    }

    let laidOut = updateAttributedImageLayout();
    if (!laidOut) {
      await tick();
      await waitForBrowserPaint();
      if (sequence !== attributionLayoutSequence || signature !== lastAttributionLayoutSignature) {
        return;
      }
      laidOut = updateAttributedImageLayout();
    }

    if (laidOut && sequence === attributionLayoutSequence && signature === lastAttributionLayoutSignature) {
      attributionLayoutReady = true;
    }
  }

  function handleViewportResize() {
    if (!needsImageLayout) {
      return;
    }
    void finalizeAttributionLayout(attributionLayoutSequence, lastAttributionLayoutSignature);
  }

  function syncResizeHandler() {
    if (typeof window === 'undefined') {
      return;
    }

    const shouldAttach = needsImageLayout;
    if (shouldAttach && !resizeHandlerAttached) {
      window.addEventListener('resize', handleViewportResize);
      resizeHandlerAttached = true;
    } else if (!shouldAttach && resizeHandlerAttached) {
      window.removeEventListener('resize', handleViewportResize);
      resizeHandlerAttached = false;
    }
  }

  $: syncResizeHandler();

  function syncResizeObserver() {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    if (!needsImageLayout) {
      if (imageResizeObserver) {
        imageResizeObserver.disconnect();
        imageResizeObserver = undefined;
      }
      return;
    }

    if (!imageBlockElement || (needsAttributedImageLayout && !attributionElement)) {
      return;
    }

    if (!imageResizeObserver) {
      imageResizeObserver = new ResizeObserver(() => {
        void finalizeAttributionLayout(attributionLayoutSequence, lastAttributionLayoutSignature);
      });
    } else {
      imageResizeObserver.disconnect();
    }

    imageResizeObserver.observe(imageBlockElement);
    if (needsAttributedImageLayout) {
      imageResizeObserver.observe(attributionElement);
    }
  }

  $: syncResizeObserver();

  $: {
    const signature = [
      safeDisplay?.imgSrc || '',
      attributionCaption,
      attributionLinkSignature,
      imageReady ? 'ready' : 'loading',
    ].join('::');

    if (signature !== lastAttributionLayoutSignature) {
      lastAttributionLayoutSignature = signature;
      attributionLayoutSequence += 1;
      const sequence = attributionLayoutSequence;

      if (!needsImageLayout) {
        imageViewportWidthPx = null;
        imageViewportHeightPx = null;
        attributionLayoutReady = true;
      } else if (!imageReady) {
        imageViewportWidthPx = null;
        imageViewportHeightPx = null;
        attributionLayoutReady = false;
      } else {
        imageViewportWidthPx = null;
        imageViewportHeightPx = null;
        attributionLayoutReady = false;
        void finalizeAttributionLayout(sequence, signature);
      }
    }
  }

  $: {
    const blocking = Boolean(safeDisplay?.imgSrc);
    const src = safeDisplay?.imgSrc || '';
    const ready = !blocking || (imageReady && attributionLayoutReady);
    const signature = `${blocking}:${ready}:${src}`;

    if (signature !== lastBlockingAssetState) {
      lastBlockingAssetState = signature;
      blockingAssetSequence += 1;
      const sequence = blockingAssetSequence;
      const detail = {
        owner: 'stimulus',
        blocking,
        ready,
        src,
      };

      if (blocking && ready) {
        void emitBlockingAssetStateAfterPaint(detail, signature, sequence);
      } else {
        dispatch('blockingassetstate', detail);
      }
    }
  }

  async function emitBlockingAssetStateAfterPaint(detail, signature, sequence) {
    await tick();
    await waitForBrowserPaint();

    if (sequence !== blockingAssetSequence || signature !== lastBlockingAssetState) {
      return;
    }

    dispatch('blockingassetstate', detail);
  }

  onDestroy(() => {
    if (typeof window !== 'undefined' && resizeHandlerAttached) {
      window.removeEventListener('resize', handleViewportResize);
      resizeHandlerAttached = false;
    }
    if (imageResizeObserver) {
      imageResizeObserver.disconnect();
      imageResizeObserver = undefined;
    }
  });
</script>

{#if visible}
  <div
    class="stimulus-display"
    class:flow-row={componentFlow === 'row'}
    class:flow-column={componentFlow !== 'row'}
    class:loading-image={waitingForImage}
    class:h5p-display={hasH5PContent}
  >
    {#if !waitingForImage}
      {#if showQuestionNumber && questionNumber > 0}
        <div class="question-number">Question {questionNumber}</div>
      {/if}

      {#key sanitizedText + sanitizedCloze + (safeDisplay.imgSrc || '') + (safeDisplay.videoSrc || '') + (safeDisplay.audioSrc || '') + JSON.stringify(safeDisplay.h5p || {}) + attributionCaption + attributionLinkSignature}
        {#if safeDisplay.imgSrc}
          <div class="stimulus-image-block" bind:this={imageBlockElement}>
            {#if hasAttribution && attributionCaption}
              <div class="stimulus-image-figure">
                <div class="stimulus-image stimulus-image-measured" style={imageViewportStyle}>
                  <img bind:this={imageElement} src={safeDisplay.imgSrc} alt="Stimulus" />
                </div>
                <span
                  bind:this={attributionElement}
                  class="stimulus-attribution"
                  class:stimulus-attribution-hidden={!attributionLayoutReady}
                  title={attributionTitle}
                >
                  {#if displayAttribution.creatorName}
                    <span>{displayAttribution.creatorName}</span>
                  {/if}
                  {#if hasCreatorAndAnotherAttributionPart}
                    <span aria-hidden="true"> | </span>
                  {/if}
                  {#if displayAttribution.sourceName}
                    {#if displayAttribution.sourceUrl}
                      <a
                        href={displayAttribution.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={`Source: ${displayAttribution.sourceName}`}
                      >
                        {displayAttribution.sourceName}
                      </a>
                    {:else}
                      <span>{displayAttribution.sourceName}</span>
                    {/if}
                  {/if}
                  {#if hasSourceAndLicenseAttribution}
                    <span aria-hidden="true"> | </span>
                  {/if}
                  {#if displayAttribution.licenseName}
                    {#if displayAttribution.licenseUrl}
                      <a
                        href={displayAttribution.licenseUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={`License: ${displayAttribution.licenseName}`}
                      >
                        {displayAttribution.licenseName}
                      </a>
                    {:else}
                      <span>{displayAttribution.licenseName}</span>
                    {/if}
                  {/if}
                </span>
              </div>
            {:else}
              <div class="stimulus-image stimulus-image-measured" style={imageViewportStyle}>
                <img bind:this={imageElement} src={safeDisplay.imgSrc} alt="Stimulus" />
              </div>
            {/if}
          </div>
        {/if}

        {#if safeDisplay.videoSrc}
          <div class="stimulus-video">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video src={safeDisplay.videoSrc} controls>
              {#if safeDisplay.videoCaptionSrc}
                <track kind="captions" src={safeDisplay.videoCaptionSrc} srclang="en" label="English captions" default />
              {/if}
            </video>
          </div>
        {/if}

        {#if safeDisplay.h5p}
          <div class="stimulus-h5p">
            <H5PFrame config={safeDisplay.h5p} on:h5presult={handleH5PResult} />
          </div>
        {/if}

        {#if !h5pOwnsPrompt && safeDisplay.clozeText}
          <div class="stimulus-text-box">
            <div class="stimulus-text-content">
              <div class="stimulus-text cloze">
                {@html sanitizedCloze}
              </div>
            </div>
            {#if showTextAttribution}
              <span
                class="stimulus-attribution stimulus-text-attribution"
                title={attributionTitle}
              >
                {#if displayAttribution.creatorName}
                  <span>{displayAttribution.creatorName}</span>
                {/if}
                {#if hasCreatorAndAnotherAttributionPart}
                  <span aria-hidden="true"> | </span>
                {/if}
                {#if displayAttribution.sourceName}
                  {#if displayAttribution.sourceUrl}
                    <a
                      href={displayAttribution.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={`Source: ${displayAttribution.sourceName}`}
                    >
                      {displayAttribution.sourceName}
                    </a>
                  {:else}
                    <span>{displayAttribution.sourceName}</span>
                  {/if}
                {/if}
                {#if hasSourceAndLicenseAttribution}
                  <span aria-hidden="true"> | </span>
                {/if}
                {#if displayAttribution.licenseName}
                  {#if displayAttribution.licenseUrl}
                    <a
                      href={displayAttribution.licenseUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={`License: ${displayAttribution.licenseName}`}
                    >
                      {displayAttribution.licenseName}
                    </a>
                  {:else}
                    <span>{displayAttribution.licenseName}</span>
                  {/if}
                {/if}
              </span>
            {/if}
          </div>
        {:else if !h5pOwnsPrompt && safeDisplay.text}
          <div class="stimulus-text-box">
            <div class="stimulus-text-content">
              <div class="stimulus-text">
                {@html sanitizedText}
              </div>
            </div>
            {#if showTextAttribution}
              <span
                class="stimulus-attribution stimulus-text-attribution"
                title={attributionTitle}
              >
                {#if displayAttribution.creatorName}
                  <span>{displayAttribution.creatorName}</span>
                {/if}
                {#if hasCreatorAndAnotherAttributionPart}
                  <span aria-hidden="true"> | </span>
                {/if}
                {#if displayAttribution.sourceName}
                  {#if displayAttribution.sourceUrl}
                    <a
                      href={displayAttribution.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={`Source: ${displayAttribution.sourceName}`}
                    >
                      {displayAttribution.sourceName}
                    </a>
                  {:else}
                    <span>{displayAttribution.sourceName}</span>
                  {/if}
                {/if}
                {#if hasSourceAndLicenseAttribution}
                  <span aria-hidden="true"> | </span>
                {/if}
                {#if displayAttribution.licenseName}
                  {#if displayAttribution.licenseUrl}
                    <a
                      href={displayAttribution.licenseUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={`License: ${displayAttribution.licenseName}`}
                    >
                      {displayAttribution.licenseName}
                    </a>
                  {:else}
                    <span>{displayAttribution.licenseName}</span>
                  {/if}
                {/if}
              </span>
            {/if}
          </div>
        {/if}

        {#if safeDisplay.audioSrc}
          <div class="stimulus-audio-box" class:audio-only={isAudioOnly}>
            <button
              class="replay-button"
              on:click={handleReplay}
              disabled={!replayEnabled}
              title="Replay Audio"
              aria-label="Replay Audio"
            >
              <i class="fa fa-volume-up"></i>
            </button>
          </div>
        {/if}
      {/key}
    {/if}
  </div>
{/if}

<style>
  .stimulus-display {
    padding: 0.5rem 0.75rem;
    width: 100%;
    height: 100%; /* Fill parent completely for proper % sizing in children */
    max-height: 100%; /* Prevent overflow while filling space */
    display: flex;
    flex-direction: column;
    align-items: center; /* Center text boxes horizontally */
    box-sizing: border-box;
    overflow: hidden; /* Prevent content from exceeding bounds */
    gap: 0.5rem;
    /* Prevent repaints when sibling content changes */
    contain: layout style;
  }

  .stimulus-display.flow-row {
    flex-direction: row;
    align-items: stretch;
    justify-content: center;
  }

  .stimulus-display.flow-column {
    flex-direction: column;
  }

  .stimulus-display.loading-image {
    visibility: hidden;
  }

  .question-number {
    font-size: 0.85rem;
    color: var(--secondary-text-color);
    margin-bottom: 0.25rem;
  }

  .stimulus-text {
    font-size: var(--card-font-size, inherit);
    line-height: 1.5;
    word-wrap: break-word;
    color: var(--text-color);
    width: 100%;
  }

  .stimulus-display.h5p-display {
    padding: 0;
    gap: 0;
    align-items: stretch;
    justify-content: stretch;
  }

  .stimulus-text.cloze {
    font-family: var(--font-family, inherit);
  }

  .stimulus-audio-box {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0.25rem;
  }

  .stimulus-audio-box.audio-only {
    flex: 1;
    padding: 2rem;
  }

  .stimulus-display.flow-row .stimulus-audio-box:not(.audio-only) {
    flex: 0 0 auto;
    padding: 50px;
  }

  .replay-button {
    background: var(--stimuli-box-color);
    border: 2px solid var(--secondary-color);
    border-radius: 50%;
    width: 80px;
    height: 80px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition:
      transform var(--transition-fast, 100ms) ease,
      border-color var(--transition-fast, 100ms) ease,
      box-shadow var(--transition-fast, 100ms) ease,
      color var(--transition-fast, 100ms) ease;
    color: var(--accent-color);
    font-size: 2.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .replay-button:hover:not(:disabled) {
    transform: scale(1.05);
    border-color: var(--accent-color);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  }

  .replay-button:active:not(:disabled) {
    transform: scale(0.95);
  }

  .replay-button:disabled {
    color: var(--audio-icon-disabled-color);
    opacity: 0.5;
    cursor: default;
    filter: grayscale(1);
    box-shadow: none;
  }

  .stimulus-text-box {
    flex: 1;
    min-height: 0;
    width: 100%;
    height: 100%;
    padding: 1em;
    overflow: auto;
    border: 1px solid var(--secondary-color);
    border-radius: var(--border-radius-lg);
    background: var(--stimuli-box-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    box-sizing: border-box;
    gap: 0.375rem;
  }

  .stimulus-display.flow-row .stimulus-text-box {
    width: auto;
    height: auto;
    max-height: 100%;
    min-width: 0;
    flex: 1 1 0;
  }

  .stimulus-text :global(p) {
    margin: 0.5rem 0;
  }

  .stimulus-text-content {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Keep imported/markdown inline styles from overriding delivery fontsize. */
  .stimulus-text :global(*) {
    font-size: inherit !important;
    line-height: inherit;
  }

  .stimulus-image-block {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1em;
    border: 1px solid var(--secondary-color);
    border-radius: var(--border-radius-lg);
    background: var(--stimuli-box-color);
    box-sizing: border-box;
    overflow: hidden;
    width: 100%;
    height: 100%;
    min-height: 0;
    max-height: 100%;
  }

  .stimulus-display.flow-row .stimulus-image-block {
    flex: 1 1 0;
    min-width: 0;
  }

  .stimulus-image-figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
  }

  .stimulus-image {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0; /* Allow flex shrinking */
    min-width: 0;
    width: 100%;
    max-height: 100%;
    overflow: hidden; /* Prevent image from exceeding bounds */
  }

  .stimulus-image-measured {
    flex: 0 1 auto;
  }

  .stimulus-display.flow-row .stimulus-image {
    min-width: 0;
  }

  .stimulus-image img {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%; /* Fill parent .stimulus-image */
    object-fit: contain; /* Scale up or down while preserving aspect ratio */
    display: block;
  }

  .stimulus-attribution {
    flex: 0 0 auto;
    display: inline-block;
    max-width: 100%;
    padding: 0 0.25rem;
    color: var(--secondary-text-color);
    font-size: 0.625rem;
    line-height: 1.25;
    text-align: center;
    text-decoration: none;
    word-break: break-word;
  }

  .stimulus-attribution a {
    color: inherit;
    text-decoration: none;
  }

  .stimulus-attribution-hidden {
    visibility: hidden;
  }

  .stimulus-text-attribution {
    margin-top: auto;
  }

  .stimulus-attribution a:hover,
  .stimulus-attribution a:focus-visible {
    color: var(--accent-color);
    text-decoration: underline;
  }

  .stimulus-video {
    text-align: center;
  }

  .stimulus-display.flow-row .stimulus-video {
    flex: 1 1 0;
    min-width: 0;
  }

  .stimulus-video video {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0 auto;
  }

  .stimulus-h5p {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
</style>
