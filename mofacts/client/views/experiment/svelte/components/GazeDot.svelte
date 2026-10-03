<script lang="ts">
  import { gazeState } from '../services/gazeTracking';
  export let visible = true;
</script>

{#if visible && $gazeState.sample}
  <div class="gaze-dot" aria-hidden="true"
    style:left={`${$gazeState.sample.x}px`} style:top={`${$gazeState.sample.y}px`}></div>
{/if}

<style>
  .gaze-dot { position: fixed; width: 8px; height: 8px; background: red;
    border: 1px solid white; outline: 1px solid black; border-radius: 50%;
    transform: translate(-50%, -50%); pointer-events: none; z-index: 10000; }
</style>
