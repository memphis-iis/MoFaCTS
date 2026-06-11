import type {
  SparcAuthoredDocument,
  SparcAuthoredNode,
} from './sparcSessionContracts';

export type SparcLayoutIssueKind =
  | 'horizontal-scroll-axis'
  | 'horizontal-overflow'
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

function pushWideContentIssue(params: {
  readonly issues: SparcLayoutIssue[];
  readonly documentId?: string;
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
    message: `SPARC document "${params.documentId}" with width constraints must declare reflow, shrink, stack, or constrain behavior`,
  });
}

function validateNodeLayout(
  node: SparcAuthoredNode,
  issues: SparcLayoutIssue[],
): void {
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
    pushWideContentIssue({ issues, documentId: document.id });
  }
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
