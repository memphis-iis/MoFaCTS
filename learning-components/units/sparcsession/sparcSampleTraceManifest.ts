import type {
  SparcAuthoredDocument,
  SparcReferenceTraceStep,
  SparcTraceStep,
} from './sparcSessionContracts';
import {
  extractCtatBrdReferenceTrace,
  selectCtatReferenceSubtrace,
  type CtatBrdXmlParser,
} from './ctatBrdTraceExtractor';
import {
  createSparcReferenceTraceForSample,
  createSparcTraceForSampleDocument,
  SPARC_SAMPLE_DOCUMENTS,
} from './sparcSampleDocuments';
import {
  compareSparcModelTrace,
  type SparcTraceComparisonResult,
} from './sparcTraceComparison';

export type SparcSampleTraceStatus =
  | 'needs-sparc-authoring'
  | 'ready-for-comparison'
  | 'equivalent';

export type SparcSampleTraceFixture = {
  readonly id: string;
  readonly label: string;
  readonly ctatRootRelativeBrdPath: string;
  readonly status: SparcSampleTraceStatus;
  readonly note?: string;
  readonly authoredDocument?: SparcAuthoredDocument;
  readonly referenceTrace?: readonly SparcReferenceTraceStep[];
  readonly sparcTrace?: readonly SparcTraceStep[];
};

function labelForSample(id: string): string {
  switch (id) {
    case 'html-factors-balloons':
      return 'HTML Factors: balloons';
    case 'html-factors-cookies':
      return 'HTML Factors: cookies';
    default:
      return id;
  }
}

export const SPARC_SAMPLE_TRACE_FIXTURES: readonly SparcSampleTraceFixture[] = SPARC_SAMPLE_DOCUMENTS.map((sample) => ({
  id: sample.document.id,
  label: labelForSample(sample.document.id),
  ctatRootRelativeBrdPath: sample.ctatRootRelativeBrdPath,
  status: 'ready-for-comparison',
  note: 'Authored sample document fixture covers the trace widgets and cross-region refs; full instructional text/layout remains separate work.',
  authoredDocument: sample.document,
  referenceTrace: createSparcReferenceTraceForSample(sample),
  sparcTrace: createSparcTraceForSampleDocument(sample),
}));

export function assertSparcSampleTraceFixtureReady(
  fixture: SparcSampleTraceFixture,
): asserts fixture is SparcSampleTraceFixture & {
  readonly referenceTrace: readonly SparcReferenceTraceStep[];
  readonly sparcTrace: readonly SparcTraceStep[];
} {
  if (fixture.status === 'needs-sparc-authoring') {
    throw new Error(`SPARC sample trace fixture "${fixture.id}" needs SPARC authoring before comparison`);
  }
  if (!Array.isArray(fixture.referenceTrace) || fixture.referenceTrace.length === 0) {
    throw new Error(`SPARC sample trace fixture "${fixture.id}" missing CTAT reference trace`);
  }
  if (!Array.isArray(fixture.sparcTrace) || fixture.sparcTrace.length === 0) {
    throw new Error(`SPARC sample trace fixture "${fixture.id}" missing SPARC trace`);
  }
}

export function compareSparcSampleTraceFixture(
  fixture: SparcSampleTraceFixture,
): SparcTraceComparisonResult {
  assertSparcSampleTraceFixtureReady(fixture);
  return compareSparcModelTrace({
    referenceTrace: fixture.referenceTrace,
    sparcTrace: fixture.sparcTrace,
  });
}

export function assertSparcSampleTraceMatchesCtatBrdTrace(params: {
  readonly fixture: SparcSampleTraceFixture;
  readonly ctatTrace: readonly SparcReferenceTraceStep[];
}): void {
  assertSparcSampleTraceFixtureReady(params.fixture);
  const selectedReferenceTrace = selectCtatReferenceSubtrace({
    ctatTrace: params.ctatTrace,
    expectedTrace: params.fixture.referenceTrace,
    label: params.fixture.id,
  });
  const result = compareSparcModelTrace({
    referenceTrace: selectedReferenceTrace,
    sparcTrace: params.fixture.sparcTrace,
  });
  if (!result.equivalent) {
    throw new Error(
      `SPARC sample trace fixture "${params.fixture.id}" does not match selected CTAT BRD trace: ${JSON.stringify(result.mismatches)}`,
    );
  }
}

export type SparcSampleTraceBrdReadResult = {
  readonly fixtureId: string;
  readonly ctatRootRelativeBrdPath: string;
  readonly ctatTraceLength: number;
  readonly selectedTraceLength: number;
};

export function assertAllSparcSampleTracesMatchCtatBrds(params: {
  readonly readCtatBrdXml: (ctatRootRelativeBrdPath: string) => string;
  readonly fixtures?: readonly SparcSampleTraceFixture[];
  readonly parser?: CtatBrdXmlParser;
}): readonly SparcSampleTraceBrdReadResult[] {
  const results: SparcSampleTraceBrdReadResult[] = [];
  for (const fixture of params.fixtures ?? SPARC_SAMPLE_TRACE_FIXTURES) {
    assertSparcSampleTraceFixtureReady(fixture);
    const brdXml = params.readCtatBrdXml(fixture.ctatRootRelativeBrdPath);
    const ctatTrace = extractCtatBrdReferenceTrace(brdXml, params.parser);
    assertSparcSampleTraceMatchesCtatBrdTrace({
      fixture,
      ctatTrace,
    });
    results.push({
      fixtureId: fixture.id,
      ctatRootRelativeBrdPath: fixture.ctatRootRelativeBrdPath,
      ctatTraceLength: ctatTrace.length,
      selectedTraceLength: fixture.referenceTrace.length,
    });
  }
  return results;
}
