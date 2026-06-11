import type {
  SparcAddressReference,
  SparcAuthoredDocument,
  SparcAuthoredNode,
  SparcOutcome,
  SparcReferenceTraceStep,
  SparcTraceStep,
} from './sparcSessionContracts';
import { sparcTrialDisplayAdapter } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import { createSparcTraceFromTrialResult } from './sparcTraceFromTrialResult';

export type SparcSampleTraceRow = {
  readonly productionRuleId: string;
  readonly actionId: string;
  readonly outcome: Extract<SparcOutcome, 'correct' | 'incorrect'>;
};

export type SparcSampleProblemDocument = {
  readonly document: SparcAuthoredDocument;
  readonly ctatRootRelativeBrdPath: string;
  readonly traceRows: readonly SparcSampleTraceRow[];
};

function targetRef(
  documentId: string,
  nodeId: string,
  relation: NonNullable<SparcAddressReference['relation']>,
): SparcAddressReference {
  return {
    relation,
    target: {
      documentId,
      nodeId,
    },
  };
}

function widgetNode(
  id: string,
  documentId: string,
  refs: readonly SparcAddressReference[] = [],
): SparcAuthoredNode {
  return {
    id,
    kind: 'widget',
    layout: {
      wideContent: 'shrink',
    },
    refs: [
      targetRef(documentId, 'conversion-table', 'contains'),
      ...refs,
    ],
  };
}

function traceRowsToReferenceTrace(
  rows: readonly SparcSampleTraceRow[],
): readonly SparcReferenceTraceStep[] {
  return rows.map((row) => ({
    referenceSystem: 'ctat-brd',
    productionRuleId: row.productionRuleId,
    actionId: row.actionId,
    outcome: row.outcome,
  }));
}

function collectAuthoredNodes(
  node: SparcAuthoredNode,
  nodes = new Map<string, SparcAuthoredNode>(),
): Map<string, SparcAuthoredNode> {
  nodes.set(node.id, node);
  for (const child of node.children ?? []) {
    collectAuthoredNodes(child, nodes);
  }
  return nodes;
}

function createSparcTraceFromSampleDocument(
  sample: SparcSampleProblemDocument,
): readonly SparcTraceStep[] {
  const authoredNodes = collectAuthoredNodes(sample.document.root);
  return sample.traceRows.flatMap((row, index) => {
    const [nodeId, , submittedValue] = row.actionId.split('::');
    if (!nodeId || submittedValue === undefined) {
      throw new Error(`Invalid sample trace action id "${row.actionId}"`);
    }
    const authoredNode = authoredNodes.get(nodeId);
    if (!authoredNode) {
      throw new Error(`SPARC sample document "${sample.document.id}" missing trace node "${nodeId}"`);
    }
    const display = sparcTrialDisplayAdapter.normalizeDisplay({
      type: 'sparc',
      schema: 'tutorscript-sparc/1.0',
      nodes: [{
        id: authoredNode.id,
        kind: authoredNode.kind,
      }],
      response: {
        gradingMode: 'node-intent',
        scoredNodes: [authoredNode.id],
        intentByNode: [{
          node: authoredNode.id,
          expected: row.outcome === 'correct' ? submittedValue : `not-${submittedValue}`,
        }],
        traceByNode: [{
          node: authoredNode.id,
          submittedValue,
          productionRuleId: row.productionRuleId,
          actionId: row.actionId,
        }],
      },
    });
    return createSparcTraceFromTrialResult({
      documentId: sample.document.id,
      display,
      result: {
        submittedNodes: {
          [authoredNode.id]: submittedValue,
        },
        triggeredBy: authoredNode.id,
        timestamp: index + 1,
      },
    }).map((step) => ({
      ...step,
      traceId: `${sample.document.id}-trace-${index + 1}`,
    }));
  });
}

const BALLOONS_TRACE_ROWS: readonly SparcSampleTraceRow[] = [{
  productionRuleId: 'enter-given-from conversion-factors',
  actionId: 'OV1::UpdateTextField::12',
  outcome: 'correct',
}, {
  productionRuleId: 'enter-given-from conversion-factors',
  actionId: 'OV2::UpdateTextField::4.25',
  outcome: 'correct',
}, {
  productionRuleId: 'enter-given-to conversion-factors',
  actionId: 'CV1::UpdateTextField::36',
  outcome: 'correct',
}, {
  productionRuleId: 'enter-factor conversion-factors',
  actionId: 'SF1::UpdateTextField::3',
  outcome: 'correct',
}, {
  productionRuleId: 'enter-factor conversion-factors',
  actionId: 'SF2::UpdateTextField::3',
  outcome: 'correct',
}, {
  productionRuleId: 'scale-completed conversion-factors',
  actionId: 'CV2::UpdateTextField::12.75',
  outcome: 'correct',
}, {
  productionRuleId: 'complete-sentence conversion-factors',
  actionId: 'A3::UpdateTextField::12.75',
  outcome: 'correct',
}, {
  productionRuleId: 'unnamed',
  actionId: 'done::ButtonPressed::-1',
  outcome: 'correct',
}, {
  productionRuleId: 'unnamed',
  actionId: 'OV2::UpdateTextField::12',
  outcome: 'incorrect',
}, {
  productionRuleId: 'unnamed',
  actionId: 'OV1::UpdateTextField::4.25',
  outcome: 'incorrect',
}, {
  productionRuleId: 'unnamed',
  actionId: 'CV1::UpdateTextField::12',
  outcome: 'incorrect',
}, {
  productionRuleId: 'unnamed',
  actionId: 'CV2::UpdateTextField::1',
  outcome: 'incorrect',
}];

