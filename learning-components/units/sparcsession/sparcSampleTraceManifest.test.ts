import assert from 'node:assert/strict';
import {
  assertAllSparcSampleTracesMatchCtatBrds,
  assertSparcSampleTraceMatchesCtatBrdTrace,
  assertSparcSampleTraceFixtureReady,
  compareSparcSampleTraceFixture,
  SPARC_SAMPLE_TRACE_FIXTURES,
} from './sparcSampleTraceManifest';
import type { SparcSampleTraceFixture } from './sparcSampleTraceManifest';
import type { SparcReferenceTraceStep } from './sparcSessionContracts';

function brdXmlForTrace(trace: readonly SparcReferenceTraceStep[]): string {
  const edges = trace.map((step) => {
    const [selection, action, input] = step.actionId.split('::');
    return `
      <edge>
        <actionLabel>
          <message>
            <properties>
              <Selection><value>${selection ?? ''}</value></Selection>
              <Action><value>${action ?? ''}</value></Action>
              <Input><value>${input ?? ''}</value></Input>
            </properties>
          </message>
          <actionType>${step.outcome === 'incorrect' ? 'Buggy Action' : 'Correct Action'}</actionType>
        </actionLabel>
        <rule><text>${step.productionRuleId}</text></rule>
      </edge>
    `;
  }).join('');
  return `<stateGraph>${edges}</stateGraph>`;
}

