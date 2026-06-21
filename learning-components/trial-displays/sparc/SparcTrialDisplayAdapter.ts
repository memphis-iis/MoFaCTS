import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { TrialDisplayAdapter } from '../../runtime/TrialDisplayAdapterRegistry';
import { expandSparcSemanticNodes } from './sparcSemanticNodes';
import { normalizeSparcFractionGroups } from './sparcFractionGroups';

export const SPARC_TRIAL_DISPLAY_TYPE = 'sparc';

export interface SparcIntentExpectation {
  node: string;
  expected: unknown;
  acceptedValues?: unknown[];
  type?: string;
}

export interface SparcPathIntentExpectation {
  path: string;
  intentByNode?: SparcIntentExpectation[];
}

export interface SparcTraceExpectation {
  node: string;
  productionRuleId: string;
  productionRuleName?: string;
  productionSet?: string;
  actionId: string;
  submittedValue?: unknown;
  clusterIndex?: number;
  responseKC?: string | number;
}

export interface SparcLayoutZone {
  id: string;
  role?: string;
  region?: string;
  flow?: string;
  [key: string]: unknown;
}

export type SparcProgressReporterPlacement = 'document' | 'sidebar';

export interface SparcProgressReporterConfig {
  placement: SparcProgressReporterPlacement;
  nodeId?: string;
  label?: string;
  showReferenceLines?: boolean;
  compact?: boolean;
}

export interface SparcBoxedNodeGroup {
  box: SparcLayoutZone;
  nodes: unknown[];
}

export interface SparcTrialDisplay {
  type: 'sparc';
  documentId?: string;
  pageId?: string;
  schema?: string;
  layout?: {
    zones?: SparcLayoutZone[];
    [key: string]: unknown;
  };
  nodes: unknown[];
  workingMemoryFacts?: unknown[];
  productionRules?: unknown[];
  clusterTargets?: unknown[];
  progressReporter?: SparcProgressReporterConfig;
  response?: {
    gradingMode?: string;
    scoredNodes?: string[];
    intentByNode?: SparcIntentExpectation[];
    intentByPath?: SparcPathIntentExpectation[];
    traceByNode?: SparcTraceExpectation[];
    evaluation?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export interface SparcTrialResult {
  submittedNodes: Record<string, unknown>;
  triggeredBy?: string;
  focusedNodeId?: string;
  eventType?: string;
  timestamp: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSubmittedNodes(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error('SPARC trial result requires submittedNodes');
  }
  return value;
}

export function normalizeSparcProgressReporter(value: unknown): SparcProgressReporterConfig | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    throw new Error('SPARC progressReporter must be an object');
  }
  if (value.placement !== 'document' && value.placement !== 'sidebar') {
    throw new Error('SPARC progressReporter.placement must be "document" or "sidebar"');
  }

  return {
    placement: value.placement,
    ...(typeof value.nodeId === 'string' ? { nodeId: value.nodeId } : {}),
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
    ...(typeof value.showReferenceLines === 'boolean' ? { showReferenceLines: value.showReferenceLines } : {}),
    ...(typeof value.compact === 'boolean' ? { compact: value.compact } : {}),
  };
}

