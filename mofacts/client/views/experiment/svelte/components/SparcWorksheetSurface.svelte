<script>
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { SparcWorksheet } from '../../../../../../learning-components/units/sparcsession/sparcWorksheet';
  import { loadWorksheetHistory } from '../services/worksheetRuntime';
  import { insertCompressedHistory } from '../../../../lib/historyWire';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';
  import SparcNode from './SparcNode.svelte';
  import { waitForBrowserPaint } from '../utils/paintTiming';

  export let display;
  export let userId;
  export let tdfId;
  export let levelUnit;
  export let attemptId;
  export let checkpointIndex = -1;
  export let inputLanguage = '';
  export let inputTextDirection = 'ltr';
  const dispatch = createEventDispatcher();
  const text = (key, args) => translatePlatformString(getActiveUiLocale(), key, args);
  let worksheet;
  let ready = false;
  let error = '';
  let seconds = 0;
  let timer;
  let disposed = false;
  let exposed = false;
  let reviewAppeared = false;
  let completed = false;
  let container;

  function workNode(node, selected) {
    const copy = { ...node };
    if (copy.atomType === 'message-box') return { ...copy, value: '' };
    if (copy.atomType === 'button') { copy.readOnly = Boolean(error) || worksheet.phase !== 'work' || worksheet.closing; copy.selected = selected?.id === copy.id; }
    if (copy.children) copy.children = copy.children.map((child) => workNode(child, selected));
    return copy;
  }
  async function refresh() {
    if (disposed) return;
    worksheet = worksheet;
    seconds = Math.max(0, Math.ceil((worksheet.deadline - Date.now()) / 1000));
    if (worksheet.phase === 'review' && !exposed) {
      exposed = true;
      await tick();
      await waitForBrowserPaint();
      if (disposed) return;
      container?.focus();
      await worksheet.feedbackAppeared();
      reviewAppeared = true;
    }
    if (worksheet.phase === 'complete' && !completed) { completed = true; dispatch('complete'); }
  }
  async function run(action) {
    if (error || disposed) return;
    try { await action(); await refresh(); }
    catch { error = text('worksheet.saveFailed'); worksheet = worksheet; clearInterval(timer); }
  }
  async function advance() {
    await run(() => worksheet.phase === 'work' ? worksheet.finishWork() : worksheet.complete());
  }
  onMount(() => {
    void run(async () => {
      worksheet = new SparcWorksheet({ display,
        core: { userId, TDFId: tdfId, levelUnit: Number(levelUnit), sessionID: attemptId }, checkpointIndex,
        now: Date.now, id: () => crypto.randomUUID(), random: Math.random, write: insertCompressedHistory });
      const history = await loadWorksheetHistory(userId, tdfId, Number(levelUnit), display.pageKey, checkpointIndex);
      if (disposed) return;
      await worksheet.initialize(history);
      ready = true;
      timer = setInterval(() => {
        void run(async () => {
          if (Date.now() >= worksheet.deadline && !worksheet.closing) {
            if (worksheet.phase === 'work') await worksheet.finishWork();
            else if (worksheet.phase === 'review' && reviewAppeared) await worksheet.complete();
          }
        });
      }, 250);
    });
  });
  onDestroy(() => { disposed = true; clearInterval(timer); });
</script>

<section class="worksheet" bind:this={container} tabindex="-1" aria-label={text('worksheet.label')}>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if !ready}<p role="status">{text('common.loading')}</p>
  {:else if worksheet.phase !== 'complete'}
    <p role="timer">{text('performance.timeRemaining', { seconds })}</p>
    {#each worksheet.order as id (id)}
      {@const question = worksheet.questions.find((item) => item.id === id)}
      {@const selected = worksheet.selection(question)}
      <div class="worksheet-question" class:incorrect={worksheet.phase === 'review' && selected?.value !== question.expected}>
        <SparcNode node={workNode(question.node, selected)} nodeValues={{}} {inputLanguage} {inputTextDirection}
          onButtonActivate={(node) => run(() => worksheet.answer(node.id))} />
        {#if worksheet.phase === 'review'}
          <p>{text('worksheet.yourAnswer', { answer: selected?.label ?? '' })}</p>
          <p>{text('feedback.correctAnswerIs', { answer: question.choices.find((choice) => choice.value === question.expected)?.label ?? question.expected })}</p>
          <p>{text(selected?.value === question.expected ? 'worksheet.correct' : 'worksheet.incorrect')}</p>
        {/if}
      </div>
    {/each}
    <button class="btn btn-primary" type="button" disabled={Boolean(error) || worksheet.closing || (worksheet.phase === 'review' && !reviewAppeared)} on:click={advance}>
      {text(worksheet.phase === 'work' ? 'worksheet.submitContinue' : 'common.continue')}
    </button>
  {/if}
</section>

<style>
  .worksheet { overflow-y: auto; max-height: 80vh; padding: 1rem; background: var(--card-bg, white); }
  .worksheet-question { margin-bottom: 1rem; padding: .75rem; border: 2px solid transparent; }
  .worksheet-question.incorrect { border-color: var(--feedback-error-color); }
</style>
