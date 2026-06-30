import type {
  SparcFactPattern,
  SparcFactSlotPattern,
  SparcProductionRule,
  SparcProductionRuleCondition,
  SparcProductionRuleExecution,
  SparcProductionRuleEffect,
  SparcProductionRuleFiring,
  SparcProductionRuleTest,
  SparcProgressiveNodeOperationTemplate,
  SparcRuleNumericExpression,
  SparcRuleExpression,
  SparcStateWrite,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import { SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY } from '../../trial-displays/sparc/sparcProgressiveNodes';

type SparcRuleBindings = Record<string, unknown>;
type SparcFactIndex = ReadonlyMap<string, readonly SparcWorkingMemoryFact[]>;

export type SparcProductionRulePlan = {
  readonly sortedRules: readonly SparcProductionRule[];
};

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function requireFiniteNumber(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must evaluate to a finite number`);
  }
  return numberValue;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  const numberValue = requireFiniteNumber(value, label);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${label} must evaluate to a non-negative integer`);
  }
  return numberValue;
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringify(record[key])}`
  )).join(',')}}`;
}

function createFactKey(fact: SparcWorkingMemoryFact): string {
  return stableStringify({
    factId: fact.factId ?? null,
    factType: fact.factType,
    slots: fact.slots ?? {},
  });
}

function createActivationKey(firing: SparcProductionRuleFiring): string {
  return stableStringify({
    ruleId: firing.ruleId,
    bindings: firing.bindings,
  });
}

function requireTwoArgs(args: readonly number[], functionName: string): readonly [number, number] {
  if (args.length !== 2) {
    throw new Error(`SPARC rule function "${functionName}" requires exactly two args`);
  }
  const left = args[0];
  const right = args[1];
  if (left === undefined || right === undefined) {
    throw new Error(`SPARC rule function "${functionName}" requires exactly two args`);
  }
  return [left, right];
}

function integerGcd(left: number, right: number): number {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

function interpolateTemplate(
  template: string,
  bindings: SparcRuleBindings,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, variableName: string) => {
    if (!(variableName in bindings)) {
      return match;
    }
    return String(bindings[variableName]);
  });
}

export function evaluateSparcRuleExpression(
  expression: SparcRuleExpression,
  bindings: Readonly<Record<string, unknown>>,
): unknown {
  switch (expression.type) {
    case 'literal':
      return expression.value;
    case 'variable': {
      const name = requireNonBlank(expression.name, 'SPARC rule expression variable name');
      if (!(name in bindings)) {
        throw new Error(`SPARC rule variable "?${name}" is not bound`);
      }
      return bindings[name];
    }
    case 'function': {
      const args = expression.args.map((arg, index) => requireFiniteNumber(
        evaluateSparcRuleExpression(arg, bindings),
        `SPARC rule function "${expression.name}" arg[${index}]`,
      ));
      switch (expression.name) {
        case 'add':
          return args.reduce((sum, value) => sum + value, 0);
        case 'subtract':
          {
            const [left, right] = requireTwoArgs(args, 'subtract');
            return left - right;
          }
        case 'multiply':
          return args.reduce((product, value) => product * value, 1);
        case 'divide':
          {
            const [left, right] = requireTwoArgs(args, 'divide');
            if (right === 0) {
              throw new Error('SPARC rule function "divide" cannot divide by zero');
            }
            return left / right;
          }
        case 'mod':
          {
            const [left, right] = requireTwoArgs(args, 'mod');
            if (right === 0) {
              throw new Error('SPARC rule function "mod" cannot divide by zero');
            }
            return left % right;
          }
        case 'gcd':
          {
            const [left, right] = requireTwoArgs(args, 'gcd');
            return integerGcd(left, right);
          }
        case 'lcm':
          {
            const [left, right] = requireTwoArgs(args, 'lcm');
            if (left === 0 || right === 0) {
              return 0;
            }
            return Math.abs(Math.trunc(left * right)) / integerGcd(left, right);
          }
      }
    }
  }
}

