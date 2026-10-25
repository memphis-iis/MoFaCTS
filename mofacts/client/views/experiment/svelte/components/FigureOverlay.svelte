<script lang="ts">
  import { onMount } from 'svelte';
  import { createFigureGestureController, type FigureGestureFrame, type FigureGestureResult, type GestureRect } from '../../../../../../learning-components/units/skeleton-demo/figureGestures';
  import type { FigureId } from '../../../../../../learning-components/units/skeleton-demo/figureGeometry';
  import type { createFigureScene, FigureProjection } from '../services/figureScene';
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
      scene = createFigureScene(); render(); onReady();
    }).catch(() => { if (mounted) onError(); });
    return () => { mounted = false; gesture.reset(); scene = null; };
  });
</script>

<div class="figure-overlay" bind:this={host}>
  <aside class="card figure-palette" aria-label="Figures" bind:this={palette}>
    <button type="button" class={`btn figure-palette-button ${activeFigure === 'cube' ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={activeFigure === 'cube'} disabled={!scene}
      on:click={() => select('cube')} bind:this={cubeButton}>
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="5" width="22" height="22" /></svg>
      <span>Cube</span>
    </button>
    <button type="button" class={`btn figure-palette-button ${activeFigure === 'pyramid' ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={activeFigure === 'pyramid'} disabled={!scene}
      on:click={() => select('pyramid')} bind:this={pyramidButton}>
      <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4 L29 27 L3 27 Z" /></svg>
      <span>Pyramid</span>
    </button>
  </aside>
  <div class="figure-display" bind:clientWidth={width} bind:clientHeight={height}>
    {#if projection}
      <svg class="figure-wireframe" width="100%" height="100%" role="img" aria-label={`${projection.name}, ${projection.lengthLabel.text}`}>
        {#each [false, true] as visible}
          {#each projection.edges.filter(edge => edge.visible === visible) as edge (edge.id)}
            <g class:figure-hidden-edge={!visible} data-edge={edge.id}>
              <line x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y} stroke-dasharray={visible ? undefined : '6 5'} />
              <line class="figure-tick" x1={edge.tickStart.x} y1={edge.tickStart.y} x2={edge.tickEnd.x} y2={edge.tickEnd.y} />
            </g>
          {/each}
        {/each}
        {#each projection.vertices as vertex (vertex.id)}
          <text class="figure-vertex-label" x={vertex.x} y={vertex.y}>{vertex.id}</text>
        {/each}
        <text class="figure-length-label" x={projection.lengthLabel.x} y={projection.lengthLabel.y - (projection.lengthLabel.lines.length - 1) * 8}>{#each projection.lengthLabel.lines as line, i}<tspan x={projection.lengthLabel.x} dy={i === 0 ? 0 : 16}>{line}</tspan>{/each}</text>
      </svg>
    {:else}
      <p class="figure-empty">Pinch over a figure on the left to select it.</p>
    {/if}
  </div>
</div>
