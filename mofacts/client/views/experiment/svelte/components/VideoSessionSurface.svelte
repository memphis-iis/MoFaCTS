<script>
  import { createEventDispatcher } from 'svelte';
  import ActiveFlashcardControllerSlot from './ActiveFlashcardControllerSlot.svelte';
  import PerformanceArea from './PerformanceArea.svelte';
  import VideoSessionMode from './VideoSessionMode.svelte';
  import VideoSessionOverlays from './VideoSessionOverlays.svelte';

  const dispatch = createEventDispatcher();

  export let checkpointGateState = '';
  export let continueButtonText = '';
  export let deliverySettings = {};
  export let fadingOut = false;
  export let instructionHtml = '';
  export let instructionStartBlocked = false;
  export let overlayMounted = false;
  export let overlayVisible = false;
  export let performanceStatsProps = {};
  export let preventScrubbing = false;
  export let questionIndices = [];
  export let questionTimes = [];
  export let resumeCheckpointIndex = undefined;
  export let resumeStartTime = undefined;
  export let showInstructionOverlay = false;
  export let showPerformanceStats = false;
  export let showTrialTimerArea = false;
  export let startBlocked = false;
  export let flashcardControllerProps = {};
  export let trialTimerProps = {};
  export let videoCanAcceptCheckpoint = false;
  export let videoEndOverlayMounted = false;
  export let videoEndOverlayVisible = false;
  export let videoPlayer = null;
  export let videoPlayerReady = false;
  export let trialContentFadeElement = null;

  function forward(name, detail) {
    dispatch(name, detail);
  }
</script>

{#if showPerformanceStats}
  <PerformanceArea {...performanceStatsProps} />
{/if}

<VideoSessionMode
  bind:this={videoPlayer}
  videoUrl={deliverySettings.videoUrl}
  questionTimes={questionTimes}
  questionIndices={questionIndices}
  resumeStartTime={resumeStartTime}
  resumeCheckpointIndex={resumeCheckpointIndex}
  preventScrubbing={preventScrubbing}
  canAcceptCheckpoint={videoCanAcceptCheckpoint}
  checkpointGateState={checkpointGateState}
  startBlocked={startBlocked}
  overlayMounted={overlayMounted}
  overlayVisible={overlayVisible}
  on:checkpoint={(event) => forward('checkpoint', event.detail)}
  on:ready={(event) => forward('ready', event.detail)}
  on:play={(event) => forward('play', event.detail)}
  on:pause={(event) => forward('pause', event.detail)}
  on:timeupdate={(event) => forward('timeupdate', event.detail)}
  on:ended={(event) => forward('ended', event.detail)}
>
  <ActiveFlashcardControllerSlot
    bind:fadeElement={trialContentFadeElement}
    contentProps={flashcardControllerProps}
    parentVisible={overlayVisible}
    visible={overlayVisible}
    fadingOut={fadingOut}
    showTrialTimerArea={showTrialTimerArea}
    trialTimerProps={trialTimerProps}
    on:transitionrun={(event) => forward('transitionrun', event.detail)}
    on:transitionstart={(event) => forward('transitionstart', event.detail)}
    on:transitionend={(event) => forward('transitionend', event.detail)}
    on:submit={(event) => forward('submit', event.detail)}
    on:choice={(event) => forward('choice', event.detail)}
    on:input={(event) => forward('input', event.detail)}
    on:activity={(event) => forward('activity', event.detail)}
    on:firstKeypress={(event) => forward('firstKeypress', event.detail)}
    on:feedbackcontent={(event) => forward('feedbackcontent', event.detail)}
    on:blockingassetstate={(event) => forward('blockingassetstate', event.detail)}
    on:reviewrevealstarted={(event) => forward('reviewrevealstarted', event.detail)}
    on:h5presult={(event) => forward('h5presult', event.detail)}
  />
</VideoSessionMode>

<VideoSessionOverlays
  continueButtonText={continueButtonText}
  instructionHtml={instructionHtml}
  instructionStartBlocked={instructionStartBlocked}
  showInstructionOverlay={showInstructionOverlay}
  videoEndOverlayMounted={videoEndOverlayMounted}
  videoEndOverlayVisible={videoEndOverlayVisible}
  videoPlayerReady={videoPlayerReady}
  on:instructioncontinue={(event) => forward('instructioncontinue', event.detail)}
  on:videocontinue={(event) => forward('videocontinue', event.detail)}
/>