function compareRuleTest(
  test: SparcProductionRuleTest,
  bindings: SparcRuleBindings,
): boolean {
  const left = evaluateSparcRuleExpression(test.left, bindings);
  const right = test.right === undefined ? undefined : evaluateSparcRuleExpression(test.right, bindings);
  switch (test.op) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'truthy':
      return Boolean(left);
    case 'falsy':
      return !left;
    case 'gt':
      return requireFiniteNumber(left, 'SPARC rule test left') > requireFiniteNumber(right, 'SPARC rule test right');
    case 'gte':
      return requireFiniteNumber(left, 'SPARC rule test left') >= requireFiniteNumber(right, 'SPARC rule test right');
    case 'lt':
      return requireFiniteNumber(left, 'SPARC rule test left') < requireFiniteNumber(right, 'SPARC rule test right');
    case 'lte':
      return requireFiniteNumber(left, 'SPARC rule test left') <= requireFiniteNumber(right, 'SPARC rule test right');
  }
}

function evaluateNumericExpression(
  expression: SparcRuleNumericExpression,
  bindings: SparcRuleBindings,
  label: string,
): number {
  return requireFiniteNumber(
    typeof expression === 'number' ? expression : evaluateSparcRuleExpression(expression, bindings),
    label,
  );
}

function matchSlotPattern(
  pattern: SparcFactSlotPattern,
  actual: unknown,
  bindings: SparcRuleBindings,
  label: string,
): SparcRuleBindings | null {
  switch (pattern.type) {
    case 'literal':
      return actual === pattern.value ? bindings : null;
    case 'bind': {
      const variable = requireNonBlank(pattern.variable, 'SPARC fact slot bind variable');
      if (variable in bindings) {
        return bindings[variable] === actual ? bindings : null;
      }
      return {
        ...bindings,
        [variable]: actual,
      };
    }
    case 'bound': {
      const variable = requireNonBlank(pattern.variable, 'SPARC fact slot bound variable');
      if (!(variable in bindings)) {
        throw new Error(`SPARC fact slot references unbound variable "?${variable}"`);
      }
      return bindings[variable] === actual ? bindings : null;
    }
    case 'range': {
      if (pattern.min === undefined && pattern.max === undefined) {
        throw new Error(`${label} range pattern requires min or max`);
      }
      const actualNumber = Number(actual);
      if (!Number.isFinite(actualNumber)) {
        throw new Error(`${label} range pattern requires a numeric fact-slot value`);
      }
      if (pattern.min !== undefined) {
        const min = evaluateNumericExpression(pattern.min, bindings, `${label} range min`);
        const minInclusive = pattern.minInclusive !== false;
        if (minInclusive ? actualNumber < min : actualNumber <= min) {
          return null;
        }
      }
      if (pattern.max !== undefined) {
        const max = evaluateNumericExpression(pattern.max, bindings, `${label} range max`);
        const maxInclusive = pattern.maxInclusive !== false;
        if (maxInclusive ? actualNumber > max : actualNumber >= max) {
          return null;
        }
      }
      return bindings;
    }
  }
}

function matchFactPattern(
  pattern: SparcFactPattern,
  fact: SparcWorkingMemoryFact,
  bindings: SparcRuleBindings,
): SparcRuleBindings | null {
  const factType = requireNonBlank(pattern.factType, 'SPARC fact pattern factType');
  if (fact.factType !== factType) {
    return null;
  }
  let nextBindings = bindings;
  for (const [slotName, slotPattern] of Object.entries(pattern.slots ?? {})) {
    if (!fact.slots || !(slotName in fact.slots)) {
      return null;
    }
    const matched = matchSlotPattern(
      slotPattern,
      fact.slots[slotName],
      nextBindings,
      `SPARC fact pattern "${factType}" slot "${slotName}"`,
    );
    if (!matched) {
      return null;
    }
    nextBindings = matched;
  }
  return nextBindings;
}

function createFactIndex(facts: readonly SparcWorkingMemoryFact[]): SparcFactIndex {
  const factsByType = new Map<string, SparcWorkingMemoryFact[]>();
  for (const fact of facts) {
    const factType = requireNonBlank(fact.factType, 'SPARC working-memory fact factType');
    const typeFacts = factsByType.get(factType) ?? [];
    typeFacts.push(fact);
    factsByType.set(factType, typeFacts);
  }
  return factsByType;
}

function candidateFactsForPattern(
  pattern: SparcFactPattern,
  factIndex: SparcFactIndex,
): readonly SparcWorkingMemoryFact[] {
  const factType = requireNonBlank(pattern.factType, 'SPARC fact pattern factType');
  return factIndex.get(factType) ?? [];
}

