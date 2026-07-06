<script>
  import { createEventDispatcher } from 'svelte';
  import FlashcardController from './FlashcardController.svelte';

  const dispatch = createEventDispatcher();

  export let contentProps = {};

  function forward(name, detail) {
    dispatch(name, detail);
  }
</script>

<div
  class="trial-content-fade trial-content-slot trial-content-slot-incoming-prepared"
  aria-hidden="true"
>
  <FlashcardController
    {...contentProps}
    parentVisible={false}
    on:feedbackcontent={(event) => forward('feedbackcontent', event.detail)}
    on:blockingassetstate={(event) => forward('blockingassetstate', event.detail)}
  />
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

  .trial-content-slot-incoming-prepared {
    pointer-events: none;
    visibility: hidden;
  }
</style>
