function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fractionAtomRole(node: unknown): 'numerator' | 'denominator' | '' {
  if (!isRecord(node) || node.nodeType !== 'atomic') {
    return '';
  }
  if (node.atomType !== 'fraction-box' && node.atomType !== 'fraction-input') {
    return '';
  }
  const explicitRole = typeof node.fractionRole === 'string'
    ? node.fractionRole.trim()
    : typeof node.role === 'string'
      ? node.role.trim()
      : isRecord(node.layout) && typeof node.layout.role === 'string'
        ? node.layout.role.trim()
        : '';
  if (explicitRole === 'numerator' || explicitRole === 'top') {
    return 'numerator';
  }
  if (explicitRole === 'denominator' || explicitRole === 'bottom') {
    return 'denominator';
  }
  const position = typeof node.position === 'string' ? node.position.trim() : '';
  if (position === 'top') {
    return 'numerator';
  }
  if (position === 'bottom') {
    return 'denominator';
  }
  return '';
}

function fractionGroupId(numerator: Record<string, unknown>, denominator: Record<string, unknown>): string {
  const numeratorId = typeof numerator.id === 'string' && numerator.id.trim()
    ? numerator.id.trim()
    : 'numerator';
  const denominatorId = typeof denominator.id === 'string' && denominator.id.trim()
    ? denominator.id.trim()
    : 'denominator';
  const prefix = numeratorId.replace(/(?:[-_]?top|[-_]?numerator)$/i, '');
  return `${prefix || numeratorId}-${denominatorId.replace(/^.*(?:[-_])/, '')}-fraction`;
}

function normalizeFractionChild(node: Record<string, unknown>, fractionRole: 'numerator' | 'denominator'): Record<string, unknown> {
  return {
    ...node,
    fractionRole,
  };
}

function buildFractionGroup(numerator: Record<string, unknown>, denominator: Record<string, unknown>): Record<string, unknown> {
  return {
    id: fractionGroupId(numerator, denominator),
    nodeType: 'group',
    groupType: 'fraction',
    ...(isRecord(numerator.placement) ? { placement: numerator.placement } : {}),
    children: [
      normalizeFractionChild(numerator, 'numerator'),
      normalizeFractionChild(denominator, 'denominator'),
    ],
  };
}

function normalizeNode(node: unknown): unknown {
  if (!isRecord(node)) {
    return node;
  }
  if (node.nodeType === 'group' && node.groupType === 'fraction') {
    return node;
  }
  if (node.nodeType === 'group' && Array.isArray(node.children)) {
    return {
      ...node,
      children: normalizeSparcFractionGroups(node.children),
    };
  }
  if (node.atomType === 'panel-selector' && Array.isArray(node.panels)) {
    return {
      ...node,
      panels: node.panels.map((panel) => (
        isRecord(panel) && Array.isArray(panel.children)
          ? { ...panel, children: normalizeSparcFractionGroups(panel.children) }
          : panel
      )),
    };
  }
  return node;
}

export function normalizeSparcFractionGroups(nodes: readonly unknown[] = []): unknown[] {
  const normalized: unknown[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const current = normalizeNode(nodes[index]);
    const next = normalizeNode(nodes[index + 1]);
    if (
      isRecord(current)
      && isRecord(next)
      && fractionAtomRole(current) === 'numerator'
      && fractionAtomRole(next) === 'denominator'
    ) {
      normalized.push(buildFractionGroup(current, next));
      index += 1;
    } else {
      normalized.push(current);
    }
  }
  return normalized;
}
