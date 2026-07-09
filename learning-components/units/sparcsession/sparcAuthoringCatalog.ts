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
  }, {
    type: 'object',
    required: ['type'],
    properties: {
      type: { const: 'range' },
      min: { anyOf: [{ type: 'number' }, ruleExpressionSchema] },
      max: { anyOf: [{ type: 'number' }, ruleExpressionSchema] },
      minInclusive: { type: 'boolean' },
      maxInclusive: { type: 'boolean' },
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
    atomType: 'dialogue-utterance',
    label: 'Dialogue utterance',
    description: 'Sequential learner or tutor message rendered in a SPARC dialogue thread.',
    properties: {
      speaker: { enum: ['learner', 'tutor'] },
      value: { type: 'string' },
      turnEventId: { type: 'string' },
      action: { type: 'string' },
      targetType: { type: 'string' },
      targetId: { type: 'string' },
    },
    defaultValue: {
      nodeType: 'atomic',
      atomType: 'dialogue-utterance',
      speaker: 'tutor',
      value: '',
    },
    renderedBy: ['SparcNode.svelte'],
    generatedBy: ['SPARC controller dialogue turns', 'AutoTutor-to-SPARC converter'],
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
    description: 'Static authored progress-style visual. It does not read or update adaptive model probabilities; use Progress reporter for live model-backed progress.',
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
    description: 'Model-backed adaptive progress reporter. Place it inline as a SPARC document node, or use display-level progressReporter placement to request the shared sidebar progress panel.',
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
    groupType: 'dialogue-thread',
    label: 'Dialogue thread',
    description: 'Sequential SPARC dialogue transcript container with tutor and learner utterance children.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'dialogue-thread',
      children: [{
        id: 'opening-tutor-message',
        nodeType: 'atomic',
        atomType: 'dialogue-utterance',
        speaker: 'tutor',
        value: '',
      }],
    },
    generatedBy: ['SPARC controller dialogue turns', 'AutoTutor-to-SPARC converter'],
  }),
  groupEntry({
    groupType: 'section',
    label: 'Section',
    description: 'Document section container with ordered child nodes.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'section',
      children: [{
        id: 'body',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Section content</p>',
      }],
    },
    generatedBy: ['OLI pages'],
  }),
  groupEntry({
    groupType: 'multiple-choice',
    label: 'Multiple choice',
    description: 'Prompt plus answer-list button choices and feedback target.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'multiple-choice',
      children: [{
        id: 'prompt',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Question prompt</p>',
      }, {
        id: 'answers',
        nodeType: 'group',
        groupType: 'answer-list',
        children: [{
          id: 'choice-a',
          nodeType: 'atomic',
          atomType: 'button',
          label: 'Choice A',
          value: 'choice-a',
        }, {
          id: 'choice-b',
          nodeType: 'atomic',
          atomType: 'button',
          label: 'Choice B',
          value: 'choice-b',
        }],
      }, {
        id: 'feedback',
        nodeType: 'atomic',
        atomType: 'message-box',
        value: '<p>Feedback appears here.</p>',
      }],
    },
    generatedBy: ['OLI single-select activities', 'semantic multiple-choice expansion'],
  }),
  groupEntry({
    groupType: 'answer-list',
    label: 'Answer list',
    description: 'Vertical list of answer controls.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'answer-list',
      children: [{
        id: 'choice-a',
        nodeType: 'atomic',
        atomType: 'button',
        label: 'Choice A',
        value: 'choice-a',
      }, {
        id: 'choice-b',
        nodeType: 'atomic',
        atomType: 'button',
        label: 'Choice B',
        value: 'choice-b',
      }],
    },
    generatedBy: ['OLI multiple-choice', 'TargetedCATA', 'semantic multiple-choice expansion'],
  }),
  groupEntry({
    groupType: 'targeted-cata',
    label: 'Select many',
    description: 'Choose-all-that-apply exercise with checkbox rows, check button, and feedback.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'targeted-cata',
      children: [{
        id: 'prompt',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Select all correct choices.</p>',
      }, {
        id: 'choice-a',
        nodeType: 'group',
        groupType: 'checkbox-choice',
        children: [{
          id: 'checkbox',
          nodeType: 'atomic',
          atomType: 'checkbox',
          checked: false,
        }, {
          id: 'label',
          nodeType: 'atomic',
          atomType: 'html-block',
          value: '<p>Choice A</p>',
        }],
      }, {
        id: 'choice-b',
        nodeType: 'group',
        groupType: 'checkbox-choice',
        children: [{
          id: 'checkbox',
          nodeType: 'atomic',
          atomType: 'checkbox',
          checked: false,
        }, {
          id: 'label',
          nodeType: 'atomic',
          atomType: 'html-block',
          value: '<p>Choice B</p>',
        }],
      }, {
        id: 'check',
        nodeType: 'atomic',
        atomType: 'button',
        label: 'Check',
        value: 'check',
      }, {
        id: 'feedback',
        nodeType: 'atomic',
        atomType: 'message-box',
        value: '<p>Feedback appears here.</p>',
      }],
    },
    generatedBy: ['OLI TargetedCATA activities'],
  }),
  groupEntry({
    groupType: 'checkbox-choice',
    label: 'Checkbox choice row',
    description: 'Inline checkbox plus rich label.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'checkbox-choice',
      children: [{
        id: 'checkbox',
        nodeType: 'atomic',
        atomType: 'checkbox',
        checked: false,
      }, {
        id: 'label',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Choice label</p>',
      }],
    },
    generatedBy: ['OLI TargetedCATA choices'],
  }),
  groupEntry({
    groupType: 'dropdown-exercise',
    label: 'Dropdown exercise',
    description: 'Prompt with one or more dropdown rows and feedback.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'dropdown-exercise',
      children: [{
        id: 'prompt',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Complete the statement.</p>',
      }, {
        id: 'row',
        nodeType: 'group',
        groupType: 'dropdown-row',
        children: [{
          id: 'label',
          nodeType: 'atomic',
          atomType: 'html-block',
          value: '<p>Dropdown label</p>',
        }, {
          id: 'dropdown',
          nodeType: 'atomic',
          atomType: 'dropdown',
          selected: '',
          options: ['', 'Option A', 'Option B'],
        }],
      }, {
        id: 'feedback',
        nodeType: 'atomic',
        atomType: 'message-box',
        value: '<p>Feedback appears here.</p>',
      }],
    },
    generatedBy: ['OLI inline dropdown activities'],
  }),
  groupEntry({
    groupType: 'dropdown-row',
    label: 'Dropdown row',
    description: 'Rich label plus dropdown input.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'dropdown-row',
      children: [{
        id: 'label',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Dropdown label</p>',
      }, {
        id: 'dropdown',
        nodeType: 'atomic',
        atomType: 'dropdown',
        selected: '',
        options: ['', 'Option A', 'Option B'],
      }],
    },
    generatedBy: ['OLI inline dropdown rows'],
  }),
  groupEntry({
    groupType: 'text-input-exercise',
    label: 'Text input exercise',
    description: 'Stem, one or more text-input rows, and feedback.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'text-input-exercise',
      children: [{
        id: 'prompt',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Enter your answer.</p>',
      }, {
        id: 'row',
        nodeType: 'group',
        groupType: 'text-input-row',
        children: [{
          id: 'label',
          nodeType: 'atomic',
          atomType: 'html-block',
          value: '<p>Answer</p>',
        }, {
          id: 'input',
          nodeType: 'atomic',
          atomType: 'text-input',
          value: '',
          hint: 'Type answer',
        }],
      }, {
        id: 'feedback',
        nodeType: 'atomic',
        atomType: 'message-box',
        value: '<p>Feedback appears here.</p>',
      }],
    },
    generatedBy: ['OLI text-input activities'],
  }),
  groupEntry({
    groupType: 'text-input-row',
    label: 'Text input row',
    description: 'One answer row containing a text input.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'text-input-row',
      children: [{
        id: 'label',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Answer</p>',
      }, {
        id: 'input',
        nodeType: 'atomic',
        atomType: 'text-input',
        value: '',
        hint: 'Type answer',
      }],
    },
    generatedBy: ['OLI text-input rows'],
  }),
  groupEntry({
    groupType: 'short-answer',
    label: 'Short answer',
    description: 'Stem, text input, submit button, and feedback.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'short-answer',
      children: [{
        id: 'prompt',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Question prompt</p>',
      }, {
        id: 'answer',
        nodeType: 'atomic',
        atomType: 'text-input',
        value: '',
        hint: 'Type answer',
      }, {
        id: 'submit',
        nodeType: 'atomic',
        atomType: 'button',
        label: 'Submit',
        value: 'submit',
      }, {
        id: 'feedback',
        nodeType: 'atomic',
        atomType: 'message-box',
        value: '<p>Feedback appears here.</p>',
      }],
    },
    generatedBy: ['OLI short-answer activities'],
  }),
  groupEntry({
    groupType: 'choice-tabs',
    label: 'Choice tabs',
    description: 'Tabbed group that displays one child panel at a time.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'choice-tabs',
      children: [{
        id: 'panel-a',
        nodeType: 'group',
        groupType: 'alternative-panel',
        label: 'Option A',
        children: [{
          id: 'body',
          nodeType: 'atomic',
          atomType: 'html-block',
          value: '<p>Option A content</p>',
        }],
      }, {
        id: 'panel-b',
        nodeType: 'group',
        groupType: 'alternative-panel',
        label: 'Option B',
        children: [{
          id: 'body',
          nodeType: 'atomic',
          atomType: 'html-block',
          value: '<p>Option B content</p>',
        }],
      }],
    },
  }),
  groupEntry({
    groupType: 'fraction',
    label: 'Fraction',
    description: 'Explicit numerator-over-denominator fraction group. The renderer draws the fraction bar only for this group type.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'fraction',
      children: [{
        id: 'numerator',
        nodeType: 'atomic',
        atomType: 'fraction-input',
        fractionRole: 'numerator',
        value: '',
      }, {
        id: 'denominator',
        nodeType: 'atomic',
        atomType: 'fraction-input',
        fractionRole: 'denominator',
        value: '',
      }],
    },
  }),
  groupEntry({
    groupType: 'alternative-panel',
    label: 'Alternative panel',
    description: 'Panel content shown by a selector or tabbed group.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'alternative-panel',
      label: 'Alternative',
      children: [{
        id: 'body',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Alternative content</p>',
      }],
    },
    generatedBy: ['OLI alternatives groups'],
  }),
  groupEntry({
    groupType: 'oli-group',
    label: 'OLI generic group',
    description: 'Converted OLI group when no more specific purpose is available.',
    defaultValue: {
      nodeType: 'group',
      groupType: 'oli-group',
      children: [{
        id: 'body',
        nodeType: 'atomic',
        atomType: 'html-block',
        value: '<p>Group content</p>',
      }],
    },
    generatedBy: ['OLI group blocks'],
  }),
] as const;

