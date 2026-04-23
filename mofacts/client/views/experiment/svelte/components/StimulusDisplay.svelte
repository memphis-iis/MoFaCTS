<script>
  /**
   * StimulusDisplay Component
   * Displays question/stimulus with support for text, cloze, image, video, and audio
   */
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { createEventDispatcher, tick } from 'svelte';
  import { waitForBrowserPaint } from '../utils/paintTiming';

  const dispatch = createEventDispatcher();

  /** @type {{ text?: string, clozeText?: string, imgSrc?: string, videoSrc?: string, audioSrc?: string, attribution?: { creatorName?: string, sourceName?: string, sourceUrl?: string, licenseName?: string, licenseUrl?: string } }} */
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

  // Sanitize and render HTML content
  $: safeDisplay = display || {};
  $: rawAttribution = safeDisplay?.attribution && typeof safeDisplay.attribution === 'object'
    ? safeDisplay.attribution
    : {};
  $: imageAttribution = {
    creatorName: String(rawAttribution.creatorName || '').trim(),
    sourceName: String(rawAttribution.sourceName || '').trim(),
    sourceUrl: String(rawAttribution.sourceUrl || '').trim(),
    licenseName: String(rawAttribution.licenseName || '').trim(),
    licenseUrl: String(rawAttribution.licenseUrl || '').trim(),
  };
  $: hasImageAttribution = Object.values(imageAttribution).some(Boolean);
  $: attributionCaption = [
    imageAttribution.creatorName,
    imageAttribution.sourceName,
    imageAttribution.licenseName,
  ].filter(Boolean).join(' | ');
  $: attributionHref = imageAttribution.sourceUrl || imageAttribution.licenseUrl || '';
  $: attributionTitle = [
    imageAttribution.creatorName ? `Creator: ${imageAttribution.creatorName}` : '',
    imageAttribution.sourceName ? `Source: ${imageAttribution.sourceName}` : '',
    imageAttribution.licenseName ? `License: ${imageAttribution.licenseName}` : '',
  ].filter(Boolean).join(' | ');

  // Memoize sanitized content based on actual content changes, not object reference
  let lastTextContent = '';
  let lastClozeContent = '';
  let cachedSanitizedText = '';
  let cachedSanitizedCloze = '';

  $: {
    const currentText = safeDisplay.text || '';
    if (currentText !== lastTextContent) {
      lastTextContent = currentText;
      cachedSanitizedText = currentText ? DOMPurify.sanitize(marked.parse(currentText)) : '';
    }
  }

  $: {
    const currentCloze = safeDisplay.clozeText || '';
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

  $: hasTextContent = Boolean(safeDisplay.clozeText || safeDisplay.text);
  $: hasVisualContent = Boolean(safeDisplay.imgSrc || safeDisplay.videoSrc);
  $: isAudioOnly = Boolean(safeDisplay.audioSrc) && !hasTextContent && !hasVisualContent;
  $: waitingForImage = Boolean(safeDisplay.imgSrc) && !imageReady;
  let lastBlockingAssetState = '';
  let blockingAssetSequence = 0;

  $: {
    const blocking = Boolean(safeDisplay?.imgSrc);
    const src = safeDisplay?.imgSrc || '';
    const ready = !blocking || imageReady;
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
</script>

{#if visible}
  <div
    class="stimulus-display"
    class:flow-row={componentFlow === 'row'}
    class:flow-column={componentFlow !== 'row'}
    class:loading-image={waitingForImage}
  >
    {#if !waitingForImage}
      {#if showQuestionNumber && questionNumber > 0}
        <div class="question-number">Question {questionNumber}</div>
      {/if}

      {#key sanitizedText + sanitizedCloze + (safeDisplay.imgSrc || '') + (safeDisplay.videoSrc || '') + (safeDisplay.audioSrc || '') + attributionCaption + attributionHref}
        {#if safeDisplay.imgSrc}
          <div class="stimulus-image-block">
            <div class="stimulus-image">
              <img src={safeDisplay.imgSrc} alt="Stimulus" />
            </div>
            {#if hasImageAttribution && attributionCaption}
              {#if attributionHref}
                <a
                  class="stimulus-attribution"
                  href={attributionHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={attributionTitle || 'Open attribution source'}
                >
                  {attributionCaption}
                </a>
              {:else}
                <div class="stimulus-attribution" title={attributionTitle}>
                  {attributionCaption}
                </div>
              {/if}
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

        {#if safeDisplay.clozeText}
          <div class="stimulus-text-box">
            <div class="stimulus-text cloze">
              {@html sanitizedCloze}
            </div>
          </div>
        {:else if safeDisplay.text}
          <div class="stimulus-text-box">
            <div class="stimulus-text">
              {@html sanitizedText}
            </div>
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
    align-items: center;
    justify-content: center;
    text-align: center;
    box-sizing: border-box;
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

  /* Keep imported/markdown inline styles from overriding delivery fontsize. */
  .stimulus-text :global(*) {
    font-size: inherit !important;
    line-height: inherit;
  }

  .stimulus-image-block {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    min-height: 0;
    max-height: 100%;
    gap: 0.35rem;
  }

  .stimulus-display.flow-row .stimulus-image-block {
    flex: 1 1 0;
    min-width: 0;
  }

  .stimulus-image {
    flex: 1 1 0; /* Fill remaining space above the caption */
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0; /* Allow flex shrinking */
    min-width: 0;
    width: 100%;
    max-height: 100%;
    overflow: hidden; /* Prevent image from exceeding bounds */
  }

  .stimulus-display.flow-row .stimulus-image {
    flex: 1 1 0;
    min-width: 0;
    height: auto;
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
    color: var(--secondary-text-color);
    font-size: 0.625rem;
    line-height: 1.25;
    text-align: center;
    text-decoration: none;
    word-break: break-word;
  }

  a.stimulus-attribution:hover,
  a.stimulus-attribution:focus-visible {
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
</style>
