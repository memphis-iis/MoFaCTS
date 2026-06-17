<script>
  import { createEventDispatcher } from 'svelte';
  import { resolveSparcTrialDisplay } from '../services/sparcTrialDisplay';
  import { buildSparcBoxedNodeGroups } from '../../../../../../learning-components/trial-displays/sparc/sparcBoxLayout';
  import {
    SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY,
    applySparcProgressiveNodeOperations,
  } from '../../../../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';
  import SparcNode from './SparcNode.svelte';

  const dispatch = createEventDispatcher();

  export let display = {};
  export let runtimeNodeValues = {};
  export let learningProgressSnapshot = null;
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

  function hasProductionRules() {
    return Array.isArray(sparcDisplay?.productionRules);
  }

  function collectDefaultSubmissionValues(nodes = [], values = {}) {
    for (const candidate of nodes || []) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      if (candidate.nodeType === 'atomic' && candidate.id && candidate.atomType === 'checkbox') {
        values[candidate.id] = candidate.checked === true;
      }
      if (Array.isArray(candidate.children)) {
        collectDefaultSubmissionValues(candidate.children, values);
      }
      if (Array.isArray(candidate.panels)) {
        for (const panel of candidate.panels) {
          collectDefaultSubmissionValues(panel.children || [], values);
        }
      }
    }
    return values;
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
    const buttonSubmission = node?.id
      ? { [node.id]: node.value ?? node.submitValue ?? buttonLabel(node) }
      : {};
    if (!isSubmitButton(node)) {
      dispatch('sparcaction', {
        submittedNodes: buttonSubmission,
        triggeredBy: node?.id,
        timestamp: Date.now(),
      });
      return;
    }
    dispatch('sparcsubmit', {
      submittedNodes: hasProductionRules()
        ? {
            ...collectDefaultSubmissionValues(sparcDisplay?.nodes),
            ...nodeValues,
            ...buttonSubmission,
          }
        : {
            ...nodeValues,
            ...buttonSubmission,
          },
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

  function getProgressiveNodeOperations(values = {}) {
    const operations = values?.[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY];
    return Array.isArray(operations) ? operations : [];
  }

  $: sparcDisplay = resolveSparcTrialDisplay(display, '[SparcTrialSurface]');
  $: progressiveNodeOperations = getProgressiveNodeOperations(runtimeNodeValues);
  $: topLevelNodes = sparcDisplay
    ? applySparcProgressiveNodeOperations(sparcDisplay.nodes || [], progressiveNodeOperations)
    : [];
  $: realizedSparcDisplay = sparcDisplay
    ? { ...sparcDisplay, nodes: topLevelNodes }
    : null;
  $: boxedNodeGroups = realizedSparcDisplay
    ? buildSparcBoxedNodeGroups(realizedSparcDisplay).filter((group) => group.nodes.length > 0)
    : [];
  $: usesBoxLayout = boxedNodeGroups.length > 0;
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

  <div class:sparc-surface-body={!usesBoxLayout} class:sparc-box-layout={usesBoxLayout}>
    {#if usesBoxLayout}
      {#each boxedNodeGroups as group (group.box.id)}
        <section
          class={`sparc-box sparc-box-${group.box.id}`}
          data-sparc-box-id={group.box.id}
          data-sparc-box-role={group.box.role || ''}
          data-sparc-box-region={group.box.region || ''}
        >
          {#each group.nodes as node (node.id)}
            <SparcNode
              {node}
              {nodeValues}
              {learningProgressSnapshot}
              onNodeValueChange={handleNodeValueChange}
              onNodeCommit={handleNodeValueCommit}
              onNodeFocus={handleNodeFocus}
              onButtonActivate={handleButtonActivate}
            />
          {/each}
        </section>
      {/each}
    {:else}
      {#each topLevelNodes as node (node.id)}
        <SparcNode
          {node}
          {nodeValues}
          {learningProgressSnapshot}
          onNodeValueChange={handleNodeValueChange}
          onNodeCommit={handleNodeValueCommit}
          onNodeFocus={handleNodeFocus}
          onButtonActivate={handleButtonActivate}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .sparc-surface {
    --sparc-surface-color: var(--learning-card-stimulus-surface-color, var(--learning-card-surface-color, var(--app-background-color)));
    --sparc-control-surface-color: var(--learning-card-surface-color, var(--app-background-color));
    --sparc-muted-surface-color: var(--app-secondary-surface-color);
    --sparc-subtle-surface-color: var(--app-subtle-surface-color);
    --sparc-text-color: var(--app-text-color);
    --sparc-secondary-text-color: var(--app-secondary-text-color, var(--app-text-color));
    --sparc-heading-color: var(--app-page-header-text-color, var(--app-text-color));
    --sparc-accent-color: var(--app-accent-color);
    --sparc-primary-action-surface-color: var(--app-primary-action-surface-color, var(--app-accent-color));
    --sparc-primary-action-text-color: var(--app-primary-action-text-color, var(--app-text-color));
    --sparc-correct-color: var(--feedback-correct-color);
    --sparc-error-color: var(--feedback-error-color);
    --sparc-warning-color: var(--app-warning-color, var(--app-accent-color));
    --sparc-border-color: color-mix(in srgb, var(--sparc-text-color) 16%, transparent);
    --sparc-shadow-color: color-mix(in srgb, var(--sparc-text-color) 22%, transparent);
    --sparc-font-family: var(--app-font-family);
    --sparc-heading-font-family: var(--app-heading-font-family, var(--app-font-family));
    --sparc-font-size-base: var(--app-font-size-base);
    --sparc-font-size-small: calc(var(--app-font-size-base) * 0.875);
    --sparc-font-size-large: calc(var(--app-font-size-base) * 1.18);
    --sparc-density-scale: var(--app-density-scale);
    --sparc-space-0: var(--app-space-0);
    --sparc-space-1: var(--app-space-1);
    --sparc-space-2: var(--app-space-2);
    --sparc-space-3: var(--app-space-3);
    --sparc-space-4: var(--app-space-4);
    --sparc-control-padding-y: var(--app-space-0);
    --sparc-control-padding-x: var(--app-space-3);
    --sparc-control-line-height: var(--app-text-input-height);
    --sparc-border-radius-sm: var(--app-border-radius-sm);
    --sparc-border-radius-lg: var(--app-border-radius-lg);
    --sparc-border-radius-pill: var(--border-radius-pill);
    --sparc-border-width: var(--app-border-width);
    --sparc-primary-flex-grow: var(--app-sparc-primary-flex-grow);
    --sparc-multiple-choice-width: var(--app-sparc-multiple-choice-width);
    --sparc-answer-list-width: var(--app-sparc-answer-list-width);
    --sparc-feedback-width-min: var(--app-sparc-feedback-width-min);
    --sparc-feedback-width-max: var(--app-sparc-feedback-width-max);
    --sparc-term-table-min-width: var(--app-sparc-term-table-min-width);
    --sparc-term-column-width-wide: var(--app-sparc-term-column-width-wide);
    --sparc-term-column-width-medium: var(--app-sparc-term-column-width-medium);
    --sparc-term-column-width-narrow: var(--app-sparc-term-column-width-narrow);
    --sparc-term-value-width: var(--app-sparc-term-value-width);
    --sparc-term-unit-width: var(--app-sparc-term-unit-width);
    --sparc-term-unit-flex-ratio: var(--app-sparc-term-unit-flex-ratio);
    --sparc-term-substance-width: var(--app-sparc-term-substance-width);
    --sparc-term-cancel-width: var(--app-sparc-term-cancel-width);
    --sparc-hint-min-height: var(--app-sparc-hint-min-height);
    --sparc-hint-button-min-width: var(--app-sparc-hint-button-min-width);
    --sparc-table-column-min-width: var(--app-sparc-table-column-min-width);
    --sparc-fraction-min-width: var(--app-sparc-fraction-min-width);
    --sparc-operator-min-width: var(--app-sparc-operator-min-width);
    --sparc-message-min-width: var(--app-sparc-message-min-width);
    --sparc-skill-track-min-width: var(--app-sparc-skill-track-min-width);
    --sparc-skill-track-max-width: var(--app-sparc-skill-track-max-width);
    --sparc-skill-bar-min-width: var(--app-sparc-skill-bar-min-width);
    --sparc-skill-track-height: var(--app-sparc-skill-track-height);
    --sparc-feedback-glow-radius: var(--app-sparc-feedback-glow-radius);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--sparc-space-2);
    padding: var(--sparc-space-3);
    overflow: auto;
    box-sizing: border-box;
    background: var(--sparc-surface-color);
    color: var(--sparc-text-color);
    font-family: var(--sparc-font-family);
    font-size: var(--sparc-font-size-base);
  }

  .sparc-question-number {
    color: var(--sparc-secondary-text-color);
    font-size: var(--sparc-font-size-small);
    font-weight: var(--app-font-weight-semibold, 600);
  }

  .sparc-topbar {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--sparc-space-3);
    padding-bottom: var(--sparc-space-1);
  }

  .sparc-topbar-title {
    color: var(--sparc-heading-color);
    font-family: var(--sparc-heading-font-family);
    font-size: calc(var(--app-font-size-base) * 1.35);
    font-weight: var(--app-font-weight-bold, 700);
  }

  .sparc-topbar-title::after {
    content: "|";
    margin-left: var(--sparc-space-4);
    color: var(--sparc-heading-color);
    font-weight: var(--app-font-weight-bold, 700);
  }

  .sparc-topbar-help {
    color: var(--sparc-heading-color);
    font-size: var(--sparc-font-size-small);
    font-weight: var(--app-font-weight-semibold, 600);
  }

  .sparc-surface-body {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-space-4);
  }

  .sparc-box-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sparc-space-3);
  }

  .sparc-box {
    display: flex;
    flex-direction: column;
    gap: var(--sparc-space-3);
    min-width: 0;
  }

  .sparc-box-layout:has(.sparc-box[data-sparc-box-region="right"]) {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .sparc-box[data-sparc-box-region="right"] {
    flex: 1 1 var(--sparc-feedback-width-min);
  }

  .sparc-box[data-sparc-box-region="left"],
  .sparc-box:not([data-sparc-box-region="right"]):not([data-sparc-box-region="bottom"]) {
    flex: var(--sparc-primary-flex-grow) 1 var(--sparc-answer-list-width);
  }

  .sparc-box[data-sparc-box-region="bottom"] {
    flex: 1 1 100%;
  }
</style>
