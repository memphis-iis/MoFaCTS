<script>
  /**
   * MultipleChoice Component
   * Displays multiple choice buttons in a grid layout
   */
  import { createEventDispatcher, afterUpdate, onDestroy, onMount } from 'svelte';
  import DOMPurify from 'dompurify';

  const dispatch = createEventDispatcher();

  /** @type {Array<{verbalChoice: string, buttonName: string, buttonValue: string, isImage: boolean}>} */
  export let buttonList = [];

  /** @type {boolean} Whether buttons are enabled */
  export let enabled = true;

  /** @type {number} Number of columns (1-4) */
  export let columns = 2;

  /** @type {boolean} Whether to show buttons */
  export let showButtons = true;

  let multipleChoiceElement;
  let gridElement;
  let resizeHandler;
  let schedulePending = false;

  function handleChoice(button, index) {
    if (!enabled) return;

    dispatch('choice', {
      answer: button.buttonName,
      buttonName: button.buttonName,
      index,
      timestamp: Date.now()
    });
  }

  // Sanitize button names for HTML display
  function sanitizeButtonName(name) {
    return DOMPurify.sanitize(name);
  }

  function resolveColumnCount() {
    const resolvedColumns = Number(columns);
    if (!Number.isFinite(resolvedColumns) || resolvedColumns <= 0) {
      return 2;
    }
    return Math.max(1, Math.floor(resolvedColumns));
  }

  function applyUniformButtonWidth() {
    if (!gridElement || typeof window === 'undefined') {
      return;
    }

    const buttons = Array.from(gridElement.querySelectorAll('button.choice-button'));
    if (!buttons.length) {
      gridElement.style.removeProperty('--uniform-button-width');
      return;
    }

    let maxWidth = 0;
    buttons.forEach((button) => {
      maxWidth = Math.max(maxWidth, button.scrollWidth);
    });

    const columnCount = resolveColumnCount();
    const computed = window.getComputedStyle(gridElement);
    const gap = parseFloat(computed.columnGap || computed.gap || '0') || 0;
    const availableGridWidth = gridElement.clientWidth;
    const availableColumnWidth = columnCount > 0
      ? ((availableGridWidth - (gap * Math.max(0, columnCount - 1))) / columnCount)
      : availableGridWidth;

    const paddedWidth = Math.min(
      maxWidth + 40,
      window.innerWidth * 0.8,
      availableColumnWidth
    );
    gridElement.style.setProperty('--uniform-button-width', `${Math.round(paddedWidth)}px`);
  }

  function getAvailableResponseHeight() {
    if (!gridElement || typeof window === 'undefined') {
      return 0;
    }

    const responseArea = gridElement.closest('.response-area');
    if (!responseArea) {
      return gridElement.clientHeight;
    }

    let reservedHeight = 0;

    return Math.max(0, responseArea.clientHeight - reservedHeight - 8);
  }

  function setButtonScale(scale, baseFontSize) {
    if (!gridElement) return;
    const scaledFontSize = Math.max(11, Math.round(baseFontSize * scale));
    gridElement.style.setProperty('--choice-font-size', `${scaledFontSize}px`);
    gridElement.style.setProperty('--choice-padding-block', `${Math.max(0.35, 0.75 * scale).toFixed(3)}rem`);
    gridElement.style.setProperty('--choice-padding-inline', `${Math.max(0.35, 0.75 * scale).toFixed(3)}rem`);
    gridElement.style.setProperty('--choice-min-height', `${Math.max(32, Math.round(48 * scale))}px`);
    gridElement.style.setProperty('--choice-grid-gap', `${Math.max(0.35, 0.75 * scale).toFixed(3)}rem`);
    if (multipleChoiceElement) {
      multipleChoiceElement.style.setProperty('--choice-container-padding', `${Math.max(0.2, 0.5 * scale).toFixed(3)}rem`);
    }
  }

  function applyAutoFitSizing() {
    if (!gridElement || typeof window === 'undefined') {
      return;
    }

    // Clear any scale set by a previous trial so baseFontSize reflects --card-font-size,
    // not the stale --choice-font-size left over from a shrunk layout.
    gridElement.style.removeProperty('--choice-font-size');

    const firstButton = gridElement.querySelector('button.choice-button');
    const fallbackFontSize = parseFloat(
      window.getComputedStyle(document.documentElement).getPropertyValue('--card-font-size')
    );
    const baseFontSize = firstButton
      ? (parseFloat(window.getComputedStyle(firstButton).fontSize) || 24)
      : (Number.isFinite(fallbackFontSize) ? fallbackFontSize : 24);

    const availableHeight = getAvailableResponseHeight();
    if (!availableHeight) {
      setButtonScale(1, baseFontSize);
      return;
    }

    const columnCount = resolveColumnCount();
    const rowCount = Math.max(1, Math.ceil(buttonList.length / columnCount));
    let minScale = 0.55;
    if (rowCount >= 4) {
      minScale = 0.42;
    } else if (rowCount === 3) {
      minScale = 0.5;
    }
    minScale = Math.max(0.36, minScale);

    const step = rowCount >= 4 ? 0.02 : 0.03;
    let chosenScale = 1;

    setButtonScale(1, baseFontSize);
    applyUniformButtonWidth();
    const fitTolerancePx = 1;
    const safetyBufferPx = 6;
    const targetHeight = Math.max(0, availableHeight - safetyBufferPx);

    for (let scale = 1; scale >= minScale; scale -= step) {
      setButtonScale(scale, baseFontSize);
      applyUniformButtonWidth();
      const measuredHeight = multipleChoiceElement
        ? multipleChoiceElement.scrollHeight
        : gridElement.scrollHeight;
      if (measuredHeight <= (targetHeight + fitTolerancePx)) {
        chosenScale = scale;
        break;
      }
      chosenScale = scale;
    }

    setButtonScale(chosenScale, baseFontSize);
    applyUniformButtonWidth();

    const finalMeasuredHeight = multipleChoiceElement
      ? multipleChoiceElement.scrollHeight
      : gridElement.scrollHeight;
    if (finalMeasuredHeight > (targetHeight + fitTolerancePx)) {
      const emergencyScale = Math.max(0.32, minScale - 0.08);
      setButtonScale(emergencyScale, baseFontSize);
      applyUniformButtonWidth();
    }
  }

  function scheduleUniformWidth() {
    if (schedulePending || typeof window === 'undefined') {
      return;
    }
    schedulePending = true;
    requestAnimationFrame(() => {
      schedulePending = false;
      applyAutoFitSizing();
    });
  }

  function debounce(fn, delay) {
    let timeoutId;
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        timeoutId = null;
        fn();
      }, delay);
    };
  }

  onMount(() => {
    if (typeof window === 'undefined') {
      return;
    }

    scheduleUniformWidth();
    resizeHandler = debounce(scheduleUniformWidth, 300);
    window.addEventListener('resize', resizeHandler);
  });

  afterUpdate(() => {
    scheduleUniformWidth();
  });

  onDestroy(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
  });

  function handleKeydown(event, index, button) {
    const key = event.key;
    const buttons = Array.from(gridElement?.querySelectorAll('button.choice-button') || []);
    if (!buttons.length) return;

    let targetIndex = index;
    if (key === 'ArrowLeft' || key === 'ArrowUp') {
      event.preventDefault();
      targetIndex = index > 0 ? index - 1 : buttons.length - 1;
    } else if (key === 'ArrowRight' || key === 'ArrowDown') {
      event.preventDefault();
      targetIndex = index < buttons.length - 1 ? index + 1 : 0;
    } else if (key === ' ' || key === 'Enter') {
      event.preventDefault();
      handleChoice(button, index);
      return;
    }

    if (targetIndex !== index) {
      buttons[targetIndex].focus();
    }
  }