const semanticPromptSchema: SparcAuthoringSchema = {
  type: 'object',
  properties: {
    id: idProperty,
    value: { type: 'string' },
    html: htmlValueProperty,
  },
  additionalProperties: true,
};

const semanticModelTargetSchema: SparcAuthoringSchema = {
  type: 'object',
  required: ['clusterIndex'],
  properties: {
    clusterIndex: { type: 'number' },
    clusterKC: { type: 'string' },
    stimulusKC: { type: 'string' },
  },
  additionalProperties: true,
};

const semanticScoringSchema: SparcAuthoringSchema = {
  type: 'object',
  properties: {
    responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          value: {},
          expected: {},
          acceptedValues: { type: 'array', items: {} },
          regex: { type: 'string' },
          outcome: { enum: ['correct', 'incorrect', 'partial', 'study', 'skipped', 'unknown'] },
          feedback: htmlValueProperty,
        },
        additionalProperties: true,
      },
    },
    default: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        outcome: { enum: ['correct', 'incorrect', 'partial', 'study', 'skipped', 'unknown'] },
        feedback: htmlValueProperty,
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

const semanticSharedProperties: Readonly<Record<string, SparcAuthoringSchema>> = {
  id: idProperty,
  nodeType: { const: 'semantic' },
  label: { type: 'string' },
  prompt: semanticPromptSchema,
  feedbackNodeId: { type: 'string' },
  headerFeedbackNodeId: { type: 'string' },
  clusterIndex: { type: 'number' },
  modelTarget: semanticModelTargetSchema,
  kc: { type: 'string' },
  scoring: semanticScoringSchema,
  layout: { type: 'object', additionalProperties: true },
  source: { type: 'object', additionalProperties: true },
};

