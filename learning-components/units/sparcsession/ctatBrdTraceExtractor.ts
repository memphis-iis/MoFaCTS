import type {
  SparcOutcome,
  SparcReferenceTraceStep,
} from './sparcSessionContracts';

export type CtatBrdXmlParser = {
  parseFromString(xml: string, mimeType: DOMParserSupportedType): Document;
};

function firstElement(parent: Element | Document, tagName: string): Element | null {
  return parent.getElementsByTagName(tagName).item(0);
}

function directText(parent: Element | null, tagName: string): string | undefined {
  if (!parent) {
    return undefined;
  }
  const element = firstElement(parent, tagName);
  const text = element?.textContent?.trim();
  return text || undefined;
}

function nestedValue(parent: Element | null, tagName: string): string | undefined {
  const element = parent ? firstElement(parent, tagName) : null;
  const text = directText(element, 'value') ?? element?.textContent?.trim();
  return text || undefined;
}

function normalizeOutcome(actionType: string | undefined): SparcOutcome {
  const normalized = String(actionType || '').trim().toLowerCase();
  if (normalized.includes('correct')) {
    return 'correct';
  }
  if (normalized.includes('buggy') || normalized.includes('incorrect')) {
    return 'incorrect';
  }
  return 'unknown';
}

function buildActionId(params: {
  readonly selection: string;
  readonly action: string;
  readonly input: string;
}): string {
  return `${params.selection}::${params.action}::${params.input}`;
}

function parseRuleIdentity(ruleText: string): {
  readonly productionRuleName?: string;
  readonly productionSet?: string;
} {
  const normalized = ruleText.trim();
  const [productionRuleName, ...productionSetParts] = normalized.split(/\s+/);
  if (!productionRuleName || productionSetParts.length === 0) {
    return {};
  }
  return {
    productionRuleName,
    productionSet: productionSetParts.join(' '),
  };
}

function extractReferenceStep(edge: Element): SparcReferenceTraceStep | null {
  const actionLabel = firstElement(edge, 'actionLabel');
  if (!actionLabel) {
    return null;
  }
  const properties = firstElement(actionLabel, 'properties');
  const selection = nestedValue(properties, 'Selection') ?? '';
  const action = nestedValue(properties, 'Action') ?? '';
  const input = nestedValue(properties, 'Input') ?? '';
  const ruleText = directText(firstElement(edge, 'rule'), 'text') ?? 'unnamed';
  const actionType = directText(actionLabel, 'actionType');
  if (!selection && !action && !input) {
    return null;
  }

  return {
    referenceSystem: 'ctat-brd',
    productionRuleId: ruleText,
    ...parseRuleIdentity(ruleText),
    actionId: buildActionId({ selection, action, input }),
    outcome: normalizeOutcome(actionType),
  };
}

export function extractCtatBrdReferenceTrace(
  brdXml: string,
  parser: CtatBrdXmlParser = new DOMParser(),
): SparcReferenceTraceStep[] {
  const document = parser.parseFromString(brdXml, 'application/xml');
  const stateGraph = firstElement(document, 'stateGraph');
  if (!stateGraph) {
    throw new Error('CTAT BRD XML missing stateGraph root');
  }
  return Array.from(stateGraph.getElementsByTagName('edge'))
    .map((edge) => extractReferenceStep(edge))
    .filter((step): step is SparcReferenceTraceStep => step !== null);
}

function traceStepMatches(
  candidate: SparcReferenceTraceStep,
  expected: SparcReferenceTraceStep,
): boolean {
  return candidate.productionRuleId === expected.productionRuleId
    && candidate.actionId === expected.actionId
    && candidate.outcome === expected.outcome;
}

export function selectCtatReferenceSubtrace(params: {
  readonly ctatTrace: readonly SparcReferenceTraceStep[];
  readonly expectedTrace: readonly SparcReferenceTraceStep[];
  readonly label?: string;
}): SparcReferenceTraceStep[] {
  const selected: SparcReferenceTraceStep[] = [];
  let searchIndex = 0;

  for (const expectedStep of params.expectedTrace) {
    const matchedIndex = params.ctatTrace.findIndex((candidate, index) => (
      index >= searchIndex && traceStepMatches(candidate, expectedStep)
    ));
    if (matchedIndex < 0) {
      const label = params.label ? ` for ${params.label}` : '';
      throw new Error(
        `CTAT BRD trace missing expected step${label}: ${expectedStep.productionRuleId} / ${expectedStep.actionId} / ${expectedStep.outcome}`,
      );
    }
    const matchedStep = params.ctatTrace[matchedIndex];
    if (!matchedStep) {
      throw new Error('CTAT BRD trace selection failed after finding a matched index');
    }
    selected.push(matchedStep);
    searchIndex = matchedIndex + 1;
  }

  return selected;
}
