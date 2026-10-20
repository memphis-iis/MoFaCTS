<script>
  import { sparcMoveLibraryClient, readSparcAdministrativeRemovals } from "../services/sparcMoveLibraryClient";
  import { sparcContentReferenceIds, projectSparcAdministrativeRemovals } from '../../../../../../learning-components/runtime/sparcAdministrativeRemoval';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import {
    resolveSparcControllerDisplay,
    resolveSparcControllerResult,
  } from '../services/sparcController';
  import {
    commitSparcAutoTutorSubmit,
    commitSparcAutoTutorDocumentLoad,
    isSparcAutoTutorDisplay,
  } from '../services/sparcAutoTutorRuleCommit';
  import {
    createSparcDialogueOpenRouterProvider,
  } from '../services/sparcControllerDialogueOpenRouter';
  import { createSparcOpenRouterSession } from '../services/sparcOpenRouterSession';
  import { readSparcResumeSnapshot } from '../services/sparcRuntimeState';
  import { isSparcCategorizedPolicy } from '../../../../../../learning-components/runtime/sparcInstructionalPolicies';
  import { projectSparcInstructionMessages } from '../../../../../../learning-components/units/sparcsession/sparcInstructionalPrimitives';
  import { commitSparcProductionRuleAction } from '../services/sparcProductionRuleActionCommit';
  import { buildSparcBoxedNodeGroups } from '../../../../../../learning-components/trial-displays/sparc/sparcBoxLayout';
  import {
    SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY,
    applySparcProgressiveNodeOperations,
  } from '../../../../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';
  import SparcNode from './SparcNode.svelte';
  import SparcAutoTutorProgress from './SparcAutoTutorProgress.svelte';
  import {
    buildSparcAutoTutorProgressSnapshot,
    selectSparcAutoTutorProgressSnapshotForRender,
  } from '../services/sparcAutoTutorProgress';
  import TrialInteractionPane from './TrialInteractionPane.svelte';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';
  import { clientConsole } from '../../../../lib/clientLogger';
  import { redactSparcDialogueDiagnosticText } from '../services/sparcCitationDiagnostics';
  import { SparcOutputLimitRecoveryError } from '../services/sparcOutputLimitRecovery';

  const dispatch = createEventDispatcher();
  const platformText = (key, values) => translatePlatformString(getActiveUiLocale(), key, values);
  const openRouterSession = createSparcOpenRouterSession();

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
  let dialogueSubmitPending = false;
  let pendingAutoTutorProgressSnapshot = null;
  let dialogueSubmitError = '';
  let dialogueSubmitErrorDetail = '';
  let dialogueRecovery = null;
  let surfaceElement;
  let autoTutorChatElement;
  let lastFeedbackRevealSignature = '';
  let observedProgressiveNodeOperationCount = 0;
  let observedAutoTutorDialogueSignature = '';
  let mounted = false;
  let startedDialogueScope = '';
  let dialogueInitialized = false;
  let checkedContentIds = new Set(), removedContentIds = new Set(), removalSignature = '', removalError = '';
  async function checkContentRemovals(ids, signature) {
    const unchecked = ids.filter(id => !checkedContentIds.has(id));
    try {
      const removed = [];
      for (let offset = 0; offset < unchecked.length; offset += 100) {
        removed.push(...await readSparcAdministrativeRemovals(unchecked.slice(offset, offset + 100)));
      }
      if (!mounted || removalSignature !== signature) return;
      removedContentIds = new Set([...removedContentIds, ...removed]);
      checkedContentIds = new Set([...checkedContentIds, ...unchecked]);
      removalError = '';
    } catch { if (mounted && removalSignature === signature) removalError = 'Saved instructional content could not be checked. Reload the lesson.'; }
  }
  onMount(() => {
    mounted = true;
    return () => { mounted = false; };
  });

  async function startCategorizedDialogue(currentDisplay, scope) {
    startedDialogueScope = scope;
    dialogueInitialized = false;
    dialogueSubmitPending = true;
    dialogueSubmitError = '';
    dialogueSubmitErrorDetail = '';
    dialogueRecovery = null;
    const timestamp = Date.now();
    try {
      const provider = createSparcDialogueOpenRouterProvider({ ...(isSparcCategorizedPolicy(currentDisplay.instructionalController?.policyId) ? { moveLibrary: sparcMoveLibraryClient } : {}), policyId: currentDisplay.instructionalController.policyId,
        tdfId, sessionId: openRouterSession.sessionIdForScope({ tdfId, attemptId, pageKey: currentDisplay.pageKey }) });
      const result = await commitSparcAutoTutorDocumentLoad({ engine, currentDisplay, tdfId, userId, attemptId, levelUnit,
        scoreLearnerResponse: provider.scoreLearnerResponse, generateTutorUtterance: provider.generateTutorUtterance,
        onNodeValues: async values => {
          if (!mounted || dialogueScope !== scope) return;
          dispatchSparcNodeValues(values, timestamp); await tick();
        },
      });
      if (!mounted || dialogueScope !== scope) return;
      dispatch('runtimewatchedstatechanged');
      dispatchSparcNodeValues(result.sparcNodeValues, timestamp);
      dialogueInitialized = true;
    } catch (error) {
      if (!mounted || dialogueScope !== scope) return;
      dispatchSparcNodeValues(readSparcResumeSnapshot({ userId, TDFId: tdfId, levelUnit,
        pageKey: currentDisplay.pageKey, display: currentDisplay }).nodeValues, timestamp);
      if (error instanceof SparcOutputLimitRecoveryError) {
        dialogueRecovery = { scope, retry: () => startCategorizedDialogue(currentDisplay, scope) };
      } else {
        dialogueSubmitError = platformText('autoTutor.serviceError');
        dialogueSubmitErrorDetail = dialogueSubmissionErrorDetail(error);
        clientConsole(1, '[SPARC][Dialogue] initialization failed', { detail: dialogueSubmitErrorDetail });
      }
    } finally {
      dialogueSubmitPending = false;
      if (mounted && dialogueScope === scope) {
        await tick();
        const nextControl = surfaceElement?.querySelector('[data-sparc-retry]')
          || surfaceElement?.querySelector('[data-node-id="instructional-choice-menu"] button:not(:disabled)')
          || surfaceElement?.querySelector('textarea:not(:disabled):not([readonly]), input:not(:disabled):not([readonly])');
        nextControl?.focus();
      }
    }
  }

  function handleFeedbackContent(event) {
    dispatch('feedbackcontent', event.detail);
  }

  function dialogueSubmissionErrorDetail(error) {
    const value = error && typeof error === 'object' ? error : {};
    const code = typeof value.error === 'string' ? value.error.trim() : '';
    const message = typeof value.reason === 'string' && value.reason.trim()
      ? value.reason.trim()
      : (error instanceof Error && error.message.trim()
        ? error.message.trim()
        : String(error || 'Unknown error'));
    return redactSparcDialogueDiagnosticText(
      `${code ? `${code}: ` : ''}${message}`
    ).replace(/\s+/g, ' ').slice(0, 800);
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
    return projectSparcInstructionMessages(flattenNodes(nodes).filter((node) => (
      (node?.atomType === 'dialogue-utterance' || (node?.atomType === 'html-block' && node?.turnEventId) || node?.id === 'instructional-choice-menu' || (node?.groupType === 'button-group' && node.id?.endsWith(':selected')))
      && (includeOpening || node.id !== 'opening-tutor-message')
    )));
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

  function dialogueInputValuePatch(nodes = [], values = {}) {
    return dialogueInputNodes(nodes).reduce((patch, inputNode) => {
      if (Object.prototype.hasOwnProperty.call(values, inputNode.id)) {
        patch[inputNode.id] = values[inputNode.id];
      }
      return patch;
    }, {});
  }

  function clearedDialogueInputValuePatch(nodes = []) {
    return dialogueInputNodes(nodes).reduce((patch, inputNode) => ({
      ...patch,
      [inputNode.id]: '',
    }), {});
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
    const clearedValues = clearedDialogueInputValuePatch(realizedSparcDisplay?.nodes);
    if (Object.keys(clearedValues).length === 0) {
      return;
    }
    nodeValues = {
      ...nodeValues,
      ...clearedValues,
    };
    dialogueInputResetVersion += 1;
  }

  function restoreDialogueInputs(values) {
    if (Object.keys(values).length === 0) {
      return;
    }
    nodeValues = {
      ...nodeValues,
      ...values,
    };
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
    if ((node?.menuId && node?.optionId) || node?.questionId) {
      void submitAutoTutorDialogue({ submittedNodes: buttonSubmission, triggeredBy: node.id, timestamp: Date.now() });
      return;
    }
    if (!isSubmitButton(node)) {
      void handleSparcAction({
        submittedNodes: buttonSubmission,
        triggeredBy: node?.id,
        focusedNodeId: activeNodeId || undefined,
        timestamp: Date.now(),
      });
      return;
    }
    const submission = {
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
    };
    if (isAutoTutorDialogueDisplay(sparcDisplay)) {
      void submitAutoTutorDialogue(submission);
      return;
    }
    void handleSparcSubmit(submission);
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
    void submitAutoTutorDialogue({
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
    if (!isSparcAutoTutorDisplay(candidateDisplay)) {
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
    if (isSparcAutoTutorDisplay(currentDisplay)) {
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
    if (isSparcAutoTutorDisplay(currentDisplay)) {
      const sparcResult = resolveSparcControllerResult(currentDisplay, detail || {}, '[SparcSessionSurface]');
      if (!sparcResult) {
        throw new Error(describeSparcBoundaryContext(currentDisplay, '[SparcSessionSurface] SPARC dialogue submit received for non-SPARC display'));
      }
      const provider = createSparcDialogueOpenRouterProvider({ ...(isSparcCategorizedPolicy(currentDisplay.instructionalController?.policyId) ? { moveLibrary: sparcMoveLibraryClient } : {}),
        ...(currentDisplay.instructionalController?.policyId ? { policyId: currentDisplay.instructionalController.policyId } : {}),
        tdfId: typeof tdfId === 'string' ? tdfId : null,
        sessionId: openRouterSession.sessionIdForScope({
          tdfId,
          attemptId,
          pageKey: currentDisplay.pageKey,
        }),
      });
      const priorProgressiveOperations = currentSparcProgressiveNodeOperations();
      const optimisticOperations = buildOptimisticDialogueLearnerOperations(currentDisplay, sparcResult);
      if (optimisticOperations.length > 0) {
        dispatchSparcNodeValues({
          [SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY]: [
            ...priorProgressiveOperations,
            ...optimisticOperations,
          ],
          ...clearedDialogueInputValuePatch(currentDisplay.nodes),
        }, sparcResult.timestamp);
      }
      let result;
      try {
        result = await commitSparcAutoTutorSubmit({
          engine,
          currentDisplay,
          sparcResult,
          tdfId,
          userId,
          attemptId,
          levelUnit,
          scoreLearnerResponse: provider.scoreLearnerResponse,
          generateTutorUtterance: provider.generateTutorUtterance,
          onNodeValues: async values => {
            dispatchSparcNodeValues(values, sparcResult.timestamp);
            await tick();
          },
        });
      } catch (error) {
        // Accepted assessment/selection remains visible even if the subsequent provider call fails.
        dispatchSparcNodeValues(readSparcResumeSnapshot({ userId, TDFId: tdfId, levelUnit,
          pageKey: currentDisplay.pageKey, display: currentDisplay }).nodeValues, sparcResult.timestamp);
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

  async function submitAutoTutorDialogue(detail) {
    if (dialogueSubmitPending || dialogueRecovery) {
      return;
    }
    pendingAutoTutorProgressSnapshot = autoTutorProgressSnapshot;
    dialogueSubmitPending = true;
    dialogueSubmitError = '';
    dialogueSubmitErrorDetail = '';
    const submittedInputValues = dialogueInputValuePatch(
      realizedSparcDisplay?.nodes,
      detail?.submittedNodes,
    );
    clearDialogueInputs();
    try {
      await handleSparcSubmit(detail);
    } catch (error) {
      if (error instanceof SparcOutputLimitRecoveryError) {
        const scope = dialogueScope;
        // Resume the journaled event, not a new response or assessment.
        dialogueRecovery = { scope, retry: categorizedDialogue
          ? () => startCategorizedDialogue(sparcDisplay, scope)
          : () => submitAutoTutorDialogue(detail) };
      } else {
        restoreDialogueInputs(submittedInputValues);
        dispatchSparcNodeValues(submittedInputValues, detail?.timestamp);
        dialogueSubmitError = platformText('autoTutor.serviceError');
        dialogueSubmitErrorDetail = dialogueSubmissionErrorDetail(error);
        clientConsole(1, '[SPARC][Dialogue] submission failed', {
          detail: dialogueSubmitErrorDetail,
        });
      }
    } finally {
      dialogueSubmitPending = false;
      pendingAutoTutorProgressSnapshot = null;
      await tick();
      const nextControl = surfaceElement?.querySelector('[data-sparc-retry]')
        || surfaceElement?.querySelector('[data-node-id="instructional-choice-menu"] button:not(:disabled)')
        || surfaceElement?.querySelector('textarea:not(:disabled):not([readonly]), input:not(:disabled):not([readonly])');
      nextControl?.focus();
    }
  }

  async function retryTutorResponse() {
    if (!dialogueRecovery || dialogueSubmitPending) return;
    const recovery = dialogueRecovery;
    dialogueRecovery = null;
    if (recovery.scope === dialogueScope) await recovery.retry();
  }

  function handleAutoTutorContinue() {
    dispatch('forceadvance', { reason: 'SPARC AutoTutor Complete' });
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

  function buildAutoTutorDialogueSignature(messages = []) {
    return messages.map((message) => [
      message?.id || '',
      message?.speaker || '',
      message?.value || '',
      (message?.children || []).map(child => `${child.id}:${child.value ?? child.label ?? ''}`).join('|'),
    ].join(':')).join('|');
  }

  async function scrollAutoTutorChatToLatest() {
    await tick();
    if (!autoTutorChatElement || typeof window === 'undefined') {
      return;
    }
    window.requestAnimationFrame(() => {
      if (autoTutorChatElement) {
        autoTutorChatElement.scrollTop = autoTutorChatElement.scrollHeight;
      }
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
  $: currentAutoTutorProgressSnapshot = buildSparcAutoTutorProgressSnapshot({
    display: sparcDisplay,
    runtimeNodeValues: nodeValues,
  });
  $: autoTutorProgressSnapshot = selectSparcAutoTutorProgressSnapshotForRender({
    currentSnapshot: currentAutoTutorProgressSnapshot,
    pendingSnapshot: pendingAutoTutorProgressSnapshot,
    submissionPending: dialogueSubmitPending,
  });
  $: autoTutorDialogueCompleted = autoTutorDialogueMode && !dialogueRecovery && currentAutoTutorProgressSnapshot.completed
    && (!isSparcCategorizedPolicy(sparcDisplay?.instructionalController?.policyId) || !dialogueSubmitPending);
  $: categorizedDialogue = autoTutorDialogueMode && isSparcCategorizedPolicy(sparcDisplay?.instructionalController?.policyId);
  $: dialogueScope = JSON.stringify([userId, tdfId, attemptId, levelUnit, sparcDisplay?.pageKey]);
  $: if (dialogueRecovery && dialogueRecovery.scope !== dialogueScope) dialogueRecovery = null;
  $: if (mounted && categorizedDialogue && engine && userId && tdfId && attemptId && subsetKind === 'question'
    && startedDialogueScope !== dialogueScope && !dialogueSubmitPending) {
    startCategorizedDialogue(sparcDisplay, dialogueScope);
  }
  $: autoTutorDialoguePrompt = autoTutorDialogueMode && !categorizedDialogue ? dialoguePrompt(topLevelNodes) : '';
  $: savedDialogueMessages = autoTutorDialogueMode ? dialogueNodes(topLevelNodes).map((node) => dialogueSubmitPending || dialogueRecovery
    ? { ...node, readOnly: true, children: (node.children || []).map((child) => ({ ...child, readOnly: true })) } : node) : [];
  $: contentReferenceIds = sparcContentReferenceIds(savedDialogueMessages);
  $: contentReferenceSignature = JSON.stringify(contentReferenceIds);
  $: if (mounted && contentReferenceSignature !== removalSignature) {
    removalSignature = contentReferenceSignature;
    checkContentRemovals(contentReferenceIds, contentReferenceSignature);
  }
  $: autoTutorDialogueMessages = projectSparcAdministrativeRemovals(savedDialogueMessages.filter(node =>
    sparcContentReferenceIds([node]).every(id => checkedContentIds.has(id))), removedContentIds);
  $: latestDialogueQuestion = savedDialogueMessages.flatMap(node => node.children || [node])
    .filter(node => node.component === 'question' || String(node.id).endsWith(':question')).at(-1);
  $: currentQuestionRemoved = !!latestDialogueQuestion && !!projectSparcAdministrativeRemovals([latestDialogueQuestion], removedContentIds)[0].administrativeRemoval;
  $: autoTutorDialogueSignature = buildAutoTutorDialogueSignature(autoTutorDialogueMessages);
  $: if (
    autoTutorDialogueMode
    && autoTutorDialogueSignature !== observedAutoTutorDialogueSignature
  ) {
    observedAutoTutorDialogueSignature = autoTutorDialogueSignature;
    scrollAutoTutorChatToLatest();
  }
  $: autoTutorDialogueInputNode = autoTutorDialogueMode ? firstNodeById(topLevelNodes, 'learner-response-input') : null;
  $: autoTutorDialogueSubmitNode = autoTutorDialogueMode ? firstNodeById(topLevelNodes, 'learner-response-submit') : null;
  $: autoTutorDialogueInputRenderNode = autoTutorDialogueInputNode && (dialogueSubmitPending || dialogueRecovery || currentQuestionRemoved || contentReferenceIds.some(id => !checkedContentIds.has(id)) || (categorizedDialogue && !dialogueInitialized))
    ? { ...autoTutorDialogueInputNode, readOnly: true }
    : autoTutorDialogueInputNode;
  $: autoTutorDialogueSubmitRenderNode = autoTutorDialogueSubmitNode && (dialogueSubmitPending || dialogueRecovery || currentQuestionRemoved || contentReferenceIds.some(id => !checkedContentIds.has(id)) || (categorizedDialogue && !dialogueInitialized))
    ? { ...autoTutorDialogueSubmitNode, readOnly: true }
    : autoTutorDialogueSubmitNode;
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
    {#if autoTutorDialoguePrompt}<header class="sparc-auto-tutor-header">
      <div class="sparc-auto-tutor-question">
        <h1>{autoTutorDialoguePrompt}</h1>
      </div>
    </header>{/if}
    <SparcAutoTutorProgress snapshot={autoTutorProgressSnapshot} />

    <section
      bind:this={autoTutorChatElement}
      class="sparc-auto-tutor-chat"
      aria-label={platformText('autoTutor.conversation')}
      aria-busy={dialogueSubmitPending}
    >
      {#if removalError}<p role="alert">{removalError}</p>{/if}
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
      {#if dialogueSubmitPending}
        <div
          class="sparc-auto-tutor-pending-turn"
          data-sparc-speaker="tutor"
          role="status"
          aria-label={platformText('common.loading')}
        >
          <div class="sparc-auto-tutor-pending-speaker" aria-hidden="true">Tutor</div>
          <div class="sparc-auto-tutor-pending-bubble" aria-hidden="true">
            <span class="sparc-auto-tutor-pending-swirl"></span>
            <span class="sparc-auto-tutor-skeleton-lines">
              <span class="sparc-auto-tutor-skeleton-line"></span>
              <span class="sparc-auto-tutor-skeleton-line sparc-auto-tutor-skeleton-line-short"></span>
            </span>
          </div>
        </div>
      {/if}
    </section>

    <footer class="sparc-auto-tutor-input-bar">
      {#if autoTutorDialogueCompleted}
        <button
          type="button"
          class="btn btn-primary sparc-auto-tutor-continue"
          on:click={handleAutoTutorContinue}
        >
          {platformText('common.continue')}
        </button>
      {:else if autoTutorDialogueInputNode}
        <div class="sparc-auto-tutor-input">
          {#key `${autoTutorDialogueInputNode.id}:${dialogueInputResetVersion}`}
          <SparcNode
            node={autoTutorDialogueInputRenderNode}
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
      {#if !autoTutorDialogueCompleted && autoTutorDialogueSubmitNode}
        <div class="sparc-auto-tutor-submit">
          <SparcNode
            node={autoTutorDialogueSubmitRenderNode}
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
    {#if dialogueRecovery}
      <div class="sparc-auto-tutor-recovery">
        <p role="status">{platformText('autoTutor.responseRetry')}</p>
        <button type="button" class="btn btn-primary" data-sparc-retry on:click={retryTutorResponse} disabled={dialogueSubmitPending}>
          {platformText('common.tryAgain')}
        </button>
      </div>
    {/if}
    {#if dialogueSubmitError}
      <p class="sparc-auto-tutor-submit-error" role="alert">
        {dialogueSubmitError}
      </p>
      {#if dialogueSubmitErrorDetail}
        <p class="sparc-auto-tutor-submit-error-detail">
          <span>Technical detail:</span>
          <code>{dialogueSubmitErrorDetail}</code>
        </p>
      {/if}
    {/if}
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
        {displayUserAnswerInFeedback}
        {feedbackLayout}
        {displayCorrectAnswerInIncorrectFeedback}
        on:feedbackcontent={handleFeedbackContent}
        on:blockingassetstate
      />
    </div>
  {/if}
</div>
