<script>
  import { createEventDispatcher } from 'svelte';

  export let continueButtonText = 'Continue';
  export let instructionHtml = '';
  export let instructionStartBlocked = false;
  export let showInstructionOverlay = false;
  export let videoEndOverlayMounted = false;
  export let videoEndOverlayVisible = false;
  export let videoPlayerReady = false;

  const dispatch = createEventDispatcher();

  function handleInstructionContinue(event) {
    dispatch('instructioncontinue', event);
  }

  function handleVideoContinue(event) {
    dispatch('videocontinue', event);
  }
</script>

{#if showInstructionOverlay}
  <div class="video-instruction-overlay" role="dialog" aria-modal="true" aria-live="polite">
    <div class="video-instruction-panel">
      <div class="video-instruction-copy">
        {@html instructionHtml}
      </div>
      {#if instructionStartBlocked}
        <p class="video-instruction-warning">
          The browser blocked automatic video start. Press Continue again to start the video.
        </p>
      {/if}
      <button
        type="button"
        class="btn btn-primary video-instruction-continue"
        disabled={!videoPlayerReady}
        on:click={handleInstructionContinue}
      >
        {videoPlayerReady ? (continueButtonText || 'Continue') : 'Loading video...'}
      </button>
    </div>
  </div>
{/if}

{#if videoEndOverlayMounted}
  <div class="video-end-overlay" class:video-end-overlay-visible={videoEndOverlayVisible}>
    <button type="button" class="btn btn-primary video-continue-button" on:click={handleVideoContinue}>
      {continueButtonText || 'Continue'}
    </button>
  </div>
{/if}

<style>
  .video-instruction-overlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(var(--app-space-4-px), 4vw, var(--app-space-5));
    background: color-mix(in srgb, var(--app-background-color) 94%, transparent);
  }

  .video-instruction-panel {
    width: min(760px, 100%);
    max-height: min(78vh, 720px);
    overflow: auto;
    padding: clamp(calc(18px * var(--app-density-scale)), 3vw, calc(32px * var(--app-density-scale)));
    border: 1px solid var(--app-secondary-surface-color);
    background: var(--learning-card-surface-color);
    color: var(--app-text-color);
    box-shadow: var(--app-shadow-modal);
  }

  .video-instruction-copy {
    font-size: clamp(var(--app-font-size-base), 1.6vw, calc(var(--app-font-size-base) * 1.2));
    line-height: var(--app-line-height-relaxed);
  }

  .video-instruction-warning {
    margin: var(--app-space-4-px) 0 0;
    color: var(--app-state-error-color);
    font-weight: var(--app-font-weight-semibold);
  }

  .video-instruction-continue {
    width: min(420px, 100%);
    margin: var(--app-space-5-px) auto 0;
    border: 1px solid var(--app-secondary-surface-color);
    background: var(--learning-card-primary-action-surface-color);
    color: var(--learning-card-primary-action-text-color);
    font-weight: var(--app-font-weight-bold);
  }

  .video-instruction-continue:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .video-end-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--app-text-color) 60%, transparent);
    z-index: 120;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--app-transition-smooth) ease;
  }

  .video-end-overlay.video-end-overlay-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .video-continue-button {
    padding: calc(0.75rem * var(--app-density-scale)) calc(2rem * var(--app-density-scale));
    border: 1px solid var(--app-secondary-surface-color);
    font-weight: var(--app-font-weight-semibold);
    background: var(--learning-card-primary-action-surface-color);
    color: var(--learning-card-primary-action-text-color);
  }
</style>
