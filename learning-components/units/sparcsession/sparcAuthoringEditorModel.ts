import {
  SPARC_AUTHORING_CATALOG,
  type SparcAuthoringCatalogEntry,
} from './sparcAuthoringCatalog';
import type {
  SparcCondition,
  SparcProductionRule,
  SparcProductionRuleCondition,
  SparcProductionRuleEffect,
  SparcProductionRuleTest,
  SparcReactiveRule,
  SparcRuleExpression,
  SparcStateWrite,
} from './sparcSessionContracts';

export const SPARC_RENDERED_AUTHORING_ENTRY_IDS: readonly string[] = [
  ...SPARC_AUTHORING_CATALOG.groupEntries.map((entry) => entry.id),
  ...SPARC_AUTHORING_CATALOG.nodeEntries.map((entry) => entry.id),
] as const;

export function getRenderedSparcPaletteEntries(): readonly SparcAuthoringCatalogEntry[] {
  const editableIds = new Set(SPARC_RENDERED_AUTHORING_ENTRY_IDS);
  return [
    ...SPARC_AUTHORING_CATALOG.groupEntries,
    ...SPARC_AUTHORING_CATALOG.nodeEntries,
  ].filter((entry) => editableIds.has(entry.id));
}

export function literalExpression(value: unknown = ''): SparcRuleExpression {
  return { type: 'literal', value };
}

export function variableExpression(name = 'value'): SparcRuleExpression {
  return { type: 'variable', name };
}

export function defaultProductionCondition(kind = 'fact-pattern'): SparcProductionRuleCondition {
  if (kind === 'not-fact-pattern') {
    return {
      type: 'not',
      pattern: {
        factType: 'interface-state',
        slots: {},
      },
    };
  }
  return {
    factType: 'interface-event',
    slots: {
      action: { type: 'literal', value: 'ButtonPressed' },
    },
  };
}

export function defaultProductionTest(): SparcProductionRuleTest {
  return {
    op: 'eq',
    left: variableExpression('value'),
    right: literalExpression(''),
  };
}

export function defaultProductionEffect(type = 'classify'): SparcProductionRuleEffect {
  switch (type) {
    case 'assert-fact':
      return {
        type: 'assert-fact',
        fact: {
          factType: 'model',
          slots: {},
        },
      };
    case 'write-state':
      return {
        type: 'write-state',
        write: {
          target: {
            documentId: variableExpression('documentId'),
            nodeId: literalExpression('node-id'),
          },
          key: 'value',
          value: variableExpression('value'),
        },
      };
    case 'message':
      return {
        type: 'message',
        messageType: 'feedback',
        template: '',
      };
    case 'credit':
      return {
        type: 'credit',
        kc: '',
      };
    case 'model-practice':
      return {
        type: 'model-practice',
        outcome: 'correct',
        responseValue: variableExpression('value'),
      };
    case 'append-node':
      return {
        type: 'append-node',
        boxId: literalExpression('box-id'),
        node: {
          id: 'node-id',
          nodeType: 'atomic',
          atomType: 'text-block',
          value: '',
        },
      };
    case 'append-node-if-missing':
      return {
        type: 'append-node-if-missing',
        boxId: literalExpression('box-id'),
        node: {
          id: 'node-id',
          nodeType: 'atomic',
          atomType: 'text-block',
          value: '',
        },
      };
    case 'insert-node':
      return {
        type: 'insert-node',
        afterNodeId: literalExpression('node-id'),
        node: {
          id: 'inserted-node-id',
          nodeType: 'atomic',
          atomType: 'text-block',
          value: '',
        },
      };
    case 'append-text':
      return {
        type: 'append-text',
        nodeId: literalExpression('node-id'),
        text: literalExpression(''),
      };
    case 'classify':
    default:
      return {
        type: 'classify',
        outcome: 'correct',
      };
  }
}

export function defaultProductionRule(index: number): SparcProductionRule {
  return {
    id: `production-rule-${index + 1}`,
    when: [defaultProductionCondition()],
    tests: [],
    then: [defaultProductionEffect()],
  };
}

export function defaultReactiveCondition(type = 'state'): SparcCondition {
  switch (type) {
    case 'model':
      return {
        type: 'model',
        query: {
          target: {
            sparcDocumentId: '',
            sparcNodeId: '',
            stimuliSetId: '',
            stimulusKC: '',
            clusterKC: '',
            KCId: '',
            KCDefault: '',
            KCCluster: '',
          },
          metric: 'probability',
        },
        compare: 'truthy',
      };
    case 'all':
      return {
        type: 'all',
        conditions: [defaultReactiveCondition('state')],
      };
    case 'any':
      return {
        type: 'any',
        conditions: [defaultReactiveCondition('state')],
      };
    case 'not':
      return {
        type: 'not',
        condition: defaultReactiveCondition('state'),
      };
    case 'state':
    default:
      return {
        type: 'state',
        query: {
          target: {
            documentId: '',
            nodeId: '',
          },
          key: 'value',
        },
        compare: 'truthy',
      };
  }
}

export function defaultStateWrite(documentId = '', nodeId = ''): SparcStateWrite {
  return {
    target: {
      documentId,
      nodeId,
    },
    key: 'visible',
    value: true,
  };
}

export function defaultReactiveRule(index: number): SparcReactiveRule {
  return {
    id: `reactive-rule-${index + 1}`,
    when: defaultReactiveCondition('state'),
    writes: [defaultStateWrite()],
  };
}
