<script>
  import { parseSparcPromptFigure } from '../../../../../../learning-components/units/sparcsession/sparcSupportedPrompt';
  import { readSparcPromptImage } from '../services/sparcPromptImage';

  export let figure;
  export let figureId;
  $: validated = parseSparcPromptFigure(figure);
  $: image = readSparcPromptImage(validated.assetId);
</script>

<figure id={figureId} class="sparc-prompt-figure">
  {#await image}
    <p role="status">Loading figure…</p>
  {:then loaded}
    <img src={loaded.dataUrl} alt={validated.description} />
  {:catch}
    <p role="alert">The saved figure could not be loaded. Please reload the lesson.</p>
  {/await}
</figure>

<style>
  .sparc-prompt-figure { margin: 0.75rem 0 0; width: min(100%, 640px); }
  img { display: block; width: 100%; height: auto; border-radius: 0.4rem; }
</style>

