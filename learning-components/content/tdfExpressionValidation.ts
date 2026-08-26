import { compileProbabilityExpression, SafeExpressionError } from '../safe-expression/safeExpressionEngine';
import { compileAdaptiveRule } from '../units/shared/adaptiveRuleEvaluation';

type UnknownRecord = Record<string, unknown>;

export type TdfExpressionValidationIssue = {
  readonly fieldPath: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
};

export type TdfExpressionValidationResult = {
  readonly valid: boolean;
  readonly expressionCount: number;
  readonly probabilityExpressionCount: number;
  readonly adaptiveRuleCount: number;
  readonly issues: readonly TdfExpressionValidationIssue[];
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function issueFromError(fieldPath: string, error: unknown): TdfExpressionValidationIssue {
  if (error instanceof SafeExpressionError) {
    return {
      fieldPath,
      message: error.message,
      ...(error.line === undefined ? {} : { line: error.line }),
      ...(error.column === undefined ? {} : { column: error.column }),
    };
  }
  return { fieldPath, message: error instanceof Error ? error.message : String(error) };
}

function collectAdaptiveRules(value: unknown, fieldPath: string): Array<{ source: string; fieldPath: string }> {
  if (Array.isArray(value)) {
    return value.map((source, index) => {
      if (typeof source !== 'string') throw new Error(`${fieldPath}[${index}]: adaptive rule must be a string`);
      return { source, fieldPath: `${fieldPath}[${index}]` };
    });
  }
  const record = asRecord(value);
  if (!record) throw new Error(`${fieldPath}: adaptiveLogic must be an array or an object of rule arrays`);
  const rules: Array<{ source: string; fieldPath: string }> = [];
  for (const [key, entries] of Object.entries(record)) {
    if (!Array.isArray(entries)) throw new Error(`${fieldPath}.${key}: adaptive rule group must be an array`);
    entries.forEach((source, index) => {
      if (typeof source !== 'string') throw new Error(`${fieldPath}.${key}[${index}]: adaptive rule must be a string`);
      rules.push({ source, fieldPath: `${fieldPath}.${key}[${index}]` });
    });
  }
  return rules;
}

export function validateTdfExpressions(tdfValue: unknown, rootPath = 'tdfs.tutor'): TdfExpressionValidationResult {
  const wrapper = asRecord(tdfValue);
  const tutor = asRecord(asRecord(wrapper?.tdfs)?.tutor) ?? asRecord(wrapper?.tutor) ?? wrapper;
  const issues: TdfExpressionValidationIssue[] = [];
  let probabilityExpressionCount = 0;
  let adaptiveRuleCount = 0;
  if (!tutor) return { valid: true, expressionCount: 0, probabilityExpressionCount: 0, adaptiveRuleCount: 0, issues };

  const seen = new WeakSet<object>();
  const visit = (value: unknown, fieldPath: string, depth = 0): void => {
    if (depth > 64) {
      issues.push({ fieldPath: fieldPath.slice(0, 1_000), message: `${fieldPath.slice(0, 1_000)}: TDF expression traversal exceeds depth 64` });
      return;
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) return;
      seen.add(value);
      value.forEach((entry, index) => visit(entry, `${fieldPath}[${index}]`, depth + 1));
      return;
    }
    const record = asRecord(value);
    if (!record) return;
    if (seen.has(record)) return;
    seen.add(record);
    for (const [key, fieldValue] of Object.entries(record)) {
      const childPath = `${fieldPath}.${key}`;
      if (key === 'calculateProbability') {
        if (fieldValue === undefined || fieldValue === null || fieldValue === '') continue;
        probabilityExpressionCount += 1;
        if (typeof fieldValue !== 'string') {
          issues.push({ fieldPath: childPath, message: `${childPath}: calculateProbability must be a string` });
          continue;
        }
        try { compileProbabilityExpression(fieldValue, childPath); }
        catch (error: unknown) { issues.push(issueFromError(childPath, error)); }
        continue;
      }
      if (key === 'adaptiveLogic') {
        try {
          for (const rule of collectAdaptiveRules(fieldValue, childPath)) {
            adaptiveRuleCount += 1;
            try { compileAdaptiveRule(rule.source, rule.fieldPath); }
            catch (error: unknown) { issues.push(issueFromError(rule.fieldPath, error)); }
          }
        } catch (error: unknown) {
          issues.push(issueFromError(childPath, error));
        }
        continue;
      }
      visit(fieldValue, childPath, depth + 1);
    }
  };

  const units = Array.isArray(tutor.unit) ? tutor.unit : [];
  units.forEach((unit, index) => visit(unit, `${rootPath}.unit[${index}]`));
  const setspec = asRecord(tutor.setspec);
  const templates = Array.isArray(setspec?.unitTemplate) ? setspec.unitTemplate : [];
  templates.forEach((template, index) => visit(template, `${rootPath}.setspec.unitTemplate[${index}]`));
  return {
    valid: issues.length === 0,
    expressionCount: probabilityExpressionCount + adaptiveRuleCount,
    probabilityExpressionCount,
    adaptiveRuleCount,
    issues,
  };
}

export function assertValidTdfExpressions(tdfValue: unknown, rootPath = 'tdfs.tutor'): void {
  const result = validateTdfExpressions(tdfValue, rootPath);
  if (!result.valid) throw new Error(result.issues.map((issue) => issue.message).join('; '));
}
