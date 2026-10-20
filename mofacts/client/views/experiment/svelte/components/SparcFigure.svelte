<script>
  import { parseSparcPromptFigure, SPARC_PROMPT_IMAGE_SETTINGS } from '../../../../../common/lib/sparcPromptImage';
  import { SPARC_ADMINISTRATIVE_REMOVAL_TEXT } from '../../../../../../learning-components/runtime/sparcAdministrativeRemoval';

  export let figure;
  export let figureId = undefined;
  export let compact = false;
  export let image;
  export let onFigureState = () => {};
  let imageFailed = false;
  $: validated = parseSparcPromptFigure(figure);
  $: assetId = validated.assetId;
  $: observedImage = observeImage(image, figureId, assetId);

  function observeImage(promise, id, assetId) {
    imageFailed = false;
    return promise.catch(error => {
      onFigureState({ figureId: id, assetId, status: 'failed' });
      throw error;
    });
  }

  function removedFigure() {
    onFigureState({ figureId, assetId: validated.assetId, status: 'ready' });
  }

  function imageReadiness(element) {
    let disposed = false;
    const id = figureId, assetId = validated.assetId;
    const report = status => {
      if (!disposed && element.isConnected) onFigureState({ figureId: id, assetId, status });
    };
    const fail = () => {
      if (disposed) return;
      imageFailed = true;
      report('failed');
    };
    const loaded = async () => {
      try {
        await element.decode();
        report('ready');
      } catch { fail(); }
    };
    element.addEventListener('load', loaded);
    element.addEventListener('error', fail);
    if (element.complete) {
      if (element.naturalWidth > 0) loaded();
      else fail();
    }
    return { destroy() {
      disposed = true;
      element.removeEventListener('load', loaded);
      element.removeEventListener('error', fail);
    } };
  }
</script>

<figure id={figureId} class="sparc-prompt-figure" class:sparc-prompt-figure-compact={compact} style:width={`min(100%, ${validated.displayWidth ?? SPARC_PROMPT_IMAGE_SETTINGS.maxDisplayWidth}px)`}>
  {#await observedImage}
    <p role="status">Loading figure…</p>
  {:then loaded}
    {#if loaded.administrativeRemoval}<p use:removedFigure>{SPARC_ADMINISTRATIVE_REMOVAL_TEXT}</p>
    {:else if imageFailed}<p role="alert">The saved figure could not be loaded. Please reload the lesson.</p>
    {:else}<img src={loaded.dataUrl} alt={validated.description} use:imageReadiness />{/if}
  {:catch}
    <p role="alert">The saved figure could not be loaded. Please reload the lesson.</p>
  {/await}
</figure>
