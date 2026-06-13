<script>
  import { createEventDispatcher } from 'svelte';
  import { resolveSparcTrialDisplay } from '../services/sparcTrialDisplay';
  import SparcNode from './SparcNode.svelte';

  const dispatch = createEventDispatcher();

  export let display = {};
  export let runtimeNodeValues = {};
  export let showQuestionNumber = false;
  export let questionNumber = 0;

  let activeNodeId = '';

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

  function mergeRuntimeNodeValues(baseValues, runtimeValues) {
    if (!runtimeValues || typeof runtimeValues !== 'object' || Array.isArray(runtimeValues)) {
      return baseValues;
    }
    return {
      ...baseValues,
      ...runtimeValues,
    };
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

  function handleNodeValueCommit(nodeId, value) {
    nodeValues = {
      ...nodeValues,
      [nodeId]: value,
    };
    if (value === undefined || value === null || value === '') {
      return;
    }
    dispatch('sparcaction', {
      submittedNodes: {
        [nodeId]: value,
      },
      triggeredBy: nodeId,
      timestamp: Date.now(),
    });
  }

  function handleButtonActivate(node) {
    const submittedNodes = {
      ...nodeValues,
      ...(node?.id ? { [node.id]: node.value ?? node.submitValue ?? buttonLabel(node) } : {}),
    };
    if (!isSubmitButton(node)) {
      dispatch('sparcaction', {
        submittedNodes,
        triggeredBy: node?.id,
        timestamp: Date.now(),
      });
      return;
    }
    dispatch('sparcsubmit', {
      submittedNodes,
      triggeredBy: node?.id,
      timestamp: Date.now(),
    });
  }

  function handleNodeFocus(nodeId) {
    if (!nodeId || activeNodeId === nodeId) {
      return;
    }
    activeNodeId = nodeId;
    dispatch('sparcaction', {
      submittedNodes: {},
      triggeredBy: nodeId,
      eventType: 'focus-changed',
      timestamp: Date.now(),
    });
  }

  function buttonLabel(node) {
    return String(node?.label || node?.value || '').trim();
  }

  $: sparcDisplay = resolveSparcTrialDisplay(display, '[SparcTrialSurface]');
  $: topLevelNodes = sparcDisplay?.nodes || [];
  $: authoredNodeValues = buildInitialNodeValues(topLevelNodes, {});
  $: nodeValues = mergeRuntimeNodeValues(authoredNodeValues, runtimeNodeValues);
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
        onNodeCommit={handleNodeValueCommit}
        onNodeFocus={handleNodeFocus}
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
