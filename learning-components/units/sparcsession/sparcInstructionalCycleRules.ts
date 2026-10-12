import type { SparcProductionRule, SparcProductionRuleCondition, SparcProductionRuleEffect } from './sparcSessionContracts';
import { createSparcProgressiveScaffoldingRules, decisionEffects, startedCycle, SPARC_AUTOTUTOR_GENERATE_ACTION } from './sparcProgressiveScaffoldingRules';

export const SPARC_MENU_ACTION = 'instruction.offer-menu';
export const SPARC_NEXT_TARGET_ACTION = 'instruction.next-target';
export const SPARC_STOP_ACTION = 'instruction.stop';
const literal = (value: unknown) => ({ type: 'literal' as const, value });
const variable = (name: string) => ({ type: 'variable' as const, name });
const bind = (variable: string) => ({ type: 'bind' as const, variable });
const bound = (variable: string) => ({ type: 'bound' as const, variable });

// Authored THEN options, not a second move registry. Their actions use the existing registry.
export const SPARC_INSTRUCTIONAL_MENU_OPTIONS = [
  { id: 'pump', label: 'Pump', action: 'pump' },
  { id: 'prompt', label: 'Prompt (unsupported)', action: 'prompt' },
  { id: 'prompt-supported', label: 'Prompt (supported)', action: 'prompt-supported' },
  { id: 'hint', label: 'Hint', action: 'hint' },
  { id: 'assertion', label: 'Assertion', action: 'assertion' },
  { id: 'next-target', label: 'Move to the next KC', action: SPARC_NEXT_TARGET_ACTION },
];

function eventPattern(type: string): SparcProductionRuleCondition {
  return { factType: 'interface-event', slots: { eventType: literal(type), eventId: bind('snapshotId'), pageKey: bind('pageKey') } };
}
const assessment: SparcProductionRuleCondition = { factType: 'instructional.assessmentSnapshot', slots: { snapshotId: bound('snapshotId') } };
const noDecision: SparcProductionRuleCondition = { type: 'not', pattern: { factType: 'instructional.decision', slots: { snapshotId: bound('snapshotId') } } };

export function createSparcInstructionalCycleRules(version: 'student' | 'agent'): readonly SparcProductionRule[] {
  const original = createSparcProgressiveScaffoldingRules();
  if (version === 'agent') {
    return original.filter((rule) => rule.id !== 'dialogue.completion.summary').map((rule) => {
      const action = rule.id.endsWith('pump-no-progress') ? 'instruction.question'
        : rule.id.endsWith('prompt-no-progress') ? 'instruction.explanation-question'
          : rule.id.endsWith('hint-no-progress') ? 'instruction.rich-question'
            : rule.id.endsWith('.assertion') ? 'instruction.explanation-rich-question' : undefined;
      if (!action) return rule;
      return { ...rule, then: rule.then.map((effect): SparcProductionRuleEffect => {
        if (effect.type === 'invoke-action' && effect.actionId === SPARC_AUTOTUTOR_GENERATE_ACTION) return { ...effect, actionId: action };
        if (effect.type === 'assert-fact' && ['instructional.decision', 'controller.selectedAction'].includes(effect.fact.factType)) {
          return { ...effect, fact: { ...effect.fact, slots: { ...effect.fact.slots, action: literal(action) } } };
        }
        return effect;
      }) };
    }).concat({ id: 'instruction.agent.stop', salience: 110,
      when: [eventPattern('response-submitted'), assessment, noDecision,
        { type: 'not', pattern: { factType: 'instructional.candidate', slots: { snapshotId: bound('snapshotId'), eligible: literal(true) } } }],
      then: [{ type: 'invoke-action', actionId: SPARC_STOP_ACTION }],
    });
  }

  // Each student IF retains the offered target and directly selects the named move.
  const selections = SPARC_INSTRUCTIONAL_MENU_OPTIONS.flatMap((option) =>
    (['expectation', 'misconception'] as const).map((kind): SparcProductionRule => {
      const id = `instruction.student.choose.${option.id}.${kind}`;
      return { id, when: [eventPattern('choice-selected'), assessment, noDecision,
        { factType: 'interface-event', slots: { optionId: literal(option.id), targetKind: literal(kind), targetId: bind('targetId') } },
        { factType: 'instructional.candidate', slots: { snapshotId: bound('snapshotId'), targetKind: literal(kind), targetId: bound('targetId'), targetKey: bind('targetKey'), currentValue: bind('currentValue') } },
        { factType: 'session.turnState', slots: { turnCount: bind('turnNumber') } },
      ], then: decisionEffects({ targetKind: kind, action: option.action, stage: option.id === 'next-target' ? 'PUMP' : option.action === 'prompt-supported' ? 'PROMPT' : option.action.toUpperCase(), transition: 'student-choice', sourceRuleId: id, reason: 'offered-option-selected', startsCycle: true })
        .map((effect) => effect.type === 'invoke-action' && option.id === 'next-target' ? { ...effect, actionId: SPARC_NEXT_TARGET_ACTION } : effect) };
    }));
  return [original[0]!, {
    id: 'instruction.student.target.initial', salience: 120,
    when: [eventPattern('response-submitted'), assessment,
      { type: 'not', pattern: { factType: 'instructional.activeCycle', slots: { status: literal('active') } } },
      { factType: 'instructional.candidate', slots: { snapshotId: bound('snapshotId'), targetKind: literal('expectation'), isMaximumWithinKind: literal(true), targetId: bind('targetId'), targetKey: bind('targetKey'), currentValue: bind('currentValue') } },
      { factType: 'session.turnState', slots: { turnCount: bind('turnNumber') } },
    ], then: [{ type: 'assert-fact', persist: true, identitySlots: [], fact: startedCycle('expectation', 'PUMP') }],
  }, {
    id: 'instruction.student.menu',
    when: [eventPattern('response-submitted'), assessment,
      { factType: 'instructional.activeCycle', slots: { targetKind: bind('targetKind'), targetId: bind('targetId'), status: literal('active') } },
      { factType: 'instructional.candidate', slots: { snapshotId: bound('snapshotId'), targetKind: bound('targetKind'), targetId: bound('targetId'), nextTargetId: bind('nextTargetId') } },
      { type: 'not', pattern: { factType: 'instructional.menu', slots: { snapshotId: bound('snapshotId') } } },
    ], then: [{ type: 'invoke-action', actionId: SPARC_MENU_ACTION, args: {
      options: literal(SPARC_INSTRUCTIONAL_MENU_OPTIONS), targetKind: variable('targetKind'), targetId: variable('targetId'), nextTargetId: variable('nextTargetId'),
    } }],
  }, ...selections];
}
