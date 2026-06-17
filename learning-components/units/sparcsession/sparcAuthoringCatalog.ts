export type SparcAuthoringSchema = {
  readonly type?: string;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, SparcAuthoringSchema>>;
  readonly items?: SparcAuthoringSchema;
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly oneOf?: readonly SparcAuthoringSchema[];
  readonly anyOf?: readonly SparcAuthoringSchema[];
  readonly description?: string;
  readonly additionalProperties?: boolean | SparcAuthoringSchema;
};

export type SparcAuthoringCatalogEntry = {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly description: string;
  readonly schema: SparcAuthoringSchema;
  readonly defaultValue?: unknown;
  readonly renderedBy?: readonly string[];
  readonly generatedBy?: readonly string[];
};

export type SparcAuthoringCatalog = {
  readonly schemaVersion: 1;
  readonly source: 'sparc-authoring-catalog';
  readonly nodeEntries: readonly SparcAuthoringCatalogEntry[];
  readonly groupEntries: readonly SparcAuthoringCatalogEntry[];
  readonly semanticEntries: readonly SparcAuthoringCatalogEntry[];
  readonly layoutEntries: readonly SparcAuthoringCatalogEntry[];
  readonly ruleEntries: readonly SparcAuthoringCatalogEntry[];
};

const idProperty: SparcAuthoringSchema = {
  type: 'string',
  description: 'Stable authored node id. Runtime state, feedback, rules, and history address nodes by this id.',
};

const htmlValueProperty: SparcAuthoringSchema = {
  type: 'string',
  description: 'Sanitized learner-facing HTML. The renderer allows structural, emphasis, table, image, iframe, code, and OLI diagnostic markup.',
};

const literalExpressionSchema: SparcAuthoringSchema = {
  type: 'object',
  required: ['type', 'value'],
  properties: {
    type: { const: 'literal' },
    value: { description: 'Literal value.' },
  },
};

const variableExpressionSchema: SparcAuthoringSchema = {
  type: 'object',
  required: ['type', 'name'],
  properties: {
    type: { const: 'variable' },
    name: { type: 'string' },
  },
};

const functionExpressionSchema: SparcAuthoringSchema = {
  type: 'object',
  required: ['type', 'name', 'args'],
  properties: {
    type: { const: 'function' },
    name: { enum: ['add', 'subtract', 'multiply', 'divide', 'mod', 'gcd', 'lcm'] },
    args: {
      type: 'array',
      items: { description: 'Nested literal, variable, or function expression.' },
    },
  },
};

const ruleExpressionSchema: SparcAuthoringSchema = {
  oneOf: [literalExpressionSchema, variableExpressionSchema, functionExpressionSchema],
};

const factSlotPatternSchema: SparcAuthoringSchema = {
  oneOf: [{
    type: 'object',
    required: ['type', 'value'],
    properties: {
      type: { const: 'literal' },
      value: { description: 'Required exact slot value.' },
    },
  }, {
    type: 'object',
    required: ['type', 'variable'],
    properties: {
      type: { const: 'bind' },
      variable: { type: 'string' },
    },
  }, {
    type: 'object',
    required: ['type', 'variable'],
    properties: {
      type: { const: 'bound' },
      variable: { type: 'string' },
    },
  }],
};

const documentAddressTemplateSchema: SparcAuthoringSchema = {
  type: 'object',
  required: ['documentId', 'nodeId'],
  properties: {
    documentId: {
      anyOf: [{ type: 'string' }, ruleExpressionSchema],
      description: 'Document id or expression that evaluates to a document id.',
    },
    nodeId: {
      anyOf: [{ type: 'string' }, ruleExpressionSchema],
      description: 'Node id or expression that evaluates to a node id.',
    },
  },
};

const baseAtomicNodeProperties: Readonly<Record<string, SparcAuthoringSchema>> = {
  id: idProperty,
  nodeType: { const: 'atomic' },
  placement: { type: 'object', additionalProperties: true },
  layout: { type: 'object', additionalProperties: true },
  source: { type: 'object', additionalProperties: true },
};

const baseGroupNodeProperties: Readonly<Record<string, SparcAuthoringSchema>> = {
  id: idProperty,
  nodeType: { const: 'group' },
  groupType: { type: 'string' },
  label: { type: 'string' },
  placement: { type: 'object', additionalProperties: true },
  layout: { type: 'object', additionalProperties: true },
  children: {
    type: 'array',
    items: { description: 'Child SPARC node.' },
  },
  source: { type: 'object', additionalProperties: true },
};

