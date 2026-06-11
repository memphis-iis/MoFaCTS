import {
  validateSparcDocumentReferences,
  type SparcReferenceValidationIssue,
} from './sparcDocumentAddressing';
import {
  validateSparcVerticalLayout,
  type SparcLayoutIssue,
} from './sparcLayoutPolicy';
import type { SparcAuthoredDocument } from './sparcSessionContracts';

export type SparcAuthoredDocumentValidationIssue =
  | {
      readonly source: 'references';
      readonly issue: SparcReferenceValidationIssue;
      readonly message: string;
    }
  | {
      readonly source: 'layout';
      readonly issue: SparcLayoutIssue;
      readonly message: string;
    };

export type SparcAuthoredDocumentValidationResult = {
  readonly valid: boolean;
  readonly referenceIssues: readonly SparcReferenceValidationIssue[];
  readonly layoutIssues: readonly SparcLayoutIssue[];
  readonly issues: readonly SparcAuthoredDocumentValidationIssue[];
};

export function validateSparcAuthoredDocument(
  document: SparcAuthoredDocument,
): SparcAuthoredDocumentValidationResult {
  const referenceValidation = validateSparcDocumentReferences(document);
  const layoutValidation = validateSparcVerticalLayout(document);
  const issues: SparcAuthoredDocumentValidationIssue[] = [
    ...referenceValidation.issues.map((issue) => ({
      source: 'references' as const,
      issue,
      message: issue.message,
    })),
    ...layoutValidation.issues.map((issue) => ({
      source: 'layout' as const,
      issue,
      message: issue.message,
    })),
  ];
  return {
    valid: issues.length === 0,
    referenceIssues: referenceValidation.issues,
    layoutIssues: layoutValidation.issues,
    issues,
  };
}

export function assertSparcAuthoredDocument(document: SparcAuthoredDocument): void {
  const result = validateSparcAuthoredDocument(document);
  if (result.valid) {
    return;
  }
  throw new Error(result.issues.map((issue) => issue.message).join('; '));
}
