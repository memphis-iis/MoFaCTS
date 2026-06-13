import type {
  SparcProductionRule,
  SparcProductionRuleCondition,
  SparcProductionRuleEffect,
  SparcFactSlotPattern,
  SparcRuleExpression,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

type UnknownRecord = Record<string, unknown>;

type CompiledAuthoredRules = {
  readonly workingMemoryFacts: readonly SparcWorkingMemoryFact[];
  readonly productionRules: readonly SparcProductionRule[];
};

const FRACTION_AUTHORED_RULE_IDS = new Set([
  'choose-first-common-denominator',
  'buggy-added-denominators',
  'buggy-premature-add-numerators',
  'fill-second-common-denominator',
  'copy-answer-denominator',
  'convert-numerator',
  'add-converted-numerators',
  'reduce-denominator',
  'reduce-numerator',
  'complete-problem',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function literal(value: unknown): SparcRuleExpression {
  return { type: 'literal', value };
}

function variable(name: string): SparcRuleExpression {
  return { type: 'variable', name };
}

function fn(name: Extract<SparcRuleExpression, { type: 'function' }>['name'], args: SparcRuleExpression[]): SparcRuleExpression {
  return { type: 'function', name, args };
}

function fact(
  factType: string,
  slots: Record<string, SparcFactSlotPattern>,
): SparcProductionRuleCondition {
  return { factType, slots };
}

function notFact(
  factType: string,
  slots: Record<string, SparcFactSlotPattern>,
): SparcProductionRuleCondition {
  return { type: 'not', pattern: { factType, slots } };
}

function bind(variableName: string): { readonly type: 'bind'; readonly variable: string } {
  return { type: 'bind', variable: variableName };
}

function bound(variableName: string): { readonly type: 'bound'; readonly variable: string } {
  return { type: 'bound', variable: variableName };
}

function lit(value: unknown): { readonly type: 'literal'; readonly value: unknown } {
  return { type: 'literal', value };
}

function messageEffect(
  messageType: 'hint' | 'buggy' | 'success' | 'feedback',
  template: string,
): SparcProductionRuleEffect {
  return {
    type: 'message',
    messageType,
    template,
    target: {
      documentId: variable('documentId'),
      nodeId: literal('node-hint-message'),
    },
  };
}

function writeValue(nodeVariable = 'node', valueVariable = 'input'): SparcProductionRuleEffect {
  return {
    type: 'write-state',
    write: {
      target: {
        documentId: variable('documentId'),
        nodeId: variable(nodeVariable),
      },
      key: 'value',
      value: variable(valueVariable),
    },
  };
}

function modelFact(name: string, slots: Record<string, SparcRuleExpression>): SparcProductionRuleEffect {
  return {
    type: 'assert-fact',
    fact: {
      factType: 'model',
      slots: {
        name: literal(name),
        ...slots,
      },
    },
  };
}

function interfaceEvent(selection: unknown, action: string, inputVariable = 'input'): SparcProductionRuleCondition {
  return fact('interface-event', {
    documentId: bind('documentId'),
    selection: typeof selection === 'string' ? lit(selection) : bind('selection'),
    action: lit(action),
    input: bind(inputVariable),
  });
}

function classify(outcome: 'correct' | 'buggy'): SparcProductionRuleEffect {
  return { type: 'classify', outcome };
}

function credit(kc: string): SparcProductionRuleEffect {
  return { type: 'credit', kc };
}

function hintRulesForChooseCommonDenominator(messages: readonly string[]): readonly SparcProductionRule[] {
  return messages.map((message, index) => {
    const stage = index + 1;
    const priorStageCondition = stage === 1
      ? notFact('interface-state', {
        documentId: bound('documentId'),
        node: lit('root'),
        key: lit('hintStage:choose-common-denominator'),
      })
      : fact('interface-state', {
        documentId: bound('documentId'),
        node: lit('root'),
        key: lit('hintStage:choose-common-denominator'),
        value: lit(stage - 1),
      });

    return {
      id: `fractions.authored.choose-common-denominator.hint.${stage}`,
      module: 'fraction-addition',
      salience: 500 - stage,
      when: [
        fact('interface-event', {
          documentId: bind('documentId'),
          selection: lit('hint'),
          action: lit('ButtonPressed'),
        }),
        notFact('hint-selected', {
          documentId: bound('documentId'),
        }),
        notFact('model', {
          name: lit('converted-denominator'),
          fraction: lit('first'),
        }),
        priorStageCondition,
      ],
      then: [
        {
          type: 'assert-fact',
          persist: false,
          fact: {
            factType: 'hint-selected',
            slots: {
              documentId: variable('documentId'),
            },
          },
        },
        messageEffect('hint', message),
        {
          type: 'write-state',
          write: {
            target: {
              documentId: variable('documentId'),
              nodeId: literal('root'),
            },
            key: 'hintStage:choose-common-denominator',
            value: literal(stage),
          },
        },
      ],
    };
  });
}

function compileFractionAdditionAuthoredRules(
  authoredRules: readonly UnknownRecord[],
  authoredFacts: readonly SparcWorkingMemoryFact[],
): CompiledAuthoredRules {
  const actualIds = new Set(authoredRules.map((rule) => nonBlankString(rule.id)));
  for (const id of FRACTION_AUTHORED_RULE_IDS) {
    if (!actualIds.has(id)) {
      throw new Error(`SPARC Fractions authored production rule "${id}" is required`);
    }
  }
  for (const id of actualIds) {
    if (!FRACTION_AUTHORED_RULE_IDS.has(id)) {
      throw new Error(`Unsupported SPARC Fractions authored production rule "${id}"`);
    }
  }

  const chooseRule = authoredRules.find((rule) => rule.id === 'choose-first-common-denominator');
  const hintMessages = isRecord(chooseRule?.hintBehavior) && Array.isArray(chooseRule.hintBehavior.messages)
    ? chooseRule.hintBehavior.messages.map(String)
    : [];

  const problemFact = authoredFacts.find((factEntry) => factEntry.factType === 'problem' && factEntry.slots?.type === 'fraction-addition');
  const firstNumerator = problemFact?.slots?.firstNumerator;
  const firstDenominator = problemFact?.slots?.firstDenominator;
  const secondNumerator = problemFact?.slots?.secondNumerator;
  const secondDenominator = problemFact?.slots?.secondDenominator;
  for (const [key, value] of Object.entries({
    firstNumerator,
    firstDenominator,
    secondNumerator,
    secondDenominator,
  })) {
    if (!Number.isFinite(Number(value))) {
      throw new Error(`SPARC Fractions authored rules require numeric problem slot "${key}"`);
    }
  }

  const workingMemoryFacts: SparcWorkingMemoryFact[] = [{
    factType: 'fraction-source',
    slots: {
      fraction: 'first',
      selection: 'firstNumConv',
      numerator: Number(firstNumerator),
      denominator: Number(firstDenominator),
    },
  }, {
    factType: 'fraction-source',
    slots: {
      fraction: 'second',
      selection: 'secNumConv',
      numerator: Number(secondNumerator),
      denominator: Number(secondDenominator),
    },
  }];

  const productionRules: SparcProductionRule[] = [
    ...hintRulesForChooseCommonDenominator(hintMessages),
    {
      id: 'fractions.authored.choose-first-common-denominator',
      module: 'fraction-addition',
      salience: 30,
      when: [
        interfaceEvent(null, 'UpdateTextArea', 'input'),
        fact('node-role', {
          node: bind('node'),
          selection: bound('selection'),
          role: lit('converted-denominator'),
          fraction: bind('fraction'),
        }),
        fact('problem', {
          type: lit('fraction-addition'),
          firstDenominator: bind('d1'),
          secondDenominator: bind('d2'),
        }),
      ],
      tests: [{
        op: 'eq',
        left: fn('add', [variable('input'), literal(0)]),
        right: fn('lcm', [variable('d1'), variable('d2')]),
      }, {
        op: 'eq',
        left: variable('selection'),
        right: literal('firstDenConv'),
      }],
      then: [
        classify('correct'),
        writeValue(),
        modelFact('active-common-denominator', {
          value: variable('input'),
          strategy: literal('lcd'),
          path: literal('lcd-12'),
          denominatorModelTarget: literal('determine-lcd'),
        }),
        modelFact('converted-denominator', {
          fraction: variable('fraction'),
          value: variable('input'),
        }),
        credit('determine-lcd'),
      ],
    },
    {
      id: 'fractions.authored.choose-first-common-denominator.product',
      module: 'fraction-addition',
      salience: 30,
      when: [
        interfaceEvent(null, 'UpdateTextArea', 'input'),
        fact('node-role', {
          node: bind('node'),
          selection: bound('selection'),
          role: lit('converted-denominator'),
          fraction: bind('fraction'),
        }),
        fact('problem', {
          type: lit('fraction-addition'),
          firstDenominator: bind('d1'),
          secondDenominator: bind('d2'),
        }),
      ],
      tests: [{
        op: 'eq',
        left: fn('add', [variable('input'), literal(0)]),
        right: fn('multiply', [variable('d1'), variable('d2')]),
      }, {
        op: 'eq',
        left: variable('selection'),
        right: literal('firstDenConv'),
      }],
      then: [
        classify('correct'),
        writeValue(),
        modelFact('active-common-denominator', {
          value: variable('input'),
          strategy: literal('product-denominator'),
          path: literal('common-denominator-24'),
          denominatorModelTarget: literal('multiply-denominators'),
        }),
        modelFact('converted-denominator', {
          fraction: variable('fraction'),
          value: variable('input'),
        }),
        messageEffect('success', 'Good job!'),
        credit('multiply-denominators'),
      ],
    },
    {
      id: 'fractions.authored.buggy-added-denominators',
      module: 'fraction-addition',
      salience: 40,
      when: [
        interfaceEvent(null, 'UpdateTextArea', 'input'),
        fact('node-role', {
          selection: bound('selection'),
          node: bind('node'),
          role: lit('converted-denominator'),
        }),
        fact('problem', {
          type: lit('fraction-addition'),
          firstDenominator: bind('d1'),
          secondDenominator: bind('d2'),
        }),
      ],
      tests: [{
        op: 'eq',
        left: fn('add', [variable('input'), literal(0)]),
        right: fn('add', [variable('d1'), variable('d2')]),
      }],
      then: [
        classify('buggy'),
        {
          type: 'write-state',
          write: {
            target: {
              documentId: variable('documentId'),
              nodeId: variable('node'),
            },
            key: 'correctness',
            value: literal('buggy'),
          },
        },
        messageEffect('buggy', 'Instead of adding the denominators, choose a denominator both denominators divide into.'),
      ],
    },
    {
      id: 'fractions.authored.buggy-premature-add-numerators',
      module: 'fraction-addition',
      salience: 40,
      when: [
        interfaceEvent('ansNum1', 'UpdateTextArea', 'input'),
        fact('node-role', {
          selection: lit('ansNum1'),
          node: bind('node'),
          role: lit('answer-numerator'),
          answerStage: lit('intermediate'),
        }),
        fact('problem', {
          type: lit('fraction-addition'),
          firstNumerator: bind('n1'),
          secondNumerator: bind('n2'),
        }),
        notFact('model', {
          name: lit('converted-numerator'),
          fraction: lit('first'),
        }),
      ],
      tests: [{
        op: 'eq',
        left: fn('add', [variable('input'), literal(0)]),
        right: fn('add', [variable('n1'), variable('n2')]),
      }],
      then: [
        classify('buggy'),
        {
          type: 'write-state',
          write: {
            target: {
              documentId: variable('documentId'),
              nodeId: variable('node'),
            },
            key: 'correctness',
            value: literal('buggy'),
          },
        },
        messageEffect('buggy', 'You cannot add the numerators until the fractions have been converted to a common denominator.'),
      ],
    },
    {
      id: 'fractions.authored.fill-second-common-denominator',
      module: 'fraction-addition',
      salience: 20,
      when: [
        interfaceEvent('secDenConv', 'UpdateTextArea', 'input'),
        fact('node-role', {
          selection: lit('secDenConv'),
          node: bind('node'),
          role: lit('converted-denominator'),
          fraction: bind('fraction'),
        }),
        fact('model', {
          name: lit('active-common-denominator'),
          value: bind('input'),
          denominatorModelTarget: bind('kc'),
        }),
      ],
      then: [
        classify('correct'),
        writeValue(),
        modelFact('converted-denominator', {
          fraction: variable('fraction'),
          value: variable('input'),
        }),
        credit('{kc}'),
      ],
    },
    {
      id: 'fractions.authored.copy-answer-denominator',
      module: 'fraction-addition',
      salience: 10,
      when: [
        interfaceEvent('ansDen1', 'UpdateTextArea', 'input'),
        fact('node-role', {
          selection: lit('ansDen1'),
          node: bind('node'),
          role: lit('answer-denominator'),
          answerStage: lit('intermediate'),
        }),
        fact('model', {
          name: lit('active-common-denominator'),
          value: bind('input'),
        }),
      ],
      then: [
        classify('correct'),
        writeValue(),
        modelFact('intermediate-denominator', {
          value: variable('input'),
        }),
        credit('copy-answer-denominator'),
      ],
    },
    {
      id: 'fractions.authored.convert-numerator',
      module: 'fraction-addition',
      salience: 10,
      when: [
        interfaceEvent(null, 'UpdateTextArea', 'convertedNumerator'),
        fact('node-role', {
          selection: bound('selection'),
          node: bind('node'),
          role: lit('converted-numerator'),
          fraction: bind('fraction'),
        }),
        fact('fraction-source', {
          fraction: bound('fraction'),
          numerator: bind('n'),
          denominator: bind('d'),
        }),
        fact('model', {
          name: lit('active-common-denominator'),
          value: bind('D'),
        }),
      ],
      tests: [{
        op: 'eq',
        left: fn('add', [variable('convertedNumerator'), literal(0)]),
        right: fn('multiply', [variable('n'), fn('divide', [variable('D'), variable('d')])]),
      }],
      then: [
        classify('correct'),
        writeValue('node', 'convertedNumerator'),
        modelFact('converted-numerator', {
          fraction: variable('fraction'),
          value: variable('convertedNumerator'),
        }),
        credit('convert-numerator'),
      ],
    },
    {
      id: 'fractions.authored.add-converted-numerators',
      module: 'fraction-addition',
      salience: 10,
      when: [
        interfaceEvent('ansNum1', 'UpdateTextArea', 'sumNumerator'),
        fact('node-role', {
          selection: lit('ansNum1'),
          node: bind('node'),
          role: lit('answer-numerator'),
          answerStage: lit('intermediate'),
        }),
        fact('model', {
          name: lit('converted-numerator'),
          fraction: lit('first'),
          value: bind('firstConvertedNumerator'),
        }),
        fact('model', {
          name: lit('converted-numerator'),
          fraction: lit('second'),
          value: bind('secondConvertedNumerator'),
        }),
      ],
      tests: [{
        op: 'eq',
        left: fn('add', [variable('sumNumerator'), literal(0)]),
        right: fn('add', [variable('firstConvertedNumerator'), variable('secondConvertedNumerator')]),
      }],
      then: [
        classify('correct'),
        writeValue('node', 'sumNumerator'),
        modelFact('intermediate-numerator', {
          value: variable('sumNumerator'),
        }),
        credit('add-numerators'),
      ],
    },
    {
      id: 'fractions.authored.reduce-denominator',
      module: 'fraction-addition',
      salience: 10,
      when: [
        interfaceEvent('ansDenFinal1', 'UpdateTextArea', 'finalDenominator'),
        fact('node-role', {
          selection: lit('ansDenFinal1'),
          node: bind('node'),
          role: lit('answer-denominator'),
          answerStage: lit('final'),
        }),
        fact('model', {
          name: lit('intermediate-numerator'),
          value: bind('intermediateNumerator'),
        }),
        fact('model', {
          name: lit('intermediate-denominator'),
          value: bind('intermediateDenominator'),
        }),
      ],
      tests: [{
        op: 'gt',
        left: fn('gcd', [variable('intermediateNumerator'), variable('intermediateDenominator')]),
        right: literal(1),
      }, {
        op: 'eq',
        left: fn('add', [variable('finalDenominator'), literal(0)]),
        right: fn('divide', [
          variable('intermediateDenominator'),
          fn('gcd', [variable('intermediateNumerator'), variable('intermediateDenominator')]),
        ]),
      }],
      then: [
        classify('correct'),
        writeValue('node', 'finalDenominator'),
        modelFact('final-denominator', {
          value: variable('finalDenominator'),
        }),
        credit('reduce-denominator'),
      ],
    },
    {
      id: 'fractions.authored.reduce-numerator',
      module: 'fraction-addition',
      salience: 10,
      when: [
        interfaceEvent('ansNumFinal1', 'UpdateTextArea', 'finalNumerator'),
        fact('node-role', {
          selection: lit('ansNumFinal1'),
          node: bind('node'),
          role: lit('answer-numerator'),
          answerStage: lit('final'),
        }),
        fact('model', {
          name: lit('intermediate-numerator'),
          value: bind('intermediateNumerator'),
        }),
        fact('model', {
          name: lit('intermediate-denominator'),
          value: bind('intermediateDenominator'),
        }),
      ],
      tests: [{
        op: 'gt',
        left: fn('gcd', [variable('intermediateNumerator'), variable('intermediateDenominator')]),
        right: literal(1),
      }, {
        op: 'eq',
        left: fn('add', [variable('finalNumerator'), literal(0)]),
        right: fn('divide', [
          variable('intermediateNumerator'),
          fn('gcd', [variable('intermediateNumerator'), variable('intermediateDenominator')]),
        ]),
      }],
      then: [
        classify('correct'),
        writeValue('node', 'finalNumerator'),
        modelFact('final-numerator', {
          value: variable('finalNumerator'),
        }),
        credit('reduce-numerator'),
      ],
    },
    {
      id: 'fractions.authored.complete-problem.unreduced',
      module: 'fraction-addition',
      salience: 5,
      when: [
        interfaceEvent('done', 'ButtonPressed', 'doneInput'),
        fact('problem', {
          type: lit('fraction-addition'),
          finalNumerator: bind('finalNumerator'),
          finalDenominator: bind('finalDenominator'),
        }),
        fact('model', {
          name: lit('intermediate-numerator'),
          value: bind('finalNumerator'),
        }),
        fact('model', {
          name: lit('intermediate-denominator'),
          value: bind('finalDenominator'),
        }),
      ],
      tests: [{
        op: 'eq',
        left: fn('add', [variable('doneInput'), literal(0)]),
        right: literal(-1),
      }],
      then: [
        classify('correct'),
        modelFact('completed', {
          value: literal(true),
        }),
        messageEffect('success', "You're all done with the problem."),
        credit('complete-problem'),
      ],
    },
    {
      id: 'fractions.authored.complete-problem.reduced',
      module: 'fraction-addition',
      salience: 5,
      when: [
        interfaceEvent('done', 'ButtonPressed', 'doneInput'),
        fact('problem', {
          type: lit('fraction-addition'),
          finalNumerator: bind('expectedNumerator'),
          finalDenominator: bind('expectedDenominator'),
        }),
        fact('model', {
          name: lit('final-numerator'),
          value: bind('expectedNumerator'),
        }),
        fact('model', {
          name: lit('final-denominator'),
          value: bind('expectedDenominator'),
        }),
      ],
      tests: [{
        op: 'eq',
        left: fn('add', [variable('doneInput'), literal(0)]),
        right: literal(-1),
      }],
      then: [
        classify('correct'),
        modelFact('completed', {
          value: literal(true),
        }),
        messageEffect('success', "You're all done with the problem."),
        credit('complete-problem'),
      ],
    },
  ];

  return {
    workingMemoryFacts,
    productionRules,
  };
}

export function compileSparcAuthoredProductionRules(params: {
  readonly behavior: unknown;
  readonly workingMemoryFacts?: readonly SparcWorkingMemoryFact[];
}): CompiledAuthoredRules | null {
  if (!isRecord(params.behavior) || !Array.isArray(params.behavior.authoredProductionRules)) {
    return null;
  }
  const authoredRules = params.behavior.authoredProductionRules.filter(isRecord);
  if (authoredRules.length !== params.behavior.authoredProductionRules.length) {
    throw new Error('SPARC authoredProductionRules entries must be objects');
  }
  const source = isRecord(params.behavior.source) ? nonBlankString(params.behavior.source.file) : '';
  const isFractions = source.endsWith('1416.brd')
    || authoredRules.some((rule) => nonBlankString(rule.id) === 'choose-first-common-denominator');
  if (!isFractions) {
    throw new Error('Unsupported SPARC authoredProductionRules schema');
  }
  return compileFractionAdditionAuthoredRules(authoredRules, params.workingMemoryFacts ?? []);
}