function isNegatedPattern(
  pattern: SparcProductionRuleCondition,
): pattern is Extract<SparcProductionRuleCondition, { type: 'not' }> {
  return 'type' in pattern && pattern.type === 'not';
}

function isAnyCondition(
  pattern: SparcProductionRuleCondition,
): pattern is Extract<SparcProductionRuleCondition, { type: 'any' }> {
  return 'type' in pattern && pattern.type === 'any';
}

function collectBoundVariablesFromFactPattern(
  pattern: SparcFactPattern,
  variables: Set<string>,
): void {
  for (const slotPattern of Object.values(pattern.slots ?? {})) {
    if (slotPattern.type === 'bind') {
      variables.add(requireNonBlank(slotPattern.variable, 'SPARC fact slot bind variable'));
    }
  }
}

function collectBoundVariablesFromCondition(
  condition: SparcProductionRuleCondition,
): Set<string> {
  const variables = new Set<string>();
  if (isNegatedPattern(condition)) {
    return variables;
  }
  if (isAnyCondition(condition)) {
    for (const branch of condition.conditions) {
      for (const variable of collectBoundVariablesFromCondition(branch)) {
        variables.add(variable);
      }
    }
    return variables;
  }
  collectBoundVariablesFromFactPattern(condition, variables);
  return variables;
}

function addVariablesFromTemplate(template: string | undefined, variables: Set<string>): void {
  if (!template) {
    return;
  }
  for (const match of template.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    const variableName = match[1];
    if (variableName) {
      variables.add(variableName);
    }
  }
}

function collectReferencedVariablesFromExpression(
  expression: unknown,
  variables: Set<string>,
): void {
  if (!isRuleExpression(expression)) {
    return;
  }
  if (expression.type === 'variable') {
    variables.add(requireNonBlank(expression.name, 'SPARC rule expression variable name'));
    return;
  }
  if (expression.type === 'function') {
    for (const arg of expression.args) {
      collectReferencedVariablesFromExpression(arg, variables);
    }
  }
}

function collectReferencedVariablesFromTemplateValue(
  value: string | SparcRuleExpression | undefined,
  variables: Set<string>,
): void {
  if (typeof value === 'string') {
    addVariablesFromTemplate(value, variables);
    return;
  }
  collectReferencedVariablesFromExpression(value, variables);
}

function collectReferencedVariablesFromUnknownTemplate(
  value: unknown,
  variables: Set<string>,
): void {
  if (isRuleExpression(value)) {
    collectReferencedVariablesFromExpression(value, variables);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectReferencedVariablesFromUnknownTemplate(entry, variables);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      collectReferencedVariablesFromUnknownTemplate(entry, variables);
    }
  }
}

function collectReferencedVariablesFromFactPattern(
  pattern: SparcFactPattern,
  variables: Set<string>,
): void {
  for (const slotPattern of Object.values(pattern.slots ?? {})) {
    if (slotPattern.type === 'bind' || slotPattern.type === 'bound') {
      variables.add(requireNonBlank(slotPattern.variable, 'SPARC fact slot variable'));
    } else if (slotPattern.type === 'range') {
      collectReferencedVariablesFromExpression(slotPattern.min, variables);
      collectReferencedVariablesFromExpression(slotPattern.max, variables);
    }
  }
}

function collectReferencedVariablesFromCondition(
  condition: SparcProductionRuleCondition,
  variables: Set<string>,
): void {
  if (isNegatedPattern(condition)) {
    collectReferencedVariablesFromFactPattern(condition.pattern, variables);
    return;
  }
  if (isAnyCondition(condition)) {
    for (const branch of condition.conditions ?? []) {
      collectReferencedVariablesFromCondition(branch, variables);
    }
    return;
  }
  collectReferencedVariablesFromFactPattern(condition, variables);
}

function collectReferencedVariablesFromTest(
  test: SparcProductionRuleTest,
  variables: Set<string>,
): void {
  collectReferencedVariablesFromExpression(test.left, variables);
  collectReferencedVariablesFromExpression(test.right, variables);
}

