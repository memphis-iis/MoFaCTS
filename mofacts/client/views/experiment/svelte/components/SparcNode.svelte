<script>
  import { relevantSupport } from '../services/sparcRelevantSupport';
  import { SPARC_ADMINISTRATIVE_REMOVAL_TEXT } from '../../../../../../learning-components/runtime/sparcAdministrativeRemoval';
  import DOMPurify from 'dompurify';
  import SparcVideo from './SparcVideo.svelte';
  import SparcPromptFigure from './SparcPromptFigure.svelte';
  import LearningProgressChart from './LearningProgressChart.svelte';
  import { getActiveUiLocale } from '../../../../lib/interfaceLocaleState';
  import { translatePlatformString } from '../../../../lib/interfaceI18n';
  import { sanitizeSparcRichHtml } from '../services/sparcRichHtml';
  import { renderSparcInstructionMarkdown } from '../services/sparcInstructionMarkdown';
  import { shouldSubmitTextInputOnKeydown } from '../services/textInputComposition';
  import { SPARC_CATEGORIZED_MENU_OPTIONS } from '../../../../../../learning-components/units/sparcsession/sparcDynamicInstructionRules';
  import { sparcQuestionAnswerNodes } from '../../../../../../learning-components/units/sparcsession/sparcMultipleChoiceQuestion';
  import { getSparcMoveDefinition } from '../../../../../../learning-components/units/sparcsession/sparcMoveDefinitions';

  const sparcText = (key) => translatePlatformString(getActiveUiLocale(), key);

  function isWorkedExample(component) {
    return component.id === `${component.turnEventId}:richContent`
      && component.figure === undefined && component.video === undefined
      && SPARC_CATEGORIZED_MENU_OPTIONS.some((option) => option.action === component.action);
  }

  export let node;
  export let adminDiagnosticMode = false;
  export let nodeValues = {};
  export let learningProgressSnapshot = null;
  let diagnosticPanelOpen = false;
  export let authoringSelectedNodeId = '';
  export let authoringSelectOnly = false;
  export let inputLanguage = '';
  export let inputTextDirection = '';
  export let onNodeValueChange = () => {};
  export let onNodeCommit = () => {};
  export let onNodeEnter = () => {};
  export let onNodeFocus = () => {};
  export let onButtonActivate = () => {};
  export let onFigureState = () => {};

  let activeTabId = '';
  let activePanelId = '';

  function sortByPlacementOrder(values = []) {
    return values.slice().sort((left, right) => {
      const leftOrder = Number(left?.placement?.order ?? 0);
      const rightOrder = Number(right?.placement?.order ?? 0);
      return leftOrder - rightOrder;
    });
  }

  function isMeaninglessExampleTitle(candidate, parent) {
    const isExample = parent?.groupType === 'oli-example'
      || parent?.layout?.visualPreset === 'example';
    return isExample
      && candidate?.atomType === 'html-block'
      && /^\s*<p>\s*title\s*<\/p>\s*$/i.test(String(candidate?.value || ''));
  }

  function dropdownInputForRow(candidate) {
    return (candidate?.children || []).find((child) => child?.atomType === 'dropdown') || null;
  }

  function latestAnsweredDropdownRowId(children = []) {
    const orderedChildren = sortByPlacementOrder(children);
    for (let index = orderedChildren.length - 1; index >= 0; index -= 1) {
      const row = orderedChildren[index];
      if (row?.groupType !== 'dropdown-row') {
        continue;
      }
      const input = dropdownInputForRow(row);
      if (input && (getNodeCorrectness(input) || String(getNodeValue(input) || '').trim())) {
        return row.id || '';
      }
    }
    return '';
  }

  function buildRenderItems(children = [], parent = null) {
    const items = [];
    const orderedChildren = sortByPlacementOrder(children);
    const feedbackNodes = parent?.groupType === 'dropdown-exercise'
      ? orderedChildren.filter((child) => child?.atomType === 'message-box')
      : [];
    const sharedFeedback = feedbackNodes.length === 1 ? feedbackNodes[0] : null;
    const feedbackAnchorRowId = sharedFeedback ? latestAnsweredDropdownRowId(orderedChildren) : '';
    for (let index = 0; index < orderedChildren.length; index += 1) {
      const current = orderedChildren[index];
      if (isMeaninglessExampleTitle(current, parent)) {
        continue;
      }
      if (sharedFeedback?.id === current?.id && feedbackAnchorRowId) {
        continue;
      }
      items.push({ kind: 'node', node: current, key: current?.id || `node-${index}` });
      if (sharedFeedback && current?.id === feedbackAnchorRowId) {
        items.push({ kind: 'node', node: sharedFeedback, key: sharedFeedback.id || 'dropdown-feedback' });
      }
    }
    return items;
  }

  function getNodeValue(candidate) {
    if (candidate?.administrativeRemoval) return SPARC_ADMINISTRATIVE_REMOVAL_TEXT;
    if (!candidate?.id) {
      return '';
    }
    if (Object.prototype.hasOwnProperty.call(nodeValues, candidate.id)) {
      return nodeValues[candidate.id];
    }
    if (candidate.atomType === 'dropdown') {
      return candidate.selected ?? candidate.value ?? '';
    }
    if (candidate.atomType === 'checkbox') {
      return candidate.checked === true;
    }
    return candidate.value ?? '';
  }

  function getNodeCorrectness(candidate) {
    if (!candidate?.id) {
      return '';
    }
    const value = nodeValues[`${candidate.id}::correctness`];
    return typeof value === 'string' ? value : '';
  }

  function correctnessClass(candidate) {
    const correctness = getNodeCorrectness(candidate);
    return correctness ? `sparc-correctness-${correctness}` : '';
  }

  function nodeIsVisible(candidate) {
    if (!candidate?.id || authoringSelectOnly) {
      return true;
    }
    return nodeValues[`${candidate.id}::visible`] !== false;
  }

  function updateNodeValue(candidate, nextValue) {
    if (!candidate?.id || candidate?.readOnly) {
      return;
    }
    onNodeValueChange(candidate.id, nextValue);
  }

  function commitNodeValue(candidate, nextValue) {
    if (!candidate?.id || candidate?.readOnly) {
      return;
    }
    onNodeCommit(candidate.id, nextValue);
  }

  function isPlainTextAuthoringNode(candidate) {
    return candidate?.atomType === 'text-block'
      || candidate?.atomType === 'text'
      || candidate?.atomType === 'header-cell'
      || candidate?.atomType === 'operator'
      || candidate?.atomType === 'fraction-box';
  }

  function handlePlainTextAuthoringInput(candidate, element) {
    updateNodeValue(candidate, element.textContent || '');
  }

  function handlePlainTextAuthoringPaste(candidate, element) {
    setTimeout(() => handlePlainTextAuthoringInput(candidate, element), 0);
  }

  function handlePlainTextAuthoringCommit(candidate) {
    commitNodeValue(candidate, candidate.value || '');
  }

  function handleHtmlAuthoringInput(candidate, element) {
    updateNodeValue(candidate, element.innerHTML || '');
  }

  function handleHtmlAuthoringPaste(candidate, element) {
    setTimeout(() => handleHtmlAuthoringInput(candidate, element), 0);
  }

  function handleHtmlAuthoringCommit(candidate) {
    commitNodeValue(candidate, candidate.value || '');
  }

  function buttonLabel(candidate) {
    return String(candidate?.label || candidate?.value || '').trim();
  }

  function sanitizeSparcHtml(value) {
    return sanitizeSparcRichHtml(value, DOMPurify.sanitize.bind(DOMPurify));
  }

  function dialogueSpeaker(candidate) {
    const speaker = String(candidate?.speaker || '').trim().toLowerCase();
    return speaker === 'learner' ? 'learner' : 'tutor';
  }

  function dialogueSpeakerLabel(candidate) {
    return dialogueSpeaker(candidate) === 'learner' ? 'Learner' : 'Tutor';
  }

  function dialogueProductionRuleLabel(candidate) {
    if (!adminDiagnosticMode || dialogueSpeaker(candidate) !== 'tutor') {
      return '';
    }
    const productionRuleName = String(candidate?.productionRuleName || '').trim();
    const productionRuleId = String(candidate?.productionRuleId || '').trim();
    return productionRuleName || productionRuleId;
  }

  function compactDiagnosticNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : '';
  }

  function dialogueSelectionLabel(candidate) {
    if (!dialogueProductionRuleLabel(candidate)) {
      return '';
    }
    const action = String(candidate?.action || '').trim();
    const actionLabel = SPARC_CATEGORIZED_MENU_OPTIONS.find(option => option.action === action)?.label ?? action;
    const targetId = String(candidate?.targetId || '').trim();
    const targetKind = String(candidate?.selectionTargetKind || candidate?.targetType || '').trim();
    if (candidate?.competition) {
      const values = Object.entries(candidate.competition).map(([key, value]) => `${key}=${compactDiagnosticNumber(value)}`).join(' · ');
      return `${actionLabel} → ${targetKind} ${targetId} · ${values}`;
    }
    if (!action || !targetId || !targetKind) {
      return '';
    }
    const currentValue = compactDiagnosticNumber(candidate?.selectionCurrentValue);
    const goalValue = compactDiagnosticNumber(candidate?.selectionGoalValue);
    const rank = Number(candidate?.selectionRankWithinKind);
    const metric = targetKind === 'expectation' ? 'coverage' : 'support';
    const score = currentValue && goalValue ? ` · ${metric} ${currentValue}/${goalValue}` : '';
    const ranking = Number.isInteger(rank) && rank > 0 ? ` · rank #${rank}` : '';
    return `${actionLabel} → ${targetKind} ${targetId}${score}${ranking}`;
  }

  function skillBarFill(candidate) {
    const fill = Number(candidate?.fill ?? 0);
    if (!Number.isFinite(fill)) {
      return 0;
    }
    return Math.max(0, Math.min(100, fill));
  }

  function layoutString(candidate, key) {
    const value = candidate?.layout?.[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  function glueString(candidate) {
    const glue = candidate?.layout?.glue;
    if (typeof glue === 'string') {
      return glue.trim();
    }
    const mode = glue?.mode;
    return typeof mode === 'string' ? mode.trim() : '';
  }

  function nodeLayoutRole(candidate) {
    return layoutString(candidate, 'role');
  }

  function isHeaderFeedbackNode(candidate) {
    return nodeLayoutRole(candidate) === 'header-feedback';
  }

  function isChoiceTabsGroup(candidate) {
    return candidate?.nodeType === 'group'
      && (candidate?.groupType === 'choice-tabs' || glueString(candidate) === 'choice-tabs');
  }

  function isFractionGroup(candidate) {
    return candidate?.nodeType === 'group' && candidate?.groupType === 'fraction';
  }

  function fractionRole(candidate) {
    const role = candidate?.fractionRole || candidate?.role || candidate?.layout?.role || '';
    return typeof role === 'string' ? role.trim() : '';
  }

  function fractionChild(candidate, role) {
    return (candidate?.children || []).find((child) => fractionRole(child) === role) || null;
  }

  $: headerFeedbackNode = node?.nodeType === 'group'
    ? (node.children || []).find(isHeaderFeedbackNode)
    : null;
  $: bodyChildren = node?.nodeType === 'group'
    ? (node.children || []).filter((child) => !isHeaderFeedbackNode(child) && nodeIsVisible(child))
    : [];
  $: renderItems = node?.nodeType === 'group' ? buildRenderItems(bodyChildren, node) : [];
  $: isChoiceTabs = isChoiceTabsGroup(node);
  $: isFraction = isFractionGroup(node);
  $: fractionNumerator = isFraction ? fractionChild(node, 'numerator') : null;
  $: fractionDenominator = isFraction ? fractionChild(node, 'denominator') : null;
  $: tabChildren = isChoiceTabs ? sortByPlacementOrder(bodyChildren) : [];
  $: if (isChoiceTabs && tabChildren.length > 0 && !tabChildren.some((child) => child?.id === activeTabId)) {
    activeTabId = tabChildren[0]?.id || '';
  }
  $: activeTabNode = tabChildren.find((child) => child?.id === activeTabId) || tabChildren[0] || null;
  $: panelSelectorPanels = node?.atomType === 'panel-selector' ? sortByPlacementOrder(node.panels || []) : [];
  $: if (node?.atomType === 'panel-selector' && panelSelectorPanels.length > 0 && !panelSelectorPanels.some((panel) => panel?.id === activePanelId)) {
    activePanelId = node.selectedPanelId || panelSelectorPanels[0]?.id || '';
  }
  $: activePanel = panelSelectorPanels.find((panel) => panel?.id === activePanelId) || panelSelectorPanels[0] || null;
  $: activePanelItems = activePanel ? buildRenderItems(activePanel.children || []) : [];
</script>

{#if node && nodeIsVisible(node) && node?.nodeType === 'group'}
  <div
    class={`sparc-group sparc-group-${node.groupType || 'generic'}`}
    class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
    data-node-id={node.id}
    data-sparc-layout-mode={layoutString(node, 'layoutMode')}
    data-sparc-visual-preset={layoutString(node, 'visualPreset')}
    data-sparc-glue={glueString(node)}
  >
    {#if isFraction}
      {#if fractionNumerator && fractionDenominator}
        <div class="sparc-fraction">
          <div class="sparc-fraction-top">
            <svelte:self
              node={fractionNumerator}
              {adminDiagnosticMode}
              {nodeValues}
              {learningProgressSnapshot}
              {authoringSelectedNodeId}
              {authoringSelectOnly}
              {onNodeValueChange}
              {onNodeCommit}
              {onNodeFocus}
              {onButtonActivate}
            />
          </div>
          <div class="sparc-fraction-divider"></div>
          <div class="sparc-fraction-bottom">
            <svelte:self
              node={fractionDenominator}
              {adminDiagnosticMode}
              {nodeValues}
              {learningProgressSnapshot}
              {authoringSelectedNodeId}
              {authoringSelectOnly}
              {onNodeValueChange}
              {onNodeCommit}
              {onNodeFocus}
              {onButtonActivate}
            />
          </div>
        </div>
      {:else}
        <div class="sparc-unknown">{sparcText('sparc.invalidFractionMissingParts')}</div>
      {/if}
    {:else if headerFeedbackNode}
      <div class="sparc-group-header">
        <div class="sparc-group-header-feedback">
          <svelte:self
            node={headerFeedbackNode}
            {adminDiagnosticMode}
            {nodeValues}
            {learningProgressSnapshot}
            {authoringSelectedNodeId}
            {authoringSelectOnly}
            {onNodeValueChange}
            {onNodeCommit}
            {onNodeFocus}
            {onButtonActivate}
          />
        </div>
      </div>
    {/if}
    {#if !isFraction}
      <div class="sparc-group-body">
      {#if isChoiceTabs}
        <div class="sparc-choice-tabs" role="tablist">
          {#each tabChildren as tab}
            <button
              type="button"
              class:active={tab.id === activeTabId}
              class="sparc-choice-tab"
              role="tab"
              aria-selected={tab.id === activeTabId}
              on:click={() => {
                activeTabId = tab.id;
              }}
            >
              {tab.label || tab.id}
            </button>
          {/each}
        </div>
        {#if activeTabNode}
          <div class="sparc-choice-tab-panel" role="tabpanel">
            <svelte:self
              node={activeTabNode}
              {adminDiagnosticMode}
              {nodeValues}
              {learningProgressSnapshot}
              {authoringSelectedNodeId}
              {authoringSelectOnly}
              {onNodeValueChange}
              {onNodeCommit}
              {onNodeFocus}
              {onButtonActivate}
            />
          </div>
        {/if}
      {:else}
        {#each renderItems as item (item.key)}
          <svelte:self
            node={item.node}
            {adminDiagnosticMode}
            {nodeValues}
            {learningProgressSnapshot}
            {authoringSelectedNodeId}
            {authoringSelectOnly}
            {onNodeValueChange}
            {onNodeCommit}
            {onNodeFocus}
            {onButtonActivate}
          />
        {/each}
      {/if}
      </div>
    {/if}
  </div>
{:else if node && nodeIsVisible(node) && node?.nodeType === 'atomic'}
  {#if isPlainTextAuthoringNode(node)}
    {#if authoringSelectOnly}
      <div
        class={`sparc-atom sparc-${node.atomType} sparc-authoring-inline-edit`}
        class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
        data-node-id={node.id}
        contenteditable="plaintext-only"
        role="textbox"
        tabindex="0"
        bind:textContent={node.value}
        on:focus={() => onNodeFocus(node.id)}
        on:input={(event) => handlePlainTextAuthoringInput(node, event.currentTarget)}
        on:keyup={(event) => handlePlainTextAuthoringInput(node, event.currentTarget)}
        on:paste={(event) => handlePlainTextAuthoringPaste(node, event.currentTarget)}
        on:blur={() => handlePlainTextAuthoringCommit(node)}
      ></div>
    {:else}
      <div class={`sparc-atom sparc-${node.atomType}`} class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{getNodeValue(node)}</div>
    {/if}
  {:else if node.atomType === 'html-block'}
    {#if authoringSelectOnly}
      <div
        class="sparc-atom sparc-html-block sparc-authoring-inline-edit"
        class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
        data-node-id={node.id}
        contenteditable="true"
        role="textbox"
        tabindex="0"
        bind:innerHTML={node.value}
        on:focus={() => onNodeFocus(node.id)}
        on:input={(event) => handleHtmlAuthoringInput(node, event.currentTarget)}
        on:keyup={(event) => handleHtmlAuthoringInput(node, event.currentTarget)}
        on:paste={(event) => handleHtmlAuthoringPaste(node, event.currentTarget)}
        on:blur={() => handleHtmlAuthoringCommit(node)}
      ></div>
    {:else}
      <div class="sparc-atom sparc-html-block" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{@html sanitizeSparcHtml(getNodeValue(node))}</div>
    {/if}
  {:else if node.atomType === 'panel-selector'}
    <div class="sparc-atom sparc-panel-selector" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>
      {#if node.label}
        <div class="sparc-panel-selector-label">{node.label}</div>
      {/if}
      <div class="sparc-panel-tabs" role="tablist">
        {#each panelSelectorPanels as panel}
          <button
            type="button"
            class:active={panel.id === activePanelId}
            class="sparc-panel-tab"
            role="tab"
            aria-selected={panel.id === activePanelId}
            on:click={() => {
              activePanelId = panel.id;
            }}
          >
            {panel.label || panel.id}
          </button>
        {/each}
      </div>
      {#if activePanel}
        <div class="sparc-panel-selector-panel" role="tabpanel">
          {#each activePanelItems as item (item.key)}
            <svelte:self
              node={item.node}
              {adminDiagnosticMode}
              {nodeValues}
              {learningProgressSnapshot}
              {authoringSelectedNodeId}
              {authoringSelectOnly}
              {onNodeValueChange}
              {onNodeCommit}
              {onNodeFocus}
              {onButtonActivate}
            />
          {/each}
        </div>
      {/if}
    </div>
  {:else if node.atomType === 'message-box'}
    {#if authoringSelectOnly || String(getNodeValue(node) || '').trim()}
      {#if authoringSelectOnly}
        <div
          class="sparc-atom sparc-message-box sparc-authoring-inline-edit"
          class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
          data-node-id={node.id}
          contenteditable="true"
          role="textbox"
          tabindex="0"
          bind:innerHTML={node.value}
          on:focus={() => onNodeFocus(node.id)}
          on:input={(event) => handleHtmlAuthoringInput(node, event.currentTarget)}
          on:keyup={(event) => handleHtmlAuthoringInput(node, event.currentTarget)}
          on:paste={(event) => handleHtmlAuthoringPaste(node, event.currentTarget)}
          on:blur={() => handleHtmlAuthoringCommit(node)}
        ></div>
      {:else}
        <div class="sparc-atom sparc-message-box" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{@html sanitizeSparcHtml(getNodeValue(node))}</div>
      {/if}
    {/if}
  {:else if node.atomType === 'dialogue-utterance'}
    <div
      class={`sparc-atom sparc-dialogue-utterance sparc-dialogue-utterance-${dialogueSpeaker(node)}`}
      class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
      data-node-id={node.id}
      data-sparc-speaker={dialogueSpeaker(node)}
      class:sparc-correctness-correct={dialogueSpeaker(node) === 'learner' && getNodeCorrectness(node) === 'correct'}
      class:sparc-correctness-incorrect={dialogueSpeaker(node) === 'learner' && getNodeCorrectness(node) === 'incorrect'}
      use:relevantSupport
    >
      <div class="sparc-dialogue-speaker">{dialogueSpeakerLabel(node)}
        {#if dialogueSpeaker(node) === 'learner' && getNodeCorrectness(node)}
          <span class="visually-hidden">{sparcText(node.responseFormat === 'multiple-choice' || node.responseFormat === 'true-false'
            ? getNodeCorrectness(node) === 'correct' ? 'feedback.correct' : 'feedback.incorrect'
            : getNodeCorrectness(node) === 'correct' ? 'autoTutor.responseGain' : 'autoTutor.responseNoGain')}: </span>
        {/if}
      </div>
      <div class="sparc-dialogue-bubble">
        {#if node.children?.length}
          {#each node.children as component (component.id)}
            {@const workedExample = isWorkedExample(component)}
            {@const categorizedSupport = component.id === `${component.turnEventId}:richContent` && !!getSparcMoveDefinition(component.action)?.responseFormat}
            {@const heading = categorizedSupport ? component.supportHeading : workedExample ? sparcText('sparc.workedExample') : undefined}
            <div
              class="sparc-instruction-component"
              id={`sparc-primitive-${encodeURIComponent(component.id)}`}
              tabindex="-1"
              class:sparc-worked-example={workedExample || categorizedSupport}
              role={workedExample || categorizedSupport ? 'group' : undefined}
              aria-label={heading}
            >
              {#if component.administrativeRemoval}
                <p>{component.value}</p>
              {:else if component.primitiveReference?.priorNodeId}
                <a class="sparc-support-reference" data-sparc-reference={`sparc-primitive-${encodeURIComponent(component.primitiveReference.priorNodeId)}`}
                  href={`#sparc-primitive-${encodeURIComponent(component.primitiveReference.priorNodeId)}`}>Relevant earlier {component.component === 'explanation' ? 'explanation' : 'support'}</a>
              {:else}
              {#if heading}
                <div class="sparc-worked-example-title" aria-hidden="true">{heading}</div>
              {/if}
              {#if component.video !== undefined}
                <SparcVideo video={component.video} />
              {:else if categorizedSupport && component.figure !== undefined}
                <SparcPromptFigure figure={component.figure} figureId={component.id} compact={true} {onFigureState} />
              {:else}
                <div class="sparc-instruction-content sparc-html-block">{@html renderSparcInstructionMarkdown(getNodeValue(component), DOMPurify.sanitize.bind(DOMPurify))}</div>
              {/if}
              {#if component.figure !== undefined && !categorizedSupport}
                <SparcPromptFigure figure={component.figure} figureId={component.id} {onFigureState} />
              {/if}
              {/if}
              {#if component.choices}
                <svelte:self node={sparcQuestionAnswerNodes(component, !!component.readOnly)} {nodeValues}
                  {onButtonActivate} {onNodeFocus} {authoringSelectOnly} {adminDiagnosticMode} />
              {/if}
            </div>
          {/each}
        {:else}
          {#if node.video !== undefined}
            <SparcVideo video={node.video} />
          {:else if dialogueSpeaker(node) === 'tutor'}
            <div class="sparc-instruction-content sparc-html-block">{@html renderSparcInstructionMarkdown(getNodeValue(node), DOMPurify.sanitize.bind(DOMPurify))}</div>
          {:else}
            <div>{getNodeValue(node)}</div>
          {/if}
          {#if node.figure !== undefined}
            <SparcPromptFigure figure={node.figure} figureId={node.id} {onFigureState} />
          {/if}
        {/if}
        {#if dialogueProductionRuleLabel(node)}
          <details class="sparc-production-details" bind:open={diagnosticPanelOpen}>
            <summary on:keydown={(event) => {
              if (event.key === 'Escape') {
                diagnosticPanelOpen = false;
                event.preventDefault();
                event.stopPropagation();
              }
            }}>{sparcText('dashboard.details')}</summary>
            <div class="sparc-production-panel">
              <div class="sparc-dialogue-diagnostic">production: {dialogueProductionRuleLabel(node)}</div>
              {#if dialogueSelectionLabel(node)}
                <div class="sparc-dialogue-diagnostic sparc-dialogue-diagnostic-selection">selected: {dialogueSelectionLabel(node)}</div>
              {/if}
            </div>
          </details>
        {/if}
      </div>
    </div>
  {:else if node.atomType === 'skill-bar'}
    <div class="sparc-atom sparc-skill-bar" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id} aria-label={node.label || ''}>
      <div class="sparc-skill-track">
        <div class="sparc-skill-fill" style={`width: ${skillBarFill(node)}%;`}></div>
      </div>
      {#if node.label}
        <span class="sparc-skill-label">{node.label}</span>
      {/if}
    </div>
  {:else if node.atomType === 'learning-progress'}
    <div class="sparc-atom sparc-learning-progress" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id} aria-label={node.label || 'Learning progress'}>
      {#if node.label}
        <div class="sparc-learning-progress-label">{node.label}</div>
      {/if}
      <LearningProgressChart
        snapshot={learningProgressSnapshot}
        showReferenceLines={false}
        compact={true}
      />
    </div>
  {:else if node.atomType === 'operator'}
    <div class="sparc-atom sparc-operator" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{node.value || ''}</div>
  {:else if node.atomType === 'fraction-box'}
    <div class={`sparc-atom sparc-fraction-box ${node.style ? `sparc-style-${node.style}` : ''}`} class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{getNodeValue(node)}</div>
  {:else if node.atomType === 'fraction-input' || node.atomType === 'text-input'}
    <input
      class={`sparc-atom sparc-input sparc-input-${node.atomType}`}
      class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
      class:sparc-correctness-correct={getNodeCorrectness(node) === 'correct'}
      class:sparc-correctness-incorrect={getNodeCorrectness(node) === 'incorrect' || getNodeCorrectness(node) === 'buggy'}
      data-node-id={node.id}
      type="text"
      aria-label={node.label || undefined}
      value={getNodeValue(node)}
      maxlength={node.maxlength}
      placeholder={node.hint || ''}
      lang={inputLanguage || undefined}
      dir={inputTextDirection || undefined}
      readonly={node.readOnly === true}
      on:focus={() => onNodeFocus(node.id)}
      on:input={(event) => updateNodeValue(node, event.currentTarget.value)}
      on:blur={(event) => commitNodeValue(node, event.currentTarget.value)}
      on:keydown={(event) => {
        if (shouldSubmitTextInputOnKeydown(event)) {
          event.preventDefault();
          if (onNodeEnter(node.id, event.currentTarget.value, event) === true) {
            return;
          }
          commitNodeValue(node, event.currentTarget.value);
        }
      }}
    />
  {:else if node.atomType === 'dropdown'}
    <select
      class="sparc-atom sparc-select"
      class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
      class:sparc-correctness-correct={getNodeCorrectness(node) === 'correct'}
      class:sparc-correctness-incorrect={getNodeCorrectness(node) === 'incorrect' || getNodeCorrectness(node) === 'buggy'}
      data-node-id={node.id}
      disabled={node.readOnly === true}
      value={getNodeValue(node)}
      on:focus={() => onNodeFocus(node.id)}
      on:change={(event) => {
        updateNodeValue(node, event.currentTarget.value);
        commitNodeValue(node, event.currentTarget.value);
      }}
    >
      {#each node.options || [] as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
  {:else if node.atomType === 'checkbox'}
    <label class={`sparc-atom sparc-checkbox ${correctnessClass(node)}`} class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>
      <input
        data-node-id={node.id}
        type="checkbox"
        checked={Boolean(getNodeValue(node))}
        disabled={node.readOnly === true}
        on:focus={() => onNodeFocus(node.id)}
        on:change={(event) => {
          updateNodeValue(node, event.currentTarget.checked);
          commitNodeValue(node, event.currentTarget.checked);
        }}
      />
    </label>
  {:else if node.atomType === 'button'}
    <button
      type="button"
      class={`sparc-atom sparc-button ${node.variant ? `sparc-button-${node.variant}` : ''}`}
      class:sparc-authoring-selected={node.id === authoringSelectedNodeId}
      class:sparc-correctness-correct={getNodeCorrectness(node) === 'correct'}
      class:sparc-correctness-incorrect={getNodeCorrectness(node) === 'incorrect' || getNodeCorrectness(node) === 'buggy'}
      data-node-id={node.id}
      aria-pressed={node.selected === undefined ? undefined : node.selected}
      class:worksheet-selected={node.selected === true}
      disabled={node.readOnly === true}
      on:click={() => authoringSelectOnly ? onNodeFocus(node.id) : onButtonActivate(node)}
    >
      {buttonLabel(node)}
      {#if node.questionId && node.selected && getNodeCorrectness(node)}
        <span class="visually-hidden"> — {sparcText(getNodeCorrectness(node) === 'correct' ? 'feedback.correct' : 'feedback.incorrect')}</span>
      {/if}
    </button>
  {:else}
    <div class="sparc-atom sparc-unknown" class:sparc-authoring-selected={node.id === authoringSelectedNodeId} data-node-id={node.id}>{node.atomType || 'unknown'}</div>
  {/if}
{/if}
