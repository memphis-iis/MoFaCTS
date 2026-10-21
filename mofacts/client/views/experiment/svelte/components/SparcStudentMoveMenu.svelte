<script>
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';
  import { SPARC_QUESTION_RESPONSE_FORMATS } from '../../../../../../learning-components/runtime/sparcTargetCategories';

  export let node;
  export let onActivate = undefined;
  export let history = false;
  const text = key => translatePlatformString(getActiveUiLocale(), `sparc.moveMenu.${key}`);
  const moves = ['question', 'explanation-question', 'explanation-rich-question', 'explanation-visual-question'];
  const moveKeys = ['question', 'explain', 'support', 'visual'];
  const formatKeys = ['text', 'cloze', 'multipleChoice', 'trueFalse'];
  const accepted = node.children.find(child => child.selected && child.value !== 'next-target');
  let nextKC = node.children.some(child => child.value === 'next-target' && child.selected);
  let move = accepted ? accepted.value.substring(0, accepted.value.lastIndexOf('.')) : '';
  let format = accepted ? accepted.value.substring(accepted.value.lastIndexOf('.') + 1) : '';
  if (history && accepted && (!moves.includes(move) || !SPARC_QUESTION_RESPONSE_FORMATS.includes(format))) {
    throw new Error('Saved SPARC choice has an unknown composition or question format');
  }
  let submitting = false;
  $: options = node.children;
  $: nextTarget = options.find(child => child.optionId === 'next-target');
  $: locked = options.some(child => child.selected && child.optionId !== 'next-target');

  function availableMove(id) {
    return options.some(child => child.optionId?.startsWith(`${id}.`) && !child.readOnly);
  }
  function availableFormat(id) {
    return options.some(child => child.optionId === `${move}.${id}` && !child.readOnly)
      || (!move && options.some(child => child.optionId?.endsWith(`.${id}`) && !child.readOnly));
  }
  async function choose(factor, value) {
    if (submitting) return;
    if (factor === 'kc') nextKC = value;
    if (factor === 'move') move = value;
    if (factor === 'format') format = value;
    if (!move || !format) return;
    const option = options.find(child => child.optionId === `${move}.${format}` && !child.readOnly);
    if (!option || (nextKC && !nextTarget)) throw new Error('Selected SPARC move is not offered by the active menu');
    submitting = true;
    try { await onActivate(option, nextKC ? nextTarget : null); }
    finally { submitting = false; }
  }

  // Measure the unwrapped menu, then scale its entire rectangle. Font, padding,
  // borders and hit regions keep the same proportions at every available width.
  function fitMenu(host) {
    const size = host.querySelector('.sparc-student-menu-size');
    const grid = host.querySelector('.sparc-student-menu-grid');
    const fit = () => {
      const width = grid.offsetWidth;
      const height = grid.offsetHeight;
      if (!width || !host.clientWidth) return;
      const scale = Math.min(1, host.clientWidth / width);
      size.style.width = `${width * scale}px`;
      size.style.height = `${height * scale}px`;
      grid.style.transform = `scale(${scale})`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    observer.observe(grid);
    fit();
    return { destroy: () => observer.disconnect() };
  }
</script>

{#if options.length}
  <div class="sparc-student-move-menu" class:sparc-student-move-history={history} data-node-id={node.id} use:fitMenu>
    <div class="sparc-student-menu-size">
      <div class="sparc-student-menu-grid" aria-busy={submitting}>
        {#if history}
          <div class="sparc-student-menu-column" role="group" aria-label={text('kcGroup')}>
            <button type="button" aria-pressed="true" disabled>{text(nextKC ? 'nextKC' : 'sameKC')}</button>
          </div>
          {#if move && format}
            <div class="sparc-student-menu-column" role="group" aria-label={text('moveGroup')}>
              <button type="button" aria-pressed="true" disabled>{text(moveKeys[moves.indexOf(move)])}</button>
            </div>
            <div class="sparc-student-menu-column" role="group" aria-label={text('formatGroup')}>
              <button type="button" aria-pressed="true" disabled>{text(formatKeys[SPARC_QUESTION_RESPONSE_FORMATS.indexOf(format)])}</button>
            </div>
          {/if}
        {:else}
        <div class="sparc-student-menu-column" role="group" aria-label={text('kcGroup')} class:has-selection={true}>
          <button type="button" aria-pressed={!nextKC} disabled={submitting || locked} on:click={() => choose('kc', false)}>{text('sameKC')}</button>
          <button type="button" aria-pressed={nextKC} disabled={submitting || locked || nextTarget?.readOnly || !nextTarget} on:click={() => choose('kc', true)}>{text('nextKC')}</button>
        </div>
        <div class="sparc-student-menu-column" role="group" aria-label={text('moveGroup')} class:has-selection={Boolean(move)}>
          {#each moves as id, index}
            <button type="button" aria-pressed={move === id} disabled={submitting || !availableMove(id)} on:click={() => choose('move', id)}>{text(moveKeys[index])}</button>
          {/each}
        </div>
        <div class="sparc-student-menu-column" role="group" aria-label={text('formatGroup')} class:has-selection={Boolean(format)}>
          {#each SPARC_QUESTION_RESPONSE_FORMATS as id, index}
            <button type="button" aria-pressed={format === id} disabled={submitting || !availableFormat(id)} on:click={() => choose('format', id)}>{text(formatKeys[index])}</button>
          {/each}
        </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
