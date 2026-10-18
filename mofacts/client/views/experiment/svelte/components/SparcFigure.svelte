<script>
  import { parseSparcPromptFigure, SPARC_PROMPT_IMAGE_SETTINGS } from '../../../../../common/lib/sparcPromptImage';

  export let figure;
  export let figureId = undefined;
  export let compact = false;
  export let image;
  $: validated = parseSparcPromptFigure(figure);
</script>

<figure id={figureId} class="sparc-prompt-figure" class:sparc-prompt-figure-compact={compact} style:width={`min(100%, ${validated.displayWidth ?? SPARC_PROMPT_IMAGE_SETTINGS.maxDisplayWidth}px)`}>
  {#await image}
    <p role="status">Loading figure…</p>
  {:then loaded}
    <img src={loaded.dataUrl} alt={validated.description} />
  {:catch}
    <p role="alert">The saved figure could not be loaded. Please reload the lesson.</p>
  {/await}
</figure>
