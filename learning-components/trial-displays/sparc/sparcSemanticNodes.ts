type JsonRecord = Record<string, unknown>;

type SemanticCompileContext = {
  readonly nodeIds: Set<string>;
  readonly ruleIds: Set<string>;
};

type SemanticPartSpec = {
  readonly nodeId: string;
  readonly selection: string;
  readonly action: string;
  readonly expected: unknown;
  readonly acceptedValues?: unknown[];
  readonly responseType: string;
  readonly clusterIndex: number;
  readonly feedbackNodeId: string;
  readonly kc: string;
  readonly responses: SemanticResponseSpec[];
  readonly defaultResponse?: SemanticResponseSpec;
};

type SemanticCompileResult = {
  readonly display: JsonRecord;
  readonly nodes: unknown[];
};

type SemanticRuleTest = {
  readonly op: 'eq' | 'neq' | 'regex';
  readonly left: JsonRecord;
  readonly right: JsonRecord;
};

type SemanticResponseSpec = {
  readonly id: string;
  readonly value: unknown;
  readonly outcome: string;
  readonly message: string;
  readonly tests: SemanticRuleTest[];
};

const SUPPORTED_SEMANTIC_TYPES = new Set([
  'multiple-choice',
  'select-many',
  'dropdown',
  'text-input',
  'numeric-input',
  'short-answer',
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function requireNonBlank(value: unknown, label: string): string {
  const text = nonBlankString(value);
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function literal(value: unknown): JsonRecord {
  return { type: 'literal', value };
}

function variable(name: string): JsonRecord {
  return { type: 'variable', name };
}

function bind(variableName: string): JsonRecord {
  return { type: 'bind', variable: variableName };
}

function stableText(value: unknown, fallback = ''): string {
  const text = nonBlankString(value);
  return text || fallback;
}

function semanticPromptHtml(node: JsonRecord): string {
  const prompt = isRecord(node.prompt) ? node.prompt : {};
  return stableText(prompt.html, stableText(prompt.value, stableText(node.value, stableText(node.label))));
}

function promptId(node: JsonRecord): string {
  const prompt = isRecord(node.prompt) ? node.prompt : {};
  return nonBlankString(prompt.id) || `${requireNonBlank(node.id, 'semantic node id')}-prompt`;
}

function feedbackNodeId(node: JsonRecord): string {
  const nodeId = requireNonBlank(node.id, 'semantic node id');
  return nonBlankString(node.feedbackNodeId)
    || nonBlankString(node.headerFeedbackNodeId)
    || `${nodeId}-feedback`;
}

function answerGroupId(node: JsonRecord): string {
  return nonBlankString(node.answerGroupId) || `${requireNonBlank(node.id, 'semantic node id')}-answers`;
}

function semanticModelClusterIndex(node: JsonRecord, child: JsonRecord | null, label: string): number {
  const modelTarget = isRecord(child?.modelTarget) ? child.modelTarget : isRecord(node.modelTarget) ? node.modelTarget : {};
  const rawClusterIndex = child?.clusterIndex ?? modelTarget.clusterIndex ?? node.clusterIndex;
  const clusterIndex = Number(rawClusterIndex);
  if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
    throw new Error(`${label} requires an explicit non-negative clusterIndex`);
  }
  return clusterIndex;
}

function semanticBehaviorEnabled(node: JsonRecord): boolean {
  return node.clusterIndex !== undefined || isRecord(node.modelTarget) || isRecord(node.scoring);
}

function semanticKc(node: JsonRecord, child: JsonRecord | null): string {
  const modelTarget = isRecord(child?.modelTarget) ? child.modelTarget : isRecord(node.modelTarget) ? node.modelTarget : {};
  return stableText(child?.kc, stableText(modelTarget.clusterKC, stableText(node.kc, stableText(node.id, 'semantic'))));
}

function registerNodeId(context: SemanticCompileContext, node: JsonRecord): void {
  const id = nonBlankString(node.id);
  if (!id) {
    return;
  }
  if (context.nodeIds.has(id)) {
    throw new Error(`SPARC semantic compiler generated duplicate node id "${id}"`);
  }
  context.nodeIds.add(id);
}

function registerNodeTree(context: SemanticCompileContext, node: unknown): void {
  if (!isRecord(node)) {
    return;
  }
  registerNodeId(context, node);
  for (const child of asRecords(node.children)) {
    registerNodeTree(context, child);
  }
  for (const panel of asRecords(node.panels)) {
    for (const child of asRecords(panel.children)) {
      registerNodeTree(context, child);
    }
  }
}

function collectExistingIds(nodes: readonly unknown[], context: SemanticCompileContext): void {
  for (const node of nodes) {
    if (!isRecord(node)) {
      continue;
    }
    if (node.nodeType !== 'semantic') {
      registerNodeTree(context, node);
      continue;
    }
    for (const child of asRecords(node.children)) {
      collectExistingIds([child], context);
    }
  }
}

function responseTests(response: JsonRecord, defaultExpected: unknown): SemanticRuleTest[] {
  const exactValues = 'value' in response
    ? [response.value]
    : 'expected' in response
      ? [response.expected]
      : [defaultExpected];
  const acceptedValues = Array.isArray(response.acceptedValues) && response.acceptedValues.length > 0
    ? response.acceptedValues
    : exactValues;
  const tests: SemanticRuleTest[] = acceptedValues.map((value) => ({
    op: 'eq',
    left: variable('input'),
    right: literal(value),
  }));
  const regex = nonBlankString(response.regex);
  if (regex) {
    tests.push({
      op: 'regex',
      left: variable('input'),
      right: literal(regex),
    });
  }
  return tests;
}

function semanticResponses(node: JsonRecord, part: JsonRecord, defaultExpected: unknown): {
  readonly responses: SemanticResponseSpec[];
  readonly defaultResponse?: SemanticResponseSpec;
} {
  const scoring = isRecord(part.scoring) ? part.scoring : isRecord(node.scoring) ? node.scoring : {};
  const authoredResponses = asRecords(scoring.responses);
  const responses = authoredResponses.map((response, index) => ({
    id: stableText(response.id, `response-${index}`),
    value: 'value' in response ? response.value : 'expected' in response ? response.expected : defaultExpected,
    outcome: stableText(response.outcome, index === 0 ? 'correct' : 'incorrect'),
    message: stableText(response.feedback, stableText(response.message, stableText(scoring.feedback, ''))),
    tests: responseTests(response, defaultExpected),
  }));
  if (responses.length === 0) {
    responses.push({
      id: 'correct',
      value: defaultExpected,
      outcome: 'correct',
      message: stableText(scoring.correctFeedback, stableText(scoring.feedback, 'Correct.')),
      tests: responseTests({ value: defaultExpected }, defaultExpected),
    });
  }
  const defaultScoring = isRecord(scoring.default) ? scoring.default : null;
  const defaultResponse: SemanticResponseSpec | undefined = defaultScoring
    ? {
        id: stableText(defaultScoring.id, 'default'),
        value: '',
        outcome: stableText(defaultScoring.outcome, 'incorrect'),
        message: stableText(defaultScoring.feedback, stableText(defaultScoring.message, 'Incorrect.')),
        tests: responses.flatMap((response) => response.tests
          .filter((test) => test.op === 'eq')
          .map((test) => ({
            op: 'neq',
            left: variable('input'),
            right: test.right,
          }))),
      }
    : undefined;
  return {
    responses,
    ...(defaultResponse ? { defaultResponse } : {}),
  };
}

function productionRule(params: {
  readonly semanticNode: JsonRecord;
  readonly part: SemanticPartSpec;
  readonly response: SemanticResponseSpec;
  readonly ruleSuffix: string;
  readonly salience: number;
}): JsonRecord {
  const semanticId = requireNonBlank(params.semanticNode.id, 'semantic node id');
  const ruleId = `${semanticId}.${params.part.nodeId}.${params.ruleSuffix}`;
  return {
    id: ruleId,
    module: nonBlankString(params.semanticNode.module),
    salience: params.salience,
    when: [{
      factType: 'interface-event',
      slots: {
        documentId: bind('documentId'),
        selection: literal(params.part.selection),
        action: literal(params.part.action),
        input: bind('input'),
      },
    }],
    tests: params.response.tests,
    then: [
      { type: 'classify', outcome: params.response.outcome },
      {
        type: 'write-state',
        write: {
          target: { documentId: variable('documentId'), nodeId: literal(params.part.nodeId) },
          key: 'correctness',
          value: literal(params.response.outcome),
        },
      },
      {
        type: 'message',
        messageType: 'feedback',
        template: params.response.message,
        target: { documentId: variable('documentId'), nodeId: literal(params.part.feedbackNodeId) },
      },
      { type: 'credit', kc: params.part.kc },
      {
        type: 'model-practice',
        outcome: params.response.outcome,
        clusterIndex: params.part.clusterIndex,
        nodeId: params.part.nodeId,
        responseValue: variable('input'),
      },
    ],
  };
}

function semanticIntent(part: SemanticPartSpec): JsonRecord {
  return {
    node: part.nodeId,
    expected: part.expected,
    ...(part.acceptedValues ? { acceptedValues: part.acceptedValues } : {}),
    type: part.responseType,
  };
}

function makeFeedbackNode(node: JsonRecord): JsonRecord {
  return {
    id: feedbackNodeId(node),
    nodeType: 'atomic',
    atomType: 'message-box',
    value: '',
    ...(node.headerFeedbackNodeId ? { layout: { role: 'header-feedback' } } : {}),
  };
}

function compileMultipleChoice(node: JsonRecord): {
  readonly node: JsonRecord;
  readonly parts: SemanticPartSpec[];
} {
  const nodeId = requireNonBlank(node.id, 'semantic multiple-choice id');
  const choices = asRecords(node.choices);
  const correctChoice = choices.find((choice) => choice.correct === true) ?? choices[0];
  const expected = correctChoice ? (correctChoice.value ?? correctChoice.id) : '';
  const behaviorEnabled = semanticBehaviorEnabled(node);
  const clusterIndex = behaviorEnabled
    ? semanticModelClusterIndex(node, null, `semantic multiple-choice "${nodeId}"`)
    : undefined;
  const feedbackId = feedbackNodeId(node);
  const answerChildren = choices.map((choice) => {
    const choiceId = requireNonBlank(choice.id, `semantic multiple-choice "${nodeId}" choice id`);
    return {
      id: choiceId,
      nodeType: 'atomic',
      atomType: 'button',
      ...(clusterIndex !== undefined ? { clusterIndex } : {}),
      label: choice.label ?? choice.value ?? '',
      value: choice.value ?? choice.id,
      expected,
      ...(choice.variant ? { variant: choice.variant } : {}),
    };
  });
  return {
    node: {
      ...node,
      nodeType: 'group',
      groupType: 'multiple-choice',
      layout: {
        ...(isRecord(node.layout) ? node.layout : {}),
        glue: {
          ...(isRecord((node.layout as JsonRecord | undefined)?.glue)
            ? (node.layout as Record<string, JsonRecord>).glue
            : {}),
          mode: 'multiple-choice',
          answerPlacement: 'below-prompt',
          answerAlign: 'center',
        },
      },
      children: [
        ...(node.headerFeedbackNodeId ? [makeFeedbackNode(node)] : []),
        { id: promptId(node), nodeType: 'atomic', atomType: 'text-block', value: semanticPromptHtml(node) },
        {
          id: answerGroupId(node),
          nodeType: 'group',
          groupType: 'answer-list',
          layout: { glue: { mode: 'answer-list', orientation: 'vertical' } },
          children: answerChildren,
        },
        ...(!node.headerFeedbackNodeId && (behaviorEnabled || nonBlankString(node.feedbackNodeId)) ? [makeFeedbackNode(node)] : []),
      ],
    },
    parts: behaviorEnabled
      ? answerChildren.map((choice) => {
          const choiceValue = choice.value;
          const response = {
            id: String(choiceValue ?? choice.id),
            value: choiceValue,
            outcome: choiceValue === expected ? 'correct' : 'incorrect',
            message: choiceValue === expected ? 'Correct.' : 'Incorrect.',
            tests: responseTests({ value: choiceValue }, choiceValue),
          };
          return {
            nodeId: String(choice.id),
            selection: String(choice.id),
            action: 'ButtonPressed',
            expected,
            responseType: choiceValue === expected ? 'correct-choice' : 'incorrect-choice',
            clusterIndex: clusterIndex!,
            feedbackNodeId: feedbackId,
            kc: semanticKc(node, null),
            responses: [response],
          };
        })
      : [],
  };
}

function compileSelectMany(node: JsonRecord): {
  readonly node: JsonRecord;
  readonly parts: SemanticPartSpec[];
} {
  const nodeId = requireNonBlank(node.id, 'semantic select-many id');
  const choices = asRecords(node.choices);
  const clusterIndex = semanticModelClusterIndex(node, null, `semantic select-many "${nodeId}"`);
  const feedbackId = feedbackNodeId(node);
  const children = choices.map((choice) => {
    const choiceId = requireNonBlank(choice.id, `semantic select-many "${nodeId}" choice id`);
    const checkboxId = `${nodeId}-choice-${choiceId}-checkbox`;
    return {
      id: `${nodeId}-choice-${choiceId}`,
      nodeType: 'group',
      groupType: 'checkbox-choice',
      layout: { glue: { mode: 'inline-control' } },
      children: [
        {
          id: checkboxId,
          nodeType: 'atomic',
          atomType: 'checkbox',
          clusterIndex,
          checked: false,
          expected: choice.correct === true,
        },
        {
          id: `${nodeId}-choice-${choiceId}-label`,
          nodeType: 'atomic',
          atomType: 'html-block',
          value: choice.html ?? choice.label ?? '',
        },
      ],
    };
  });
  const selectedValues = choices
    .filter((choice) => choice.correct === true)
    .map((choice) => choice.value ?? choice.id);
  const checkNodeId = `${nodeId}-check`;
  const { responses, defaultResponse } = semanticResponses(node, { ...node, clusterIndex }, selectedValues);
  return {
    node: {
      ...node,
      nodeType: 'group',
      groupType: 'targeted-cata',
      label: stableText(node.label, semanticPromptHtml(node)),
      layout: {
        ...(isRecord(node.layout) ? node.layout : {}),
        glue: {
          mode: 'checkbox-list',
          orientation: 'vertical',
          feedbackPlacement: 'below-answers',
        },
      },
      children: [
        { id: promptId(node), nodeType: 'atomic', atomType: 'html-block', value: semanticPromptHtml(node) },
        { id: answerGroupId(node), nodeType: 'group', groupType: 'answer-list', children },
        { id: checkNodeId, nodeType: 'atomic', atomType: 'button', clusterIndex, label: 'Check', value: 'check' },
        makeFeedbackNode(node),
      ],
    },
    parts: [{
      nodeId: checkNodeId,
      selection: checkNodeId,
      action: 'ButtonPressed',
      expected: selectedValues,
      responseType: 'select-many',
      clusterIndex,
      feedbackNodeId: feedbackId,
      kc: semanticKc(node, null),
      responses,
      ...(defaultResponse ? { defaultResponse } : {}),
    }],
  };
}

function compileDropdown(node: JsonRecord): {
  readonly node: JsonRecord;
  readonly parts: SemanticPartSpec[];
} {
  const nodeId = requireNonBlank(node.id, 'semantic dropdown id');
  const inputs = asRecords(node.inputs);
  const feedbackId = feedbackNodeId(node);
  const rows: JsonRecord[] = [];
  const parts: SemanticPartSpec[] = [];
  for (const input of inputs) {
    const inputId = requireNonBlank(input.id, `semantic dropdown "${nodeId}" input id`);
    const clusterIndex = semanticModelClusterIndex(node, input, `semantic dropdown "${nodeId}" input "${inputId}"`);
    const inputNodeId = `${nodeId}-input-${inputId}`;
    const options = Array.isArray(input.options)
      ? input.options.map((option) => isRecord(option) ? option.label ?? option.value ?? option.id ?? '' : option)
      : [];
    const expected = input.expected ?? input.value ?? options[0] ?? '';
    const { responses, defaultResponse } = semanticResponses(node, input, expected);
    rows.push({
      id: `${nodeId}-row-${inputId}`,
      nodeType: 'group',
      groupType: 'dropdown-row',
      layout: { glue: { mode: 'inline-control' } },
      children: [
        { id: `${nodeId}-label-${inputId}`, nodeType: 'atomic', atomType: 'html-block', value: input.label ?? input.html ?? '' },
        { id: inputNodeId, nodeType: 'atomic', atomType: 'dropdown', clusterIndex, selected: '', options: ['', ...options], expected },
      ],
    });
    parts.push({
      nodeId: inputNodeId,
      selection: inputNodeId,
      action: 'UpdateComboBox',
      expected,
      responseType: 'dropdown',
      clusterIndex,
      feedbackNodeId: feedbackId,
      kc: semanticKc(node, input),
      responses,
      ...(Array.isArray(input.acceptedValues) ? { acceptedValues: input.acceptedValues } : {}),
      ...(defaultResponse ? { defaultResponse } : {}),
    });
  }
  return {
    node: {
      ...node,
      nodeType: 'group',
      groupType: 'dropdown-exercise',
      label: stableText(node.label, semanticPromptHtml(node)),
      layout: {
        ...(isRecord(node.layout) ? node.layout : {}),
        glue: { mode: 'dropdown-list', orientation: 'vertical', feedbackPlacement: 'below-answers' },
      },
      children: [
        { id: promptId(node), nodeType: 'atomic', atomType: 'html-block', value: semanticPromptHtml(node) },
        ...rows,
        makeFeedbackNode(node),
      ],
    },
    parts,
  };
}

function compileTextLike(node: JsonRecord, semanticType: string): {
  readonly node: JsonRecord;
  readonly parts: SemanticPartSpec[];
} {
  const nodeId = requireNonBlank(node.id, `semantic ${semanticType} id`);
  const inputs = asRecords(node.inputs);
  const effectiveInputs = inputs.length > 0 ? inputs : [{ id: 'answer', expected: node.expected }];
  const feedbackId = feedbackNodeId(node);
  const rows: JsonRecord[] = [];
  const parts: SemanticPartSpec[] = [];
  for (const input of effectiveInputs) {
    const inputId = requireNonBlank(input.id, `semantic ${semanticType} "${nodeId}" input id`);
    const clusterIndex = semanticModelClusterIndex(node, input, `semantic ${semanticType} "${nodeId}" input "${inputId}"`);
    const inputNodeId = semanticType === 'short-answer' && effectiveInputs.length === 1
      ? `${nodeId}-input`
      : `${nodeId}-input-${inputId}`;
    const expected = input.expected ?? node.expected ?? '';
    const { responses, defaultResponse } = semanticResponses(node, input, expected);
    const inputNode = {
      id: inputNodeId,
      nodeType: 'atomic',
      atomType: 'text-input',
      clusterIndex,
      value: '',
      expected,
      ...(semanticType === 'numeric-input' ? { inputMode: 'numeric' } : {}),
    };
    if (semanticType === 'short-answer') {
      rows.push(inputNode);
    } else {
      rows.push({
        id: `${nodeId}-row-${inputId}`,
        nodeType: 'group',
        groupType: 'text-input-row',
        layout: { glue: { mode: 'inline-control' } },
        children: [
          ...(input.label || input.html ? [{ id: `${nodeId}-label-${inputId}`, nodeType: 'atomic', atomType: 'html-block', value: input.label ?? input.html }] : []),
          inputNode,
        ],
      });
    }
    parts.push({
      nodeId: inputNodeId,
      selection: semanticType === 'short-answer' ? `${nodeId}-submit` : inputNodeId,
      action: semanticType === 'short-answer' ? 'ButtonPressed' : 'UpdateTextField',
      expected,
      responseType: semanticType,
      clusterIndex,
      feedbackNodeId: feedbackId,
      kc: semanticKc(node, input),
      responses,
      ...(Array.isArray(input.acceptedValues) ? { acceptedValues: input.acceptedValues } : {}),
      ...(defaultResponse ? { defaultResponse } : {}),
    });
  }
  const groupType = semanticType === 'short-answer' ? 'short-answer' : 'text-input-exercise';
  return {
    node: {
      ...node,
      nodeType: 'group',
      groupType,
      label: stableText(node.label, semanticPromptHtml(node)),
      layout: {
        ...(isRecord(node.layout) ? node.layout : {}),
        glue: {
          mode: semanticType === 'short-answer' ? 'short-answer' : 'text-input-list',
          ...(semanticType === 'short-answer' ? {} : { orientation: 'vertical' }),
          feedbackPlacement: 'below-answers',
        },
      },
      children: [
        { id: promptId(node), nodeType: 'atomic', atomType: 'html-block', value: semanticPromptHtml(node) },
        ...rows,
        ...(semanticType === 'short-answer'
          ? [{ id: `${nodeId}-submit`, nodeType: 'atomic', atomType: 'button', clusterIndex: parts[0]?.clusterIndex ?? 0, label: 'Submit', value: 'submit' }]
          : []),
        makeFeedbackNode(node),
      ],
    },
    parts,
  };
}

function compileSemanticNode(node: JsonRecord): {
  readonly node: JsonRecord;
  readonly parts: SemanticPartSpec[];
} {
  const semanticType = requireNonBlank(node.semanticType, 'semanticType');
  if (!SUPPORTED_SEMANTIC_TYPES.has(semanticType)) {
    throw new Error(`Unsupported SPARC semanticType "${semanticType}"`);
  }
  if (semanticType === 'multiple-choice') {
    return compileMultipleChoice(node);
  }
  if (semanticType === 'select-many') {
    return compileSelectMany(node);
  }
  if (semanticType === 'dropdown') {
    return compileDropdown(node);
  }
  return compileTextLike(node, semanticType);
}

function compileNode(node: unknown, context: SemanticCompileContext): {
  readonly node: unknown;
  readonly intents: JsonRecord[];
  readonly rules: JsonRecord[];
} {
  if (!isRecord(node)) {
    return { node, intents: [], rules: [] };
  }
  if (node.nodeType === 'semantic') {
    const compiled = compileSemanticNode(node);
    registerNodeTree(context, compiled.node);
    const intents = compiled.parts.map(semanticIntent);
    const rules: JsonRecord[] = [];
    for (const part of compiled.parts) {
      for (const response of part.responses) {
        rules.push(productionRule({ semanticNode: node, part, response, ruleSuffix: response.id, salience: response.outcome === 'correct' ? 30 : 20 }));
      }
      if (part.defaultResponse) {
        rules.push(productionRule({ semanticNode: node, part, response: part.defaultResponse, ruleSuffix: part.defaultResponse.id, salience: 5 }));
      }
    }
    for (const rule of rules) {
      const ruleId = requireNonBlank(rule.id, 'generated production rule id');
      if (context.ruleIds.has(ruleId)) {
        throw new Error(`SPARC semantic compiler generated duplicate production rule id "${ruleId}"`);
      }
      context.ruleIds.add(ruleId);
    }
    return { node: compiled.node, intents, rules };
  }
  const childResults = Array.isArray(node.children)
    ? node.children.map((child) => compileNode(child, context))
    : [];
  const compiledNode = {
    ...node,
    ...(childResults.length > 0 ? { children: childResults.map((result) => result.node) } : {}),
  };
  return {
    node: compiledNode,
    intents: childResults.flatMap((result) => result.intents),
    rules: childResults.flatMap((result) => result.rules),
  };
}

function normalizeExistingRuleIds(display: JsonRecord): Set<string> {
  const ruleIds = new Set<string>();
  for (const [index, rule] of asRecords(display.productionRules).entries()) {
    const ruleId = requireNonBlank(rule.id, `SPARC productionRules[${index}].id`);
    if (ruleIds.has(ruleId)) {
      throw new Error(`SPARC display declares duplicate production rule id "${ruleId}"`);
    }
    ruleIds.add(ruleId);
  }
  return ruleIds;
}

export function compileSparcSemanticDisplay(display: JsonRecord): SemanticCompileResult {
  const nodes = Array.isArray(display.nodes) ? display.nodes : [];
  const context: SemanticCompileContext = {
    nodeIds: new Set<string>(),
    ruleIds: normalizeExistingRuleIds(display),
  };
  collectExistingIds(nodes, context);
  const results = nodes.map((node) => compileNode(node, context));
  const generatedIntents = results.flatMap((result) => result.intents);
  const generatedRules = results.flatMap((result) => result.rules);
  const existingResponse = isRecord(display.response) ? display.response : {};
  const existingIntentByNode = Array.isArray(existingResponse.intentByNode) ? existingResponse.intentByNode : [];
  const existingProductionRules = asRecords(display.productionRules);
  const existingScoredNodes = Array.isArray(existingResponse.scoredNodes) ? existingResponse.scoredNodes : [];
  const hasResponse = isRecord(display.response) || generatedIntents.length > 0;
  const hasProductionRules = Array.isArray(display.productionRules) || generatedRules.length > 0;
  return {
    display: {
      ...display,
      nodes: results.map((result) => result.node),
      ...(hasProductionRules
        ? {
            productionRules: [
              ...existingProductionRules,
              ...generatedRules,
            ],
          }
        : {}),
      ...(hasResponse
        ? {
            response: {
              ...existingResponse,
              gradingMode: stableText(existingResponse.gradingMode, 'node-intent'),
              scoredNodes: [
                ...existingScoredNodes,
                ...generatedIntents.map((intent) => intent.node),
              ],
              intentByNode: [
                ...existingIntentByNode,
                ...generatedIntents,
              ],
            },
          }
        : {}),
    },
    nodes: results.map((result) => result.node),
  };
}

export function expandSparcSemanticNodes(nodes: readonly unknown[]): unknown[] {
  return compileSparcSemanticDisplay({ nodes }).nodes;
}