const COOKIES_TRACE_ROWS: readonly SparcSampleTraceRow[] = [{
  productionRuleId: 'enter-given-from conversion-factors',
  actionId: 'OV1::UpdateTextField::30',
  outcome: 'correct',
}, {
  productionRuleId: 'enter-given-from conversion-factors',
  actionId: 'OV2::UpdateTextField::120',
  outcome: 'correct',
}, {
  productionRuleId: 'enter-given-to conversion-factors',
  actionId: 'CV1::UpdateTextField::90',
  outcome: 'correct',
}, {
  productionRuleId: 'enter-factor conversion-factors',
  actionId: 'SF1::UpdateTextField::3',
  outcome: 'correct',
}, {
  productionRuleId: 'enter-factor conversion-factors',
  actionId: 'SF2::UpdateTextField::3',
  outcome: 'correct',
}, {
  productionRuleId: 'scale-completed conversion-factors',
  actionId: 'CV2::UpdateTextField::360',
  outcome: 'correct',
}, {
  productionRuleId: 'complete-sentence conversion-factors',
  actionId: 'A3::UpdateTextField::360',
  outcome: 'correct',
}, {
  productionRuleId: 'unnamed',
  actionId: 'done::ButtonPressed::-1',
  outcome: 'correct',
}, {
  productionRuleId: 'unnamed',
  actionId: 'OV2::UpdateTextField::30',
  outcome: 'incorrect',
}, {
  productionRuleId: 'unnamed',
  actionId: 'OV1::UpdateTextField::120',
  outcome: 'incorrect',
}, {
  productionRuleId: 'unnamed',
  actionId: 'CV1::UpdateTextField::30',
  outcome: 'incorrect',
}, {
  productionRuleId: 'unnamed',
  actionId: 'CV2::UpdateTextField::1',
  outcome: 'incorrect',
}];

function createConversionFactorDocument(
  id: string,
  ctatRootRelativeBrdPath: string,
  traceRows: readonly SparcSampleTraceRow[],
): SparcSampleProblemDocument {
  return {
    ctatRootRelativeBrdPath,
    traceRows,
    document: {
      id,
      schemaVersion: 1,
      layout: {
        scrollAxis: 'vertical',
        layoutMode: 'document',
        maxWidth: '100%',
        wideContent: 'reflow',
      },
      initialState: [{
        target: {
          documentId: id,
          nodeId: 'final-answer-region',
          path: ['A3'],
        },
        key: 'enabled',
        value: false,
      }],
      reactiveRules: [{
        id: 'show-final-answer-after-scale',
        when: {
          type: 'state',
          query: {
            target: {
              documentId: id,
              nodeId: 'conversion-table',
              path: ['CV2'],
            },
            key: 'lastOutcome',
          },
          compare: 'eq',
          value: 'correct',
        },
        writes: [{
          target: {
            documentId: id,
            nodeId: 'final-answer-region',
            path: ['A3'],
          },
          key: 'enabled',
          value: true,
        }],
      }],
      root: {
        id: 'root',
        kind: 'document',
        layout: {
          scrollAxis: 'vertical',
          layoutMode: 'stack',
          maxWidth: '100%',
          wideContent: 'reflow',
        },
        children: [{
          id: 'problem-statement',
          kind: 'section',
          layout: {
            layoutMode: 'stack',
            maxWidth: '100%',
            wideContent: 'reflow',
          },
          refs: [
            targetRef(id, 'conversion-table', 'depends-on'),
            {
              relation: 'feedback-for',
              target: {
                documentId: id,
                nodeId: 'final-answer-region',
                path: ['A3'],
              },
            },
          ],
        }, {
          id: 'conversion-table',
          kind: 'region',
          layout: {
            layoutMode: 'columns',
            maxWidth: '100%',
            wideContent: 'stack',
          },
          children: [
            widgetNode('OV1', id),
            widgetNode('OV2', id),
            widgetNode('CV1', id),
            widgetNode('SF1', id),
            widgetNode('SF2', id),
            widgetNode('CV2', id, [targetRef(id, 'final-answer-region', 'controls')]),
          ],
        }, {
          id: 'final-answer-region',
          kind: 'region',
          layout: {
            layoutMode: 'stack',
            maxWidth: '100%',
            wideContent: 'reflow',
          },
          reactive: {
            visibleWhen: {
              type: 'state',
              query: {
                target: {
                  documentId: id,
                  nodeId: 'conversion-table',
                  path: ['CV2'],
                },
                key: 'lastOutcome',
              },
              compare: 'eq',
              value: 'correct',
            },
          },
          children: [
            widgetNode('A3', id, [targetRef(id, 'conversion-table', 'depends-on')]),
            widgetNode('done', id, [targetRef(id, 'A3', 'depends-on')]),
          ],
        }],
      },
    },
  };
}

export const SPARC_SAMPLE_DOCUMENTS: readonly SparcSampleProblemDocument[] = [
  createConversionFactorDocument(
    'html-factors-balloons',
    'docs/HTML Factors/FinalBRDs/balloons.brd',
    BALLOONS_TRACE_ROWS,
  ),
  createConversionFactorDocument(
    'html-factors-cookies',
    'docs/HTML Factors/FinalBRDs/cookies.brd',
    COOKIES_TRACE_ROWS,
  ),
];

export function findSparcSampleDocument(id: string): SparcSampleProblemDocument | undefined {
  return SPARC_SAMPLE_DOCUMENTS.find((sample) => sample.document.id === id);
}

export function createSparcReferenceTraceForSample(
  sample: SparcSampleProblemDocument,
): readonly SparcReferenceTraceStep[] {
  return traceRowsToReferenceTrace(sample.traceRows);
}

export function createSparcTraceForSampleDocument(
  sample: SparcSampleProblemDocument,
): readonly SparcTraceStep[] {
  return createSparcTraceFromSampleDocument(sample);
}