export const sparcTrialDisplayAdapter: TrialDisplayAdapter<SparcTrialDisplay, SparcTrialResult> = {
  id: 'mofacts.sparc-trial-display',
  displayType: SPARC_TRIAL_DISPLAY_TYPE,
  requiredCapabilities: ['media', 'history'],
  ownsInteraction(display) {
    return isPlainObject(display) && display.type === SPARC_TRIAL_DISPLAY_TYPE;
  },
  normalizeDisplay(display) {
    if (!isPlainObject(display)) {
      throw new Error('SPARC trial display must be an object');
    }
    if (display.type !== SPARC_TRIAL_DISPLAY_TYPE) {
      throw new Error('SPARC trial display requires type "sparc"');
    }
    if (!Array.isArray(display.nodes)) {
      throw new Error('SPARC trial display requires a nodes array');
    }
    const normalizedProgressReporter = normalizeSparcProgressReporter(display.progressReporter);
    const normalizedResponse = isPlainObject(display.response)
      ? {
          ...display.response,
          scoredNodes: Array.isArray(display.response.scoredNodes)
            ? display.response.scoredNodes.map((node) => String(node))
            : [],
          intentByNode: Array.isArray(display.response.intentByNode)
            ? display.response.intentByNode
                .filter(isPlainObject)
                .map((entry) => ({
                  node: String(entry.node || ''),
                  expected: entry.expected,
                  ...(Array.isArray(entry.acceptedValues) ? { acceptedValues: entry.acceptedValues } : {}),
                  ...(typeof entry.type === 'string' ? { type: entry.type } : {}),
                }))
            : [],
          intentByPath: Array.isArray(display.response.intentByPath)
            ? display.response.intentByPath
                .filter(isPlainObject)
                .map((pathEntry) => ({
                  path: String(pathEntry.path || ''),
                  intentByNode: Array.isArray(pathEntry.intentByNode)
                    ? pathEntry.intentByNode
                        .filter(isPlainObject)
                        .map((entry) => ({
                          node: String(entry.node || ''),
                          expected: entry.expected,
                          ...(Array.isArray(entry.acceptedValues) ? { acceptedValues: entry.acceptedValues } : {}),
                          ...(typeof entry.type === 'string' ? { type: entry.type } : {}),
                        }))
                    : [],
                }))
            : [],
          traceByNode: Array.isArray(display.response.traceByNode)
            ? display.response.traceByNode
                .filter(isPlainObject)
                .map((entry) => ({
                  node: String(entry.node || ''),
                  productionRuleId: String(entry.productionRuleId || ''),
                  ...(typeof entry.productionRuleName === 'string'
                    ? { productionRuleName: entry.productionRuleName }
                    : {}),
                  ...(typeof entry.productionSet === 'string'
                    ? { productionSet: entry.productionSet }
                    : {}),
                  actionId: String(entry.actionId || ''),
                  ...('submittedValue' in entry ? { submittedValue: entry.submittedValue } : {}),
                  ...(Number.isInteger(Number(entry.clusterIndex)) && Number(entry.clusterIndex) >= 0
                    ? { clusterIndex: Number(entry.clusterIndex) }
                    : {}),
                  ...(typeof entry.responseKC === 'string' || typeof entry.responseKC === 'number'
                    ? { responseKC: entry.responseKC }
                    : {}),
                }))
            : [],
        }
      : null;
    return {
      ...display,
      type: SPARC_TRIAL_DISPLAY_TYPE,
      nodes: normalizeSparcFractionGroups(expandSparcSemanticNodes(display.nodes)),
      ...(normalizedProgressReporter ? { progressReporter: normalizedProgressReporter } : {}),
      ...(normalizedResponse ? { response: normalizedResponse } : {}),
    };
  },
  normalizeResult(result) {
    if (!isPlainObject(result)) {
      throw new Error('SPARC trial result must be an object');
    }
    return {
      submittedNodes: normalizeSubmittedNodes(result.submittedNodes),
      ...(typeof result.triggeredBy === 'string' ? { triggeredBy: result.triggeredBy } : {}),
      ...(typeof result.focusedNodeId === 'string' ? { focusedNodeId: result.focusedNodeId } : {}),
      ...(typeof result.eventType === 'string' ? { eventType: result.eventType } : {}),
      timestamp: Number.isFinite(result.timestamp) ? Number(result.timestamp) : Date.now(),
    };
  },
};

export const sparcTrialDisplayComponentManifest: LearningComponentManifest = {
  id: sparcTrialDisplayAdapter.id,
  kind: 'trial-display',
  displayTypes: [SPARC_TRIAL_DISPLAY_TYPE],
  requiredCapabilities: ['media', 'history'],
  providedServices: [{
    name: 'sparc.display-content-readiness',
    runtimeEntry: 'sparcDisplayContentReadiness.validateSparcDisplayContentReadiness',
  }],
  register(context) {
    if (typeof context.registerTrialDisplayAdapter !== 'function') {
      throw new Error('SPARC trial display component requires registerTrialDisplayAdapter');
    }
    context.registerTrialDisplayAdapter(sparcTrialDisplayAdapter);
  },
};