describe('sparcSampleTraceManifest', function() {
  it('tracks the first two CTAT BRD sample trace fixtures', function() {
    assert.deepEqual(SPARC_SAMPLE_TRACE_FIXTURES.map((fixture) => ({
      id: fixture.id,
      ctatRootRelativeBrdPath: fixture.ctatRootRelativeBrdPath,
      status: fixture.status,
      authoredDocumentId: fixture.authoredDocument?.id,
      referenceTraceLength: fixture.referenceTrace?.length,
      sparcTraceLength: fixture.sparcTrace?.length,
    })), [{
      id: 'html-factors-balloons',
      ctatRootRelativeBrdPath: 'docs/HTML Factors/FinalBRDs/balloons.brd',
      status: 'ready-for-comparison',
      authoredDocumentId: 'html-factors-balloons',
      referenceTraceLength: 12,
      sparcTraceLength: 12,
    }, {
      id: 'html-factors-cookies',
      ctatRootRelativeBrdPath: 'docs/HTML Factors/FinalBRDs/cookies.brd',
      status: 'ready-for-comparison',
      authoredDocumentId: 'html-factors-cookies',
      referenceTraceLength: 12,
      sparcTraceLength: 12,
    }]);
  });

  it('fails clearly before SPARC authoring supplies comparable traces', function() {
    const unreadyFixture: SparcSampleTraceFixture = {
      id: 'unready-sample',
      label: 'Unready sample',
      ctatRootRelativeBrdPath: 'Examples/Unready.brd',
      status: 'needs-sparc-authoring',
    };

    assert.throws(
      () => assertSparcSampleTraceFixtureReady(unreadyFixture),
      /needs SPARC authoring before comparison/,
    );
  });

  it('compares both selected sample traces against their CTAT reference rules', function() {
    for (const fixture of SPARC_SAMPLE_TRACE_FIXTURES) {
      assert.doesNotThrow(() => assertSparcSampleTraceFixtureReady(fixture));
      const result = compareSparcSampleTraceFixture(fixture);
      assert.deepEqual(result, {
        equivalent: true,
        mismatches: [],
      });
    }
  });

  it('generates SPARC sample trace source addresses from authored trace metadata', function() {
    const [balloonsFixture] = SPARC_SAMPLE_TRACE_FIXTURES;

    assert.equal(balloonsFixture?.sparcTrace?.[0]?.traceId, 'html-factors-balloons-trace-1');
    assert.deepEqual(balloonsFixture?.sparcTrace?.[0]?.sourceAddress, {
      documentId: 'html-factors-balloons',
      nodeId: 'OV1',
    });
    assert.equal(balloonsFixture?.sparcTrace?.[8]?.actionId, 'OV2::UpdateTextField::12');
    assert.equal(balloonsFixture?.sparcTrace?.[8]?.outcome, 'incorrect');
    assert.deepEqual(balloonsFixture?.sparcTrace?.[8]?.sourceAddress, {
      documentId: 'html-factors-balloons',
      nodeId: 'OV2',
    });
  });

  it('keeps the BRD-derived production-rule sequence explicit', function() {
    const [balloonsFixture, cookiesFixture] = SPARC_SAMPLE_TRACE_FIXTURES;
    assert.deepEqual(balloonsFixture?.referenceTrace?.map((step) => step.productionRuleId), [
      'enter-given-from conversion-factors',
      'enter-given-from conversion-factors',
      'enter-given-to conversion-factors',
      'enter-factor conversion-factors',
      'enter-factor conversion-factors',
      'scale-completed conversion-factors',
      'complete-sentence conversion-factors',
      'unnamed',
      'unnamed',
      'unnamed',
      'unnamed',
      'unnamed',
    ]);
    assert.deepEqual(cookiesFixture?.referenceTrace?.map((step) => step.actionId), [
      'OV1::UpdateTextField::30',
      'OV2::UpdateTextField::120',
      'CV1::UpdateTextField::90',
      'SF1::UpdateTextField::3',
      'SF2::UpdateTextField::3',
      'CV2::UpdateTextField::360',
      'A3::UpdateTextField::360',
      'done::ButtonPressed::-1',
      'OV2::UpdateTextField::30',
      'OV1::UpdateTextField::120',
      'CV1::UpdateTextField::30',
      'CV2::UpdateTextField::1',
    ]);
    assert.deepEqual(balloonsFixture?.referenceTrace?.slice(0, 3).map((step) => ({
      productionRuleName: step.productionRuleName,
      productionSet: step.productionSet,
    })), [{
      productionRuleName: 'enter-given-from',
      productionSet: 'conversion-factors',
    }, {
      productionRuleName: 'enter-given-from',
      productionSet: 'conversion-factors',
    }, {
      productionRuleName: 'enter-given-to',
      productionSet: 'conversion-factors',
    }]);
    assert.deepEqual(balloonsFixture?.sparcTrace?.slice(0, 3).map((step) => ({
      productionRuleName: step.details?.productionRuleName,
      productionSet: step.details?.productionSet,
    })), [{
      productionRuleName: 'enter-given-from',
      productionSet: 'conversion-factors',
    }, {
      productionRuleName: 'enter-given-from',
      productionSet: 'conversion-factors',
    }, {
      productionRuleName: 'enter-given-to',
      productionSet: 'conversion-factors',
    }]);
  });

  it('compares a ready sample fixture through the shared trace comparator', function() {
    const readyFixture: SparcSampleTraceFixture = {
      id: 'ready-sample',
      label: 'Ready sample',
      ctatRootRelativeBrdPath: 'Examples/Ready.brd',
      status: 'ready-for-comparison',
      referenceTrace: [{
        referenceSystem: 'ctat-brd',
        productionRuleId: 'rule-1',
        actionId: 'node-1::UpdateTextField::2',
        outcome: 'correct',
      }],
      sparcTrace: [{
        traceId: 'trace-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'node-1',
        },
        productionRuleId: 'rule-1',
        actionId: 'node-1::UpdateTextField::2',
        outcome: 'correct',
        time: 1000,
      }],
    };

    assert.doesNotThrow(() => assertSparcSampleTraceFixtureReady(readyFixture));
    assert.equal(compareSparcSampleTraceFixture(readyFixture).equivalent, true);
  });

  it('checks a ready fixture against an explicit CTAT BRD trace projection', function() {
    const readyFixture: SparcSampleTraceFixture = {
      id: 'ready-sample',
      label: 'Ready sample',
      ctatRootRelativeBrdPath: 'Examples/Ready.brd',
      status: 'ready-for-comparison',
      referenceTrace: [{
        referenceSystem: 'ctat-brd',
        productionRuleId: 'rule-1',
        actionId: 'node-1::UpdateTextField::2',
        outcome: 'correct',
      }],
      sparcTrace: [{
        traceId: 'trace-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'node-1',
        },
        productionRuleId: 'rule-1',
        actionId: 'node-1::UpdateTextField::2',
        outcome: 'correct',
        time: 1000,
      }],
    };

    assert.doesNotThrow(() => assertSparcSampleTraceMatchesCtatBrdTrace({
      fixture: readyFixture,
      ctatTrace: [{
        referenceSystem: 'ctat-brd',
        productionRuleId: 'setup-rule',
        actionId: 'setup::UpdateTextArea::copy',
        outcome: 'correct',
      }, {
        referenceSystem: 'ctat-brd',
        productionRuleId: 'rule-1',
        actionId: 'node-1::UpdateTextField::2',
        outcome: 'correct',
      }],
    }));
  });

  it('checks all selected sample fixtures against CTAT BRD XML read by path', function() {
    const brdXmlByPath = new Map(
      SPARC_SAMPLE_TRACE_FIXTURES.map((fixture) => [
        fixture.ctatRootRelativeBrdPath,
        brdXmlForTrace(fixture.referenceTrace ?? []),
      ]),
    );

    const results = assertAllSparcSampleTracesMatchCtatBrds({
      readCtatBrdXml(path) {
        const brdXml = brdXmlByPath.get(path);
        if (!brdXml) {
          throw new Error(`missing BRD XML for ${path}`);
        }
        return brdXml;
      },
    });

    assert.deepEqual(results, [{
      fixtureId: 'html-factors-balloons',
      ctatRootRelativeBrdPath: 'docs/HTML Factors/FinalBRDs/balloons.brd',
      ctatTraceLength: 12,
      selectedTraceLength: 12,
    }, {
      fixtureId: 'html-factors-cookies',
      ctatRootRelativeBrdPath: 'docs/HTML Factors/FinalBRDs/cookies.brd',
      ctatTraceLength: 12,
      selectedTraceLength: 12,
    }]);
  });
});
