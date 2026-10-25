<script lang="ts">
  import type { FigureProjection } from '../services/figureScene';
  export let projection: FigureProjection;
  export let miniature = false;
</script>

<svg class="figure-vector" class:figure-wireframe={!miniature} class:figure-miniature={miniature}
  width="100%" height="100%" viewBox={miniature ? '0 0 240 220' : undefined}
  role={miniature ? undefined : 'img'} aria-hidden={miniature ? true : undefined}
  aria-label={miniature ? undefined : `${projection.name}, ${projection.lengthLabel.text}`}>
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