</script>

{#if showButtons && buttonList.length > 0}
  <div class="multiple-choice" class:disabled={!enabled} bind:this={multipleChoiceElement}>
    <div class="button-grid" style="--columns: {columns}" bind:this={gridElement}>
      {#each buttonList as button, index}
        <button
          class="choice-button"
          class:disabled={!enabled}
          class:is-image={button.isImage}
          disabled={!enabled}
          on:click={() => handleChoice(button, index)}
          on:keydown={(event) => handleKeydown(event, index, button)}
          data-button-value={button.buttonValue}
        >
          {#if button.isImage}
            <img src={button.buttonName} alt="Choice {index + 1}" on:load={scheduleUniformWidth} />
          {:else}
            {@html sanitizeButtonName(button.buttonName)}
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .multiple-choice {
    width: 100%;
    padding: var(--choice-container-padding, 0.5rem) 0;
  }

  .button-grid {
    display: grid;
    grid-template-columns: repeat(var(--columns, 2), 1fr);
    gap: var(--choice-grid-gap, 0.75rem);
    width: 100%;
    justify-items: center;
    min-width: 0;
  }

  .choice-button {
    width: min(100%, var(--uniform-button-width, 100%));
    max-width: 100%;
    padding: var(--choice-padding-block, 0.75rem) var(--choice-padding-inline, 0.75rem);
    font-size: var(--choice-font-size, var(--card-font-size, 24px));
    font-weight: 500;
    line-height: 1.2;
    color: var(--primary-button-text-color);
    background-color: var(--card-background-color);
    border: 2px solid color-mix(
      in srgb,
      var(--button-color) calc(100% - (var(--button-border-darkness) * 1%)),
      black calc(var(--button-border-darkness) * 1%)
    );
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    transition:
      opacity var(--transition-fast, 100ms) ease,
      background-color var(--transition-fast, 100ms) ease,
      box-shadow var(--transition-fast, 100ms) ease;
    min-height: var(--choice-min-height, 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    word-wrap: break-word;
    box-sizing: border-box;
    opacity: 1;
  }

  .choice-button:hover:not(.disabled) {
    background-color: color-mix(
      in srgb,
      var(--button-color) calc(100% - (var(--button-hover-darkness) * 1%)),
      black calc(var(--button-hover-darkness) * 1%)
    );
    color: var(--primary-button-text-color);
    opacity: 1;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--button-color) 20%, transparent);
  }

  .choice-button.disabled {
    background-color: var(--secondary-color);
    border-color: var(--secondary-color);
    color: var(--secondary-text-color);
    cursor: not-allowed;
  }

  .choice-button.is-image img {
    max-width: 100%;
    max-height: 200px;
    height: auto;
    object-fit: contain;
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .button-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
  }

  /* Tablet */
  @media (min-width: 769px) and (max-width: 992px) {
    .button-grid {
      grid-template-columns: repeat(min(var(--columns, 2), 2), 1fr);
    }
  }
</style>
