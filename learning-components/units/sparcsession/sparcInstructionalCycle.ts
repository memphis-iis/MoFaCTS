import type { ExpectationLogitChange } from '../../runtime/expectationLogitHistory';
import { isSparcChoiceFormat } from '../../runtime/sparcTargetCategories';
import { isSparcCompetitivePolicy, isSparcCategorizedPolicy, isSparcStudentPolicy } from '../../runtime/sparcInstructionalPolicies';
import { SPARC_DYNAMIC_TARGET_LOGIT, SPARC_FEEDBACK_ACTION, SPARC_FEEDBACK_STARTED } from './sparcDynamicInstructionRules';
import { competitiveAssessmentFacts, competitiveCandidateFacts, selectCompetitiveActivation } from './sparcCompetitiveSelection';
import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import { SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY, type SparcProgressiveNodeOperation } from '../../trial-displays/sparc/sparcProgressiveNodes';
import { assertCompletedDialogueReplayState, RESPONSE_LOCAL_FACT_TYPES, type SparcAutoTutorRuleTurnParams } from './sparcAutoTutorRuleRuntime';
import { createSparcLearnerResponseScoreFacts, expectationLogitChangesFromScoreFacts } from './sparcLearnerResponseScoring';
import { requireSparcInstructionalAdapter } from './sparcInstructionalAdapterRegistry';
import { SPARC_CATEGORIZED_MOVE_DEFINITIONS } from './sparcMoveDefinitions';
import { createSparcInstructionTransition, createSparcFeedbackRequest, createSparcInstructionComponentWrite, type SparcInstructionComponents } from './sparcInstructionalPrimitives';
import { createSparcUtteranceRequestFromFacts, type SparcUtteranceRequest } from './sparcUtteranceRequest';
import { buildSparcWorkingMemoryFacts, progressiveDialogueFacts } from './sparcWorkingMemoryFacts';
import { createSparcStableWorkingMemoryFactStateWrite } from './sparcWorkingMemoryState';
import { runSparcProductionRulesWithActions } from './sparcProductionRuleEvaluator';
import { createProductionRuleTransition } from './sparcProductionRuleCommit';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import { SPARC_AUTOTUTOR_EVALUATE_ACTION, SPARC_AUTOTUTOR_GENERATE_ACTION } from './sparcProgressiveScaffoldingRules';
import { SPARC_MENU_ACTION, SPARC_NEXT_TARGET_ACTION, SPARC_STOP_ACTION } from './sparcInstructionalCycleRules';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type { SparcReplayState } from './sparcStateReplay';
import type { SparcCanonicalHistoryRecord, SparcInterfaceEvent, SparcStateTransition, SparcStateWrite, SparcWorkingMemoryFact, SparcProductionActionHandler, SparcProductionRuleExecution } from './sparcSessionContracts';

