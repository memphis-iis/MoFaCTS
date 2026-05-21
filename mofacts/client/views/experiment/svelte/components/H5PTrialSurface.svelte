<script>
  import { createEventDispatcher } from 'svelte';
  import H5PFrame from './H5PFrame.svelte';

  const dispatch = createEventDispatcher();

  /** @type {Object} H5P display config */
  export let config = null;

  /** @type {boolean} Whether question number should be displayed */
  export let showQuestionNumber = false;

  /** @type {number} Current question number */
  export let questionNumber = 0;

  function handleH5PResult(event) {
    dispatch('h5presult', event.detail);
  }
</script>

<div class="h5p-trial-surface">
  {#if showQuestionNumber && questionNumber > 0}
    <div class="h5p-question-number">Question {questionNumber}</div>
  {/if}
  <div class="h5p-frame-region">
    <H5PFrame {config} on:h5presult={handleH5PResult} />
  </div>
</div>

<style>
  .h5p-trial-surface {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--stimuli-box-color);
    box-sizing: border-box;
  }

  .h5p-question-number {
    flex: 0 0 auto;
    padding: 0.35rem 0.75rem;
    color: var(--secondary-text-color);
    font-size: 0.85rem;
    text-align: center;
    border-bottom: 1px solid var(--secondary-color);
  }

  .h5p-frame-region {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow: hidden;
  }
</style>
