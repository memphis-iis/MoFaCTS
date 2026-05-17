<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import {
    clampH5PPreferredHeight,
    H5P_DEFAULT_PREFERRED_HEIGHT,
    validateH5PDisplayConfig,
  } from '../../../../../common/lib/h5pDisplay';
  import { clientConsole } from '../../../../lib/clientLogger';

  const dispatch = createEventDispatcher();

  export let config = null;
  let reportedHeight = null;
  let pendingResult = null;

  $: baseUrl = typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/`
    : 'https://mofacts.local/';
  $: validation = validateH5PDisplayConfig(config, baseUrl);
  $: embedUrl = validation.valid
    ? (config?.sourceType === 'self-hosted'
      ? `/h5p-content/${encodeURIComponent(String(config?.contentId || ''))}/play`
      : String(config?.embedUrl || '').trim())
    : '';
  $: isSelfHosted = config?.sourceType === 'self-hosted';
  $: frameHeight = clampH5PPreferredHeight(reportedHeight ?? config?.preferredHeight ?? H5P_DEFAULT_PREFERRED_HEIGHT);
  $: frameStyle = isSelfHosted ? 'height: 100%;' : `height: ${frameHeight}px;`;
  $: if (embedUrl) {
    reportedHeight = null;
    pendingResult = null;
  }

  function handleMessage(event) {
    if (typeof window !== 'undefined' && event.origin !== window.location.origin) {
      return;
    }
    const data = event.data || {};
    if (data.type === 'mofacts:h5p-result') {
      pendingResult = data;
    } else if (data.type === 'mofacts:h5p-loaded') {
      dispatch('loaded', data);
    } else if (data.type === 'mofacts:h5p-failed') {
      clientConsole(1, '[H5PFrame] H5P runtime reported a failure', data);
      dispatch('failed', data);
    } else if (data.type === 'mofacts:h5p-xapi') {
      dispatch('h5pxapi', data);
    } else if (!isSelfHosted && data.type === 'mofacts:h5p-resize' && data.contentId === config?.contentId) {
      const nextHeight = Number(data.height);
      if (Number.isFinite(nextHeight) && nextHeight > 0) {
        reportedHeight = nextHeight + 8;
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage);
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', handleMessage);
    }
  });

  function handleLoad() {
    dispatch('loaded', { sourceType: config?.sourceType, embedUrl });
  }

  function handleError() {
    clientConsole(1, '[H5PFrame] H5P iframe failed to load', {
      embedUrl,
    });
    dispatch('failed', { embedUrl });
  }

  function handleContinue() {
    if (!pendingResult) {
      return;
    }
    dispatch('h5presult', pendingResult);
    pendingResult = null;
  }
</script>

<div class="h5p-frame-shell">
  {#if validation.valid}
    <iframe
      class="h5p-frame"
      src={embedUrl}
      title="H5P activity"
      style={frameStyle}
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="fullscreen; autoplay; clipboard-read; clipboard-write"
      allowfullscreen
      scrolling="no"
      on:load={handleLoad}
      on:error={handleError}
    ></iframe>
    {#if pendingResult}
      <div class="h5p-continue-bar">
        <button type="button" class="h5p-continue-button" on:click={handleContinue}>
          Continue
        </button>
      </div>
    {/if}
  {:else}
    <div class="h5p-frame-error" role="alert">
      {validation.message || 'Invalid H5P display configuration'}
    </div>
  {/if}
</div>

<style>
  .h5p-frame-shell {
    width: 100%;
    max-width: 100%;
    height: 100%;
    min-height: 0;
    border: 0;
    border-radius: 0;
    background: var(--stimuli-box-color);
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .h5p-frame {
    flex: 1 1 auto;
    display: block;
    width: 100%;
    height: 100%;
    max-height: none;
    min-height: 0;
    border: 0;
    background: var(--background-color, #fff);
  }

  .h5p-continue-bar {
    flex: 0 0 auto;
    display: flex;
    justify-content: flex-end;
    padding: 0.625rem 0.75rem;
    border-top: 1px solid var(--secondary-color);
    background: var(--stimuli-box-color);
  }

  .h5p-continue-button {
    min-width: 8rem;
    padding: 0.625rem 1rem;
    border: 1px solid var(--accent-color);
    border-radius: var(--border-radius-md, 6px);
    background: var(--accent-color);
    color: var(--button-text-color, #fff);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .h5p-continue-button:hover,
  .h5p-continue-button:focus-visible {
    filter: brightness(0.95);
  }

  .h5p-frame-error {
    padding: 1rem;
    color: var(--alert-color);
    text-align: center;
    font-size: 0.95rem;
    line-height: 1.4;
  }
</style>
