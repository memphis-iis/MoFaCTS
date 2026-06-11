import assert from 'node:assert/strict';
import {
  assertSparcDocumentReferences,
  resolveSparcDocumentAddress,
  validateSparcDocumentReferences,
} from './sparcDocumentAddressing';
import { findSparcSampleDocument } from './sparcSampleDocuments';
import type { SparcAuthoredDocument } from './sparcSessionContracts';

function sampleDocument(): SparcAuthoredDocument {
  const sample = findSparcSampleDocument('html-factors-balloons');
  assert.ok(sample);
  return sample.document;
}

describe('sparcDocumentAddressing', function() {
  it('resolves authored addresses into nested content inside another region', function() {
    const document = sampleDocument();
    const resolved = resolveSparcDocumentAddress(document, {
      documentId: 'html-factors-balloons',
      nodeId: 'final-answer-region',
      path: ['A3'],
    });

    assert.equal(resolved.node.id, 'final-answer-region');
    assert.deepEqual(resolved.pathNodes.map((node) => node.id), ['A3']);
  });

  it('resolves numeric path segments against authored children', function() {
    const document = sampleDocument();
    const resolved = resolveSparcDocumentAddress(document, {
      documentId: 'html-factors-balloons',
      nodeId: 'conversion-table',
      path: [1],
    });

    assert.deepEqual(resolved.pathNodes.map((node) => node.id), ['OV2']);
  });

  it('validates cross-region references in the sample documents', function() {
    const document = sampleDocument();

    assert.deepEqual(validateSparcDocumentReferences(document), {
      valid: true,
      issues: [],
    });
    assert.doesNotThrow(() => assertSparcDocumentReferences(document));
  });

  it('reports unresolved nested path references without guessing a target', function() {
    const document: SparcAuthoredDocument = {
      ...sampleDocument(),
      root: {
        ...sampleDocument().root,
        children: [{
          id: 'source',
          kind: 'section',
          refs: [{
            relation: 'feedback-for',
            target: {
              documentId: 'html-factors-balloons',
              nodeId: 'final-answer-region',
              path: ['missing-widget'],
            },
          }],
        }, ...(sampleDocument().root.children ?? [])],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'source');
    assert.match(
      result.issues[0]?.message ?? '',
      /path segment "missing-widget" not found under node "final-answer-region"/,
    );
  });

  it('validates authored reactive rule write targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      reactiveRules: [{
        id: 'bad-rule',
        writes: [{
          target: {
            documentId: 'doc-1',
            nodeId: 'region-1',
            path: ['missing'],
          },
          key: 'visible',
          value: true,
        }],
      }],
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'region',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'reactive-rule:bad-rule');
    assert.match(result.issues[0]?.message ?? '', /path segment "missing" not found/);
  });

  it('validates authored initial-state write targets', function() {
    const document: SparcAuthoredDocument = {
      id: 'doc-1',
      schemaVersion: 1,
      initialState: [{
        target: {
          documentId: 'doc-1',
          nodeId: 'region-1',
          path: ['missing'],
        },
        key: 'visible',
        value: false,
      }],
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'region-1',
          kind: 'region',
        }],
      },
    };

    const result = validateSparcDocumentReferences(document);

    assert.equal(result.valid, false);
    assert.equal(result.issues[0]?.sourceNodeId, 'initial-state:0');
    assert.match(result.issues[0]?.message ?? '', /path segment "missing" not found/);
  });

  it('fails clearly when an address points at another document', function() {
    assert.throws(
      () => resolveSparcDocumentAddress(sampleDocument(), {
        documentId: 'other-doc',
        nodeId: 'conversion-table',
      }),
      /does not match authored document/,
    );
  });

  it('fails clearly when authored node ids are duplicated', function() {
    const document: SparcAuthoredDocument = {
      id: 'dup-doc',
      schemaVersion: 1,
      root: {
        id: 'root',
        kind: 'document',
        children: [{
          id: 'dup',
          kind: 'section',
        }, {
          id: 'dup',
          kind: 'region',
        }],
      },
    };

    assert.throws(
      () => resolveSparcDocumentAddress(document, {
        documentId: 'dup-doc',
        nodeId: 'dup',
      }),
      /duplicate node id "dup"/,
    );
  });
});