function atomicEntry(params: {
  readonly atomType: string;
  readonly label: string;
  readonly description: string;
  readonly properties?: Readonly<Record<string, SparcAuthoringSchema>>;
  readonly defaultValue?: unknown;
  readonly renderedBy?: readonly string[];
  readonly generatedBy?: readonly string[];
}): SparcAuthoringCatalogEntry {
  return {
    id: `atomic.${params.atomType}`,
    label: params.label,
    category: 'atomic-node',
    description: params.description,
    schema: {
      type: 'object',
      required: ['id', 'nodeType', 'atomType'],
      properties: {
        ...baseAtomicNodeProperties,
        atomType: { const: params.atomType },
        ...(params.properties ?? {}),
      },
      additionalProperties: true,
    },
    ...(params.defaultValue === undefined ? {} : { defaultValue: params.defaultValue }),
    ...(params.renderedBy ? { renderedBy: params.renderedBy } : {}),
    ...(params.generatedBy ? { generatedBy: params.generatedBy } : {}),
  };
}

function groupEntry(params: {
  readonly groupType: string;
  readonly label: string;
  readonly description: string;
  readonly defaultValue?: unknown;
  readonly generatedBy?: readonly string[];
}): SparcAuthoringCatalogEntry {
  return {
    id: `group.${params.groupType}`,
    label: params.label,
    category: 'group-node',
    description: params.description,
    schema: {
      type: 'object',
      required: ['id', 'nodeType', 'groupType', 'children'],
      properties: {
        ...baseGroupNodeProperties,
        groupType: { const: params.groupType },
      },
      additionalProperties: true,
    },
    ...(params.defaultValue === undefined ? {} : { defaultValue: params.defaultValue }),
    ...(params.generatedBy ? { generatedBy: params.generatedBy } : {}),
  };
}

