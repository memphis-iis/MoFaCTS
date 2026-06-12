<script>
  import { createEventDispatcher } from 'svelte';
  import PerformanceArea from './PerformanceArea.svelte';
  import TrialContent from './TrialContent.svelte';

  const dispatch = createEventDispatcher();

  export let contentProps = {};
  export let parentVisible = false;
  export let visible = false;
  export let fadingOut = false;
  export let slotted = false;
  export let showTrialTimerArea = false;
  export let trialTimerProps = {};
  export let showSkipStudyButton = false;
  export let skipStudyButtonText = 'Skip';
  export let fadeElement = null;

  function forward(name, detail) {
    dispatch(name, detail);
  }
</script>

<div
  class="trial-content-fade"
  class:trial-content-slot={slotted}
  class:trial-content-visible={visible}
  class:trial-content-fading-out={fadingOut}
  bind:this={fadeElement}
  on:transitionrun={(event) => forward('transitionrun', event)}
  on:transitionstart={(event) => forward('transitionstart', event)}
  on:transitionend={(event) => forward('transitionend', event)}
>
  {#if showTrialTimerArea}
    <PerformanceArea {...trialTimerProps} />
  {/if}

  <TrialContent
    {...contentProps}
    parentVisible={parentVisible}
    on:submit={(event) => forward('submit', event.detail)}
    on:choice={(event) => forward('choice', event.detail)}
    on:input={(event) => forward('input', event.detail)}
    on:activity={(event) => forward('activity', event.detail)}
    on:firstKeypress={(event) => forward('firstKeypress', event.detail)}
    on:feedbackcontent={(event) => forward('feedbackcontent', event.detail)}
    on:replay={(event) => forward('replay', event.detail)}
    on:blockingassetstate={(event) => forward('blockingassetstate', event.detail)}
    on:reviewrevealstarted={(event) => forward('reviewrevealstarted', event.detail)}
    on:h5presult={(event) => forward('h5presult', event.detail)}
    on:sparcsubmit={(event) => forward('sparcsubmit', event.detail)}
  />

  {#if showSkipStudyButton}
    <div class="skip-study-container">
      <button type="button" class="btn btn-primary skip-study-button" on:click={(event) => forward('skipstudy', event)}>
        {skipStudyButtonText}
      </button>
    </div>
  {/if}
</div>

<style>
  .trial-content-fade {
    display: flex;
    flex-direction: column;
    width: 100%;
    opacity: 0;
    transition: opacity var(--app-transition-smooth) ease;
  }

  .trial-content-slot {
    position: absolute;
    inset: 0;
    min-height: 0;
  }

  .trial-content-visible {
    opacity: 1;
  }

  .trial-content-fading-out {
    opacity: 0;
    transition-duration: var(--app-transition-smooth);
    pointer-events: none;
  }

  .skip-study-container {
    display: flex;
    justify-content: center;
    padding: var(--card-spacing-sm) var(--card-spacing-md);
    flex-shrink: 0;
  }

  .skip-study-button {
    padding: var(--app-space-2) var(--app-space-4);
    border: 1px solid var(--app-secondary-surface-color);
    font-weight: var(--app-font-weight-medium);
    background: var(--learning-card-primary-action-surface-color);
    color: var(--learning-card-primary-action-text-color);
    opacity: 0.85;
    transition: opacity 0.15s ease;
  }

  .skip-study-button:hover {
    opacity: 1;
  }
</style>
