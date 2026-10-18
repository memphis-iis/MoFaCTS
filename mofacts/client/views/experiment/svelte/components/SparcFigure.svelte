<script>
  import { parseSparcPromptFigure, SPARC_PROMPT_IMAGE_SETTINGS } from '../../../../../common/lib/sparcPromptImage';
  import { SPARC_ADMINISTRATIVE_REMOVAL_TEXT } from '../../../../../../learning-components/runtime/sparcAdministrativeRemoval';

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
    {#if loaded.administrativeRemoval}<p>{SPARC_ADMINISTRATIVE_REMOVAL_TEXT}</p>
    {:else}<img src={loaded.dataUrl} alt={validated.description} />{/if}
  {:catch}
    <p role="alert">The saved figure could not be loaded. Please reload the lesson.</p>
  {/await}
</figure>