type MenuOption = { id: string; label: string; action: string; targetId: string; targetKind: 'expectation' | 'misconception' };
const DECISION_STATE_FACT_TYPES = new Set(['instructional.decision', 'controller.selectedAction', 'instructional.activeCycle']);
export type SparcCycleResult = {
  readonly transition: SparcStateTransition;
  readonly historyRecord?: SparcCanonicalHistoryRecord;
  readonly utteranceRequest?: SparcUtteranceRequest;
  readonly execution?: SparcProductionRuleExecution;
};
function factWrites(facts: readonly SparcWorkingMemoryFact[], event: SparcInterfaceEvent): SparcStateWrite[] {
  return facts.map((fact) => createSparcStableWorkingMemoryFactStateWrite({ target: { pageKey: event.source.pageKey, nodeId: 'root' }, fact,
    identitySlots: fact.factType === 'learningTarget.score' ? { clusterKC: fact.slots?.clusterKC }
      : fact.factType === 'diagnostic.misconceptionScore' ? { id: fact.slots?.id } : {},
  }));
}
function writtenFacts(transition: SparcStateTransition): SparcWorkingMemoryFact[] {
  return transition.writes.flatMap((write) => write.key.startsWith('workingMemoryFact') ? [write.value as SparcWorkingMemoryFact] : []);
}
export function currentSparcMenu(replay: SparcReplayState): SparcWorkingMemoryFact | undefined {
  return Object.values(replay.cells).map((cell) => cell.value as SparcWorkingMemoryFact)
    .find((fact) => fact?.factType === 'instructional.menu');
}
export function projectSparcMenuOperations(replay: SparcReplayState): SparcProgressiveNodeOperation[] {
  const selected: SparcProgressiveNodeOperation[] = [];
  let anchor = '';
  let firstDialogueNodeId = '';
  for (const transition of replay.transitions) {
    for (const write of transition.writes) {
      const operation = write.value as { node?: { id?: string; turnEventId?: string; atomType?: string } };
      if (write.key === SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY && operation?.node?.turnEventId
        && ['dialogue-utterance', 'html-block'].includes(operation.node.atomType!)) {
        anchor = operation.node.id!;
        firstDialogueNodeId ||= anchor;
      }
      const fact = write.value as SparcWorkingMemoryFact;
      if (fact?.factType !== 'instructional.menu' || fact.slots?.status !== 'selected') continue;
      const offered = fact.slots.options as MenuOption[];
      const option = offered.find(entry => entry.id === fact.slots!.selectedOptionId);
      if (!option) throw new Error('Saved instructional choice is missing its offered option');
      const next = offered.find(entry => entry.id === 'next-target');
      const selectedNext = option.id === 'next-target' || (next && transition.event.payload?.targetId === next.targetId
        && transition.event.payload?.targetKind === next.targetKind
        && (next.targetId !== option.targetId || next.targetKind !== option.targetKind));
      const id = `${String(fact.slots.menuId)}:selected`;
      const choiceNode = (choice: MenuOption) => ({
        id: `${id}:${choice.id}`, nodeType: 'atomic' as const, atomType: 'button', label: choice.label,
        value: choice.id, selected: true, readOnly: true,
      });
      selected.push({ type: 'insert-node', boxId: 'dialogue-flow', ...(anchor ? { afterNodeId: anchor } : {}), node: {
        id, nodeType: 'group', groupType: 'button-group', children: [choiceNode(option),
          ...(selectedNext && option.id !== 'next-target' && next ? [choiceNode(next)] : []),
        ],
      } });
      anchor = id;
    }
  }
  const orderedSelections = selected.map(operation => operation.type === 'insert-node' && !operation.afterNodeId && firstDialogueNodeId
    ? { ...operation, beforeNodeId: firstDialogueNodeId } : operation);
  const menu = currentSparcMenu(replay);
  if (!menu) return orderedSelections;
  const pending = menu.slots?.status === 'pending' || menu.slots?.status === 'selected';
  const options = pending ? menu.slots?.options as MenuOption[] : [];
  const selectedEvent = replay.transitions.find(transition => transition.event.type === 'choice-selected'
    && transition.event.payload?.menuId === menu.slots?.menuId)?.event;
  const selectedOption = options.find(option => option.id === menu.slots?.selectedOptionId);
  const selectedNext = selectedEvent && selectedOption && (selectedEvent.payload?.targetId !== selectedOption.targetId
    || selectedEvent.payload?.targetKind !== selectedOption.targetKind);
  return [...orderedSelections, { type: 'insert-node', boxId: 'dialogue-flow', node: {
    id: 'instructional-choice-menu', nodeType: 'group', groupType: 'button-group',
    label: pending ? 'Choose what to do next' : '',
    children: options.map((option) => ({ id: `${String(menu.slots?.menuId)}:${option.id}`, nodeType: 'atomic', atomType: 'button', label: option.label,
      value: option.id, menuId: menu.slots?.menuId, optionId: option.id,
      selected: menu.slots?.status === 'selected' && (option.id === menu.slots.selectedOptionId || (option.id === 'next-target' && Boolean(selectedNext))),
      readOnly: menu.slots?.status === 'selected' && menu.slots.selectedOptionId !== option.id })),
  } }];
}

function inputControls(event: SparcInterfaceEvent, enabled: boolean): SparcStateWrite[] {
  return ['learner-response-input', 'learner-response-submit'].map((id) => ({
    target: { pageKey: event.source.pageKey, nodeId: 'root' }, key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
    value: { type: 'insert-node', node: { id, nodeType: 'atomic', atomType: id.endsWith('input') ? 'text-input' : 'button',
      label: id.endsWith('input') ? 'Response' : 'Submit', value: id.endsWith('input') ? '' : 'submit', readOnly: !enabled,
      turnEventId: event.eventId,
    } },
  }));
}

