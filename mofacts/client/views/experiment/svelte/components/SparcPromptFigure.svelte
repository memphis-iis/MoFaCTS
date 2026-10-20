<script>
  import { parseSparcPromptFigure } from '../../../../../../learning-components/units/sparcsession/sparcSupportedPrompt';
  import { readSparcPromptImage } from '../services/sparcPromptImage';
  import SparcFigure from './SparcFigure.svelte';

  export let figure;
  export let figureId;
  export let compact = false;
  export let onFigureState = () => {};
  $: validated = parseSparcPromptFigure(figure);
  $: assetId = validated.assetId;
  $: image = readSparcPromptImage(assetId);
</script>

<SparcFigure {figure} {figureId} {compact} {image} {onFigureState} />

