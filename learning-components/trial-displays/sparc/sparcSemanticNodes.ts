function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function expandMultipleChoiceNode(node: Record<string, unknown>): Record<string, unknown> {
  const nodeId = nonBlankString(node.id);
  const prompt = isRecord(node.prompt) ? node.prompt : {};
  const promptId = nonBlankString(prompt.id) || `${nodeId}-prompt`;
  const answerGroupId = nonBlankString(node.answerGroupId) || `${nodeId}-answers`;
  const feedbackNodeId = nonBlankString(node.feedbackNodeId) || nonBlankString(node.headerFeedbackNodeId);
  const choices = Array.isArray(node.choices) ? node.choices.filter(isRecord) : [];
  const children: Record<string, unknown>[] = [];
  if (feedbackNodeId) {
    children.push({
      id: feedbackNodeId,
      nodeType: 'atomic',
      atomType: 'message-box',
      value: '',
      layout: {
        role: 'header-feedback',
      },
    });
  }
  children.push({
    id: promptId,
    nodeType: 'atomic',
    atomType: 'text-block',
    value: prompt.value ?? node.value ?? '',
  }, {
    id: answerGroupId,
    nodeType: 'group',
    groupType: 'answer-list',
    layout: {
      glue: {
        mode: 'answer-list',
        orientation: 'vertical',
      },
    },
    children: choices.map((choice) => ({
      id: nonBlankString(choice.id),
      nodeType: 'atomic',
      atomType: 'button',
      label: choice.label ?? choice.value ?? '',
      value: choice.value ?? choice.label ?? '',
      ...(choice.variant ? { variant: choice.variant } : {}),
    })).filter((choice) => choice.id),
  });
  return {
    ...node,
    nodeType: 'group',
    groupType: nonBlankString(node.groupType) || 'multiple-choice',
    layout: {
      ...(isRecord(node.layout) ? node.layout : {}),
      glue: {
        ...(isRecord((node.layout as Record<string, unknown> | undefined)?.glue)
          ? (node.layout as Record<string, Record<string, unknown>>).glue
          : {}),
        mode: 'multiple-choice',
        answerPlacement: 'below-prompt',
        answerAlign: 'center',
      },
    },
    children,
  };
}

export function expandSparcSemanticNodes(nodes: readonly unknown[]): unknown[] {
  return nodes.map((node) => {
    if (!isRecord(node)) {
      return node;
    }
    const expanded = node.nodeType === 'semantic' && node.semanticType === 'multiple-choice'
      ? expandMultipleChoiceNode(node)
      : node;
    return {
      ...expanded,
      ...(Array.isArray(expanded.children)
        ? { children: expandSparcSemanticNodes(expanded.children) }
        : {}),
    };
  });
}