function collectReferencedVariablesFromEffect(
  effect: SparcProductionRuleEffect,
  variables: Set<string>,
): void {
  switch (effect.type) {
    case 'assert-fact':
      addVariablesFromTemplate(effect.fact.factId, variables);
      for (const expression of Object.values(effect.fact.slots ?? {})) {
        collectReferencedVariablesFromExpression(expression, variables);
      }
      break;
    case 'write-state':
      collectReferencedVariablesFromTemplateValue(effect.write.target.documentId, variables);
      collectReferencedVariablesFromTemplateValue(effect.write.target.nodeId, variables);
      collectReferencedVariablesFromExpression(effect.write.value, variables);
      break;
    case 'message':
      addVariablesFromTemplate(effect.template, variables);
      collectReferencedVariablesFromTemplateValue(effect.target?.documentId, variables);
      collectReferencedVariablesFromTemplateValue(effect.target?.nodeId, variables);
      break;
    case 'credit':
      addVariablesFromTemplate(effect.kc, variables);
      break;
    case 'model-practice':
      collectReferencedVariablesFromExpression(effect.clusterIndex, variables);
      collectReferencedVariablesFromTemplateValue(effect.nodeId, variables);
      collectReferencedVariablesFromExpression(effect.responseValue, variables);
      collectReferencedVariablesFromExpression(effect.input, variables);
      break;
    case 'append-node':
    case 'append-node-if-missing':
    case 'insert-node':
    case 'append-text':
      collectReferencedVariablesFromUnknownTemplate(effect, variables);
      break;
    case 'classify':
    case 'terminate-production-phase':
      break;
  }
}

function collectVariablesReferencedOutsideCondition(
  rule: SparcProductionRule,
  conditionIndex: number,
): Set<string> {
  const variables = new Set<string>();
  for (const condition of rule.when.slice(conditionIndex + 1)) {
    collectReferencedVariablesFromCondition(condition, variables);
  }
  for (const test of rule.tests ?? []) {
    collectReferencedVariablesFromTest(test, variables);
  }
  for (const effect of rule.then) {
    collectReferencedVariablesFromEffect(effect, variables);
  }
  return variables;
}

function validateAnyConditionBindings(
  condition: SparcProductionRuleCondition,
  ruleId: string,
  referencedOutside = new Set<string>(),
): void {
  if (isNegatedPattern(condition)) {
    return;
  }
  if (!isAnyCondition(condition)) {
    return;
  }
  if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) {
    throw new Error(`SPARC production rule "${ruleId}" any condition requires at least one branch condition`);
  }
  const branchVariableSets = condition.conditions.map((branch) => {
    validateAnyConditionBindings(branch, ruleId, referencedOutside);
    return collectBoundVariablesFromCondition(branch);
  });
  const unsafeVariables = new Set<string>();
  for (const variables of branchVariableSets) {
    for (const variable of variables) {
      if (
        branchVariableSets.some((branchVariables) => !branchVariables.has(variable))
        && referencedOutside.has(variable)
      ) {
        unsafeVariables.add(variable);
      }
    }
  }
  if (unsafeVariables.size > 0) {
    throw new Error(
      `SPARC production rule "${ruleId}" any condition branch-local bindings are referenced outside the any condition: ${[...unsafeVariables].sort().join(', ')}`,
    );
  }
}

