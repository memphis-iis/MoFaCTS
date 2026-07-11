import { expect } from 'chai';
import {
  assertCanonicalHistoryEnvelope,
  CANONICAL_HISTORY_CORE_FIELDS,
  CANONICAL_HISTORY_SCHEMA_VERSION,
  HISTORY_EVENT_TYPES,
  validateHistoryWirePayload,
  withCanonicalHistorySchemaVersion,
} from './historyEnvelope';
import {
  assertCanonicalHistoryEnvelope as assertComponentCanonicalHistoryEnvelope,
  CANONICAL_HISTORY_CORE_FIELDS as COMPONENT_CANONICAL_HISTORY_CORE_FIELDS,
  CANONICAL_HISTORY_SCHEMA_VERSION as COMPONENT_CANONICAL_HISTORY_SCHEMA_VERSION,
  HISTORY_EVENT_TYPES as COMPONENT_HISTORY_EVENT_TYPES,
} from '../../learning-components/runtime/historyEnvelope';
import { compressHistoryRecord, decompressHistoryRecord } from './historyCompression';
import { HISTORY_KEY_MAP, outputFields } from './Definitions';

function createHistoryRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    historySchemaVersion: 1,
    stimuliSetId: 'set-1',
    stimulusKC: 'kc-1',
    clusterKC: 'cluster-1',
    KCId: 'kc-1',
    userId: 'user-1',
    TDFId: 'tdf-1',
    outcome: 'correct',
    probabilityEstimate: 0.5,
    typeOfResponse: 'text',
    responseValue: 'answer',
    displayedStimulus: { text: 'Prompt' },
    anonStudentId: 'student-1',
    sessionID: 'session-1',
    responseDuration: 300,
    levelUnit: 0,
    levelUnitName: 'Unit 1',
    levelUnitType: 'model',
    problemName: 'Prompt',
    stepName: 'Prompt',
    time: 2000,
    problemStartTime: 1000,
    selection: 'answer',
    action: 'respond',
    input: 'answer',
    studentResponseType: 'ATTEMPT',
    studentResponseSubtype: 'T',
    tutorResponseType: 'RESULT',
    KCDefault: 'kc-1',
    KCCategoryDefault: '',
    KCCluster: 'cluster-1',
    KCCategoryCluster: '',
    CFStartLatency: 100,
    CFEndLatency: 500,
    CFFeedbackLatency: 250,
    feedbackText: 'Correct',
    feedbackType: 'correct',
    instructionQuestionResult: false,
    entryPoint: 'direct',
    eventType: '',
    ...overrides,
  };
}