export const SPARC_ATOMIC_NODE_CATALOG: readonly SparcAuthoringCatalogEntry[] = [
  atomicEntry({
    atomType: 'html-block',
    label: 'HTML block',
    description: 'Rich formatted text/media block rendered through the sanitized SPARC HTML renderer.',
    properties: { value: htmlValueProperty },
    defaultValue: { nodeType: 'atomic', atomType: 'html-block', value: '<p></p>' },
    renderedBy: ['SparcNode.svelte'],
    generatedBy: ['OLI rich text blocks', 'OLI images', 'missing OLI activity diagnostics'],
  }),
  atomicEntry({
    atomType: 'text-block',
    label: 'Text block',
    description: 'Plain text output block.',
    properties: { value: { type: 'string' } },
    defaultValue: { nodeType: 'atomic', atomType: 'text-block', value: '' },
    renderedBy: ['SparcNode.svelte', 'sparcSemanticNodes.ts'],
  }),
  atomicEntry({
    atomType: 'message-box',
    label: 'Message box',
    description: 'Rule-addressed feedback, hint, success, or buggy-message output target.',
    properties: { value: htmlValueProperty },
    defaultValue: { nodeType: 'atomic', atomType: 'message-box', value: '' },
    renderedBy: ['SparcNode.svelte', 'sparcProductionRuleActionCommit.ts'],
    generatedBy: ['OLI activity feedback nodes', 'semantic multiple-choice feedback nodes'],
  }),
  atomicEntry({
    atomType: 'button',
    label: 'Button',
    description: 'Learner action button. Production-rule events normally use action ButtonPressed.',
    properties: {
      label: { type: 'string' },
      value: {},
      expected: {},
      variant: { type: 'string' },
    },
    defaultValue: { nodeType: 'atomic', atomType: 'button', label: 'Choice', value: 'choice' },
    renderedBy: ['SparcNode.svelte', 'sparcTrialDisplayRuntimeBridge.ts'],
    generatedBy: ['OLI multiple-choice choices', 'OLI check/submit controls', 'semantic multiple-choice choices'],
  }),
  atomicEntry({
    atomType: 'text-input',
    label: 'Text input',
    description: 'Single-line learner text or numeric input.',
    properties: {
      value: { type: 'string' },
      expected: {},
      hint: { type: 'string' },
      maxlength: { type: 'number' },
      readOnly: { type: 'boolean' },
    },
    defaultValue: { nodeType: 'atomic', atomType: 'text-input', value: '' },
    renderedBy: ['SparcNode.svelte', 'sparcTrialDisplayRuntimeBridge.ts'],
    generatedBy: ['OLI text-input activities', 'OLI short-answer activities'],
  }),
  atomicEntry({
    atomType: 'dropdown',
    label: 'Dropdown',
    description: 'Select-one learner input rendered as a select control.',
    properties: {
      selected: { type: 'string' },
      options: { type: 'array', items: {} },
      expected: {},
      readOnly: { type: 'boolean' },
    },
    defaultValue: { nodeType: 'atomic', atomType: 'dropdown', selected: '', options: [''] },
    renderedBy: ['SparcNode.svelte'],
    generatedBy: ['OLI inline dropdown activities'],
  }),
  atomicEntry({
    atomType: 'select',
    label: 'Legacy select',
    description: 'Runtime-addressed select input recognized by the SPARC trial-display bridge. New renderer-authored content should use dropdown.',
    properties: {
      selected: { type: 'string' },
      options: { type: 'array', items: {} },
      expected: {},
    },
    defaultValue: { nodeType: 'atomic', atomType: 'select', selected: '', options: [''] },
    renderedBy: ['sparcTrialDisplayRuntimeBridge.ts'],
  }),
  atomicEntry({
    atomType: 'checkbox',
    label: 'Checkbox',
    description: 'Boolean learner input used for select-many patterns.',
    properties: {
      checked: { type: 'boolean' },
      expected: { type: 'boolean' },
      readOnly: { type: 'boolean' },
    },
    defaultValue: { nodeType: 'atomic', atomType: 'checkbox', checked: false },
    renderedBy: ['SparcNode.svelte', 'sparcTrialDisplayRuntimeBridge.ts'],
    generatedBy: ['OLI TargetedCATA activities'],
  }),
  atomicEntry({
    atomType: 'panel-selector',
    label: 'Panel selector',
    description: 'Tabbed selector that shows one authored panel at a time.',
    properties: {
      selectedPanelId: { type: 'string' },
      panels: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
    defaultValue: { nodeType: 'atomic', atomType: 'panel-selector', panels: [] },
    renderedBy: ['SparcNode.svelte'],
    generatedBy: ['OLI alternatives groups'],
  }),
  atomicEntry({
    atomType: 'skill-bar',
    label: 'Skill bar',
    description: 'Progress-style output indicator.',
    properties: {
      fill: { type: 'number' },
      label: { type: 'string' },
    },
    defaultValue: { nodeType: 'atomic', atomType: 'skill-bar', fill: 0 },
    renderedBy: ['SparcNode.svelte'],
  }),
  atomicEntry({
    atomType: 'learning-progress',
    label: 'Progress reporter',
    description: 'Adaptive model progress reporter rendered as an inline SPARC node. SPARC rendering omits target and mean probability guide lines.',
    properties: {
      label: { type: 'string' },
    },
    defaultValue: { nodeType: 'atomic', atomType: 'learning-progress', label: 'Progress' },
    renderedBy: ['SparcNode.svelte', 'LearningProgressChart.svelte'],
  }),
  atomicEntry({
    atomType: 'operator',
    label: 'Operator',
    description: 'Math/operator text cell used by structured layouts.',
    properties: { value: { type: 'string' } },
    defaultValue: { nodeType: 'atomic', atomType: 'operator', value: '+' },
    renderedBy: ['SparcNode.svelte'],
  }),
  atomicEntry({
    atomType: 'fraction-box',
    label: 'Fraction box',
    description: 'Static numerator/denominator cell for fraction layouts.',
    properties: {
      value: { type: 'string' },
      position: { enum: ['top', 'bottom'] },
      style: { type: 'string' },
    },
    defaultValue: { nodeType: 'atomic', atomType: 'fraction-box', value: '', position: 'top' },
    renderedBy: ['SparcNode.svelte'],
  }),
  atomicEntry({
    atomType: 'fraction-input',
    label: 'Fraction input',
    description: 'Text input cell paired into a numerator/denominator fraction layout.',
    properties: {
      value: { type: 'string' },
      position: { enum: ['top', 'bottom'] },
      expected: {},
    },
    defaultValue: { nodeType: 'atomic', atomType: 'fraction-input', value: '', position: 'top' },
    renderedBy: ['SparcNode.svelte'],
  }),
  atomicEntry({
    atomType: 'header-cell',
    label: 'Header cell',
    description: 'Plain header cell used in table-like layouts.',
    properties: { value: { type: 'string' } },
    defaultValue: { nodeType: 'atomic', atomType: 'header-cell', value: '' },
    renderedBy: ['SparcNode.svelte'],
  }),
  atomicEntry({
    atomType: 'text',
    label: 'Inline text',
    description: 'Plain inline text atom.',
    properties: { value: { type: 'string' } },
    defaultValue: { nodeType: 'atomic', atomType: 'text', value: '' },
    renderedBy: ['SparcNode.svelte'],
  }),
] as const;

export const SPARC_GROUP_NODE_CATALOG: readonly SparcAuthoringCatalogEntry[] = [
  groupEntry({
    groupType: 'section',
    label: 'Section',
    description: 'Page or document section with a title and ordered child nodes.',
    generatedBy: ['OLI pages'],
  }),
  groupEntry({
    groupType: 'multiple-choice',
    label: 'Multiple choice',
    description: 'Prompt plus answer-list button choices and feedback target.',
    generatedBy: ['OLI single-select activities', 'semantic multiple-choice expansion'],
  }),
  groupEntry({
    groupType: 'answer-list',
    label: 'Answer list',
    description: 'Vertical list of answer controls.',
    generatedBy: ['OLI multiple-choice', 'TargetedCATA', 'semantic multiple-choice expansion'],
  }),
  groupEntry({
    groupType: 'targeted-cata',
    label: 'Select many',
    description: 'Choose-all-that-apply exercise with checkbox rows, check button, and feedback.',
    generatedBy: ['OLI TargetedCATA activities'],
  }),
  groupEntry({
    groupType: 'checkbox-choice',
    label: 'Checkbox choice row',
    description: 'Inline checkbox plus rich label.',
    generatedBy: ['OLI TargetedCATA choices'],
  }),
  groupEntry({
    groupType: 'dropdown-exercise',
    label: 'Dropdown exercise',
    description: 'Prompt with one or more dropdown rows and feedback.',
    generatedBy: ['OLI inline dropdown activities'],
  }),
  groupEntry({
    groupType: 'dropdown-row',
    label: 'Dropdown row',
    description: 'Rich label plus dropdown input.',
    generatedBy: ['OLI inline dropdown rows'],
  }),
  groupEntry({
    groupType: 'text-input-exercise',
    label: 'Text input exercise',
    description: 'Stem, one or more text-input rows, and feedback.',
    generatedBy: ['OLI text-input activities'],
  }),
  groupEntry({
    groupType: 'text-input-row',
    label: 'Text input row',
    description: 'One answer row containing a text input.',
    generatedBy: ['OLI text-input rows'],
  }),
  groupEntry({
    groupType: 'short-answer',
    label: 'Short answer',
    description: 'Stem, text input, submit button, and feedback.',
    generatedBy: ['OLI short-answer activities'],
  }),
  groupEntry({
    groupType: 'choice-tabs',
    label: 'Choice tabs',
    description: 'Tabbed group that displays one child panel at a time.',
  }),
  groupEntry({
    groupType: 'alternative-panel',
    label: 'Alternative panel',
    description: 'Panel content shown by a selector or tabbed group.',
    generatedBy: ['OLI alternatives groups'],
  }),
  groupEntry({
    groupType: 'oli-group',
    label: 'OLI generic group',
    description: 'Converted OLI group when no more specific purpose is available.',
    generatedBy: ['OLI group blocks'],
  }),
] as const;

export const SPARC_SEMANTIC_NODE_CATALOG: readonly SparcAuthoringCatalogEntry[] = [{
  id: 'semantic.multiple-choice',
  label: 'Semantic multiple choice',
  category: 'semantic-node',
  description: 'Clean authored multiple-choice object expanded by the runtime into concrete prompt, answer-list, button, and message nodes.',
  schema: {
    type: 'object',
    required: ['id', 'nodeType', 'semanticType', 'choices'],
    properties: {
      id: idProperty,
      nodeType: { const: 'semantic' },
      semanticType: { const: 'multiple-choice' },
      label: { type: 'string' },
      feedbackNodeId: { type: 'string' },
      prompt: {
        type: 'object',
        properties: {
          id: idProperty,
          value: { type: 'string' },
        },
      },
      answerGroupId: { type: 'string' },
      choices: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'label'],
          properties: {
            id: idProperty,
            label: { type: 'string' },
            value: {},
            variant: { type: 'string' },
          },
        },
      },
    },
    additionalProperties: true,
  },
  defaultValue: {
    nodeType: 'semantic',
    semanticType: 'multiple-choice',
    choices: [],
  },
  renderedBy: ['sparcSemanticNodes.ts', 'SparcNode.svelte'],
}] as const;