function validateRangeBound(value: unknown, label: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be a finite number`);
    }
    return;
  }
  if (!isRuleExpression(value)) {
    throw new Error(`${label} must be a number or SPARC rule expression`);
  }
}

function validateRangePatternsInFactPattern(
  pattern: SparcFactPattern,
  ruleId: string,
): void {
  for (const [slotName, slotPattern] of Object.entries(pattern.slots ?? {})) {
    if (slotPattern.type !== 'range') {
      continue;
    }
    const label = `SPARC production rule "${ruleId}" fact "${pattern.factType}" slot "${slotName}" range`;
    if (slotPattern.min === undefined && slotPattern.max === undefined) {
      throw new Error(`${label} requires min or max`);
    }
    if (slotPattern.min !== undefined) {
      validateRangeBound(slotPattern.min, `${label} min`);
    }
    if (slotPattern.max !== undefined) {
      validateRangeBound(slotPattern.max, `${label} max`);
    }
  }
}

function validateConditionShape(
  condition: SparcProductionRuleCondition,
  ruleId: string,
): void {
  if (isNegatedPattern(condition)) {
    validateRangePatternsInFactPattern(condition.pattern, ruleId);
    return;
  }
  if (isAnyCondition(condition)) {
    for (const branch of condition.conditions) {
      validateConditionShape(branch, ruleId);
    }
    return;
  }
  validateRangePatternsInFactPattern(condition, ruleId);
}

function findPatternMatches(
  factIndex: SparcFactIndex,
  patterns: readonly SparcProductionRuleCondition[],
  bindings: SparcRuleBindings = {},
): readonly SparcRuleBindings[] {
  const [head, ...tail] = patterns;
  if (!head) {
    return [bindings];
  }
  if (isNegatedPattern(head)) {
    const hasMatch = candidateFactsForPattern(head.pattern, factIndex)
      .some((fact) => matchFactPattern(head.pattern, fact, bindings));
    return hasMatch ? [] : findPatternMatches(factIndex, tail, bindings);
  }
  if (isAnyCondition(head)) {
    if (!Array.isArray(head.conditions) || head.conditions.length === 0) {
      throw new Error('SPARC any production-rule condition requires at least one branch condition');
    }
    return head.conditions.flatMap((condition) => (
      findPatternMatches(factIndex, [condition, ...tail], bindings)
    ));
  }
  const matches: SparcRuleBindings[] = [];
  for (const fact of candidateFactsForPattern(head, factIndex)) {
    const matched = matchFactPattern(head, fact, bindings);
    if (!matched) {
      continue;
    }
    matches.push(...findPatternMatches(factIndex, tail, matched));
  }
  return matches;
}

function instantiateFact(
  effect: Extract<SparcProductionRuleEffect, { type: 'assert-fact' }>,
  bindings: SparcRuleBindings,
): SparcWorkingMemoryFact {
  const slots: Record<string, unknown> = {};
  for (const [slotName, expression] of Object.entries(effect.fact.slots ?? {})) {
    slots[slotName] = evaluateSparcRuleExpression(expression, bindings);
  }
  return {
    ...(effect.fact.factId ? { factId: interpolateTemplate(effect.fact.factId, bindings) } : {}),
    factType: requireNonBlank(effect.fact.factType, 'SPARC asserted fact factType'),
    ...(Object.keys(slots).length > 0 ? { slots } : {}),
  };
}

function instantiateFactIdentitySlots(
  effect: Extract<SparcProductionRuleEffect, { type: 'assert-fact' }>,
  fact: SparcWorkingMemoryFact,
): Readonly<Record<string, unknown>> | undefined {
  if (!Array.isArray(effect.identitySlots)) {
    return undefined;
  }
  const identitySlots: Record<string, unknown> = {};
  const slots = fact.slots ?? {};
  for (const slotName of effect.identitySlots) {
    const normalizedSlotName = requireNonBlank(slotName, 'SPARC assert-fact identitySlots entry');
    if (!(normalizedSlotName in slots)) {
      throw new Error(
        `SPARC assert-fact identity slot "${normalizedSlotName}" is missing from fact "${fact.factType}"`,
      );
    }
    identitySlots[normalizedSlotName] = slots[normalizedSlotName];
  }
  return identitySlots;
}

function evaluateStringTemplateValue(
  value: string | SparcRuleExpression,
  bindings: SparcRuleBindings,
  label: string,
): string {
  const evaluated = typeof value === 'string'
    ? value
    : evaluateSparcRuleExpression(value, bindings);
  return requireNonBlank(evaluated, label);
}

function instantiateWrite(
  effect: Extract<SparcProductionRuleEffect, { type: 'write-state' }>,
  bindings: SparcRuleBindings,
): SparcStateWrite {
  return {
    target: {
      documentId: evaluateStringTemplateValue(
        effect.write.target.documentId,
        bindings,
        'SPARC production rule write target documentId',
      ),
      nodeId: evaluateStringTemplateValue(
        effect.write.target.nodeId,
        bindings,
        'SPARC production rule write target nodeId',
      ),
    },
    key: requireNonBlank(effect.write.key, 'SPARC production rule write key'),
    value: evaluateSparcRuleExpression(effect.write.value, bindings),
  };
}

function isRuleExpression(value: unknown): value is SparcRuleExpression {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.type === 'literal'
    || record.type === 'variable'
    || record.type === 'function';
}

function instantiateTemplateValue(value: unknown, bindings: SparcRuleBindings): unknown {
  if (isRuleExpression(value)) {
    return evaluateSparcRuleExpression(value, bindings);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => instantiateTemplateValue(entry, bindings));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      instantiateTemplateValue(entry, bindings),
    ]));
  }
  return value;
}

function instantiateProgressiveNodeWrite(
  effect: SparcProgressiveNodeOperationTemplate,
  bindings: SparcRuleBindings,
): SparcStateWrite {
  const operation = instantiateTemplateValue(effect, bindings);
  return {
    target: {
      documentId: evaluateStringTemplateValue(
        { type: 'variable', name: 'documentId' },
        bindings,
        'SPARC progressive node operation documentId',
      ),
      nodeId: 'root',
    },
    key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
    value: operation,
  };
}

function instantiateFiring(
  rule: SparcProductionRule,
  bindings: SparcRuleBindings,
): SparcProductionRuleFiring {
  const assertedFacts: SparcWorkingMemoryFact[] = [];
  const persistentAssertedFacts: SparcWorkingMemoryFact[] = [];
  const persistentAssertedFactIdentitySlots: (Readonly<Record<string, unknown>> | undefined)[] = [];
  const writes: SparcStateWrite[] = [];
  const messages: {
    readonly messageType: 'hint' | 'buggy' | 'success' | 'feedback';
    readonly text: string;
    readonly target?: SparcStateWrite['target'];
  }[] = [];
  const modelPracticeObservations: {
    outcome: SparcProductionRuleFiring['modelPracticeObservations'][number]['outcome'];
    clusterIndex?: number;
    nodeId?: string;
    responseValue?: unknown;
    input?: unknown;
  }[] = [];
  const classifications: (SparcProductionRuleFiring['classifications'][number])[] = [];
  const credits: string[] = [];
  let terminatesProductionPhase = false;
  let terminalReason: string | undefined;

  for (const effect of rule.then) {
    switch (effect.type) {
      case 'assert-fact':
        {
        const fact = instantiateFact(effect, bindings);
        assertedFacts.push(fact);
        if (effect.persist !== false) {
          persistentAssertedFacts.push(fact);
          persistentAssertedFactIdentitySlots.push(instantiateFactIdentitySlots(effect, fact));
        }
        break;
        }
      case 'write-state':
        writes.push(instantiateWrite(effect, bindings));
        break;
      case 'message':
        {
        const text = interpolateTemplate(effect.template, bindings);
        const target = effect.target
          ? {
              documentId: evaluateStringTemplateValue(
                effect.target.documentId,
                bindings,
                'SPARC production rule message target documentId',
              ),
              nodeId: evaluateStringTemplateValue(
                effect.target.nodeId,
                bindings,
                'SPARC production rule message target nodeId',
              ),
            }
          : undefined;
        messages.push({
          messageType: effect.messageType,
          text,
          ...(target ? { target } : {}),
        });
        break;
        }
      case 'classify':
        classifications.push(effect.outcome);
        break;
      case 'credit':
        credits.push(requireNonBlank(
          interpolateTemplate(effect.kc, bindings),
          'SPARC production rule credit kc',
        ));
        break;
      case 'model-practice':
        modelPracticeObservations.push({
          outcome: effect.outcome,
          ...(effect.clusterIndex !== undefined
            ? {
                clusterIndex: requireNonNegativeInteger(
                  evaluateSparcRuleExpression(
                    typeof effect.clusterIndex === 'number'
                      ? { type: 'literal', value: effect.clusterIndex }
                      : effect.clusterIndex,
                    bindings,
                  ),
                  'SPARC production rule model-practice clusterIndex',
                ),
              }
            : {}),
          ...(effect.nodeId !== undefined
            ? {
                nodeId: evaluateStringTemplateValue(
                  effect.nodeId,
                  bindings,
                  'SPARC production rule model-practice nodeId',
                ),
              }
            : {}),
          ...(effect.responseValue !== undefined
            ? { responseValue: evaluateSparcRuleExpression(effect.responseValue, bindings) }
            : {}),
          ...(effect.input !== undefined
            ? { input: evaluateSparcRuleExpression(effect.input, bindings) }
            : {}),
        });
        break;
      case 'terminate-production-phase':
        terminatesProductionPhase = true;
        terminalReason = typeof effect.reason === 'string' && effect.reason.trim()
          ? effect.reason.trim()
          : undefined;
        break;
      case 'append-node':
      case 'append-node-if-missing':
      case 'insert-node':
      case 'append-text':
        writes.push(instantiateProgressiveNodeWrite(effect, bindings));
        break;
    }
  }

  return {
    ruleId: rule.id,
    bindings,
    assertedFacts,
    persistentAssertedFacts,
    persistentAssertedFactIdentitySlots,
    writes,
    messages,
    modelPracticeObservations,
    classifications,
    credits,
    terminatesProductionPhase,
    ...(terminalReason ? { terminalReason } : {}),
  };
}

export function evaluateSparcProductionRules(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly rules: readonly SparcProductionRule[];
  readonly compiledPlan?: SparcProductionRulePlan;
}): readonly SparcProductionRuleFiring[] {
  const firings: SparcProductionRuleFiring[] = [];
  const factIndex = createFactIndex(params.facts);
  const sortedRules = params.compiledPlan?.sortedRules ?? compileSparcProductionRulePlan(params.rules).sortedRules;
  for (const rule of sortedRules) {
    const matches = findPatternMatches(factIndex, rule.when);
    for (const bindings of matches) {
      if ((rule.tests ?? []).every((test) => compareRuleTest(test, bindings))) {
        firings.push(instantiateFiring(rule, bindings));
      }
    }
  }
  return firings;
}

export function compileSparcProductionRulePlan(
  rules: readonly SparcProductionRule[],
): SparcProductionRulePlan {
  const sortedRules = [...rules].sort((left, right) => {
    const salienceDelta = (right.salience ?? 0) - (left.salience ?? 0);
    return salienceDelta || left.id.localeCompare(right.id);
  });
  for (const rule of sortedRules) {
    requireNonBlank(rule.id, 'SPARC production rule id');
    if (!Array.isArray(rule.when) || rule.when.length === 0) {
      throw new Error(`SPARC production rule "${rule.id}" requires at least one fact pattern`);
    }
    for (const [conditionIndex, condition] of rule.when.entries()) {
      validateConditionShape(condition, rule.id);
      validateAnyConditionBindings(
        condition,
        rule.id,
        collectVariablesReferencedOutsideCondition(rule, conditionIndex),
      );
    }
    if (!Array.isArray(rule.then)) {
      throw new Error(`SPARC production rule "${rule.id}" then must be an array`);
    }
  }
  return { sortedRules };
}

export function runSparcProductionRules(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly rules: readonly SparcProductionRule[];
  readonly maxCycles?: number;
}): SparcProductionRuleExecution {
  const maxCycles = params.maxCycles ?? 25;
  if (!Number.isInteger(maxCycles) || maxCycles < 1) {
    throw new Error('SPARC production rule maxCycles must be a positive integer');
  }

  const facts: SparcWorkingMemoryFact[] = [...params.facts];
  const factKeys = new Set(facts.map((fact) => createFactKey(fact)));
  const firedActivationKeys = new Set<string>();
  const firings: SparcProductionRuleFiring[] = [];
  const compiledPlan = compileSparcProductionRulePlan(params.rules);

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const nextFiring = evaluateSparcProductionRules({
      facts,
      rules: params.rules,
      compiledPlan,
    }).find((firing) => {
      const activationKey = createActivationKey(firing);
      if (firedActivationKeys.has(activationKey)) {
        return false;
      }
      firedActivationKeys.add(activationKey);
      return true;
    });

    if (!nextFiring) {
      return {
        facts,
        firings,
        cycles: cycle - 1,
      };
    }

    firings.push(nextFiring);
    for (const fact of nextFiring.assertedFacts) {
      const factKey = createFactKey(fact);
      if (factKeys.has(factKey)) {
        continue;
      }
      factKeys.add(factKey);
      facts.push(fact);
    }
    if (nextFiring.terminatesProductionPhase) {
      return {
        facts,
        firings,
        cycles: cycle,
      };
    }
  }

  throw new Error(`SPARC production rules did not quiesce within ${maxCycles} cycles`);
}
