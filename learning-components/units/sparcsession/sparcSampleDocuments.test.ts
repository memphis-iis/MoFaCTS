import assert from 'node:assert/strict';
import {
  createSparcReferenceTraceForSample,
  createSparcTraceForSampleDocument,
  findSparcSampleDocument,
  SPARC_SAMPLE_DOCUMENTS,
} from './sparcSampleDocuments';
import { validateSparcDocumentReferences } from './sparcDocumentAddressing';
import { validateSparcVerticalLayout } from './sparcLayoutPolicy';
import type { SparcAuthoredNode } from './sparcSessionContracts';

function collectNodeIds(node: SparcAuthoredNode): string[] {
  return [
    node.id,
    ...(node.children ?? []).flatMap((child) => collectNodeIds(child)),
  ];
}

describe('sparcSampleDocuments', function() {
  it('defines the two selected CTAT samples as authored SPARC document fixtures', function() {
    assert.deepEqual(SPARC_SAMPLE_DOCUMENTS.map((sample) => ({
      id: sample.document.id,
      brd: sample.ctatRootRelativeBrdPath,
      schemaVersion: sample.document.schemaVersion,
      traceRows: sample.traceRows.length,
    })), [{
      id: 'html-factors-balloons',
      brd: 'docs/HTML Factors/FinalBRDs/balloons.brd',
      schemaVersion: 1,
      traceRows: 12,
    }, {
      id: 'html-factors-cookies',
      brd: 'docs/HTML Factors/FinalBRDs/cookies.brd',
      schemaVersion: 1,
      traceRows: 12,
    }]);
  });

  it('keeps the CTAT trace widgets as authored document nodes', function() {
    const sample = findSparcSampleDocument('html-factors-balloons');
    assert.ok(sample);
    const nodeIds = collectNodeIds(sample.document.root);

    assert.deepEqual(['OV1', 'OV2', 'CV1', 'SF1', 'SF2', 'CV2', 'A3', 'done'].map((nodeId) => (
      nodeIds.includes(nodeId)
    )), [true, true, true, true, true, true, true, true]);
  });

  it('allows authored references across regions and into nested region content', function() {
    const sample = findSparcSampleDocument('html-factors-balloons');
    assert.ok(sample);
    const [statement, conversionTable, finalAnswerRegion] = sample.document.root.children ?? [];

    assert.deepEqual(statement?.refs, [{
      relation: 'depends-on',
      target: {
        documentId: 'html-factors-balloons',
        nodeId: 'conversion-table',
      },
    }, {
      relation: 'feedback-for',
      target: {
        documentId: 'html-factors-balloons',
        nodeId: 'final-answer-region',
        path: ['A3'],
      },
    }]);
    assert.equal(conversionTable?.kind, 'region');
    assert.equal(finalAnswerRegion?.kind, 'region');
    assert.deepEqual(finalAnswerRegion?.children?.find((node) => node.id === 'A3')?.refs, [{
      relation: 'contains',
      target: {
        documentId: 'html-factors-balloons',
        nodeId: 'conversion-table',
      },
    }, {
      relation: 'depends-on',
      target: {
        documentId: 'html-factors-balloons',
        nodeId: 'conversion-table',
      },
    }]);
  });

  it('declares vertical layout and wide-content behavior for sample documents', function() {
    for (const sample of SPARC_SAMPLE_DOCUMENTS) {
      assert.deepEqual(validateSparcVerticalLayout(sample.document), {
        valid: true,
        issues: [],
      });
    }
  });

  it('keeps sample document references resolvable', function() {
    for (const sample of SPARC_SAMPLE_DOCUMENTS) {
      assert.deepEqual(validateSparcDocumentReferences(sample.document), {
        valid: true,
        issues: [],
      });
    }
  });

  it('authors initial state and reactive rules as part of the sample document start state', function() {
    const sample = findSparcSampleDocument('html-factors-balloons');
    assert.ok(sample);
    const finalAnswerRegion = sample.document.root.children?.find((node) => node.id === 'final-answer-region');

    assert.deepEqual(sample.document.initialState, [{
      target: {
        documentId: 'html-factors-balloons',
        nodeId: 'final-answer-region',
        path: ['A3'],
      },
      key: 'enabled',
      value: false,
    }]);
    assert.deepEqual(sample.document.reactiveRules, [{
      id: 'show-final-answer-after-scale',
      when: {
        type: 'state',
        query: {
          target: {
            documentId: 'html-factors-balloons',
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
          documentId: 'html-factors-balloons',
          nodeId: 'final-answer-region',
          path: ['A3'],
        },
        key: 'enabled',
        value: true,
      }],
    }]);
    assert.deepEqual(finalAnswerRegion?.reactive, {
      visibleWhen: {
        type: 'state',
        query: {
          target: {
            documentId: 'html-factors-balloons',
            nodeId: 'conversion-table',
            path: ['CV2'],
          },
          key: 'lastOutcome',
        },
        compare: 'eq',
        value: 'correct',
      },
    });
  });

  it('generates CTAT-comparable traces from authored sample documents', function() {
    const sample = findSparcSampleDocument('html-factors-cookies');
    assert.ok(sample);
    const referenceTrace = createSparcReferenceTraceForSample(sample);
    const sparcTrace = createSparcTraceForSampleDocument(sample);

    assert.equal(referenceTrace.length, 12);
    assert.equal(sparcTrace.length, 12);
    assert.equal(sparcTrace[0]?.sourceAddress.nodeId, 'OV1');
    assert.equal(sparcTrace[8]?.sourceAddress.nodeId, 'OV2');
    assert.equal(sparcTrace[8]?.outcome, 'incorrect');
  });
});