/** Resume and persistence around the existing production engine, for multi-event instructional cycles. */
export async function commitSparcInstructionalCycle(params: SparcAutoTutorRuleTurnParams & {
  readonly core: SparcPracticeHistoryCore;
  readonly runtime: { readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory' | 'writeCanonicalHistoryBatch'> };
}): Promise<SparcCycleResult> {
  const student = isSparcStudentPolicy(params.document.instructionalController?.policyId);
  const competitive = isSparcCompetitivePolicy(params.document.instructionalController?.policyId);
  if (!isSparcCategorizedPolicy(params.document.instructionalController?.policyId)) throw new Error('Instructional cycles require a categorized policy');
  const dynamicMoves = SPARC_CATEGORIZED_MOVE_DEFINITIONS;
  assertCompletedDialogueReplayState(params.replayState);
  const adapter = requireSparcInstructionalAdapter(params.document.instructionalController);
  const previous = params.replayState?.transitions ?? [];
  for (const transition of previous) {
    const policyId = transition.event.payload?.policyId;
    if (policyId && policyId !== params.document.instructionalController!.policyId) throw new Error('Cannot resume a different instructional version');
  }
  const acceptedEvent = previous.find((transition) => transition.event.eventId === params.event.eventId)?.event;
  if (acceptedEvent && (acceptedEvent.payload?.input !== params.event.payload?.input || acceptedEvent.payload?.optionId !== params.event.payload?.optionId
    || acceptedEvent.payload?.targetId !== params.event.payload?.targetId || acceptedEvent.payload?.targetKind !== params.event.payload?.targetKind)) {
    throw new Error('Conflicting submission for an accepted instructional event');
  }
  const event: SparcInterfaceEvent = acceptedEvent ?? { ...params.event, payload: { ...params.event.payload, policyId: params.document.instructionalController!.policyId } };
  const completed = previous.find((transition) => transition.transitionId === `${event.eventId}:cycle`);
  if (completed) return { transition: completed };
  const acceptedDecision = previous.find((transition) => transition.transitionId === `${event.eventId}:decision`);
  const acceptedAssessment = previous.find((transition) => transition.transitionId === `${event.eventId}:assessment`);
  const acceptedFeedback = previous.find((transition) => transition.transitionId === `${event.eventId}:feedback`);
  let facts = [...buildSparcWorkingMemoryFacts({ ...params, event })].filter((fact) => !RESPONSE_LOCAL_FACT_TYPES.has(fact.factType)
    || (event.type === 'choice-selected' && ['learnerResponse.contribution', 'dialogue.learnerQuestion', 'controller.completionState'].includes(fact.factType)));
  facts.push({ factType: 'dialogue.problemStatement', slots: { text: params.problemStatement } });
  if (competitive) facts.push(...dynamicMoves.map((move) => ({ factType: 'instructional.move', slots: { action: move.moveId, assistance: move.assistance } })));
  let finalRecord: SparcCanonicalHistoryRecord | undefined;
  let generatedRequest: SparcUtteranceRequest | undefined;
  let generated = false;
  let menuOffered = false;
  let stopped = false;
  let documentLoadFacts: readonly SparcWorkingMemoryFact[] = [];
  let feedbackWork: Promise<{ ok: true; transition: SparcStateTransition } | { ok: false; error: unknown }> | undefined;
  const waitForFeedback = async () => {
    if (!feedbackWork) return;
    const result = await feedbackWork;
    if (!result.ok) throw result.error;
    return result.transition;
  };
  const historyRecord = (transition: SparcStateTransition, changes?: readonly ExpectationLogitChange[]) =>
    createSparcStateTransitionHistoryRecord({ core: params.core, transition, action: `sparc-${transition.transitionId.split(':').at(-1)}`,
      responseValue: event.type === 'response-submitted' ? event.payload?.input ?? '' : '',
      ...(changes ? { expectationLogitChanges: changes } : {}),
    });
  const save = async (transition: SparcStateTransition, changes?: readonly ExpectationLogitChange[]) => {
    const record = historyRecord(transition, changes);
    await params.runtime.history.writeCanonicalHistory(record);
    return record;
  };
  const saveDecision = async (current: readonly SparcWorkingMemoryFact[]) => {
    if (acceptedDecision) return;
    const menu = current.find((fact) => fact.factType === 'instructional.menu');
    await save({ transitionId: `${event.eventId}:decision`, event, writes: factWrites([
      ...current.filter((fact) => DECISION_STATE_FACT_TYPES.has(fact.factType) || ['dialogue.responseModifier', 'instructional.oet'].includes(fact.factType)),
      ...(student ? [{ factType: 'instructional.menu', slots: { ...menu?.slots, snapshotId: event.eventId,
        status: 'selected', selectedOptionId: event.payload?.optionId } }] : []),
    ], event) });
  };
  const projection = (current: readonly SparcWorkingMemoryFact[]) => {
    const projected = adapter.projectInstructionalFacts({
    snapshotId: event.eventId, facts: current, config: params.document.instructionalController!,
    candidateOptions: { ...params.candidateOptions, ...(student ? { includeCompletedExpectations: false } : {}),
      ...(event.type === 'document-loaded' ? { weights: { frontierWeight: 0, coherenceWeight: 0, centralityWeight: 1 } } : {}) },
    });
    return competitive ? { ...projected, facts: competitiveCandidateFacts([...current, ...projected.facts], SPARC_DYNAMIC_TARGET_LOGIT).slice(current.length) } : projected;
  };
  const assertions = (values: readonly SparcWorkingMemoryFact[], persist = false) => values.map((fact) => ({ fact, persist,
    identitySlots: fact.factType === 'learningTarget.score' ? { clusterKC: fact.slots?.clusterKC }
      : fact.factType === 'diagnostic.misconceptionScore' ? { id: fact.slots?.id }
        : fact.factType === 'instructional.candidate' ? { snapshotId: fact.slots?.snapshotId, targetKey: fact.slots?.targetKey }
          : fact.factType === 'dialogue.utterance' ? { utteranceId: fact.slots?.utteranceId } : {},
  }));
  const menuFrom = (args: Readonly<Record<string, unknown>>): SparcWorkingMemoryFact => {
    if (!student || !Array.isArray(args.options) || !args.targetId || !args.nextTargetId) throw new Error('Menu requires student options and bound targets');
    const options = args.options.map((option: Omit<MenuOption, 'targetId' | 'targetKind'>) => ({ ...option,
      targetId: String(option.id === 'next-target' ? args.nextTargetId : args.targetId),
      targetKind: option.id === 'next-target' ? 'expectation' : args.targetKind,
    }));
    return { factType: 'instructional.menu', slots: { snapshotId: event.eventId, menuId: `${params.document.id}:menu:${event.time}`, status: 'pending', options } };
  };
  const generate: SparcProductionActionHandler = async ({ facts: current, ruleId, actionId }) => {
    const request = { ...createSparcUtteranceRequestFromFacts(current), historySessionId: params.core.sessionID, learnerText: String(event.payload?.input ||
      current.filter((fact) => fact.factType === 'dialogue.utterance' && fact.slots?.speaker === 'learner').at(-1)?.slots?.text || '') };
    if ((!request.learnerText && !isSparcCategorizedPolicy(params.document.instructionalController?.policyId))
      || request.sourceRuleId !== ruleId || request.selectedAction.snapshotId !== event.eventId
      || (actionId !== SPARC_AUTOTUTOR_GENERATE_ACTION && actionId !== request.action)) throw new Error('Instruction requires the firing production decision and response context');
    const decisions = current.filter((fact) => fact.factType === 'instructional.decision' && fact.slots?.snapshotId === event.eventId);
    if (decisions.length !== 1 || decisions[0]!.slots?.action !== request.action || decisions[0]!.slots?.targetId !== request.targetId) throw new Error('Conflicting instructional decision');
    if (student && (request.targetId !== event.payload?.targetId || decisions[0]!.slots?.targetKind !== event.payload?.targetKind)) {
      throw new Error('Instructional decision changed the offered target');
    }
    const menu = current.find((fact) => fact.factType === 'instructional.menu');
    const menuConsumed = { factType: 'instructional.menu', slots: { ...menu?.slots, snapshotId: event.eventId,
      status: 'consumed', ...(student ? { selectedOptionId: event.payload?.optionId } : {}) } };
    await saveDecision(current);
    const realized: Partial<{ -readonly [K in keyof SparcInstructionComponents]: SparcInstructionComponents[K] }> = {};
    const savedComponents = new Set<string>();
    for (const prior of previous.filter(entry => entry.transitionId.startsWith(`${event.eventId}:primitive:`))) {
      const component = prior.transitionId.split(':').at(-1) as 'explanation' | 'richContent' | 'question';
      const node = (prior.writes[0]?.value as { node?: Record<string, unknown> })?.node;
      if (!node || typeof node.value !== 'string') throw new Error('Saved instructional primitive is invalid');
      realized[component] = node.value;
      if (node.administrativeRemoval) realized.removedComponents = [...(realized.removedComponents ?? []), component];
      if (node.video) realized.video = node.video as NonNullable<SparcInstructionComponents['video']>;
      if (node.figure) realized.figure = node.figure as NonNullable<SparcInstructionComponents['figure']>;
      if (node.choices) realized.choices = node.choices as NonNullable<SparcInstructionComponents['choices']>;
      if (node.supportHeading) realized.supportHeading = String(node.supportHeading);
      savedComponents.add(component);
    }
    const output = await params.generateTutorUtterance({ ...request, realizedInstruction: realized,
      onInstructionComponent: async (component, text, figure, details) => {
        await waitForFeedback();
        const write = createSparcInstructionComponentWrite({ document: params.document, event, request, component, text, ...(figure ? { figure } : {}), ...(details ? { details } : {}) });
        await save({ transitionId: `${event.eventId}:primitive:${component}`, event, writes: [write] });
        savedComponents.add(component);
      },
    });
    await waitForFeedback();
    const transition = createSparcInstructionTransition({ document: params.document, event, learnerText: request.learnerText, request, generated: output, includeLearner: false });
    generatedRequest = request;
    generated = true;
    return { assertions: [...assertions(student ? [menuConsumed] : [], true)], writes: [...transition.writes.filter(write => {
      const id = (write.value as { node?: { id?: string } })?.node?.id;
      return !id || !savedComponents.has(id.substring(`${event.eventId}:`.length));
    }), ...inputControls(event, !isSparcChoiceFormat(request.moveDefinition.responseFormat)
      && !(typeof output === 'object' && 'removedComponents' in output && output.removedComponents?.includes('question')))] };
  };
  const actions: Record<string, SparcProductionActionHandler> = {
    [SPARC_FEEDBACK_ACTION]: async ({ facts: current, ruleId }) => {
      const realizeFeedback = async (): Promise<SparcStateTransition> => {
      let transition = acceptedFeedback;
      if (!transition) {
        const request = { ...createSparcFeedbackRequest(current, event, ruleId), historySessionId: params.core.sessionID };
        let feedbackSaved = false;
        const output = await params.generateTutorUtterance({ ...request, onFeedback: async (text, reference) => {
          const saved = createSparcInstructionTransition({ document: params.document, event, learnerText: request.learnerText!, request, generated: text, includeLearner: false });
          for (const write of saved.writes) {
            const operation = write.value as { node?: Record<string, unknown> };
            if (operation.node) operation.node.primitiveReference = reference;
          }
          transition = { ...saved, transitionId: `${event.eventId}:feedback` };
          await save(transition); feedbackSaved = true;
        } });
        const realized = createSparcInstructionTransition({ document: params.document, event, learnerText: request.learnerText!, request, generated: output, includeLearner: false });
        if (!feedbackSaved) { transition = { ...realized, transitionId: `${event.eventId}:feedback` };
          await save(transition); }
      }
      if (!transition) throw new Error('Feedback checkpoint was not saved');
      return transition;
      };
      if (competitive) {
        feedbackWork ??= realizeFeedback().then(transition => ({ ok: true as const, transition }), error => ({ ok: false as const, error }));
        return { assertions: assertions([{ factType: SPARC_FEEDBACK_STARTED, slots: { snapshotId: event.eventId } }]), writes: [] };
      }
      const transition = await realizeFeedback();
      return { assertions: assertions(progressiveDialogueFacts({ transitions: [transition] })), writes: [] };
    },
    [SPARC_AUTOTUTOR_EVALUATE_ACTION]: async ({ facts: current }) => {
      let acceptedFacts: SparcWorkingMemoryFact[];
      let learnerWrites: SparcStateWrite[] = [];
      if (acceptedAssessment) {
        // Score changes live in their own rows. Rehydrate carried values before
        // continuing an accepted assessment, including existing bundled histories.
        const restored = [...createSparcLearnerResponseScoreFacts({ facts: current, score: {} }), ...writtenFacts(acceptedAssessment)];
        acceptedFacts = [...new Map(factWrites(restored, event).map((write, i) => [write.key, restored[i]!])).values()];
      }
      else {
        const scoreFacts = createSparcLearnerResponseScoreFacts({ facts: current, score: await params.scoreLearnerResponse() });
        const scoreTypes = new Set(scoreFacts.map((fact) => fact.factType));
        const scored = [...current.filter((fact) => !scoreTypes.has(fact.factType)), ...scoreFacts];
        const derived = adapter.deriveControllerFacts(scored);
        const projected = projection([...scored, ...derived]);
        let completed = !projected.candidates.expectations.some((candidate) => candidate.coverage < candidate.goalValue)
          && !projected.candidates.misconceptions.some((candidate) => candidate.eligible);
        const modelFacts = competitive ? competitiveAssessmentFacts({ facts: current, scoreFacts, snapshotId: event.eventId,
          coverageThreshold: projected.candidates.coverageThreshold,
          misconceptionThreshold: projected.candidates.misconceptionThreshold,
        }) : [];
        if (competitive) completed = !projection([...scored, ...derived, ...modelFacts]).facts.some((fact) => fact.factType === 'instructional.candidate' && fact.slots?.eligible === true);
        acceptedFacts = [...scoreFacts, ...derived.map((fact) => fact.factType === 'controller.completionState'
          ? { ...fact, slots: { ...fact.slots, completed, reason: completed ? 'required-coverage' : 'in-progress' } } : fact)];
        const changes = competitive ? undefined : expectationLogitChangesFromScoreFacts(current, scoreFacts);
        learnerWrites = [{ target: { pageKey: params.document.id, nodeId: 'root' }, key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
          value: { type: 'append-node', boxId: 'dialogue-flow', node: { id: `${event.eventId}:learner`, nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'learner', value: event.payload?.input, turnEventId: event.eventId } } }];
        const scoreChangeFacts = scoreFacts.filter((fact) => {
          const expectation = fact.factType === 'learningTarget.score';
          if (!expectation && fact.factType !== 'diagnostic.misconceptionScore') return false;
          const identity = expectation ? 'clusterKC' : 'id';
          const value = expectation ? 'coverage' : 'supportStrength';
          const prior = current.find(entry => entry.factType === fact.factType && entry.slots?.[identity] === fact.slots?.[identity]);
          return fact.slots?.[value] !== (prior?.slots?.[value] ?? 0);
        });
        const evidenceChanges = scoreFacts.filter(fact => fact.factType === 'instructional.evidence'
          && JSON.stringify(current.find(prior => prior.factType === fact.factType && prior.factId === fact.factId)?.slots) !== JSON.stringify(fact.slots));
        const records = evidenceChanges.map(fact => historyRecord({ transitionId: `${event.eventId}:assessment:evidence:${fact.factId}`,
          event, writes: factWrites([fact], event) }));
        records.push(...scoreChangeFacts.map(fact => {
          const expectation = fact.factType === 'learningTarget.score';
          const id = String(expectation ? fact.slots?.clusterKC : fact.slots?.id);
          return historyRecord({ transitionId: `${event.eventId}:assessment:score:${expectation ? 'expectation' : 'misconception'}:${id}`,
            event, writes: factWrites([fact], event) }, changes?.filter(change => change.clusterKC === id));
        }));
        records.push(historyRecord({ transitionId: `${event.eventId}:assessment`, event,
          writes: [...factWrites(acceptedFacts.filter(fact => !['learningTarget.score', 'diagnostic.misconceptionScore', 'instructional.evidence'].includes(fact.factType)), event), ...learnerWrites] }));
        if (!params.runtime.history.writeCanonicalHistoryBatch) throw new Error('SPARC assessments require an atomic history batch writer');
        await params.runtime.history.writeCanonicalHistoryBatch(records);
      }
      if (competitive && !acceptedFacts.some(fact => fact.factType === 'instructional.modelObservation')) {
        // The assessment is the durable evidence checkpoint. Each target's derived
        // observations form one atomic model update, keeping seven-KC records bounded.
        // Replay reuses the assessment and each accepted update without another AI call.
        const thresholds = projection([...current, ...acceptedFacts]).candidates;
        const modelFacts = competitiveAssessmentFacts({ facts: current, scoreFacts: acceptedFacts, snapshotId: event.eventId,
          coverageThreshold: thresholds.coverageThreshold, misconceptionThreshold: thresholds.misconceptionThreshold });
        const updates = new Map<string, SparcWorkingMemoryFact[]>();
        for (const fact of modelFacts) {
          const key = String(fact.slots!.targetKey);
          updates.set(key, [...(updates.get(key) ?? []), fact]);
        }
        for (const [key, update] of updates) {
          const id = `${event.eventId}:assessment:model:${key}`;
          const accepted = previous.find(entry => entry.transitionId === id);
          if (!accepted) await save({ transitionId: id, event, writes: factWrites(update, event) });
          acceptedFacts.push(...(accepted ? writtenFacts(accepted) : update));
        }
      }
      const types = new Set(acceptedFacts.map((fact) => fact.factType));
      const scored = [...current.filter((fact) => !types.has(fact.factType)
        || (['instructional.modelObservation', 'instructional.oet'].includes(fact.factType)
          && !acceptedFacts.some((accepted) => accepted.factType === fact.factType && accepted.factId === fact.factId))), ...acceptedFacts];
      const projected = projection(scored);
      return { assertions: assertions([...acceptedFacts, ...projected.facts,
        ...progressiveDialogueFacts({ transitions: [{ transitionId: 'projection', event, writes: learnerWrites }] }),
      ]), writes: [] };
    },
    [SPARC_AUTOTUTOR_GENERATE_ACTION]: generate,
    ...Object.fromEntries(SPARC_CATEGORIZED_MOVE_DEFINITIONS.map((definition) => [definition.moveId, generate])),
    [SPARC_MENU_ACTION]: async ({ args }) => {
      menuOffered = true;
      return { assertions: assertions([menuFrom(args)], true), writes: inputControls(event, false) };
    },
    [SPARC_NEXT_TARGET_ACTION]: async ({ facts: current }) => {
      await saveDecision(current);
      const decision = current.find((fact) => fact.factType === 'instructional.decision' && fact.slots?.snapshotId === event.eventId);
      const candidate = projection(current).facts.find((fact) => fact.factType === 'instructional.candidate' && fact.slots?.targetId === decision?.slots?.targetId && fact.slots?.targetKind === 'expectation');
      const menu = current.find((fact) => fact.factType === 'instructional.menu');
      menuOffered = true;
      return { assertions: assertions([menuFrom({ options: menu?.slots?.options, targetKind: 'expectation', targetId: decision?.slots?.targetId, nextTargetId: candidate?.slots?.nextTargetId })], true), writes: inputControls(event, false) };
    },
    [SPARC_STOP_ACTION]: async () => { stopped = true; return { assertions: [], writes: inputControls(event, false) }; },
  };
  if (event.type === 'document-loaded') {
    if (!isSparcCategorizedPolicy(params.document.instructionalController?.policyId)) throw new Error('Document startup requires a categorized instructional policy');
    const derived = adapter.deriveControllerFacts(facts);
    documentLoadFacts = derived;
    facts.push(...derived, ...projection([...facts, ...derived]).facts);
  }
  if (event.type === 'choice-selected') {
    const pending = params.replayState && currentSparcMenu(params.replayState);
    if (!acceptedDecision) {
      const option = (pending?.slots?.options as MenuOption[] | undefined)?.find((entry) => entry.id === event.payload?.optionId);
      const nextTarget = (pending?.slots?.options as MenuOption[] | undefined)?.find(entry => entry.id === 'next-target');
      const matchesTarget = (candidate?: MenuOption) => Boolean(candidate && candidate.targetId === event.payload?.targetId && candidate.targetKind === event.payload?.targetKind);
      if (!student || pending?.slots?.status !== 'pending' || pending.slots.menuId !== event.payload?.menuId || !option
        || (!matchesTarget(option) && !matchesTarget(nextTarget))) throw new Error('Stale or invalid instructional choice');
    }
    facts.push(...projection(facts).facts);
  }
  let execution: SparcProductionRuleExecution;
  let transition: SparcStateTransition;
  try {
  if (acceptedDecision) {
    // Rebuild this response's assessment projection before continuing its saved
    // decision. Its candidate diagnostics are part of persisted tutor nodes, so
    // omitting them makes an overlapping original/resumed write conflict.
    if (acceptedAssessment) facts.push(...writtenFacts(acceptedAssessment).filter(fact => RESPONSE_LOCAL_FACT_TYPES.has(fact.factType)));
    facts = [...facts.filter((fact) => !DECISION_STATE_FACT_TYPES.has(fact.factType)), ...writtenFacts(acceptedDecision)];
    facts.push(...projection(facts).facts);
    const decision = facts.find((fact) => fact.factType === 'instructional.decision');
    const ruleId = String(decision?.slots?.sourceRuleId);
    const action = String(decision?.slots?.action);
    const rule = params.document.productionRules?.find((entry) => entry.id === ruleId);
    const invocation = rule?.then.find((effect) => effect.type === 'invoke-action' && (effect.actionId === action || effect.actionId === SPARC_AUTOTUTOR_GENERATE_ACTION));
    if (!invocation || invocation.type !== 'invoke-action') throw new Error('Accepted decision no longer matches its authored production');
    if (competitive && event.type === 'response-submitted' && !acceptedFeedback) {
      if (!acceptedAssessment) throw new Error('Accepted response decision requires its saved assessment');
      const feedbackFacts = [...facts, ...writtenFacts(acceptedAssessment).filter(fact => RESPONSE_LOCAL_FACT_TYPES.has(fact.factType))];
      await actions[SPARC_FEEDBACK_ACTION]!({ facts: [...feedbackFacts, ...projection(feedbackFacts).facts],
        ruleId: 'instruction.dynamic.feedback', actionId: SPARC_FEEDBACK_ACTION, args: {} });
    }
    const result = await actions[invocation.actionId]!({ facts, ruleId, actionId: invocation.actionId, args: {} });
    transition = { transitionId: `${event.eventId}:cycle`, event, writes: [...result.writes, ...factWrites(result.assertions.filter((entry) => entry.persist).map((entry) => entry.fact), event)] };
    execution = { initialFacts: facts, facts, firings: [], cycles: 0 };
  } else {
    execution = await runSparcProductionRulesWithActions({ facts, rules: params.document.productionRules ?? [], actions,
      ...(competitive ? { selectActivation: (activations) => selectCompetitiveActivation(activations, params.document.productionRules ?? []) } : {}),
      ...(params.maxProductionRuleCycles !== undefined ? { maxCycles: params.maxProductionRuleCycles } : {}) });
    const result = createProductionRuleTransition({ document: params.document, event, execution });
    if (!result || (!generated && !menuOffered && !stopped)) throw new Error('Instructional productions did not produce instruction, a menu, or a natural stop');
    // Assessment and decision already own their durable facts. The generic rule
    // trace also contains transient assertions and dialogue history; embedding it
    // here duplicates those records and makes each turn grow with the lesson.
    transition = { ...result, event, transitionId: `${event.eventId}:cycle` };
  }
  } finally {
    // Do not leave a provider/history operation running after this turn fails.
    await waitForFeedback();
  }
  if (documentLoadFacts.length) transition = { ...transition, writes: [...transition.writes, ...factWrites(documentLoadFacts, event)] };
  // The decision checkpoint already owns these facts. Both generation paths
  // finish with the same controls/completion writes rather than repeating the
  // original production's decision assertions only on its first execution.
  if (generated) transition = { ...transition, writes: transition.writes.filter(write =>
    !DECISION_STATE_FACT_TYPES.has((write.value as SparcWorkingMemoryFact)?.factType)) };
  finalRecord = await save(transition);
  return { transition, historyRecord: finalRecord, execution, ...(generatedRequest ? { utteranceRequest: generatedRequest } : {}) };
}
