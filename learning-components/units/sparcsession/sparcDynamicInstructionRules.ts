import type { SparcProductionRule, SparcProductionRuleCondition, SparcProductionRuleEffect, SparcFactPattern } from './sparcSessionContracts';
import { SPARC_DYNAMIC_MOVE_DEFINITIONS, SPARC_CATEGORIZED_MOVE_DEFINITIONS } from './sparcMoveDefinitions';
import { SPARC_TARGET_CATEGORIES } from '../../runtime/sparcTargetCategories';
import { SPARC_INSTRUCTIONAL_COMPETITION_MODULE } from './sparcCompetitiveSelection';
import { createSparcProgressiveScaffoldingRules, decisionEffects, instructionalTargetConditions, startedCycle } from './sparcProgressiveScaffoldingRules';
import { SPARC_MENU_ACTION, SPARC_NEXT_TARGET_ACTION, SPARC_STOP_ACTION } from './sparcInstructionalCycleRules';

export const SPARC_FEEDBACK_ACTION = 'instruction.feedback';
export const SPARC_DYNAMIC_TARGET_LOGIT = Math.log(0.8 / 0.2);
export const SPARC_DYNAMIC_MENU_OPTIONS = [
  { id: 'question', label: 'Question', action: 'instruction.dynamic.question' },
  { id: 'explanation-question', label: 'Explanation and question', action: 'instruction.dynamic.explanation-question' },
  { id: 'explanation-rich-question', label: 'Explanation with example or figure and question', action: 'instruction.dynamic.explanation-rich-question' },
  { id: 'next-target', label: 'Move to the next KC', action: SPARC_NEXT_TARGET_ACTION },
] as const;
export const SPARC_CATEGORIZED_MENU_OPTIONS = [
  ...SPARC_CATEGORIZED_MOVE_DEFINITIONS.map(move => ({
    id: move.moveId.substring('instruction.dynamic.'.length), action: move.moveId,
    label: `${move.components!.includes('richContent') ? 'Explanation with example or figure and question' : move.components!.includes('explanation') ? 'Explanation and question' : 'Question'} (${move.responseFormat === 'text' ? 'text answer' : 'multiple choice'})`,
  })),
  SPARC_DYNAMIC_MENU_OPTIONS[3],
];
const literal = (value: unknown) => ({ type: 'literal' as const, value });
const variable = (name: string) => ({ type: 'variable' as const, name });
const bind = (variable: string) => ({ type: 'bind' as const, variable });
const bound = (variable: string) => ({ type: 'bound' as const, variable });
const event = (eventType: string): SparcProductionRuleCondition => ({ factType: 'interface-event', slots: { eventType: literal(eventType), eventId: bind('snapshotId') } });
const assessed: SparcProductionRuleCondition = { factType: 'instructional.assessmentSnapshot', slots: { snapshotId: bound('snapshotId') } };
const feedback: SparcFactPattern = { factType: 'dialogue.utterance', slots: { eventId: bound('snapshotId'), action: literal(SPARC_FEEDBACK_ACTION), speaker: literal('tutor') } };
const completion = (completed: boolean): SparcProductionRuleCondition => ({ factType: 'controller.completionState', slots: { completed: literal(completed) } });
const undecided: SparcProductionRuleCondition = { type: 'not', pattern: { factType: 'instructional.decision', slots: { snapshotId: bound('snapshotId') } } };
const turn: SparcProductionRuleCondition = { factType: 'session.turnState', slots: { turnCount: bind('turnNumber') } };