const semanticChoiceSchema: SparcAuthoringSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: idProperty,
    label: { type: 'string' },
    html: htmlValueProperty,
    value: {},
    correct: { type: 'boolean' },
    variant: { type: 'string' },
  },
  additionalProperties: true,
};

const semanticInputSchema: SparcAuthoringSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: idProperty,
    label: { type: 'string' },
    html: htmlValueProperty,
    expected: {},
    acceptedValues: { type: 'array', items: {} },
    options: { type: 'array', items: {} },
    clusterIndex: { type: 'number' },
    modelTarget: semanticModelTargetSchema,
    kc: { type: 'string' },
    scoring: semanticScoringSchema,
  },
  additionalProperties: true,
};

function semanticEntry(params: {
  readonly semanticType: string;
  readonly label: string;
  readonly description: string;
  readonly properties: Readonly<Record<string, SparcAuthoringSchema>>;
  readonly defaultValue: Record<string, unknown>;
}): SparcAuthoringCatalogEntry {
  return {
    id: `semantic.${params.semanticType}`,
    label: params.label,
    category: 'semantic-node',
    description: params.description,
    schema: {
      type: 'object',
      required: ['id', 'nodeType', 'semanticType'],
      properties: {
        ...semanticSharedProperties,
        semanticType: { const: params.semanticType },
        ...params.properties,
      },
      additionalProperties: true,
    },
    defaultValue: {
      nodeType: 'semantic',
      semanticType: params.semanticType,
      ...params.defaultValue,
    },
    renderedBy: ['sparcSemanticNodes.ts', 'SparcNode.svelte'],
  };
}