describe('canonical history envelope', function() {
  it('keeps the app facade aligned with the component-owned history contract', function() {
    const record = createHistoryRecord({ eventType: 'autotutor-turn' });

    expect(CANONICAL_HISTORY_SCHEMA_VERSION).to.equal(COMPONENT_CANONICAL_HISTORY_SCHEMA_VERSION);
    expect(CANONICAL_HISTORY_CORE_FIELDS).to.deep.equal(COMPONENT_CANONICAL_HISTORY_CORE_FIELDS);
    expect(HISTORY_EVENT_TYPES).to.deep.equal(COMPONENT_HISTORY_EVENT_TYPES);
    expect(() => assertCanonicalHistoryEnvelope(record)).not.to.throw();
    expect(() => assertComponentCanonicalHistoryEnvelope(record)).not.to.throw();
  });

  it('keeps the compressed history key map append-only and unambiguous', function() {
    const entries = Object.entries(HISTORY_KEY_MAP);
    const codes = entries.map(([code]) => code);
    const fields = entries.map(([, field]) => field);
    const numericCodes = codes.map((code) => Number(code));

    expect(new Set(codes).size).to.equal(codes.length);
    expect(new Set(fields).size).to.equal(fields.length);
    expect(codes.every((code) => /^[0-9]{2}$/.test(code))).to.equal(true);
    expect(Math.min(...numericCodes)).to.equal(1);
    expect(Math.max(...numericCodes)).to.equal(codes.length);

    for (let expectedCode = 1; expectedCode <= codes.length; expectedCode += 1) {
      expect(HISTORY_KEY_MAP[String(expectedCode).padStart(2, '0')])
        .to.be.a('string')
        .and.not.equal('');
    }
  });

  it('accepts compact trial records with the shared core fields', function() {
    const record = createHistoryRecord();

    expect(() => assertCanonicalHistoryEnvelope(record)).not.to.throw();
    const compressed = compressHistoryRecord(record);
    const decompressed = decompressHistoryRecord(compressed);
    const result = validateHistoryWirePayload(compressed);

    expect(result.wirePayloadBytes).to.be.lessThan(2048);
    expect(compressed.TDFId).to.equal(undefined);
    expect(decompressed.TDFId).to.equal('tdf-1');
    expect(decompressed.problemStartTime).to.equal(1000);
    expect(decompressed.eventType).to.equal('');
    expect(() => assertCanonicalHistoryEnvelope(decompressed)).not.to.throw();
  });

  it('keeps stable compressed keys for cross-component analytics fields', function() {
    const compressed = compressHistoryRecord(createHistoryRecord({ eventType: 'h5p' }));

    expect(compressed['03']).to.equal('user-1');
    expect(compressed['04']).to.equal('tdf-1');
    expect(compressed['05']).to.equal('correct');
    expect(compressed['07']).to.equal('text');
    expect(compressed['08']).to.equal('answer');
    expect(compressed['09']).to.deep.equal({ text: 'Prompt' });
    expect(compressed['13']).to.equal('session-1');
    expect(compressed['25']).to.equal(0);
    expect(compressed['27']).to.equal('model');
    expect(compressed['30']).to.equal(2000);
    expect(compressed['31']).to.equal(1000);
    expect(compressed['32']).to.equal('answer');
    expect(compressed['33']).to.equal('respond');
    expect(compressed['34']).to.equal('answer');
    expect(compressed['63']).to.equal('h5p');
    expect(compressed['73']).to.equal(1);
    expect(compressed['74']).to.equal('set-1');
    expect(compressed['75']).to.equal('kc-1');
    expect(compressed['76']).to.equal('cluster-1');
  });

  it('accepts only documented event types for the current schema', function() {
    for (const eventType of HISTORY_EVENT_TYPES) {
      expect(() => assertCanonicalHistoryEnvelope(createHistoryRecord({ eventType }))).not.to.throw();
    }

    expect(() => assertCanonicalHistoryEnvelope(createHistoryRecord({ eventType: 'new-component-event' })))
      .to.throw('History record eventType "new-component-event" is not documented for schema 1');
    expect(() => assertCanonicalHistoryEnvelope(createHistoryRecord({ eventType: null })))
      .to.throw('History record eventType must be a string');
  });

  it('keeps export columns aligned with versioned event semantics', function() {
    expect(outputFields).to.include.members([
      'History Schema Version',
      'Event Type',
    ]);
    expect(outputFields.indexOf('History Schema Version'))
      .to.be.lessThan(outputFields.indexOf('Event Type'));
  });

  it('stamps the current schema version before shared client validation', function() {
    const record = createHistoryRecord();
    delete record.historySchemaVersion;

    const versioned = withCanonicalHistorySchemaVersion(record);

    expect(() => assertCanonicalHistoryEnvelope(versioned)).not.to.throw();
    expect(versioned.historySchemaVersion).to.equal(1);
  });

  it('rejects unknown history schema versions instead of silently persisting them', function() {
    const record = createHistoryRecord({ historySchemaVersion: 2 });

    expect(() => assertCanonicalHistoryEnvelope(record))
      .to.throw('History record historySchemaVersion must be 1');
  });

  it('requires explicit stimulus identity for model-practice rows', function() {
    const record = createHistoryRecord();
    delete record.stimuliSetId;

    expect(() => assertCanonicalHistoryEnvelope(record))
      .to.throw('Model practice history record missing stimuliSetId');
  });

  it('rejects model-practice identity alias mismatches', function() {
    const record = createHistoryRecord({
      KCId: 'cluster-1',
    });

    expect(() => assertCanonicalHistoryEnvelope(record))
      .to.throw('Model practice history identity mismatch: KCId must equal stimulusKC');
  });

  it('accepts bounded component-specific extension fields', function() {
    const record = createHistoryRecord({
      typeOfResponse: 'h5p',
      selection: 'h5p interaction',
      action: 'h5p interaction',
      eventType: 'h5p',
      h5p: {
        contentId: 'content-1',
        eventType: 'part',
        eventIndex: 0,
        completed: false,
        passed: false,
        correct: true,
      },
    });

    expect(() => assertCanonicalHistoryEnvelope(record)).not.to.throw();
    const compressed = compressHistoryRecord(record);
    const result = validateHistoryWirePayload(compressed);
    const decompressed = decompressHistoryRecord(compressed);

    expect(result.wirePayloadBytes).to.be.lessThan(2048);
    expect((decompressed.h5p as Record<string, unknown>).completed).to.equal(false);
    expect((decompressed.h5p as Record<string, unknown>).passed).to.equal(false);
  });

  it('accepts compact SPARC extension fields on the canonical history path', function() {
    const record = createHistoryRecord({
      typeOfResponse: 'sparc',
      selection: 'sparc document response',
      action: 'response-submitted',
      eventType: 'sparc',
      sparc: {
        pageKey: 'doc-1',
        sourceAddress: {
          pageKey: 'doc-1',
          nodeId: 'region-1',
          path: ['widget-7', 'input'],
        },
        practiceObservation: {
          observationId: 'obs-1',
          sourceAddress: {
            pageKey: 'doc-1',
            nodeId: 'region-1',
            path: ['widget-7', 'input'],
          },
          time: 2000,
          problemStartTime: 1000,
          outcome: 'correct',
          responseValue: 'answer',
        },
      },
    });

    expect(() => assertCanonicalHistoryEnvelope(record)).not.to.throw();
    const compressed = compressHistoryRecord(record);
    const result = validateHistoryWirePayload(compressed);
    const decompressed = decompressHistoryRecord(compressed);

    expect(result.wirePayloadBytes).to.be.lessThan(2048);
    expect(compressed['63']).to.equal('sparc');
    expect(compressed['79']).to.be.an('object');
    expect((decompressed.sparc as Record<string, unknown>).pageKey).to.equal('doc-1');
  });

  it('rejects component-specific extension fields that exceed their own budget', function() {
    const record = createHistoryRecord({
      CFNote: 'x'.repeat(256),
    });

    expect(() => assertCanonicalHistoryEnvelope(record, { maxExtensionFieldBytes: 128 }))
      .to.throw('History extension field CFNote exceeds 128 bytes');
  });

  it('fails clearly when a component skips the comparable history core', function() {
    const record = createHistoryRecord();
    delete record.problemStartTime;

    expect(() => assertCanonicalHistoryEnvelope(record))
      .to.throw('History record missing canonical core fields: problemStartTime');
  });

  it('rejects undefined canonical core values before wire compression can drop them', function() {
    const record = createHistoryRecord({
      selection: undefined,
    });

    expect(() => assertCanonicalHistoryEnvelope(record))
      .to.throw('History record has undefined canonical core fields: selection');
  });

  it('rejects per-trial runtime snapshots instead of silently logging them', function() {
    const record = createHistoryRecord({
      runtimeState: { queue: ['large per-trial state'] },
    });

    expect(() => assertCanonicalHistoryEnvelope(record))
      .to.throw('History record contains per-trial runtime snapshot fields: runtimeState');
  });

  it('enforces the wire payload budget after compression', function() {
    const compressed = compressHistoryRecord(createHistoryRecord({
      CFNote: 'x'.repeat(256),
    }));

    expect(() => validateHistoryWirePayload(compressed, { maxWirePayloadBytes: 128 }))
      .to.throw('History wire payload exceeds 128 bytes');
  });
});
