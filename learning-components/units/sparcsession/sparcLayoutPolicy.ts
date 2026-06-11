import type {
  SparcAuthoredDocument,
  SparcAuthoredNode,
} from './sparcSessionContracts';

export type SparcLayoutIssueKind =
  | 'horizontal-scroll-axis'
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

function hasMaxWidth(layout: unknown): boolean {
  return isRecord(layout) && layout.maxWidth !== undefined && layout.maxWidth !== null && layout.maxWidth !== '';
}

function readScrollAxis(layout: unknown): unknown {
  return isRecord(layout) ? layout.scrollAxis : undefined;
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
  if (hasMaxWidth(node.layout) && !hasWideContentPolicy(node.layout)) {
    issues.push({
      kind: 'missing-wide-content-policy',
      nodeId: node.id,
      message: `SPARC node "${node.id}" with maxWidth must declare reflow, shrink, stack, or constrain behavior`,
    });
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
  if (hasMaxWidth(document.layout) && !hasWideContentPolicy(document.layout)) {
    issues.push({
      kind: 'missing-wide-content-policy',
      message: `SPARC document "${document.id}" with maxWidth must declare reflow, shrink, stack, or constrain behavior`,
    });
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
