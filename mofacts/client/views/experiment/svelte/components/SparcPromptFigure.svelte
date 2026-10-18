<script>
  import { parseSparcPromptFigure } from '../../../../../../learning-components/units/sparcsession/sparcSupportedPrompt';
  import { readSparcPromptImage } from '../services/sparcPromptImage';
  import SparcFigure from './SparcFigure.svelte';

  export let figure;
  export let figureId;
  export let compact = false;
  $: validated = parseSparcPromptFigure(figure);
  $: image = readSparcPromptImage(validated.assetId);
</script>

<SparcFigure {figure} {figureId} {compact} {image} />

