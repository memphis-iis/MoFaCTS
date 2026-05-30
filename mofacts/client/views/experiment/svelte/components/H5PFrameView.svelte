<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let validation = { valid: false };
  export let embedUrl = '';
  export let isSelfHosted = false;
  export let continueReady = false;
  export let manualContinueVisible = false;
  export let measuring = false;
  export let frameVisible = false;
  export let transitionReady = false;
  export let stageStyle = '';
  export let visualStyle = '';
  export let surfaceStyle = '';
  export let frameStyle = '';
  export let frameElement;
  export let viewportElement;
  export let continueBarElement;
</script>

<div class="h5p-frame-shell">
  {#if validation.valid}
    <div bind:this={viewportElement} class="h5p-frame-viewport">
      <div
        class="h5p-frame-stage"
        class:h5p-frame-stage-measuring={measuring}
        class:h5p-frame-stage-hidden={!frameVisible}
        class:h5p-frame-stage-transition-ready={transitionReady}
        style={stageStyle}
      >
        <div class="h5p-frame-visual" style={visualStyle}>
          <div class="h5p-frame-surface" style={surfaceStyle}>
            <iframe
              bind:this={frameElement}
              class="h5p-frame"
              src={embedUrl}
              title="H5P activity"
              style={frameStyle}
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
              allow="fullscreen; autoplay; clipboard-read; clipboard-write"
              allowfullscreen
              scrolling="no"
              on:load={() => dispatch('load')}
              on:error={() => dispatch('error')}
            ></iframe>
          </div>
        </div>
      </div>
    </div>
    {#if isSelfHosted}
      <div bind:this={continueBarElement} class="h5p-continue-bar" aria-hidden={!continueReady}>
        {#if continueReady}
          <button type="button" class="btn btn-primary h5p-continue-button" on:click={() => dispatch('continue')}>
            Continue
          </button>
        {/if}
      </div>
    {:else if manualContinueVisible}
      <div bind:this={continueBarElement} class="h5p-continue-bar">
        <button type="button" class="btn btn-primary h5p-continue-button" on:click={() => dispatch('continue')}>
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
    background: var(--learning-card-stimulus-surface-color);
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .h5p-frame-viewport {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }

  .h5p-frame-stage {
    flex: 0 0 auto;
    overflow: hidden;
    max-width: 100%;
    max-height: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    opacity: 1;
    visibility: visible;
  }

  .h5p-frame-stage-hidden {
    opacity: 0;
    pointer-events: none;
  }

  .h5p-frame-stage-transition-ready {
    transition: opacity var(--app-transition-smooth, 180ms) ease;
  }

  .h5p-frame-visual {
    flex: 0 0 auto;
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
    will-change: width, height;
  }

  .h5p-frame-surface {
    transform-origin: top left;
    overflow: hidden;
    will-change: width, height, transform;
  }

  .h5p-frame-stage-transition-ready .h5p-frame-visual {
    transition:
      width var(--app-transition-smooth, 180ms) ease,
      height var(--app-transition-smooth, 180ms) ease;
  }

  .h5p-frame-stage-transition-ready .h5p-frame-surface {
    transition:
      width var(--app-transition-smooth, 180ms) ease,
      height var(--app-transition-smooth, 180ms) ease,
      transform var(--app-transition-smooth, 180ms) ease;
  }

  .h5p-frame {
    display: block;
    border: 0;
    min-width: 0;
    min-height: 0;
    background: var(--app-background-color);
    overflow: clip;
  }

  .h5p-continue-bar {
    flex: 0 0 var(--h5p-action-bar-height, 3.75rem);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: var(--h5p-action-bar-height, 3.75rem);
    padding: var(--app-space-0) calc(0.75rem * var(--app-density-scale));
    border-top: 1px solid var(--app-secondary-surface-color);
    background: var(--learning-card-stimulus-surface-color);
    box-sizing: border-box;
  }

  .h5p-continue-button {
    min-width: 8rem;
    padding: calc(0.625rem * var(--app-density-scale)) var(--app-space-3);
    border: 1px solid var(--learning-card-primary-action-surface-color);
    background: var(--learning-card-primary-action-surface-color);
    color: var(--learning-card-primary-action-text-color);
    font-weight: 600;
  }

  .h5p-continue-button:hover,
  .h5p-continue-button:focus-visible {
    filter: brightness(0.95);
  }

  .h5p-frame-error {
    padding: var(--app-space-3);
    color: var(--feedback-error-color);
    text-align: center;
    font-size: calc(var(--app-font-size-base) * 0.95);
    line-height: 1.4;
  }
</style>