export const SPARC_SEMANTIC_NODE_CATALOG: readonly SparcAuthoringCatalogEntry[] = [
  semanticEntry({
    semanticType: 'multiple-choice',
    label: 'Semantic multiple choice',
    description: 'Authored single-select question expanded into prompt, answer-list buttons, response intent, feedback rules, and model-practice effects when model target metadata is present.',
    properties: {
      answerGroupId: { type: 'string' },
      choices: { type: 'array', items: semanticChoiceSchema },
    },
    defaultValue: {
      id: 'semantic-multiple-choice',
      choices: [{ id: 'choice-a', label: 'Choice A', value: 'A', correct: true }],
    },
  }),
  semanticEntry({
    semanticType: 'select-many',
    label: 'Semantic select many',
    description: 'Authored choose-all-that-apply question expanded into checkbox rows, a check button, feedback rules, and model-practice effects.',
    properties: {
      answerGroupId: { type: 'string' },
      choices: { type: 'array', items: semanticChoiceSchema },
    },
    defaultValue: {
      id: 'semantic-select-many',
      choices: [{ id: 'choice-a', label: 'Choice A', value: 'A', correct: true }],
    },
  }),
  semanticEntry({
    semanticType: 'dropdown',
    label: 'Semantic dropdown',
    description: 'Authored one-or-many dropdown question expanded into dropdown rows, response intent, feedback rules, and model-practice effects.',
    properties: {
      inputs: { type: 'array', items: semanticInputSchema },
    },
    defaultValue: {
      id: 'semantic-dropdown',
      inputs: [{ id: 'a', label: 'Answer', options: ['Option A', 'Option B'], expected: 'Option A' }],
    },
  }),
  semanticEntry({
    semanticType: 'text-input',
    label: 'Semantic text input',
    description: 'Authored one-or-many text input question expanded into text-input rows, response intent, feedback rules, and model-practice effects.',
    properties: {
      inputs: { type: 'array', items: semanticInputSchema },
    },
    defaultValue: {
      id: 'semantic-text-input',
      inputs: [{ id: 'answer', label: 'Answer', expected: '' }],
    },
  }),
  semanticEntry({
    semanticType: 'numeric-input',
    label: 'Semantic numeric input',
    description: 'Authored numeric answer question expanded into text-input rows with numeric input hints, response intent, feedback rules, and model-practice effects.',
    properties: {
      inputs: { type: 'array', items: semanticInputSchema },
    },
    defaultValue: {
      id: 'semantic-numeric-input',
      inputs: [{ id: 'answer', label: 'Answer', expected: 0 }],
    },
  }),
  semanticEntry({
    semanticType: 'short-answer',
    label: 'Semantic short answer',
    description: 'Authored short-answer question expanded into stem, learner response input, submit button, feedback rules, and model-practice effects.',
    properties: {
      expected: {},
      inputs: { type: 'array', items: semanticInputSchema },
    },
    defaultValue: {
      id: 'semantic-short-answer',
      expected: '',
    },
  }),
] as const;

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
  id: 'rule.condition.any',
  label: 'Any condition',
  category: 'production-rule-condition',
  description: 'OR condition that matches when any nested production-rule condition matches.',
  schema: {
    type: 'object',
    required: ['type', 'conditions'],
    properties: {
      type: { const: 'any' },
      conditions: {
        type: 'array',
        items: { description: 'Nested fact-pattern, negated fact-pattern, or any condition.' },
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
    required: ['op', 'left'],
    properties: {
      op: { enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy', 'regex'] },
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
      identitySlots: {
        type: 'array',
        items: { type: 'string' },
      },
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
  id: 'rule.effect.model-practice',
  label: 'Model practice update',
  category: 'production-rule-effect',
  description: 'Write adaptive model history for the matched production-rule outcome. Without an explicit cluster index, the runtime resolves through the source node cluster attachment.',
  schema: {
    type: 'object',
    required: ['type', 'outcome'],
    properties: {
      type: { const: 'model-practice' },
      outcome: { enum: ['correct', 'incorrect', 'partial', 'study', 'skipped', 'unknown'] },
      clusterIndex: { anyOf: [{ type: 'number' }, ruleExpressionSchema] },
      nodeId: { anyOf: [{ type: 'string' }, ruleExpressionSchema] },
      responseValue: ruleExpressionSchema,
      input: ruleExpressionSchema,
    },
  },
}, {
  id: 'rule.effect.terminate-production-phase',
  label: 'Stop production rules',
  category: 'production-rule-effect',
  description: 'Stop the current salience-ranked production-rule run after this rule fires.',
  schema: {
    type: 'object',
    required: ['type'],
    properties: {
      type: { const: 'terminate-production-phase' },
      reason: { type: 'string' },
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
