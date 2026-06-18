import {
  validateSparcDocumentReferences,
  type SparcReferenceValidationIssue,
} from './sparcDocumentAddressing';
import {
  validateSparcVerticalLayout,
  type SparcLayoutIssue,
} from './sparcLayoutPolicy';
import {
  validateSparcSessionModelConfiguration,
  type SparcSessionModelConfigurationValidationIssue,
} from './sparcSessionRuntimeConfig';
import type {
  SparcAuthoredDocument,
  SparcAuthoredNode,
  SparcCondition,
  SparcProductionRuleEffect,
} from './sparcSessionContracts';

type SparcDocumentValidationUnit = {
  sparcsession?: Record<string, unknown> | null;
};

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
    }
  | {
      readonly source: 'model-config';
      readonly issue: SparcSessionModelConfigurationValidationIssue;
      readonly message: string;
    };

export type SparcAuthoredDocumentValidationResult = {
  readonly valid: boolean;
  readonly referenceIssues: readonly SparcReferenceValidationIssue[];
  readonly layoutIssues: readonly SparcLayoutIssue[];
  readonly modelConfigIssues: readonly SparcSessionModelConfigurationValidationIssue[];
  readonly issues: readonly SparcAuthoredDocumentValidationIssue[];
};

function conditionUsesModel(condition: SparcCondition | undefined): boolean {
  if (!condition) {
    return false;
  }
  switch (condition.type) {
    case 'model':
      return true;
    case 'all':
    case 'any':
      return condition.conditions.some(conditionUsesModel);
    case 'not':
      return conditionUsesModel(condition.condition);
    case 'state':
    default:
      return false;
  }
}

function effectUsesModel(effect: SparcProductionRuleEffect): boolean {
  return effect.type === 'model-practice';
}

function nodeUsesModel(node: SparcAuthoredNode): boolean {
  if (node.modelTarget) {
    return true;
  }
  if ((node.stimulusIds ?? []).length > 0) {
    return true;
  }
  if ((node.refs ?? []).some((ref) => ref.relation === 'model-target')) {
    return true;
  }
  if (conditionUsesModel(node.reactive?.visibleWhen) || conditionUsesModel(node.reactive?.enabledWhen)) {
    return true;
  }
  if ((node as unknown as { atomType?: unknown }).atomType === 'learning-progress') {
    return true;
  }
  return (node.children ?? []).some(nodeUsesModel);
}

export function sparcAuthoredDocumentUsesModelBackedFeatures(
  document: SparcAuthoredDocument,
): boolean {
  if (nodeUsesModel(document.root)) {
    return true;
  }
  if ((document.reactiveRules ?? []).some((rule) => conditionUsesModel(rule.when))) {
    return true;
  }
  return (document.productionRules ?? []).some((rule) => rule.then.some(effectUsesModel));
}

export function validateSparcAuthoredDocument(
  document: SparcAuthoredDocument,
  unit?: SparcDocumentValidationUnit | null,
): SparcAuthoredDocumentValidationResult {
  const referenceValidation = validateSparcDocumentReferences(document);
  const layoutValidation = validateSparcVerticalLayout(document);
  const modelConfigIssues = unit && sparcAuthoredDocumentUsesModelBackedFeatures(document)
    ? validateSparcSessionModelConfiguration(unit)
    : [];
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
    ...modelConfigIssues.map((issue) => ({
      source: 'model-config' as const,
      issue,
      message: issue.message,
    })),
  ];
  return {
    valid: issues.length === 0,
    referenceIssues: referenceValidation.issues,
    layoutIssues: layoutValidation.issues,
    modelConfigIssues,
    issues,
  };
}

export function assertSparcAuthoredDocument(
  document: SparcAuthoredDocument,
  unit?: SparcDocumentValidationUnit | null,
): void {
  const result = validateSparcAuthoredDocument(document, unit);
  if (result.valid) {
    return;
  }
  throw new Error(result.issues.map((issue) => issue.message).join('; '));
}
