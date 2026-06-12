import type {
  SparcFactPattern,
  SparcFactSlotPattern,
  SparcProductionRule,
  SparcProductionRuleExecution,
  SparcProductionRuleEffect,
  SparcProductionRuleFiring,
  SparcProductionRuleTest,
  SparcRuleExpression,
  SparcStateWrite,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

type SparcRuleBindings = Record<string, unknown>;

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
  const right = evaluateSparcRuleExpression(test.right, bindings);
  switch (test.op) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
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

function matchSlotPattern(
  pattern: SparcFactSlotPattern,
  actual: unknown,
  bindings: SparcRuleBindings,
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
    const matched = matchSlotPattern(slotPattern, fact.slots[slotName], nextBindings);
    if (!matched) {
      return null;
    }
    nextBindings = matched;
  }
  return nextBindings;
}

function findPatternMatches(
  facts: readonly SparcWorkingMemoryFact[],
  patterns: readonly SparcFactPattern[],
  bindings: SparcRuleBindings = {},
): readonly SparcRuleBindings[] {
  const [head, ...tail] = patterns;
  if (!head) {
    return [bindings];
  }
  const matches: SparcRuleBindings[] = [];
  for (const fact of facts) {
    const matched = matchFactPattern(head, fact, bindings);
    if (!matched) {
      continue;
    }
    matches.push(...findPatternMatches(facts, tail, matched));
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

function instantiateFiring(
  rule: SparcProductionRule,
  bindings: SparcRuleBindings,
): SparcProductionRuleFiring {
  const assertedFacts: SparcWorkingMemoryFact[] = [];
  const writes: SparcStateWrite[] = [];
  const messages: {
    readonly messageType: 'hint' | 'buggy' | 'success' | 'feedback';
    readonly text: string;
  }[] = [];
  const classifications: (SparcProductionRuleFiring['classifications'][number])[] = [];
  const credits: string[] = [];

  for (const effect of rule.then) {
    switch (effect.type) {
      case 'assert-fact':
        assertedFacts.push(instantiateFact(effect, bindings));
        break;
      case 'write-state':
        writes.push(instantiateWrite(effect, bindings));
        break;
      case 'message':
        messages.push({
          messageType: effect.messageType,
          text: interpolateTemplate(effect.template, bindings),
        });
        break;
      case 'classify':
        classifications.push(effect.outcome);
        break;
      case 'credit':
        credits.push(requireNonBlank(
          interpolateTemplate(effect.kc, bindings),
          'SPARC production rule credit kc',
        ));
        break;
    }
  }

  return {
    ruleId: rule.id,
    bindings,
    assertedFacts,
    writes,
    messages,
    classifications,
    credits,
  };
}

export function evaluateSparcProductionRules(params: {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly rules: readonly SparcProductionRule[];
}): readonly SparcProductionRuleFiring[] {
  const firings: SparcProductionRuleFiring[] = [];
  const sortedRules = [...params.rules].sort((left, right) => {
    const salienceDelta = (right.salience ?? 0) - (left.salience ?? 0);
    return salienceDelta || left.id.localeCompare(right.id);
  });
  for (const rule of sortedRules) {
    requireNonBlank(rule.id, 'SPARC production rule id');
    if (!Array.isArray(rule.when) || rule.when.length === 0) {
      throw new Error(`SPARC production rule "${rule.id}" requires at least one fact pattern`);
    }
    if (!Array.isArray(rule.then)) {
      throw new Error(`SPARC production rule "${rule.id}" then must be an array`);
    }
    const matches = findPatternMatches(params.facts, rule.when);
    for (const bindings of matches) {
      if ((rule.tests ?? []).every((test) => compareRuleTest(test, bindings))) {
        firings.push(instantiateFiring(rule, bindings));
      }
    }
  }
  return firings;
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

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const nextFirings = evaluateSparcProductionRules({
      facts,
      rules: params.rules,
    }).filter((firing) => {
      const activationKey = createActivationKey(firing);
      if (firedActivationKeys.has(activationKey)) {
        return false;
      }
      firedActivationKeys.add(activationKey);
      return true;
    });

    if (nextFirings.length === 0) {
      return {
        facts,
        firings,
        cycles: cycle - 1,
      };
    }

    firings.push(...nextFirings);
    for (const firing of nextFirings) {
      for (const fact of firing.assertedFacts) {
        const factKey = createFactKey(fact);
        if (factKeys.has(factKey)) {
          continue;
        }
        factKeys.add(factKey);
        facts.push(fact);
      }
    }
  }

  throw new Error(`SPARC production rules did not quiesce within ${maxCycles} cycles`);
}
