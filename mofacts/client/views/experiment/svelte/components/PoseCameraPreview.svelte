<script lang="ts">
  import type { PoseConnection, PoseObservation } from '../services/poseTracking';
  import { isInFrameLandmark } from '../services/poseTracking';
  export let videoElement: HTMLVideoElement;
  export let observation: PoseObservation | null = null;
  export let handConnections: readonly PoseConnection[] = [];
  export let mirrored = true;
  export let cameraVisible = true;
  export let wireframeVisible = true;
  let aspectRatio = 4 / 3;
  let availableWidth = 0;
  let availableHeight = 0;
  $: fittedWidth = Math.max(0, Math.min(availableWidth, availableHeight * aspectRatio));
  function updateAspectRatio(): void {
    if (videoElement.videoWidth && videoElement.videoHeight) {
      aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
    }
  }
</script>

<div class="card pose-camera-preview" bind:clientWidth={availableWidth} bind:clientHeight={availableHeight}>
  <div class="pose-camera-frame" style={`--pose-aspect-ratio: ${aspectRatio}; width: ${fittedWidth}px`}>
  <div class="pose-camera-mirror" class:mirrored>
    <!-- A silent, live camera preview has no prerecorded audio to caption. -->
    <!-- svelte-ignore a11y_media_has_caption -->
    <video class:pose-layer-hidden={!cameraVisible} aria-hidden={!cameraVisible} bind:this={videoElement} muted playsinline on:loadedmetadata={updateAspectRatio}
      on:resize={updateAspectRatio} aria-label="Live camera preview"></video>
    <svg class:pose-layer-hidden={!wireframeVisible} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {#each observation?.hands ?? [] as hand}
        <g class="pose-camera-hand">
          {#each handConnections as connection}
            {#if isInFrameLandmark(hand[connection.start]) && isInFrameLandmark(hand[connection.end])}
              <line x1={hand[connection.start].x} y1={hand[connection.start].y}
                x2={hand[connection.end].x} y2={hand[connection.end].y} />
            {/if}
          {/each}
          {#each hand as point}
            {#if isInFrameLandmark(point)}<circle cx={point.x} cy={point.y} r="0.003" />{/if}
          {/each}
        </g>
      {/each}
    </svg>
  </div>
  <slot />
  </div>
</div>
