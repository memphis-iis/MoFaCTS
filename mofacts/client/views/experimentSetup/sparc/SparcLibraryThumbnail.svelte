<script>
  import { onMount } from 'svelte';

  export let onSelect;
  export let selectionLabel;
  export let selected = undefined;

  let frame;
  let content;
  let visible = false;
  let transform = 'scale(0)';

  onMount(() => {
    function fit() {
      const style = getComputedStyle(frame);
      const left = parseFloat(style.paddingLeft);
      const top = parseFloat(style.paddingTop);
      const width = frame.clientWidth - left - parseFloat(style.paddingRight);
      const height = frame.clientHeight - top - parseFloat(style.paddingBottom);
      const sourceWidth = Math.max(content.offsetWidth, content.scrollWidth);
      const sourceHeight = Math.max(content.offsetHeight, content.scrollHeight);
      if (width <= 0 || height <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return;

      // Geometry only: the shared theme determines the frame and reading width.
      const scale = Math.min(1, width / sourceWidth, height / sourceHeight);
      const x = left + (width - sourceWidth * scale) / 2;
      const y = top + (height - sourceHeight * scale) / 2;
      transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }

    const sizeObserver = new ResizeObserver(fit);
    sizeObserver.observe(frame);
    sizeObserver.observe(content);
    const visibilityObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        visible = true;
        visibilityObserver.disconnect();
      }
    }, { rootMargin: '200px' });
    visibilityObserver.observe(frame);
    return () => { sizeObserver.disconnect(); visibilityObserver.disconnect(); };
  });
</script>

<div class="sparc-library-thumbnail" bind:this={frame}>
  <div class="sparc-library-thumbnail-content sparc-library-thumbnail-miniature" bind:this={content} style:transform aria-hidden="true" inert>
    {#if visible}<slot />{/if}
  </div>
  <button type="button" class="sparc-library-thumbnail-select" aria-label={selectionLabel} aria-pressed={selected} on:click={onSelect}></button>
</div>
