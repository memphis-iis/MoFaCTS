<script>
  import { createEventDispatcher } from 'svelte';
  import { resolveSparcTrialDisplay } from '../services/sparcTrialDisplay';
  import SparcNode from './SparcNode.svelte';

  const dispatch = createEventDispatcher();

  export let display = {};
  export let showQuestionNumber = false;
  export let questionNumber = 0;

  function buildInitialNodeValues(nodes = [], values = {}) {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      if (node.nodeType === 'group') {
        buildInitialNodeValues(node.children || [], values);
        continue;
      }
      if (!node.id) {
        continue;
      }
      if (node.atomType === 'dropdown') {
        values[node.id] = node.selected ?? node.value ?? '';
      } else if (node.atomType === 'checkbox') {
        values[node.id] = node.checked === true;
      } else {
        values[node.id] = node.value ?? '';
      }
    }
    return values;
  }

  function isSubmitButton(node) {
    const label = String(node?.label || node?.value || '').trim().toLowerCase();
    return /done|submit|check/.test(label);
  }

  function handleNodeValueChange(nodeId, value) {
    nodeValues = {
      ...nodeValues,
      [nodeId]: value,
    };
  }

  function handleButtonActivate(node) {
    if (!isSubmitButton(node)) {
      return;
    }
    dispatch('sparcsubmit', {
      submittedNodes: nodeValues,
      triggeredBy: node?.id,
      timestamp: Date.now(),
    });
  }

  $: sparcDisplay = resolveSparcTrialDisplay(display, '[SparcTrialSurface]');
  $: topLevelNodes = sparcDisplay?.nodes || [];
  $: nodeValues = buildInitialNodeValues(topLevelNodes, {});
</script>

<div class="sparc-surface">
  {#if showQuestionNumber}
    <div class="sparc-question-number">Question {questionNumber}</div>
  {/if}

  {#if sparcDisplay?.topbar?.title}
    <div class="sparc-topbar">
      <div class="sparc-topbar-title">{sparcDisplay.topbar.title}</div>
      {#if sparcDisplay.topbar.helpLabel}
        <div class="sparc-topbar-help">{sparcDisplay.topbar.helpLabel}</div>
      {/if}
    </div>
  {/if}

  <div class="sparc-surface-body">
    {#each topLevelNodes as node (node.id)}
      <SparcNode
        {node}
        {nodeValues}
        onNodeValueChange={handleNodeValueChange}
        onButtonActivate={handleButtonActivate}
      />
    {/each}
  </div>
</div>

<style>
  .sparc-surface {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    overflow: auto;
    box-sizing: border-box;
  }

  .sparc-question-number {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .sparc-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .sparc-topbar-title {
    font-size: 1.1rem;
    font-weight: 700;
  }

  .sparc-topbar-help {
    font-size: 0.9rem;
    opacity: 0.75;
  }

  .sparc-surface-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>