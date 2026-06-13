<script>
  import { createEventDispatcher } from 'svelte';
  import ActiveTrialContentSlot from './ActiveTrialContentSlot.svelte';
  import IncomingTrialContentSlot from './IncomingTrialContentSlot.svelte';
  import LearningProgressPanel from './LearningProgressPanel.svelte';
  import PerformanceArea from './PerformanceArea.svelte';

  const dispatch = createEventDispatcher();

  export let deliverySettings = {};
  export let fadingOut = false;
  export let incomingSlot = null;
  export let learningProgressPanelState = { panelOpen: false };
  export let learningProgressSnapshot = null;
  export let performanceStatsProps = {};
  export let showLearningProgressPanel = false;
  export let showPerformanceStats = false;
  export let showTrialTimerArea = false;
  export let trialContentFadeElement = null;
  export let trialContentProps = {};
  export let trialContentVisible = false;
  export let trialSubset = {};
  export let trialTimerProps = {};

  function forward(name, detail) {
    dispatch(name, detail);
  }
</script>

<div
  class="learning-session-layout"
  class:learning-session-layout-panel-open={learningProgressPanelState.panelOpen}
>
  <div class="learning-session-main">
    {#if showPerformanceStats}
      <PerformanceArea {...performanceStatsProps} />
    {/if}

    <div class="trial-content-stack">
      <ActiveTrialContentSlot
        bind:fadeElement={trialContentFadeElement}
        contentProps={trialContentProps}
        parentVisible={trialContentVisible}
        visible={trialContentVisible}
        fadingOut={fadingOut}
        slotted={true}
        showTrialTimerArea={showTrialTimerArea}
        trialTimerProps={trialTimerProps}
        showSkipStudyButton={trialSubset.showSkipStudyButton}
        skipStudyButtonText={deliverySettings.skipStudyButtonText || 'Skip'}
        on:transitionrun={(event) => forward('transitionrun', event.detail)}
        on:transitionstart={(event) => forward('transitionstart', event.detail)}
        on:transitionend={(event) => forward('transitionend', event.detail)}
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
        on:sparcaction={(event) => forward('sparcaction', event.detail)}
        on:sparcsubmit={(event) => forward('sparcsubmit', event.detail)}
        on:skipstudy={(event) => forward('skipstudy', event.detail)}
      />

      {#if incomingSlot}
        <IncomingTrialContentSlot
          contentProps={incomingSlot.props}
          on:feedbackcontent={(event) => forward('feedbackcontent', event.detail)}
          on:blockingassetstate={(event) => forward('incomingblockingassetstate', event.detail)}
        />
      {/if}
    </div>
  </div>

  {#if showLearningProgressPanel}
    <LearningProgressPanel
      snapshot={learningProgressSnapshot}
      open={learningProgressPanelState.panelOpen}
      on:toggle={(event) => forward('learningprogresstoggle', event.detail)}
    />
  {/if}
</div>

<style>
  .learning-session-layout {
    --learning-progress-panel-width: 136px;

    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: stretch;
    width: 100%;
    overflow: hidden;
  }

  .learning-session-main {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding-right: var(--app-space-0);
    transition: padding-right var(--app-transition-smooth) ease;
  }

  .learning-session-layout-panel-open .learning-session-main {
    padding-right: var(--app-space-0);
  }

  .trial-content-stack {
    flex: 1;
    min-height: 0;
    position: relative;
  }
</style>
