<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let validation = { valid: false };
  export let embedUrl = '';
  export let isSelfHosted = false;
  export let continueReady = false;
  export let manualContinueVisible = false;
  export let measuring = false;
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
          <button type="button" class="h5p-continue-button" on:click={() => dispatch('continue')}>
            Continue
          </button>
        {/if}
      </div>
    {:else if manualContinueVisible}
      <div bind:this={continueBarElement} class="h5p-continue-bar">
        <button type="button" class="h5p-continue-button" on:click={() => dispatch('continue')}>
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
  }

  .h5p-frame-visual {
    flex: 0 0 auto;
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
    transition:
      width var(--transition-smooth, 180ms) ease,
      height var(--transition-smooth, 180ms) ease;
    will-change: width, height;
  }

  .h5p-frame-surface {
    transform-origin: top left;
    overflow: hidden;
    transition:
      width var(--transition-smooth, 180ms) ease,
      height var(--transition-smooth, 180ms) ease,
      transform var(--transition-smooth, 180ms) ease;
    will-change: width, height, transform;
  }

  .h5p-frame {
    display: block;
    border: 0;
    min-width: 0;
    min-height: 0;
    background: var(--background-color, #fff);
    overflow: clip;
  }

  .h5p-continue-bar {
    flex: 0 0 var(--h5p-action-bar-height, 3.75rem);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: var(--h5p-action-bar-height, 3.75rem);
    padding: 0 0.75rem;
    border-top: 1px solid var(--secondary-color);
    background: var(--stimuli-box-color);
    box-sizing: border-box;
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
