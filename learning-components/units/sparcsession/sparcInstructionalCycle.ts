import type { ExpectationLogitChange } from '../../runtime/expectationLogitHistory';
import { SPARC_COMPETITIVE_POLICY_ID } from '../../runtime/sparcInstructionalPolicies';
import { advanceOet, competitiveAssessmentFacts, competitiveCandidateFacts, competitiveMoveFacts, selectCompetitiveActivation, SPARC_ADVANCE_OET_ACTION, targetOet } from './sparcCompetitiveSelection';
import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import { SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY } from '../../trial-displays/sparc/sparcProgressiveNodes';
import { assertCompletedDialogueReplayState, RESPONSE_LOCAL_FACT_TYPES, type SparcAutoTutorRuleTurnParams } from './sparcAutoTutorRuleRuntime';
import { createSparcLearnerResponseScoreFacts, expectationLogitChangesFromScoreFacts } from './sparcLearnerResponseScoring';
import { requireSparcInstructionalAdapter } from './sparcInstructionalAdapterRegistry';
import { SPARC_STUDENT_SELECTED_POLICY_ID } from './sparcInstructionalControl';
import { SPARC_COMPOSITE_MOVE_DEFINITIONS } from './sparcMoveDefinitions';
import { createSparcInstructionTransition } from './sparcInstructionalPrimitives';
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
export function projectSparcMenuOperations(replay: SparcReplayState): Record<string, unknown>[] {
  const menu = currentSparcMenu(replay);
  if (!menu) return [];
  const pending = menu.slots?.status === 'pending' || menu.slots?.status === 'selected';
  const options = pending ? menu.slots?.options as MenuOption[] : [];
  return [{ type: 'insert-node', boxId: 'dialogue-flow', node: {
    id: 'instructional-choice-menu', nodeType: 'group', groupType: 'button-group',
    label: pending ? 'Choose what to do next' : '',
    children: options.map((option) => ({ id: `${String(menu.slots?.menuId)}:${option.id}`, nodeType: 'atomic', atomType: 'button', label: option.label,
      value: option.id, menuId: menu.slots?.menuId, optionId: option.id,
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
  readonly runtime: { readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'> };
}): Promise<SparcCycleResult> {
  const student = params.document.instructionalController?.policyId === SPARC_STUDENT_SELECTED_POLICY_ID;
  const competitive = params.document.instructionalController?.policyId === SPARC_COMPETITIVE_POLICY_ID;
  assertCompletedDialogueReplayState(params.replayState);
  const adapter = requireSparcInstructionalAdapter(params.document.instructionalController);
  const previous = params.replayState?.transitions ?? [];
  for (const transition of previous) {
    const policyId = transition.event.payload?.policyId;
    if (policyId && policyId !== params.document.instructionalController!.policyId) throw new Error('Cannot resume a different instructional version');
  }
  const acceptedEvent = previous.find((transition) => transition.event.eventId === params.event.eventId)?.event;
  if (acceptedEvent && (acceptedEvent.payload?.input !== params.event.payload?.input || acceptedEvent.payload?.optionId !== params.event.payload?.optionId)) {
    throw new Error('Conflicting submission for an accepted instructional event');
  }
  const event: SparcInterfaceEvent = acceptedEvent ?? { ...params.event, payload: { ...params.event.payload, policyId: params.document.instructionalController!.policyId } };
  const completed = previous.find((transition) => transition.transitionId === `${event.eventId}:cycle`);
  if (completed) return { transition: completed };
  const acceptedDecision = previous.find((transition) => transition.transitionId === `${event.eventId}:decision`);
  const acceptedAssessment = previous.find((transition) => transition.transitionId === `${event.eventId}:assessment`);
  let facts = [...buildSparcWorkingMemoryFacts({ ...params, event })].filter((fact) => !RESPONSE_LOCAL_FACT_TYPES.has(fact.factType)
    || (event.type === 'choice-selected' && ['learnerResponse.contribution', 'dialogue.learnerQuestion'].includes(fact.factType)));
  facts.push({ factType: 'dialogue.problemStatement', slots: { text: params.problemStatement } });
  if (competitive) facts.push(...competitiveMoveFacts());
  let finalRecord: SparcCanonicalHistoryRecord | undefined;
  let generatedRequest: SparcUtteranceRequest | undefined;
  let generated = false;
  let menuOffered = false;
  let stopped = false;
  const save = async (transition: SparcStateTransition, changes?: readonly ExpectationLogitChange[]) => {
    const record = createSparcStateTransitionHistoryRecord({ core: params.core, transition, action: `sparc-${transition.transitionId.split(':').at(-1)}`,
      responseValue: event.type === 'response-submitted' ? event.payload?.input ?? '' : '',
      ...(changes ? { expectationLogitChanges: changes } : {}),
    });
    await params.runtime.history.writeCanonicalHistory(record);
    return record;
  };
  const saveDecision = async (current: readonly SparcWorkingMemoryFact[]) => {
    if (acceptedDecision) return;
    const menu = current.find((fact) => fact.factType === 'instructional.menu');
    await save({ transitionId: `${event.eventId}:decision`, event, writes: factWrites([
      ...current.filter((fact) => ['instructional.decision', 'controller.selectedAction', 'instructional.activeCycle', 'dialogue.responseModifier', 'instructional.oet'].includes(fact.factType)),
      ...(student ? [{ factType: 'instructional.menu', slots: { ...menu?.slots, snapshotId: event.eventId,
        status: 'selected', selectedOptionId: event.payload?.optionId } }] : []),
    ], event) });
  };
  const projection = (current: readonly SparcWorkingMemoryFact[]) => {
    const projected = adapter.projectInstructionalFacts({
    snapshotId: event.eventId, facts: current, config: params.document.instructionalController!,
    candidateOptions: { ...params.candidateOptions, ...(student ? { includeCompletedExpectations: true } : {}) },
    });
    return competitive ? { ...projected, facts: competitiveCandidateFacts([...current, ...projected.facts]).slice(current.length) } : projected;
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
    const request = { ...createSparcUtteranceRequestFromFacts(current), learnerText: String(event.payload?.input ||
      current.filter((fact) => fact.factType === 'dialogue.utterance' && fact.slots?.speaker === 'learner').at(-1)?.slots?.text || '') };
    if (!request.learnerText || request.sourceRuleId !== ruleId || request.selectedAction.snapshotId !== event.eventId
      || (actionId !== SPARC_AUTOTUTOR_GENERATE_ACTION && actionId !== request.action)) throw new Error('Instruction requires the firing production decision and response context');
    const decisions = current.filter((fact) => fact.factType === 'instructional.decision' && fact.slots?.snapshotId === event.eventId);
    if (decisions.length !== 1 || decisions[0]!.slots?.action !== request.action || decisions[0]!.slots?.targetId !== request.targetId) throw new Error('Conflicting instructional decision');
    if (student && (request.targetId !== event.payload?.targetId || decisions[0]!.slots?.targetKind !== event.payload?.targetKind)) {
      throw new Error('Instructional decision changed the offered target');
    }
    const menu = current.find((fact) => fact.factType === 'instructional.menu');
    const menuConsumed = { factType: 'instructional.menu', slots: { ...menu?.slots, snapshotId: event.eventId, status: 'consumed' } };
    await saveDecision(current);
    const output = await params.generateTutorUtterance(request);
    const transition = createSparcInstructionTransition({ document: params.document, event, learnerText: request.learnerText, request, generated: output, includeLearner: false });
    generatedRequest = request;
    generated = true;
    return { assertions: [...assertions(student ? [menuConsumed] : [], true)], writes: [...transition.writes, ...inputControls(event, true)] };
  };
  const actions: Record<string, SparcProductionActionHandler> = {
    [SPARC_AUTOTUTOR_EVALUATE_ACTION]: async ({ facts: current }) => {
      let acceptedFacts: SparcWorkingMemoryFact[];
      let learnerWrites: SparcStateWrite[] = [];
      if (acceptedAssessment) acceptedFacts = writtenFacts(acceptedAssessment);
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
        acceptedFacts = [...scoreFacts, ...modelFacts, ...derived.map((fact) => fact.factType === 'controller.completionState'
          ? { ...fact, slots: { ...fact.slots, completed, reason: completed ? 'required-coverage' : 'in-progress' } } : fact)];
        const changes = competitive ? undefined : expectationLogitChangesFromScoreFacts(current, scoreFacts);
        learnerWrites = [{ target: { pageKey: params.document.id, nodeId: 'root' }, key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
          value: { type: 'append-node', boxId: 'dialogue-flow', node: { id: `${event.eventId}:learner`, nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'learner', value: event.payload?.input, turnEventId: event.eventId } } }];
        await save({ transitionId: `${event.eventId}:assessment`, event, writes: [...factWrites(acceptedFacts, event), ...learnerWrites] }, changes);
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
    [SPARC_ADVANCE_OET_ACTION]: async ({ args, facts: current }) => {
      const targetKey = String(args.targetKey);
      return { assertions: assertions([{ factType: 'instructional.oet', factId: targetKey,
        slots: { targetKey, logit: advanceOet(targetOet(current, targetKey), Number(args.increment)) } }], true), writes: [] };
    },
    ...Object.fromEntries(SPARC_COMPOSITE_MOVE_DEFINITIONS.map((definition) => [definition.moveId, generate])),
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
  if (event.type === 'choice-selected') {
    const pending = params.replayState && currentSparcMenu(params.replayState);
    if (!acceptedDecision) {
      const option = (pending?.slots?.options as MenuOption[] | undefined)?.find((entry) => entry.id === event.payload?.optionId);
      if (!student || pending?.slots?.status !== 'pending' || pending.slots.menuId !== event.payload?.menuId || !option
        || option.targetId !== event.payload?.targetId || option.targetKind !== event.payload?.targetKind) throw new Error('Stale or invalid instructional choice');
    }
    facts.push(...projection(facts).facts);
  }
  let execution: SparcProductionRuleExecution;
  let transition: SparcStateTransition;
  if (acceptedDecision) {
    facts = [...facts.filter((fact) => !['instructional.decision', 'controller.selectedAction', 'instructional.activeCycle'].includes(fact.factType)), ...writtenFacts(acceptedDecision)];
    const decision = facts.find((fact) => fact.factType === 'instructional.decision');
    const ruleId = String(decision?.slots?.sourceRuleId);
    const action = String(decision?.slots?.action);
    const rule = params.document.productionRules?.find((entry) => entry.id === ruleId);
    const invocation = rule?.then.find((effect) => effect.type === 'invoke-action' && (effect.actionId === action || effect.actionId === SPARC_AUTOTUTOR_GENERATE_ACTION));
    if (!invocation || invocation.type !== 'invoke-action') throw new Error('Accepted decision no longer matches its authored production');
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
  finalRecord = await save(transition);
  return { transition, historyRecord: finalRecord, execution, ...(generatedRequest ? { utteranceRequest: generatedRequest } : {}) };
}
