<script>
  import { createEventDispatcher, tick } from 'svelte';
  import {
    resolveSparcControllerDisplay,
    resolveSparcControllerResult,
  } from '../services/sparcController';
  import {
    commitSparcControllerDialogueSubmit,
    isSparcControllerDialogueDisplay,
  } from '../services/sparcControllerDialogueCommit';
  import {
    createSparcDialogueOpenRouterProvider,
  } from '../services/sparcControllerDialogueOpenRouter';
  import { commitSparcProductionRuleAction } from '../services/sparcProductionRuleActionCommit';
  import { buildSparcBoxedNodeGroups } from '../../../../../../learning-components/trial-displays/sparc/sparcBoxLayout';
  import {
    SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY,
    applySparcProgressiveNodeOperations,
  } from '../../../../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';
  import SparcNode from './SparcNode.svelte';
  import SparcAutoTutorProgress from './SparcAutoTutorProgress.svelte';
  import TrialInteractionPane from './TrialInteractionPane.svelte';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';

  const dispatch = createEventDispatcher();
  const platformText = (key, values) => translatePlatformString(getActiveUiLocale(), key, values);

  export let display = {};
  export let adminDiagnosticMode = false;
  export let engine = null;
  export let tdfId = '';
  export let userId = '';
  export let attemptId = '';
  export let levelUnit = null;
  export let runtimeNodeValues = {};
  export let learningProgressSnapshot = null;
  export let showQuestionNumber = false;
  export let questionNumber = 0;
  export let subsetKind = 'none';
  export let feedbackVisible = false;
  export let isCorrect = false;
  export let isTimeout = false;
  export let feedbackUserAnswer = '';
  export let correctAnswer = '';
  export let correctAnswerImageSrc = '';
  export let correctLabelText = '';
  export let incorrectLabelText = '';
  export let feedbackMessage = '';
  export let correctColor = 'var(--feedback-correct-color)';
  export let incorrectColor = 'var(--feedback-error-color)';
  export let displayCorrectFeedback = true;
  export let displayIncorrectFeedback = true;
  export let displayUserAnswerInFeedback = 'onIncorrect';
  export let feedbackLayout = 'stacked';
  export let displayCorrectAnswerInIncorrectFeedback = true;
  export let inputLanguage = '';
  export let inputTextDirection = '';
  export let onAuthoringNodeValueChange = null;
  export let onAuthoringNodeFocus = null;
  export let authoringSelectedNodeId = '';
  export let authoringSelectOnly = false;

  let activeNodeId = '';
  let feedbackFadeElement;
  let dialogueInputResetVersion = 0;
  let surfaceElement;
  let lastFeedbackRevealSignature = '';
  let observedProgressiveNodeOperationCount = 0;

  function handleFeedbackContent(event) {
    dispatch('feedbackcontent', event.detail);
  }

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

  function applyInitialStateNodeValues(values = {}, initialState = []) {
    const nextValues = { ...values };
    for (const write of initialState || []) {
      const nodeId = typeof write?.target?.nodeId === 'string' ? write.target.nodeId.trim() : '';
      const key = typeof write?.key === 'string' ? write.key.trim() : '';
      if (!nodeId || !key) {
        continue;
      }
      if (key === 'value' || key === 'message' || key === 'text') {
        nextValues[nodeId] = write.value;
      } else if (key === 'correctness' || key === 'visible') {
        nextValues[`${nodeId}::${key}`] = write.value;
      }
    }
    return nextValues;
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

  function collectAnswerSubmissionValues(values = {}) {
    const answerValues = {};
    for (const [key, value] of Object.entries(values || {})) {
      if (key.includes('::') || key === SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY) {
        continue;
      }
      answerValues[key] = value;
    }
    return answerValues;
  }

  function isAutoTutorDialogueDisplay(candidate) {
    return candidate?.unitType === 'sparc-autotutor-dialogue';
  }

  function flattenNodes(nodes = [], collected = []) {
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      collected.push(node);
      if (Array.isArray(node.children)) {
        flattenNodes(node.children, collected);
      }
      if (Array.isArray(node.panels)) {
        for (const panel of node.panels) {
          flattenNodes(panel?.children || [], collected);
        }
      }
    }
    return collected;
  }

  function dialogueNodes(nodes = [], options = {}) {
    const includeOpening = options.includeOpening === true;
    return flattenNodes(nodes).filter((node) => (
      node?.atomType === 'dialogue-utterance'
      && (includeOpening || node.id !== 'opening-tutor-message')
    ));
  }

  function firstNodeById(nodes = [], id) {
    return flattenNodes(nodes).find((node) => node?.id === id) || null;
  }

  function firstNodeByAtomType(nodes = [], atomType) {
    return flattenNodes(nodes).find((node) => node?.atomType === atomType) || null;
  }

  function dialoguePrompt(nodes = []) {
    const opening = firstNodeById(nodes, 'opening-tutor-message') || firstNodeByAtomType(nodes, 'dialogue-utterance');
    const value = opening?.value;
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  function dialogueInputNodes(nodes = []) {
    return flattenNodes(nodes).filter((node) => (
      node?.atomType === 'text-input'
      && node.id === 'learner-response-input'
    ));
  }

  function handleNodeValueChange(nodeId, value) {
    nodeValues = {
      ...nodeValues,
      [nodeId]: value,
    };
    if (typeof onAuthoringNodeValueChange === 'function') {
      onAuthoringNodeValueChange(nodeId, value);
    }
  }

  function handleNodeValueCommit(nodeId, value) {
    nodeValues = {
      ...nodeValues,
      [nodeId]: value,
    };
    if (authoringSelectOnly) {
      if (typeof onAuthoringNodeValueChange === 'function') {
        onAuthoringNodeValueChange(nodeId, value);
      }
      return;
    }
    if (value === undefined || value === null || value === '') {
      return;
    }
    void handleSparcAction({
      submittedNodes: {
        [nodeId]: value,
      },
      triggeredBy: nodeId,
      timestamp: Date.now(),
    });
  }

  function clearDialogueInputs() {
    const inputIds = dialogueInputNodes(realizedSparcDisplay?.nodes).map((inputNode) => inputNode.id);
    if (inputIds.length === 0) {
      return;
    }
    nodeValues = inputIds.reduce((values, inputNodeId) => ({
      ...values,
      [inputNodeId]: '',
    }), nodeValues);
    dialogueInputResetVersion += 1;
  }

  function handleButtonActivate(node) {
    if (authoringSelectOnly) {
      handleNodeFocus(node?.id);
      return;
    }
    const buttonSubmission = node?.id
      ? { [node.id]: node.value ?? node.submitValue ?? buttonLabel(node) }
      : {};
    if (!isSubmitButton(node)) {
      void handleSparcAction({
        submittedNodes: buttonSubmission,
        triggeredBy: node?.id,
        focusedNodeId: activeNodeId || undefined,
        timestamp: Date.now(),
      });
      return;
    }
    void handleSparcSubmit({
      submittedNodes: hasProductionRules()
        ? {
            ...collectDefaultSubmissionValues(sparcDisplay?.nodes),
            ...collectAnswerSubmissionValues(nodeValues),
            ...buttonSubmission,
          }
        : {
            ...collectAnswerSubmissionValues(nodeValues),
            ...buttonSubmission,
          },
      triggeredBy: node?.id,
      focusedNodeId: activeNodeId || undefined,
      timestamp: Date.now(),
    });
    if (isAutoTutorDialogueDisplay(sparcDisplay)) {
      clearDialogueInputs();
    }
  }

  function handleNodeEnter(nodeId, value) {
    if (
      !isAutoTutorDialogueDisplay(sparcDisplay)
      || nodeId !== 'learner-response-input'
      || authoringSelectOnly
    ) {
      return false;
    }
    const learnerText = String(value ?? '').trim();
    if (!learnerText) {
      return true;
    }
    nodeValues = {
      ...nodeValues,
      [nodeId]: learnerText,
    };
    void handleSparcSubmit({
      submittedNodes: {
        ...collectDefaultSubmissionValues(sparcDisplay?.nodes),
        ...collectAnswerSubmissionValues({
          ...nodeValues,
          [nodeId]: learnerText,
        }),
        ...(autoTutorDialogueSubmitNode?.id
          ? { [autoTutorDialogueSubmitNode.id]: autoTutorDialogueSubmitNode.value ?? autoTutorDialogueSubmitNode.submitValue ?? buttonLabel(autoTutorDialogueSubmitNode) }
          : {}),
      },
      triggeredBy: autoTutorDialogueSubmitNode?.id || nodeId,
      focusedNodeId: activeNodeId || undefined,
      timestamp: Date.now(),
    });
    clearDialogueInputs();
    return true;
  }

  function handleNodeFocus(nodeId) {
    if (!nodeId || activeNodeId === nodeId) {
      return;
    }
    activeNodeId = nodeId;
    if (typeof onAuthoringNodeFocus === 'function') {
      onAuthoringNodeFocus(nodeId);
    }
    if (authoringSelectOnly) {
      return;
    }
    void handleSparcAction({
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

  function describeSparcBoundaryContext(candidateDisplay, source) {
    const displayRecord = candidateDisplay && typeof candidateDisplay === 'object' ? candidateDisplay : {};
    const pageKey = typeof displayRecord.pageKey === 'string' && displayRecord.pageKey.trim()
      ? displayRecord.pageKey.trim()
      : 'missing';
    return `${source}; pageKey=${pageKey}; tdfId=${tdfId || 'missing'}; unit=${levelUnit ?? 'missing'}; hasUserId=${Boolean(userId)}; hasAttemptId=${Boolean(attemptId)}`;
  }

  function currentSparcProgressiveNodeOperations() {
    const operations = runtimeNodeValues?.[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY];
    return Array.isArray(operations) ? operations : [];
  }

  function buildOptimisticDialogueLearnerOperations(candidateDisplay, sparcResult) {
    if (!isSparcControllerDialogueDisplay(candidateDisplay)) {
      return [];
    }
    const learnerText = String(sparcResult?.submittedNodes?.['learner-response-input'] ?? '').trim();
    if (!learnerText) {
      return [];
    }
    const eventId = `optimistic:${sparcResult.timestamp}:${sparcResult.triggeredBy || 'submit'}`;
    return [{
      type: 'append-node-if-missing',
      boxId: 'dialogue-flow',
      node: {
        id: `${eventId}:learner`,
        nodeType: 'atomic',
        atomType: 'dialogue-utterance',
        speaker: 'learner',
        value: learnerText,
        turnEventId: eventId,
        optimistic: true,
      },
    }];
  }

  function dispatchRuntimeEvent(event) {
    dispatch('runtimeevent', event);
  }

  function dispatchSparcNodeValues(sparcNodeValues, timestamp) {
    if (Object.keys(sparcNodeValues).length === 0) {
      return;
    }
    dispatchRuntimeEvent({
      type: 'SPARC_ACTION',
      timestamp,
      sparcNodeValues,
    });
  }

  function sendSparcProgressiveNodeOperations(operations, timestamp) {
    dispatchSparcNodeValues({
      [SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY]: operations,
    }, timestamp);
  }

  function currentSparcControllerDisplay(source) {
    if (!display) {
      throw new Error(describeSparcBoundaryContext(display, `${source} SPARC session is missing controller display`));
    }
    const resolvedDisplay = resolveSparcControllerDisplay(display, source);
    if (!resolvedDisplay) {
      throw new Error(describeSparcBoundaryContext(display, `${source} SPARC session has invalid controller display`));
    }
    return resolvedDisplay;
  }

  async function handleSparcAction(detail) {
    if (subsetKind !== 'question') {
      return;
    }
    const currentDisplay = currentSparcControllerDisplay('[SparcSessionSurface] SPARC action');
    if (isSparcControllerDialogueDisplay(currentDisplay)) {
      return;
    }
    const pageKey = typeof currentDisplay.pageKey === 'string' ? currentDisplay.pageKey.trim() : '';
    const hasProductionRuleSource = Array.isArray(currentDisplay.productionRules);
    if (!pageKey || !hasProductionRuleSource) {
      return;
    }
    const sparcResult = resolveSparcControllerResult(currentDisplay, detail || {}, '[SparcSessionSurface]');
    if (!sparcResult) {
      throw new Error(describeSparcBoundaryContext(currentDisplay, '[SparcSessionSurface] SPARC action received for non-SPARC display'));
    }
    const { sparcNodeValues } = await commitSparcProductionRuleAction({
      engine,
      currentDisplay,
      sparcResult,
      tdfId,
      userId,
      attemptId,
      levelUnit,
    });
    dispatch('runtimewatchedstatechanged');
    dispatchSparcNodeValues(sparcNodeValues, sparcResult.timestamp);
  }

  async function commitSparcSubmitProductionRules(detail) {
    if (subsetKind !== 'question') {
      return { canSubmit: true };
    }
    const currentDisplay = currentSparcControllerDisplay('[SparcSessionSurface] SPARC submit');
    if (isSparcControllerDialogueDisplay(currentDisplay)) {
      const sparcResult = resolveSparcControllerResult(currentDisplay, detail || {}, '[SparcSessionSurface]');
      if (!sparcResult) {
        throw new Error(describeSparcBoundaryContext(currentDisplay, '[SparcSessionSurface] SPARC dialogue submit received for non-SPARC display'));
      }
      const provider = createSparcDialogueOpenRouterProvider({
        tdfId: typeof tdfId === 'string' ? tdfId : null,
      });
      const priorProgressiveOperations = currentSparcProgressiveNodeOperations();
      const optimisticOperations = buildOptimisticDialogueLearnerOperations(currentDisplay, sparcResult);
      if (optimisticOperations.length > 0) {
        sendSparcProgressiveNodeOperations([
          ...priorProgressiveOperations,
          ...optimisticOperations,
        ], sparcResult.timestamp);
      }
      let result;
      try {
        result = await commitSparcControllerDialogueSubmit({
          engine,
          currentDisplay,
          sparcResult,
          tdfId,
          userId,
          attemptId,
          levelUnit,
          scoreLearnerResponse: provider.scoreLearnerResponse,
          generateTutorUtterance: provider.generateTutorUtterance,
        });
      } catch (error) {
        if (optimisticOperations.length > 0) {
          sendSparcProgressiveNodeOperations(priorProgressiveOperations, sparcResult.timestamp);
        }
        throw error;
      }
      dispatch('runtimewatchedstatechanged');
      dispatchSparcNodeValues(result.sparcNodeValues, sparcResult.timestamp);
      return { canSubmit: false, dialogueSubmit: true };
    }
    const pageKey = typeof currentDisplay.pageKey === 'string' ? currentDisplay.pageKey.trim() : '';
    const hasProductionRuleSource = Array.isArray(currentDisplay.productionRules);
    if (!pageKey || !hasProductionRuleSource) {
      return { canSubmit: true, productionRuleSubmit: false };
    }
    const sparcResult = resolveSparcControllerResult(currentDisplay, detail || {}, '[SparcSessionSurface]');
    if (!sparcResult) {
      throw new Error(describeSparcBoundaryContext(currentDisplay, '[SparcSessionSurface] SPARC submit received for non-SPARC display'));
    }
    const triggeredBy = typeof sparcResult.triggeredBy === 'string' ? sparcResult.triggeredBy : '';
    const submittedNodes = triggeredBy && Object.prototype.hasOwnProperty.call(sparcResult.submittedNodes, triggeredBy)
      ? { [triggeredBy]: sparcResult.submittedNodes[triggeredBy] }
      : sparcResult.submittedNodes;
    const result = await commitSparcProductionRuleAction({
      engine,
      currentDisplay,
      sparcResult: {
        ...sparcResult,
        submittedNodes,
      },
      tdfId,
      userId,
      attemptId,
      levelUnit,
    });
    dispatch('runtimewatchedstatechanged');
    dispatchSparcNodeValues(result.sparcNodeValues, sparcResult.timestamp);
    return {
      canSubmit: result.classifications.includes('correct'),
      productionRuleSubmit: true,
    };
  }

  async function handleSparcSubmit(detail) {
    const { canSubmit, productionRuleSubmit } = await commitSparcSubmitProductionRules(detail);
    if (!canSubmit) {
      return;
    }
    if (productionRuleSubmit) {
      dispatch('forceadvance', { reason: 'SPARC Done' });
      return;
    }
    const sparcResult = resolveSparcControllerResult(display, detail || {}, '[SparcSessionSurface]');
    if (!sparcResult) {
      throw new Error(describeSparcBoundaryContext(display, '[SparcSessionSurface] SPARC result received for non-SPARC display'));
    }
    dispatchRuntimeEvent({
      type: 'SUBMIT',
      userAnswer: '__SPARC_COMPLETED__',
      timestamp: sparcResult.timestamp,
      source: 'sparc',
      sparcResult,
    });
  }

  function isVerticallyScrollable(element) {
    if (!element) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return (
      (style.overflowY === 'auto' || style.overflowY === 'scroll')
      && element.scrollHeight > element.clientHeight
    );
  }

  function scrollSparcScrollableNodesToBottom() {
    if (!surfaceElement || typeof window === 'undefined') {
      return;
    }
    const candidates = [surfaceElement, ...surfaceElement.querySelectorAll('*')];
    for (const element of candidates) {
      if (isVerticallyScrollable(element)) {
        element.scrollTop = element.scrollHeight;
      }
    }
  }

  async function scrollAfterProgressiveNodeAdditions() {
    await tick();
    if (typeof window === 'undefined') {
      return;
    }
    window.requestAnimationFrame(() => {
      scrollSparcScrollableNodesToBottom();
    });
  }

  $: sparcDisplay = resolveSparcControllerDisplay(display, '[SparcSessionSurface]');
  $: feedbackRevealSignature = [
    subsetKind,
    feedbackMessage,
    correctAnswer,
    feedbackUserAnswer,
    isCorrect ? 'correct' : 'incorrect',
    isTimeout ? 'timeout' : 'answered',
  ].join('::');
  $: if (!feedbackVisible) {
    lastFeedbackRevealSignature = '';
  }
  $: if (feedbackVisible && lastFeedbackRevealSignature !== feedbackRevealSignature) {
    lastFeedbackRevealSignature = feedbackRevealSignature;
    dispatch('reviewrevealstarted', {
      subsetKind,
      transitionDurationMs: 0,
      timestamp: Date.now(),
    });
  }
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
  $: authoredNodeValues = applyInitialStateNodeValues(
    buildInitialNodeValues(topLevelNodes, {}),
    sparcDisplay?.initialState || [],
  );
  $: nodeValues = mergeRuntimeNodeValues(authoredNodeValues, runtimeNodeValues);
  $: autoTutorDialogueMode = isAutoTutorDialogueDisplay(sparcDisplay);
  $: autoTutorDialoguePrompt = autoTutorDialogueMode ? dialoguePrompt(topLevelNodes) : '';
  $: autoTutorDialogueMessages = autoTutorDialogueMode ? dialogueNodes(topLevelNodes) : [];
  $: autoTutorDialogueInputNode = autoTutorDialogueMode ? firstNodeById(topLevelNodes, 'learner-response-input') : null;
  $: autoTutorDialogueSubmitNode = autoTutorDialogueMode ? firstNodeById(topLevelNodes, 'learner-response-submit') : null;
  $: progressiveNodeOperationCount = progressiveNodeOperations.length;
  $: if (progressiveNodeOperationCount > observedProgressiveNodeOperationCount) {
    scrollAfterProgressiveNodeAdditions();
  }
  $: observedProgressiveNodeOperationCount = progressiveNodeOperationCount;
</script>

<div bind:this={surfaceElement} class="sparc-surface" class:sparc-auto-tutor-dialogue-surface={autoTutorDialogueMode}>
  {#if showQuestionNumber}
    <div class="sparc-question-number">Question {questionNumber}</div>
  {/if}

  {#if autoTutorDialogueMode}
    <header class="sparc-auto-tutor-header">
      <div class="sparc-auto-tutor-question">
        <h1>{autoTutorDialoguePrompt}</h1>
      </div>
      <SparcAutoTutorProgress display={sparcDisplay} runtimeNodeValues={nodeValues} />
    </header>

    <section class="sparc-auto-tutor-chat" aria-label={platformText('autoTutor.conversation')}>
      {#each autoTutorDialogueMessages as node (node.id)}
        <SparcNode
          {node}
          {adminDiagnosticMode}
          {nodeValues}
          {learningProgressSnapshot}
          {authoringSelectedNodeId}
          {authoringSelectOnly}
          {inputLanguage}
          {inputTextDirection}
          onNodeValueChange={handleNodeValueChange}
          onNodeCommit={handleNodeValueCommit}
          onNodeFocus={handleNodeFocus}
          onButtonActivate={handleButtonActivate}
        />
      {/each}
    </section>

    <footer class="sparc-auto-tutor-input-bar">
      {#if autoTutorDialogueInputNode}
        <div class="sparc-auto-tutor-input">
          {#key `${autoTutorDialogueInputNode.id}:${dialogueInputResetVersion}`}
          <SparcNode
            node={autoTutorDialogueInputNode}
            {adminDiagnosticMode}
            {nodeValues}
            {learningProgressSnapshot}
            {authoringSelectedNodeId}
            {authoringSelectOnly}
            {inputLanguage}
            {inputTextDirection}
            onNodeValueChange={handleNodeValueChange}
            onNodeCommit={handleNodeValueCommit}
            onNodeEnter={handleNodeEnter}
            onNodeFocus={handleNodeFocus}
            onButtonActivate={handleButtonActivate}
          />
          {/key}
        </div>
      {/if}
      {#if autoTutorDialogueSubmitNode}
        <div class="sparc-auto-tutor-submit">
          <SparcNode
            node={autoTutorDialogueSubmitNode}
            {adminDiagnosticMode}
            {nodeValues}
            {learningProgressSnapshot}
            {authoringSelectedNodeId}
            {authoringSelectOnly}
            {inputLanguage}
            {inputTextDirection}
            onNodeValueChange={handleNodeValueChange}
            onNodeCommit={handleNodeValueCommit}
            onNodeFocus={handleNodeFocus}
            onButtonActivate={handleButtonActivate}
          />
        </div>
      {/if}
    </footer>
  {:else if sparcDisplay?.topbar?.title}
    <div class="sparc-topbar">
      <div class="sparc-topbar-title">{sparcDisplay.topbar.title}</div>
      {#if sparcDisplay.topbar.helpLabel}
        <div class="sparc-topbar-help">{sparcDisplay.topbar.helpLabel}</div>
      {/if}
    </div>
  {/if}

  {#if !autoTutorDialogueMode}
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
              {adminDiagnosticMode}
              {nodeValues}
              {learningProgressSnapshot}
              {authoringSelectedNodeId}
              {authoringSelectOnly}
              {inputLanguage}
              {inputTextDirection}
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
          {adminDiagnosticMode}
          {nodeValues}
          {learningProgressSnapshot}
          {authoringSelectedNodeId}
          {authoringSelectOnly}
          {inputLanguage}
          {inputTextDirection}
          onNodeValueChange={handleNodeValueChange}
          onNodeCommit={handleNodeValueCommit}
          onNodeFocus={handleNodeFocus}
          onButtonActivate={handleButtonActivate}
        />
      {/each}
    {/if}
  </div>
  {/if}

  {#if feedbackVisible}
    <div class="sparc-feedback-container">
      <TrialInteractionPane
        bind:fadeElement={feedbackFadeElement}
        interactionVisible={feedbackVisible}
        mountedFeedbackVisible={feedbackVisible}
        mountedResponseVisible={false}
        {isCorrect}
        {isTimeout}
        {feedbackUserAnswer}
        {correctAnswer}
        {correctAnswerImageSrc}
        {correctLabelText}
        {incorrectLabelText}
        {feedbackMessage}
        {correctColor}
        {incorrectColor}
        {displayCorrectFeedback}
        {displayIncorrectFeedback}
        {displayUserAnswerInFeedback}
        {feedbackLayout}
        {displayCorrectAnswerInIncorrectFeedback}
        on:feedbackcontent={handleFeedbackContent}
        on:blockingassetstate
      />
    </div>
  {/if}
</div>

<style>
  .sparc-surface {
    --sparc-surface-color: var(--learning-card-stimulus-surface-color, var(--learning-card-surface-color, var(--app-background-color)));
    --sparc-control-surface-color: var(--learning-card-surface-color, var(--app-background-color));
    --sparc-muted-surface-color: var(--app-secondary-surface-color);
    --sparc-subtle-surface-color: var(--app-subtle-surface-color);
    --sparc-text-color: var(--app-text-color);
    --sparc-secondary-text-color: var(--app-secondary-text-color, var(--app-text-color));
    --sparc-muted-text-color: var(--app-secondary-text-color, var(--app-text-color));
    --sparc-heading-color: var(--app-page-header-text-color, var(--app-text-color));
    --sparc-accent-color: var(--app-accent-color);
    --sparc-link-color: var(--app-accent-color);
    --sparc-primary-action-surface-color: var(--app-primary-action-surface-color, var(--app-accent-color));
    --sparc-primary-action-text-color: var(--app-primary-action-text-color, var(--app-text-color));
    --sparc-correct-color: var(--feedback-correct-color);
    --sparc-error-color: var(--feedback-error-color);
    --sparc-warning-color: var(--app-warning-color, var(--app-accent-color));
    --sparc-border-color: color-mix(in srgb, var(--sparc-text-color) 16%, transparent);
    --sparc-shadow-color: color-mix(in srgb, var(--sparc-text-color) 22%, transparent);
    --sparc-font-family: var(--app-font-family);
    --sparc-heading-font-family: var(--app-heading-font-family, var(--app-font-family));
    --sparc-monospace-font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
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

  .sparc-feedback-container {
    flex: 0 0 min(28%, 14rem);
    min-height: 8rem;
    width: 100%;
    border-top: 1px solid var(--app-secondary-surface-color);
    overflow: hidden;
  }

  .sparc-auto-tutor-dialogue-surface {
    gap: var(--sparc-space-3);
    padding: clamp(var(--app-space-3), 2vw, var(--app-space-5));
    overflow: hidden;
  }

  .sparc-auto-tutor-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
    gap: var(--sparc-space-3);
    align-items: start;
    flex: 0 0 auto;
  }

  .sparc-auto-tutor-question {
    min-width: 0;
  }

  .sparc-auto-tutor-question h1 {
    margin: 0;
    color: var(--sparc-text-color);
    font-size: calc(var(--app-font-size-base) * 1.25);
    line-height: 1.35;
    font-weight: 700;
    letter-spacing: 0;
  }

  .sparc-auto-tutor-chat {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sparc-space-3);
    padding: var(--sparc-space-3);
    border: 1px solid var(--sparc-border-color);
    border-radius: var(--sparc-border-radius-sm);
    background: var(--sparc-surface-color);
    overflow-y: auto;
    box-sizing: border-box;
  }

  .sparc-auto-tutor-input-bar {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(7.5rem, 12rem);
    gap: var(--sparc-space-2);
    align-items: stretch;
    padding-top: var(--sparc-space-1);
    box-sizing: border-box;
  }

  .sparc-auto-tutor-input,
  .sparc-auto-tutor-submit {
    min-width: 0;
  }

  .sparc-auto-tutor-input :global(.sparc-input),
  .sparc-auto-tutor-submit :global(.sparc-button) {
    width: 100%;
  }

  .sparc-auto-tutor-submit :global(.sparc-button) {
    text-align: center;
  }

  @media (max-width: 768px) {
    .sparc-auto-tutor-dialogue-surface {
      padding: calc(0.625rem * var(--app-density-scale));
      gap: var(--sparc-space-2);
    }

    .sparc-auto-tutor-header {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sparc-space-2);
    }

    .sparc-auto-tutor-question h1 {
      font-size: calc(var(--app-font-size-base) * 1.05);
    }

    .sparc-auto-tutor-chat {
      padding: var(--sparc-space-2);
      gap: var(--sparc-space-2);
    }

    .sparc-auto-tutor-input-bar {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
