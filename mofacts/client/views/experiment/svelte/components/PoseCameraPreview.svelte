<script lang="ts">
  import type { PoseConnection, PoseObservation } from '../services/poseTracking';
  import { isVisiblePoseLandmark } from '../services/poseTracking';
  export let videoElement: HTMLVideoElement;
  export let observation: PoseObservation | null = null;
  export let connections: readonly PoseConnection[] = [];
  $: points = observation?.landmarks ?? [];
</script>

<div class="pose-camera-preview">
  <div class="pose-camera-mirror">
    <!-- A silent, live camera preview has no prerecorded audio to caption. -->
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={videoElement} muted playsinline aria-label="Live camera preview" />
    <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {#each connections as connection}
        {#if isVisiblePoseLandmark(points[connection.start]) && isVisiblePoseLandmark(points[connection.end])}
          <line x1={points[connection.start].x} y1={points[connection.start].y}
            x2={points[connection.end].x} y2={points[connection.end].y} />
        {/if}
      {/each}
      {#each points as point}
        {#if isVisiblePoseLandmark(point)}
          <circle cx={point.x} cy={point.y} r="0.005" />
        {/if}
      {/each}
    </svg>
  </div>
</div>
