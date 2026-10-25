<script lang="ts">
  import { onMount } from 'svelte';
  import { createFigureGestureController, type FigureGestureFrame, type FigureGestureResult, type GestureRect } from '../../../../../../learning-components/units/skeleton-demo/figureGestures';
  import type { FigureId } from '../../../../../../learning-components/units/skeleton-demo/figureGeometry';
  import type { createFigureScene, FigureProjection } from '../services/figureScene';
  import FigureWireframe from './FigureWireframe.svelte';
  export let onReady: () => void;
  export let onError: () => void;
  let host: HTMLDivElement;
  let palette: HTMLElement;
  let cubeButton: HTMLButtonElement;
  let pyramidButton: HTMLButtonElement;
  let width = 0;
  let height = 0;
  let scene: ReturnType<typeof createFigureScene> | null = null;
  let projection: FigureProjection | null = null;
  let activeFigure: FigureId | null = null;
  let thumbnails: Record<FigureId, FigureProjection> | null = null;
  const gesture = createFigureGestureController();
  function render(): void {
    if (!scene) return;
    try { projection = scene.project(width, height); activeFigure = scene.activeFigure; }
    catch { onError(); }
  }
  $: if (width >= 0 && height >= 0 && scene) render();
  const bounds = (element: HTMLElement): GestureRect => {
    const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height };
  };
  export function resetGestures(): void { gesture.reset(); }
  export function update(frame: FigureGestureFrame, mirrored: boolean): FigureGestureResult {
    const result = gesture.update(frame, mirrored, { preview: bounds(host), palette: bounds(palette),
      targets: [{ id: 'cube', bounds: bounds(cubeButton) }, { id: 'pyramid', bounds: bounds(pyramidButton) }], activeFigure });
    scene?.apply(result); render(); return result;
  }
  function select(id: FigureId): void { gesture.reset(); scene?.select(id); render(); }
  onMount(() => {
    let mounted = true;
    void import('../services/figureScene').then(({ createFigureScene }) => {
      if (!mounted) return;
      scene = createFigureScene(); thumbnails = { cube: scene.thumbnail('cube'), pyramid: scene.thumbnail('pyramid') }; render(); onReady();
    }).catch(() => { if (mounted) onError(); });
    return () => { mounted = false; gesture.reset(); scene = null; };
  });
</script>

<div class="figure-overlay" bind:this={host}>
  <aside class="card figure-palette" aria-label="Figures" bind:this={palette}>
    <button type="button" class={`btn figure-palette-button ${activeFigure === 'cube' ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={activeFigure === 'cube'} disabled={!scene}
      on:click={() => select('cube')} bind:this={cubeButton}>
      {#if thumbnails}<FigureWireframe projection={thumbnails.cube} miniature />{/if}
      <span>Cube</span>
    </button>
    <button type="button" class={`btn figure-palette-button ${activeFigure === 'pyramid' ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={activeFigure === 'pyramid'} disabled={!scene}
      on:click={() => select('pyramid')} bind:this={pyramidButton}>
      {#if thumbnails}<FigureWireframe projection={thumbnails.pyramid} miniature />{/if}
      <span>Pyramid</span>
    </button>
  </aside>
  <div class="figure-display" bind:clientWidth={width} bind:clientHeight={height}>
    {#if projection}
      <FigureWireframe {projection} />
    {:else}
      <p class="figure-empty">Pinch over a figure on the left to select it.</p>
    {/if}
  </div>
</div>
