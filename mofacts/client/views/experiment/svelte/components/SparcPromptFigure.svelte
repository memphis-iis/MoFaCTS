<script>
  import { parseSparcPromptFigure } from '../../../../../../learning-components/units/sparcsession/sparcSupportedPrompt';
  import { readSparcPromptImage } from '../services/sparcPromptImage';
  import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../../../../common/lib/sparcPromptImage';

  export let figure;
  export let figureId;
  export let compact = false;
  $: validated = parseSparcPromptFigure(figure);
  $: image = readSparcPromptImage(validated.assetId);
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

<style>
  .sparc-prompt-figure { margin: 0.75rem 0 0; }
  .sparc-prompt-figure-compact { margin: 0; }
  img { display: block; width: 100%; height: auto; border-radius: 0.4rem; }
</style>