export const SPARC_LAYOUT_CATALOG: readonly SparcAuthoringCatalogEntry[] = [{
  id: 'layout.policy',
  label: 'Layout policy',
  category: 'layout',
  description: 'Declarative layout policy checked by SPARC document validation.',
  schema: {
    type: 'object',
    properties: {
      scrollAxis: { enum: ['none', 'vertical'] },
      layoutMode: { enum: ['document', 'stack', 'columns', 'sidebar', 'tabs'] },
      visualPreset: {
        enum: ['assignment', 'chapter', 'section', 'practice-panel', 'feedback-panel', 'callout', 'control-panel'],
      },
      density: { enum: ['compact', 'comfortable', 'spacious'] },
      width: {},
      minWidth: {},
      maxWidth: {},
      wideContent: { enum: ['constrain', 'reflow', 'shrink', 'stack'] },
      overflowX: { enum: ['clip', 'hidden', 'visible'] },
      glue: {
        type: 'object',
        properties: {
          mode: {
            enum: [
              'multiple-choice',
              'answer-list',
              'checkbox-list',
              'dropdown-list',
              'text-input-list',
              'short-answer',
              'inline-control',
              'choice-tabs',
              'intro-feedback',
              'fill-in',
              'term-column',
              'footer-actions',
            ],
          },
          orientation: { enum: ['vertical', 'horizontal'] },
          feedbackPlacement: { enum: ['below-answers', 'header'] },
          answerPlacement: { enum: ['below-prompt'] },
          answerAlign: { enum: ['center', 'left', 'right'] },
        },
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  },
}] as const;

export const SPARC_RULE_CATALOG: readonly SparcAuthoringCatalogEntry[] = [{
  id: 'rule.condition.fact-pattern',
  label: 'Fact pattern condition',
  category: 'production-rule-condition',
  description: 'Positive working-memory fact pattern. Matching can bind, require literals, or compare to previously bound variables.',
  schema: {
    type: 'object',
    required: ['factType'],
    properties: {
      factType: { type: 'string' },
      slots: {
        type: 'object',
        additionalProperties: factSlotPatternSchema,
      },
    },
  },
}, {
  id: 'rule.condition.not-fact-pattern',
  label: 'Negated fact pattern condition',
  category: 'production-rule-condition',
  description: 'Negative condition that matches only when a fact pattern is absent.',
  schema: {
    type: 'object',
    required: ['type', 'pattern'],
    properties: {
      type: { const: 'not' },
      pattern: {
        type: 'object',
        required: ['factType'],
        properties: {
          factType: { type: 'string' },
          slots: { type: 'object', additionalProperties: factSlotPatternSchema },
        },
      },
    },
  },
}, {
  id: 'rule.test.comparison',
  label: 'Bound-variable comparison test',
  category: 'production-rule-test',
  description: 'Post-match comparison over rule expressions.',
  schema: {
    type: 'object',
    required: ['op', 'left', 'right'],
    properties: {
      op: { enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      left: ruleExpressionSchema,
      right: ruleExpressionSchema,
    },
  },
}, {
  id: 'rule.expression',
  label: 'Rule expression',
  category: 'production-rule-expression',
  description: 'Literal, bound variable, or arithmetic function expression.',
  schema: ruleExpressionSchema,
}, {
  id: 'rule.effect.assert-fact',
  label: 'Assert fact',
  category: 'production-rule-effect',
  description: 'Add a working-memory fact; persisted unless persist is explicitly false.',
  schema: {
    type: 'object',
    required: ['type', 'fact'],
    properties: {
      type: { const: 'assert-fact' },
      persist: { type: 'boolean' },
      fact: {
        type: 'object',
        required: ['factType'],
        properties: {
          factId: { type: 'string' },
          factType: { type: 'string' },
          slots: { type: 'object', additionalProperties: ruleExpressionSchema },
        },
      },
    },
  },
}, {
  id: 'rule.effect.write-state',
  label: 'Write state',
  category: 'production-rule-effect',
  description: 'Write addressed node state. The correctness key drives correct/incorrect highlighting in the renderer.',
  schema: {
    type: 'object',
    required: ['type', 'write'],
    properties: {
      type: { const: 'write-state' },
      write: {
        type: 'object',
        required: ['target', 'key', 'value'],
        properties: {
          target: documentAddressTemplateSchema,
          key: { type: 'string' },
          value: ruleExpressionSchema,
        },
      },
    },
  },
}, {
  id: 'rule.effect.message',
  label: 'Message',
  category: 'production-rule-effect',
  description: 'Emit templated learner feedback, hint, buggy, or success message to an optional target node.',
  schema: {
    type: 'object',
    required: ['type', 'messageType', 'template'],
    properties: {
      type: { const: 'message' },
      messageType: { enum: ['hint', 'buggy', 'success', 'feedback'] },
      template: { type: 'string' },
      target: documentAddressTemplateSchema,
    },
  },
}, {
  id: 'rule.effect.classify',
  label: 'Classify outcome',
  category: 'production-rule-effect',
  description: 'Classify the submitted action outcome.',
  schema: {
    type: 'object',
    required: ['type', 'outcome'],
    properties: {
      type: { const: 'classify' },
      outcome: { enum: ['correct', 'incorrect', 'partial', 'study', 'skipped', 'unknown', 'buggy'] },
    },
  },
}, {
  id: 'rule.effect.credit',
  label: 'Credit KC',
  category: 'production-rule-effect',
  description: 'Credit a knowledge component after a matched rule firing.',
  schema: {
    type: 'object',
    required: ['type', 'kc'],
    properties: {
      type: { const: 'credit' },
      kc: { type: 'string' },
    },
  },
}, {
  id: 'rule.effect.progressive-node-operation',
  label: 'Progressive node operation',
  category: 'production-rule-effect',
  description: 'Append, insert, or extend SPARC nodes through replayable state writes.',
  schema: {
    oneOf: [{
      type: 'object',
      required: ['type', 'boxId', 'node'],
      properties: {
        type: { enum: ['append-node', 'append-node-if-missing'] },
        frontier: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
        boxId: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
        beforeNodeId: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
        afterNodeId: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
        node: { type: 'object', additionalProperties: true },
      },
    }, {
      type: 'object',
      required: ['type', 'node'],
      properties: {
        type: { const: 'insert-node' },
        boxId: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
        beforeNodeId: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
        afterNodeId: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
        node: { type: 'object', additionalProperties: true },
      },
    }, {
      type: 'object',
      required: ['type', 'nodeId', 'text'],
      properties: {
        type: { const: 'append-text' },
        nodeId: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
        text: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
        separator: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
      },
    }],
  },
}, {
  id: 'reactive.condition',
  label: 'Reactive state/model condition',
  category: 'reactive-rule-condition',
  description: 'Condition language used by reactive rules and node visible/enabled checks.',
  schema: {
    oneOf: [{
      type: 'object',
      required: ['type', 'query', 'compare'],
      properties: {
        type: { const: 'state' },
        query: {
          type: 'object',
          required: ['target', 'key'],
          properties: {
            target: {
              type: 'object',
              required: ['documentId', 'nodeId'],
              properties: {
                documentId: { type: 'string' },
                nodeId: { type: 'string' },
              },
            },
            key: { type: 'string' },
          },
        },
        compare: { enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy'] },
        value: {},
      },
    }, {
      type: 'object',
      required: ['type', 'query', 'compare'],
      properties: {
        type: { const: 'model' },
        query: { type: 'object', additionalProperties: true },
        compare: { enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy'] },
        value: {},
      },
    }, {
      type: 'object',
      required: ['type', 'conditions'],
      properties: {
        type: { enum: ['all', 'any'] },
        conditions: { type: 'array', items: { description: 'Nested reactive condition.' } },
      },
    }, {
      type: 'object',
      required: ['type', 'condition'],
      properties: {
        type: { const: 'not' },
        condition: { description: 'Nested reactive condition.' },
      },
    }],
  },
}] as const;

export const SPARC_AUTHORING_CATALOG: SparcAuthoringCatalog = {
  schemaVersion: 1,
  source: 'sparc-authoring-catalog',
  nodeEntries: SPARC_ATOMIC_NODE_CATALOG,
  groupEntries: SPARC_GROUP_NODE_CATALOG,
  semanticEntries: SPARC_SEMANTIC_NODE_CATALOG,
  layoutEntries: SPARC_LAYOUT_CATALOG,
  ruleEntries: SPARC_RULE_CATALOG,
} as const;

export function getSparcAuthoringCatalog(): SparcAuthoringCatalog {
  return SPARC_AUTHORING_CATALOG;
}
