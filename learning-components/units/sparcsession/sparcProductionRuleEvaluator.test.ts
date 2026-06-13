import assert from 'node:assert/strict';
import {
  evaluateSparcProductionRules,
  runSparcProductionRules,
} from './sparcProductionRuleEvaluator';
import type {
  SparcProductionRule,
  SparcRuleExpression,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

const literal = (value: unknown): SparcRuleExpression => ({ type: 'literal', value });
const variable = (name: string): SparcRuleExpression => ({ type: 'variable', name });
const fn = (
  name: Extract<SparcRuleExpression, { type: 'function' }>['name'],
  args: readonly SparcRuleExpression[],
): SparcRuleExpression => ({ type: 'function', name, args });

describe('sparcProductionRuleEvaluator', function() {
  it('generalizes the Fractions LCD denominator edge into a fact-pattern rule', function() {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'problem',
      slots: {
        type: 'fraction-addition',
        firstDenominator: 4,
        secondDenominator: 6,
      },
    }, {
      factType: 'interface-event',
      slots: {
        selection: 'firstDenConv',
        action: 'UpdateTextArea',
        input: 12,
      },
    }, {
      factType: 'node-role',
      slots: {
        node: 'firstDenConv',
        role: 'converted-denominator',
        fraction: 'first',
      },
    }, {
      factType: 'interface-state',
      slots: {
        node: 'firstDenConv',
        status: 'empty',
      },
    }];

    const rules: SparcProductionRule[] = [{
      id: 'fractions.determine-lcd',
      module: 'fraction-addition',
      salience: 20,
      when: [{
        factType: 'problem',
        slots: {
          type: { type: 'literal', value: 'fraction-addition' },
          firstDenominator: { type: 'bind', variable: 'd1' },
          secondDenominator: { type: 'bind', variable: 'd2' },
        },
      }, {
        factType: 'interface-event',
        slots: {
          selection: { type: 'bind', variable: 'node' },
          action: { type: 'literal', value: 'UpdateTextArea' },
          input: { type: 'bind', variable: 'D' },
        },
      }, {
        factType: 'node-role',
        slots: {
          node: { type: 'bound', variable: 'node' },
          role: { type: 'literal', value: 'converted-denominator' },
          fraction: { type: 'bind', variable: 'fraction' },
        },
      }, {
        factType: 'interface-state',
        slots: {
          node: { type: 'bound', variable: 'node' },
          status: { type: 'literal', value: 'empty' },
        },
      }],
      tests: [{
        op: 'eq',
        left: variable('D'),
        right: fn('lcm', [variable('d1'), variable('d2')]),
      }],
      then: [{
        type: 'classify',
        outcome: 'correct',
      }, {
        type: 'assert-fact',
        fact: {
          factType: 'model',
          slots: {
            name: literal('active-common-denominator'),
            value: variable('D'),
            strategy: literal('lcd'),
          },
        },
      }, {
        type: 'assert-fact',
        fact: {
          factType: 'model',
          slots: {
            name: literal('converted-denominator'),
            fraction: variable('fraction'),
            value: variable('D'),
          },
        },
      }, {
        type: 'message',
        messageType: 'hint',
        template: "Enter '{D}', the least common denominator between both fractions.",
      }, {
        type: 'credit',
        kc: 'determine-lcd',
      }],
    }];

    const [firing] = evaluateSparcProductionRules({ facts, rules });

    assert.equal(firing?.ruleId, 'fractions.determine-lcd');
    assert.deepEqual(firing.bindings, {
      d1: 4,
      d2: 6,
      node: 'firstDenConv',
      D: 12,
      fraction: 'first',
    });
    assert.deepEqual(firing.assertedFacts.map((fact) => fact.slots), [{
      name: 'active-common-denominator',
      value: 12,
      strategy: 'lcd',
    }, {
      name: 'converted-denominator',
      fraction: 'first',
      value: 12,
    }]);
    assert.equal(firing.messages[0]?.text, "Enter '12', the least common denominator between both fractions.");
    assert.deepEqual(firing.classifications, ['correct']);
    assert.deepEqual(firing.credits, ['determine-lcd']);
  });

  it('can write state to the interface node bound by a generalized rule', function() {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'interface-event',
      slots: {
        documentId: 'fractions-doc',
        selection: 'firstDenConv',
        action: 'UpdateTextArea',
        input: '12',
      },
    }, {
      factType: 'node-role',
      slots: {
        selection: 'firstDenConv',
        node: 'node-known-1-equivalent-bottom',
        role: 'converted-denominator',
      },
    }];
    const rules: SparcProductionRule[] = [{
      id: 'fractions.accept-denominator-input',
      when: [{
        factType: 'interface-event',
        slots: {
          documentId: { type: 'bind', variable: 'documentId' },
          selection: { type: 'bind', variable: 'selection' },
          action: { type: 'literal', value: 'UpdateTextArea' },
          input: { type: 'bind', variable: 'input' },
        },
      }, {
        factType: 'node-role',
        slots: {
          selection: { type: 'bound', variable: 'selection' },
          node: { type: 'bind', variable: 'node' },
          role: { type: 'literal', value: 'converted-denominator' },
        },
      }],
      then: [{
        type: 'write-state',
        write: {
          target: {
            documentId: variable('documentId'),
            nodeId: variable('node'),
          },
          key: 'value',
          value: variable('input'),
        },
      }],
    }];

    const [firing] = evaluateSparcProductionRules({ facts, rules });

    assert.deepEqual(firing?.writes, [{
      target: {
        documentId: 'fractions-doc',
        nodeId: 'node-known-1-equivalent-bottom',
      },
      key: 'value',
      value: '12',
    }]);
  });

  it('keeps targeted message effects transient for a SPARC message node', function() {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'interface-event',
      slots: {
        documentId: 'fractions-doc',
        selection: 'HintButton',
        action: 'ButtonPressed',
        input: '?',
      },
    }];
    const rules: SparcProductionRule[] = [{
      id: 'fractions.hint-common-denominator',
      when: [{
        factType: 'interface-event',
        slots: {
          documentId: { type: 'bind', variable: 'documentId' },
          selection: { type: 'literal', value: 'HintButton' },
          action: { type: 'literal', value: 'ButtonPressed' },
        },
      }],
      then: [{
        type: 'message',
        messageType: 'hint',
        template: 'Choose a denominator both denominators divide into.',
        target: {
          documentId: variable('documentId'),
          nodeId: literal('node-hint-message'),
        },
      }],
    }];

    const [firing] = evaluateSparcProductionRules({ facts, rules });

    assert.deepEqual(firing?.messages, [{
      messageType: 'hint',
      text: 'Choose a denominator both denominators divide into.',
      target: {
        documentId: 'fractions-doc',
        nodeId: 'node-hint-message',
      },
    }]);
    assert.deepEqual(firing?.writes, []);
  });

  it('supports negated fact patterns for first hint state', function() {
    const firstHintRule: SparcProductionRule = {
      id: 'fractions.hint-1',
      when: [{
        factType: 'interface-event',
        slots: {
          documentId: { type: 'bind', variable: 'documentId' },
          selection: { type: 'literal', value: 'hint' },
          action: { type: 'literal', value: 'ButtonPressed' },
        },
      }, {
        type: 'not',
        pattern: {
          factType: 'interface-state',
          slots: {
            documentId: { type: 'bound', variable: 'documentId' },
            node: { type: 'literal', value: 'root' },
            key: { type: 'literal', value: 'hintStage' },
          },
        },
      }],
      then: [{
        type: 'message',
        messageType: 'hint',
        template: 'Choose a denominator both denominators divide into.',
        target: {
          documentId: variable('documentId'),
          nodeId: literal('node-hint-message'),
        },
      }, {
        type: 'write-state',
        write: {
          target: {
            documentId: variable('documentId'),
            nodeId: literal('root'),
          },
          key: 'hintStage',
          value: literal(1),
        },
      }],
    };

    const withoutStage = evaluateSparcProductionRules({
      facts: [{
        factType: 'interface-event',
        slots: {
          documentId: 'fractions-doc',
          selection: 'hint',
          action: 'ButtonPressed',
        },
      }],
      rules: [firstHintRule],
    });
    const withStage = evaluateSparcProductionRules({
      facts: [{
        factType: 'interface-event',
        slots: {
          documentId: 'fractions-doc',
          selection: 'hint',
          action: 'ButtonPressed',
        },
      }, {
        factType: 'interface-state',
        slots: {
          documentId: 'fractions-doc',
          node: 'root',
          key: 'hintStage',
          value: 1,
        },
      }],
      rules: [firstHintRule],
    });

    assert.equal(withoutStage[0]?.ruleId, 'fractions.hint-1');
    assert.equal(withStage.length, 0);
  });

  it('uses salience and re-evaluation to choose one hint activation per cycle', function() {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'interface-event',
      slots: {
        documentId: 'fractions-doc',
        selection: 'hint',
        action: 'ButtonPressed',
      },
    }];
    const selectGuard = {
      type: 'not' as const,
      pattern: {
        factType: 'hint-selected',
        slots: {
          documentId: { type: 'literal' as const, value: 'fractions-doc' },
        },
      },
    };
    const rules: SparcProductionRule[] = [{
      id: 'fractions.hint-denominator',
      salience: 50,
      when: [{
        factType: 'interface-event',
        slots: {
          documentId: { type: 'bind', variable: 'documentId' },
          selection: { type: 'literal', value: 'hint' },
          action: { type: 'literal', value: 'ButtonPressed' },
        },
      }, selectGuard, {
        type: 'not',
        pattern: {
          factType: 'model',
          slots: {
            name: { type: 'literal', value: 'active-common-denominator' },
          },
        },
      }],
      then: [{
        type: 'assert-fact',
        fact: {
          factType: 'hint-selected',
          slots: {
            documentId: variable('documentId'),
          },
        },
      }, {
        type: 'message',
        messageType: 'hint',
        template: 'Choose the common denominator first.',
      }],
    }, {
      id: 'fractions.hint-convert-numerators',
      salience: 40,
      when: [{
        factType: 'interface-event',
        slots: {
          documentId: { type: 'bind', variable: 'documentId' },
          selection: { type: 'literal', value: 'hint' },
          action: { type: 'literal', value: 'ButtonPressed' },
        },
      }, selectGuard],
      then: [{
        type: 'assert-fact',
        fact: {
          factType: 'hint-selected',
          slots: {
            documentId: variable('documentId'),
          },
        },
      }, {
        type: 'message',
        messageType: 'hint',
        template: 'Convert the numerators next.',
      }],
    }];

    const result = runSparcProductionRules({ facts, rules });

    assert.deepEqual(result.firings.map((firing) => firing.ruleId), [
      'fractions.hint-denominator',
    ]);
    assert.equal(result.firings[0]?.messages[0]?.text, 'Choose the common denominator first.');
  });

  it('can credit a KC bound by a generalized rule', function() {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'expected-response',
      slots: {
        selection: 'Numerator1Units',
        action: 'UpdateComboBox',
        input: 'g',
        kc: 'Set-Numerator-Unit-of-Unit-Conversion',
      },
    }, {
      factType: 'interface-event',
      slots: {
        selection: 'Numerator1Units',
        action: 'UpdateComboBox',
        input: 'g',
      },
    }];
    const rules: SparcProductionRule[] = [{
      id: 'stoich.accept-exact-response',
      when: [{
        factType: 'expected-response',
        slots: {
          selection: { type: 'bind', variable: 'selection' },
          action: { type: 'bind', variable: 'action' },
          input: { type: 'bind', variable: 'input' },
          kc: { type: 'bind', variable: 'kc' },
        },
      }, {
        factType: 'interface-event',
        slots: {
          selection: { type: 'bound', variable: 'selection' },
          action: { type: 'bound', variable: 'action' },
          input: { type: 'bound', variable: 'input' },
        },
      }],
      then: [{
        type: 'credit',
        kc: '{kc}',
      }],
    }];

    const [firing] = evaluateSparcProductionRules({ facts, rules });

    assert.deepEqual(firing?.credits, ['Set-Numerator-Unit-of-Unit-Conversion']);
  });

  it('keeps the Fractions product-denominator path as a different strategy over the same facts', function() {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'problem',
      slots: {
        type: 'fraction-addition',
        firstDenominator: 4,
        secondDenominator: 6,
      },
    }, {
      factType: 'interface-event',
      slots: {
        selection: 'firstDenConv',
        action: 'UpdateTextArea',
        input: 24,
      },
    }, {
      factType: 'node-role',
      slots: {
        node: 'firstDenConv',
        role: 'converted-denominator',
      },
    }];

    const rules: SparcProductionRule[] = [{
      id: 'fractions.multiply-denominators',
      module: 'fraction-addition',
      when: [{
        factType: 'problem',
        slots: {
          type: { type: 'literal', value: 'fraction-addition' },
          firstDenominator: { type: 'bind', variable: 'd1' },
          secondDenominator: { type: 'bind', variable: 'd2' },
        },
      }, {
        factType: 'interface-event',
        slots: {
          selection: { type: 'bind', variable: 'node' },
          action: { type: 'literal', value: 'UpdateTextArea' },
          input: { type: 'bind', variable: 'D' },
        },
      }, {
        factType: 'node-role',
        slots: {
          node: { type: 'bound', variable: 'node' },
          role: { type: 'literal', value: 'converted-denominator' },
        },
      }],
      tests: [{
        op: 'eq',
        left: variable('D'),
        right: fn('multiply', [variable('d1'), variable('d2')]),
      }],
      then: [{
        type: 'assert-fact',
        fact: {
          factType: 'model',
          slots: {
            name: literal('active-common-denominator'),
            value: variable('D'),
            strategy: literal('product-denominator'),
          },
        },
      }, {
        type: 'message',
        messageType: 'success',
        template: 'Good job!',
      }],
    }];

    const [firing] = evaluateSparcProductionRules({ facts, rules });

    assert.equal(firing?.ruleId, 'fractions.multiply-denominators');
    assert.deepEqual(firing.assertedFacts[0]?.slots, {
      name: 'active-common-denominator',
      value: 24,
      strategy: 'product-denominator',
    });
    assert.equal(firing.messages[0]?.messageType, 'success');
  });

  it('templates Stoichiometry unit-conversion messages from problem facts', function() {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'problem',
      slots: {
        type: 'stoichiometry',
        sourceUnit: 'mg',
        targetUnit: 'g',
        substance: 'COH4',
      },
    }, {
      factType: 'unit-equivalence',
      slots: {
        sourceValue: 1000,
        sourceUnit: 'mg',
        targetValue: 1,
        targetUnit: 'g',
      },
    }, {
      factType: 'interface-event',
      slots: {
        selection: 'Numerator1Value',
        action: 'UpdateTextField',
        input: 1,
      },
    }];

    const rules: SparcProductionRule[] = [{
      id: 'stoich.set-unit-conversion-numerator-value',
      module: 'stoichiometry-unit-conversion',
      when: [{
        factType: 'problem',
        slots: {
          type: { type: 'literal', value: 'stoichiometry' },
          sourceUnit: { type: 'bind', variable: 'sourceUnit' },
          targetUnit: { type: 'bind', variable: 'targetUnit' },
          substance: { type: 'bind', variable: 'substance' },
        },
      }, {
        factType: 'unit-equivalence',
        slots: {
          sourceValue: { type: 'bind', variable: 'sourceValue' },
          sourceUnit: { type: 'bound', variable: 'sourceUnit' },
          targetValue: { type: 'bind', variable: 'targetValue' },
          targetUnit: { type: 'bound', variable: 'targetUnit' },
        },
      }, {
        factType: 'interface-event',
        slots: {
          selection: { type: 'literal', value: 'Numerator1Value' },
          action: { type: 'literal', value: 'UpdateTextField' },
          input: { type: 'bound', variable: 'targetValue' },
        },
      }],
      then: [{
        type: 'classify',
        outcome: 'correct',
      }, {
        type: 'assert-fact',
        fact: {
          factType: 'model',
          slots: {
            name: literal('unit-conversion-numerator-value'),
            value: variable('targetValue'),
          },
        },
      }, {
        type: 'message',
        messageType: 'hint',
        template: 'Since {targetValue} {targetUnit} is equivalent to {sourceValue} {sourceUnit}, put {targetValue} here for {substance}.',
      }],
    }];

    const [firing] = evaluateSparcProductionRules({ facts, rules });

    assert.equal(firing?.ruleId, 'stoich.set-unit-conversion-numerator-value');
    assert.deepEqual(firing.assertedFacts[0]?.slots, {
      name: 'unit-conversion-numerator-value',
      value: 1,
    });
    assert.equal(
      firing.messages[0]?.text,
      'Since 1 g is equivalent to 1000 mg, put 1 here for COH4.',
    );
  });

  it('runs downstream Fractions rules from inferred working-memory facts', function() {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'problem',
      slots: {
        type: 'fraction-addition',
        firstNumerator: 1,
        firstDenominator: 4,
        secondDenominator: 6,
      },
    }, {
      factType: 'interface-event',
      slots: {
        selection: 'firstDenConv',
        action: 'UpdateTextArea',
        input: 12,
      },
    }, {
      factType: 'interface-event',
      slots: {
        selection: 'firstNumConv',
        action: 'UpdateTextArea',
        input: 3,
      },
    }, {
      factType: 'node-role',
      slots: {
        node: 'firstDenConv',
        role: 'converted-denominator',
        fraction: 'first',
      },
    }, {
      factType: 'node-role',
      slots: {
        node: 'firstNumConv',
        role: 'converted-numerator',
        fraction: 'first',
      },
    }];

    const rules: SparcProductionRule[] = [{
      id: 'fractions.determine-lcd',
      module: 'fraction-addition',
      salience: 20,
      when: [{
        factType: 'problem',
        slots: {
          type: { type: 'literal', value: 'fraction-addition' },
          firstDenominator: { type: 'bind', variable: 'd1' },
          secondDenominator: { type: 'bind', variable: 'd2' },
        },
      }, {
        factType: 'interface-event',
        slots: {
          selection: { type: 'bind', variable: 'denominatorNode' },
          action: { type: 'literal', value: 'UpdateTextArea' },
          input: { type: 'bind', variable: 'D' },
        },
      }, {
        factType: 'node-role',
        slots: {
          node: { type: 'bound', variable: 'denominatorNode' },
          role: { type: 'literal', value: 'converted-denominator' },
          fraction: { type: 'bind', variable: 'fraction' },
        },
      }],
      tests: [{
        op: 'eq',
        left: variable('D'),
        right: fn('lcm', [variable('d1'), variable('d2')]),
      }],
      then: [{
        type: 'assert-fact',
        fact: {
          factType: 'model',
          slots: {
            name: literal('active-common-denominator'),
            value: variable('D'),
            strategy: literal('lcd'),
          },
        },
      }],
    }, {
      id: 'fractions.convert-first-numerator',
      module: 'fraction-addition',
      when: [{
        factType: 'problem',
        slots: {
          type: { type: 'literal', value: 'fraction-addition' },
          firstNumerator: { type: 'bind', variable: 'n' },
          firstDenominator: { type: 'bind', variable: 'd' },
        },
      }, {
        factType: 'model',
        slots: {
          name: { type: 'literal', value: 'active-common-denominator' },
          value: { type: 'bind', variable: 'D' },
        },
      }, {
        factType: 'interface-event',
        slots: {
          selection: { type: 'bind', variable: 'numeratorNode' },
          action: { type: 'literal', value: 'UpdateTextArea' },
          input: { type: 'bind', variable: 'convertedNumerator' },
        },
      }, {
        factType: 'node-role',
        slots: {
          node: { type: 'bound', variable: 'numeratorNode' },
          role: { type: 'literal', value: 'converted-numerator' },
          fraction: { type: 'literal', value: 'first' },
        },
      }],
      tests: [{
        op: 'eq',
        left: variable('convertedNumerator'),
        right: fn('multiply', [
          variable('n'),
          fn('divide', [variable('D'), variable('d')]),
        ]),
      }],
      then: [{
        type: 'assert-fact',
        fact: {
          factType: 'model',
          slots: {
            name: literal('converted-numerator'),
            fraction: literal('first'),
            value: variable('convertedNumerator'),
          },
        },
      }, {
        type: 'message',
        messageType: 'hint',
        template: 'Multiply {n} and {D}/{d}. Put {convertedNumerator} in the highlighted cell.',
      }],
    }];

    const result = runSparcProductionRules({ facts, rules });

    assert.equal(result.cycles, 2);
    assert.deepEqual(result.firings.map((firing) => firing.ruleId), [
      'fractions.determine-lcd',
      'fractions.convert-first-numerator',
    ]);
    assert.ok(result.facts.some((fact) => (
      fact.factType === 'model'
      && fact.slots?.name === 'converted-numerator'
      && fact.slots.value === 3
    )));
    assert.equal(
      result.firings[1]?.messages[0]?.text,
      'Multiply 1 and 12/4. Put 3 in the highlighted cell.',
    );
  });

  it('does not fire the same production-rule activation repeatedly', function() {
    const facts: SparcWorkingMemoryFact[] = [{
      factType: 'interface-event',
      slots: {
        selection: 'done',
        action: 'ButtonPressed',
        input: -1,
      },
    }];
    const rules: SparcProductionRule[] = [{
      id: 'sparc.done',
      when: [{
        factType: 'interface-event',
        slots: {
          selection: { type: 'literal', value: 'done' },
          action: { type: 'literal', value: 'ButtonPressed' },
          input: { type: 'literal', value: -1 },
        },
      }],
      then: [{
        type: 'assert-fact',
        fact: {
          factType: 'model',
          slots: {
            name: literal('completed'),
            value: literal(true),
          },
        },
      }, {
        type: 'message',
        messageType: 'success',
        template: "You're all done with the problem!",
      }],
    }];

    const result = runSparcProductionRules({ facts, rules, maxCycles: 3 });

    assert.equal(result.cycles, 1);
    assert.equal(result.firings.length, 1);
    assert.equal(result.facts.filter((fact) => fact.factType === 'model').length, 1);
  });
});
