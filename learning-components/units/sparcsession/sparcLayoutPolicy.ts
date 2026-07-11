import type {
  SparcAuthoredDocument,
  SparcAuthoredNode,
} from './sparcSessionContracts';

export type SparcLayoutIssueKind =
  | 'horizontal-scroll-axis'
  | 'horizontal-overflow'
  | 'invalid-visual-density'
  | 'invalid-visual-preset'
  | 'missing-document-visual-preset'
  | 'missing-panel-visual-preset'
  | 'missing-responsive-layout-policy'
  | 'missing-wide-content-policy'
  | 'missing-document-layout';

export type SparcLayoutIssue = {
  readonly kind: SparcLayoutIssueKind;
  readonly nodeId?: string;
  readonly message: string;
};

export type SparcLayoutValidationResult = {
  readonly valid: boolean;
  readonly issues: readonly SparcLayoutIssue[];
};

const WIDE_CONTENT_POLICIES = new Set(['constrain', 'reflow', 'shrink', 'stack']);
const RESPONSIVE_LAYOUT_MODES = new Set(['columns', 'sidebar']);
const RESPONSIVE_WIDE_CONTENT_POLICIES = new Set(['reflow', 'stack']);
const DOCUMENT_VISUAL_PRESETS = new Set(['assignment', 'chapter']);
const PANEL_VISUAL_PRESETS = new Set(['practice-panel', 'feedback-panel', 'callout', 'control-panel']);
const ALL_VISUAL_PRESETS = new Set([
  ...DOCUMENT_VISUAL_PRESETS,
  'section',
  ...PANEL_VISUAL_PRESETS,
]);
const VISUAL_DENSITIES = new Set(['compact', 'comfortable', 'spacious']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasWideContentPolicy(layout: unknown): boolean {
  if (!isRecord(layout)) {
    return false;
  }
  return WIDE_CONTENT_POLICIES.has(String(layout.wideContent));
}

function hasConstrainedWidth(layout: unknown): boolean {
  if (!isRecord(layout)) {
    return false;
  }
  return ['width', 'minWidth', 'maxWidth'].some((fieldName) => (
    layout[fieldName] !== undefined
    && layout[fieldName] !== null
    && layout[fieldName] !== ''
  ));
}

function readScrollAxis(layout: unknown): unknown {
  return isRecord(layout) ? layout.scrollAxis : undefined;
}

function readOverflowX(layout: unknown): unknown {
  return isRecord(layout) ? layout.overflowX : undefined;
}

function readLayoutMode(layout: unknown): unknown {
  return isRecord(layout) ? layout.layoutMode : undefined;
}

function readVisualPreset(layout: unknown): unknown {
  return isRecord(layout) ? layout.visualPreset : undefined;
}

function readDensity(layout: unknown): unknown {
  return isRecord(layout) ? layout.density : undefined;
}

function pushWideContentIssue(params: {
  readonly issues: SparcLayoutIssue[];
  readonly pageKey?: string;
  readonly nodeId?: string;
}): void {
  if (params.nodeId) {
    params.issues.push({
      kind: 'missing-wide-content-policy',
      nodeId: params.nodeId,
      message: `SPARC node "${params.nodeId}" with width constraints must declare reflow, shrink, stack, or constrain behavior`,
    });
    return;
  }
  params.issues.push({
    kind: 'missing-wide-content-policy',
    message: `SPARC document "${params.pageKey}" with width constraints must declare reflow, shrink, stack, or constrain behavior`,
  });
}

function pushResponsiveLayoutIssue(params: {
  readonly issues: SparcLayoutIssue[];
  readonly layoutMode: string;
  readonly pageKey?: string;
  readonly nodeId?: string;
}): void {
  if (params.nodeId) {
    params.issues.push({
      kind: 'missing-responsive-layout-policy',
      nodeId: params.nodeId,
      message: `SPARC node "${params.nodeId}" layoutMode "${params.layoutMode}" must declare wideContent "reflow" or "stack"`,
    });
    return;
  }
  params.issues.push({
    kind: 'missing-responsive-layout-policy',
    message: `SPARC document "${params.pageKey}" layoutMode "${params.layoutMode}" must declare wideContent "reflow" or "stack"`,
  });
}

function validateResponsiveLayoutMode(params: {
  readonly layout: unknown;
  readonly issues: SparcLayoutIssue[];
  readonly pageKey?: string;
  readonly nodeId?: string;
}): void {
  const layoutMode = readLayoutMode(params.layout);
  if (!RESPONSIVE_LAYOUT_MODES.has(String(layoutMode))) {
    return;
  }
  if (
    !isRecord(params.layout)
    || !RESPONSIVE_WIDE_CONTENT_POLICIES.has(String(params.layout.wideContent))
  ) {
    pushResponsiveLayoutIssue({
      issues: params.issues,
      layoutMode: String(layoutMode),
      ...(params.pageKey === undefined ? {} : { pageKey: params.pageKey }),
      ...(params.nodeId === undefined ? {} : { nodeId: params.nodeId }),
    });
  }
}

function validateDocumentVisualPreset(params: {
  readonly document: SparcAuthoredDocument;
  readonly issues: SparcLayoutIssue[];
}): void {
  if (!params.document.layout) {
    return;
  }
  const visualPreset = readVisualPreset(params.document.layout);
  if (!visualPreset) {
    params.issues.push({
      kind: 'missing-document-visual-preset',
      message: `SPARC document "${params.document.id}" must declare visualPreset "assignment" or "chapter"`,
    });
    return;
  }
  if (!DOCUMENT_VISUAL_PRESETS.has(String(visualPreset))) {
    params.issues.push({
      kind: 'invalid-visual-preset',
      message: `SPARC document "${params.document.id}" visualPreset "${String(visualPreset)}" is not a document preset`,
    });
  }
}

function validateNodeVisualPreset(params: {
  readonly node: SparcAuthoredNode;
  readonly issues: SparcLayoutIssue[];
}): void {
  const visualPreset = readVisualPreset(params.node.layout);
  if (visualPreset && !ALL_VISUAL_PRESETS.has(String(visualPreset))) {
    params.issues.push({
      kind: 'invalid-visual-preset',
      nodeId: params.node.id,
      message: `SPARC node "${params.node.id}" visualPreset "${String(visualPreset)}" is not recognized`,
    });
    return;
  }
  if (params.node.kind !== 'panel' && params.node.kind !== 'module') {
    return;
  }
  if (!visualPreset) {
    params.issues.push({
      kind: 'missing-panel-visual-preset',
      nodeId: params.node.id,
      message: `SPARC ${params.node.kind} "${params.node.id}" must declare a panel visualPreset`,
    });
    return;
  }
  if (!PANEL_VISUAL_PRESETS.has(String(visualPreset))) {
    params.issues.push({
      kind: 'invalid-visual-preset',
      nodeId: params.node.id,
      message: `SPARC ${params.node.kind} "${params.node.id}" visualPreset "${String(visualPreset)}" is not a panel preset`,
    });
  }
}

function validateVisualDensity(params: {
  readonly layout: unknown;
  readonly issues: SparcLayoutIssue[];
  readonly pageKey?: string;
  readonly nodeId?: string;
}): void {
  const density = readDensity(params.layout);
  if (!density || VISUAL_DENSITIES.has(String(density))) {
    return;
  }
  if (params.nodeId) {
    params.issues.push({
      kind: 'invalid-visual-density',
      nodeId: params.nodeId,
      message: `SPARC node "${params.nodeId}" density "${String(density)}" is not recognized`,
    });
    return;
  }
  params.issues.push({
    kind: 'invalid-visual-density',
    message: `SPARC document "${params.pageKey}" density "${String(density)}" is not recognized`,
  });
}

function validateNodeLayout(
  node: SparcAuthoredNode,
  issues: SparcLayoutIssue[],
): void {
  validateNodeVisualPreset({ node, issues });
  validateVisualDensity({
    layout: node.layout,
    issues,
    nodeId: node.id,
  });
  const scrollAxis = readScrollAxis(node.layout);
  if (scrollAxis === 'horizontal') {
    issues.push({
      kind: 'horizontal-scroll-axis',
      nodeId: node.id,
      message: `SPARC node "${node.id}" declares horizontal scrolling`,
    });
  }
  if (readOverflowX(node.layout) === 'auto' || readOverflowX(node.layout) === 'scroll') {
    issues.push({
      kind: 'horizontal-overflow',
      nodeId: node.id,
      message: `SPARC node "${node.id}" declares horizontal overflow`,
    });
  }
  if (hasConstrainedWidth(node.layout) && !hasWideContentPolicy(node.layout)) {
    pushWideContentIssue({ issues, nodeId: node.id });
  }
  validateResponsiveLayoutMode({
    layout: node.layout,
    issues,
    nodeId: node.id,
  });
  for (const child of node.children ?? []) {
    validateNodeLayout(child, issues);
  }
}

export function validateSparcVerticalLayout(
  document: SparcAuthoredDocument,
): SparcLayoutValidationResult {
  const issues: SparcLayoutIssue[] = [];
  const documentScrollAxis = readScrollAxis(document.layout);
  if (!document.layout) {
    issues.push({
      kind: 'missing-document-layout',
      message: `SPARC document "${document.id}" must declare vertical document layout`,
    });
  } else if (documentScrollAxis !== 'vertical') {
    issues.push({
      kind: 'horizontal-scroll-axis',
      message: `SPARC document "${document.id}" must use vertical scrolling`,
    });
  }
  if (readOverflowX(document.layout) === 'auto' || readOverflowX(document.layout) === 'scroll') {
    issues.push({
      kind: 'horizontal-overflow',
      message: `SPARC document "${document.id}" declares horizontal overflow`,
    });
  }
  if (hasConstrainedWidth(document.layout) && !hasWideContentPolicy(document.layout)) {
    pushWideContentIssue({ issues, pageKey: document.id });
  }
  validateDocumentVisualPreset({ document, issues });
  validateVisualDensity({
    layout: document.layout,
    issues,
    pageKey: document.id,
  });
  validateResponsiveLayoutMode({
    layout: document.layout,
    issues,
    pageKey: document.id,
  });
  validateNodeLayout(document.root, issues);
  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertSparcVerticalLayout(document: SparcAuthoredDocument): void {
  const result = validateSparcVerticalLayout(document);
  if (result.valid) {
    return;
  }
  throw new Error(result.issues.map((issue) => issue.message).join('; '));
}
