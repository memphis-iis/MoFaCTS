<script lang="ts">
  import { onMount } from 'svelte';
  import type { HandRotationResult } from '../../../../../../learning-components/units/skeleton-demo/handRotation';
  import type { createHandCubeScene } from '../services/handCubeScene';
  export let rotation: HandRotationResult['rotation'] = null;
  export let onReady: () => void;
  export let onError: () => void;
  let host: HTMLDivElement;
  let xLabel: HTMLSpanElement;
  let yLabel: HTMLSpanElement;
  let zLabel: HTMLSpanElement;
  let scene: ReturnType<typeof createHandCubeScene> | null = null;
  $: if (scene) scene.rotate(rotation);
  onMount(() => {
    let mounted = true;
    void import('../services/handCubeScene').then(({ createHandCubeScene }) => {
      if (!mounted) return;
      scene = createHandCubeScene(host, [xLabel, yLabel, zLabel], onError);
      onReady();
    }).catch(() => { if (mounted) onError(); });
    return () => { mounted = false; scene?.dispose(); scene = null; };
  });
</script>

<div class="hand-cube-overlay" bind:this={host} role="img" aria-label="Hand-controlled cube with X, Y and Z coordinate axes">
  <span class="hand-cube-axis-label" bind:this={xLabel} aria-hidden="true">X</span>
  <span class="hand-cube-axis-label" bind:this={yLabel} aria-hidden="true">Y</span>
  <span class="hand-cube-axis-label" bind:this={zLabel} aria-hidden="true">Z</span>
</div>