/** Rules own evaluation -> saved feedback -> selection; eligible move/format alternatives compete on one target. */
export function createSparcDynamicInstructionRules(version: 'student' | 'agent', categorized = false): readonly SparcProductionRule[] {
  const moves = categorized ? SPARC_CATEGORIZED_MOVE_DEFINITIONS : SPARC_DYNAMIC_MOVE_DEFINITIONS;
  const options = categorized ? SPARC_CATEGORIZED_MENU_OPTIONS : SPARC_DYNAMIC_MENU_OPTIONS;
  const categories = categorized ? SPARC_TARGET_CATEGORIES : [undefined];
  const categoryCondition = (kind: string, category: string | undefined): SparcProductionRuleCondition[] => category === undefined ? [] : [{
    factType: kind === 'expectation' ? 'autotutor.expectation' : 'autotutor.misconception',
    slots: { [kind === 'expectation' ? 'clusterKC' : 'id']: bound('targetId'), category: literal(category) },
  }];
  const evaluation = createSparcProgressiveScaffoldingRules().find((rule) => rule.id === 'dialogue.response.evaluate')!;
  const shared: SparcProductionRule[] = [evaluation, {
    id: 'instruction.dynamic.feedback', when: [event('response-submitted'), assessed, { type: 'not', pattern: feedback }],
    then: [{ type: 'invoke-action', actionId: SPARC_FEEDBACK_ACTION }],
  }, {
    id: 'instruction.dynamic.stop', when: [event('response-submitted'), assessed, feedback, completion(true), undecided],
    then: [{ type: 'invoke-action', actionId: SPARC_STOP_ACTION }],
  }];
  if (version === 'agent') {
    const rules = moves.flatMap((move) => categories.flatMap(category => (['expectation', 'misconception'] as const).flatMap((kind) =>
      (kind === 'expectation' ? ['start', 'continue'] as const : ['start', 'continue', 'interrupt'] as const).map((transition): SparcProductionRule => {
        const id = `instruction.dynamic.agent.${kind}.${transition}.${move.moveId}${category ? `.${category}` : ''}`;
        const effects = decisionEffects({ targetKind: kind, action: move.moveId, stage: 'DYNAMIC', transition, sourceRuleId: id, reason: 'oet-distance', startsCycle: transition !== 'continue' });
        return { id, module: SPARC_INSTRUCTIONAL_COMPETITION_MODULE,
          when: [event('response-submitted'), assessed, feedback, completion(false), undecided,
            ...instructionalTargetConditions(kind, transition),
            ...categoryCondition(kind, category),
            { factType: 'instructional.candidate', slots: { snapshotId: bound('snapshotId'), targetKind: literal(kind), targetId: bound('targetId'), eligible: literal(true), expectancyLogit: bind('expectancyLogit'), oetLogit: bind('oetLogit') } },
            { factType: 'instructional.move', slots: { action: literal(move.moveId), assistance: bind('assistance') } }, turn],
          then: effects.map((effect): SparcProductionRuleEffect => effect.type === 'assert-fact' && effect.fact.factType === 'instructional.decision'
            ? { ...effect, fact: { ...effect.fact, slots: { ...effect.fact.slots, expectancyLogit: variable('expectancyLogit'), assistance: variable('assistance'), oetLogit: variable('oetLogit'), utility: variable('utility'), temperature: variable('temperature'), selectionProbability: variable('selectionProbability') } } }
            : effect),
        };
      }))));
    return [...shared, ...rules];
  }
  const menus = (['expectation', 'misconception'] as const).flatMap((kind) =>
    (kind === 'expectation' ? ['start', 'continue'] as const : ['start', 'continue', 'interrupt'] as const).map((transition): SparcProductionRule => ({
      id: `instruction.dynamic.student.menu.${kind}.${transition}`,
      when: [event('response-submitted'), assessed, feedback, completion(false),
        ...instructionalTargetConditions(kind, transition),
        { factType: 'instructional.candidate', slots: { snapshotId: bound('snapshotId'), targetKind: literal(kind), targetId: bound('targetId'), nextTargetId: bind('nextTargetId') } }, turn,
        { type: 'not', pattern: { factType: 'instructional.menu', slots: { snapshotId: bound('snapshotId') } } }],
      then: [
        ...(transition === 'continue' ? [] : [{ type: 'assert-fact' as const, persist: true, identitySlots: [], fact: startedCycle(kind, 'DYNAMIC') }]),
        { type: 'invoke-action', actionId: SPARC_MENU_ACTION, args: { options: literal(options), targetKind: literal(kind), targetId: variable('targetId'), nextTargetId: variable('nextTargetId') } },
      ],
    })));
  const choices = options.flatMap((option) => (option.id === 'next-target' ? [undefined] : categories).flatMap(category => (['expectation', 'misconception'] as const).map((kind): SparcProductionRule => {
    const id = `instruction.dynamic.student.choose.${kind}.${option.id}${category ? `.${category}` : ''}`;
    return { id, when: [event('choice-selected'), assessed, completion(false), undecided,
      { factType: 'interface-event', slots: { optionId: literal(option.id), targetKind: literal(kind), targetId: bind('targetId') } },
      ...categoryCondition(kind, category),
      { factType: 'instructional.candidate', slots: { snapshotId: bound('snapshotId'), targetKind: literal(kind), targetId: bound('targetId'), targetKey: bind('targetKey'), currentValue: bind('currentValue') } }, turn],
      then: decisionEffects({ targetKind: kind, action: option.action, stage: 'DYNAMIC', transition: 'student-choice', sourceRuleId: id, reason: 'offered-option-selected', startsCycle: true })
        .map((effect): SparcProductionRuleEffect => effect.type === 'invoke-action' && option.id === 'next-target' ? { ...effect, actionId: SPARC_NEXT_TARGET_ACTION } : effect),
    };
  })));
  return [...shared, ...menus, ...choices];
}
