import assert from 'node:assert/strict';
import {
  extractCtatBrdReferenceTrace,
  selectCtatReferenceSubtrace,
} from './ctatBrdTraceExtractor';

const SAMPLE_BRD = `<?xml version="1.0" standalone="yes"?>
<stateGraph tutorType="Example-tracing Tutor">
  <node>
    <text>Start</text>
    <uniqueID>1</uniqueID>
  </node>
  <edge>
    <actionLabel preferPathMark="true">
      <message>
        <verb>NotePropertySet</verb>
        <properties>
          <MessageType>InterfaceAction</MessageType>
          <Selection><value>numerator-input</value></Selection>
          <Action><value>UpdateTextField</value></Action>
          <Input><value>3</value></Input>
        </properties>
      </message>
      <actionType>Correct Action</actionType>
    </actionLabel>
    <rule>
      <text>enter-numerator fractions</text>
      <indicator>-1</indicator>
    </rule>
    <sourceID>1</sourceID>
    <destID>2</destID>
  </edge>
  <edge>
    <actionLabel>
      <message>
        <properties>
          <Selection><value>denominator-input</value></Selection>
          <Action><value>UpdateTextField</value></Action>
          <Input><value>5</value></Input>
        </properties>
      </message>
      <actionType>Buggy Action</actionType>
    </actionLabel>
    <rule>
      <text>wrong-denominator</text>
    </rule>
  </edge>
</stateGraph>`;

describe('ctatBrdTraceExtractor', function() {
  it('extracts CTAT BRD edge traces as production-rule reference steps', function() {
    const trace = extractCtatBrdReferenceTrace(SAMPLE_BRD);

    assert.deepEqual(trace, [{
      referenceSystem: 'ctat-brd',
      productionRuleId: 'enter-numerator fractions',
      productionRuleName: 'enter-numerator',
      productionSet: 'fractions',
      actionId: 'numerator-input::UpdateTextField::3',
      outcome: 'correct',
    }, {
      referenceSystem: 'ctat-brd',
      productionRuleId: 'wrong-denominator',
      actionId: 'denominator-input::UpdateTextField::5',
      outcome: 'incorrect',
    }]);
  });

  it('returns an empty trace for empty CTAT BRD state graphs', function() {
    const trace = extractCtatBrdReferenceTrace(`
      <stateGraph>
        <node><text>EmptyStartState</text><uniqueID>1</uniqueID></node>
        <EdgesGroups ordered="true"></EdgesGroups>
      </stateGraph>
    `);

    assert.deepEqual(trace, []);
  });

  it('fails clearly when the XML is not a CTAT state graph', function() {
    assert.throws(
      () => extractCtatBrdReferenceTrace('<notStateGraph />'),
      /CTAT BRD XML missing stateGraph root/,
    );
  });

  it('selects an ordered sample subtrace from a larger CTAT BRD trace', function() {
    const ctatTrace = extractCtatBrdReferenceTrace(SAMPLE_BRD);

    assert.deepEqual(selectCtatReferenceSubtrace({
      ctatTrace,
      expectedTrace: [ctatTrace[1]!],
      label: 'sample',
    }), [ctatTrace[1]]);
  });

  it('fails clearly when a selected sample step is not present in the BRD trace order', function() {
    const ctatTrace = extractCtatBrdReferenceTrace(SAMPLE_BRD);

    assert.throws(
      () => selectCtatReferenceSubtrace({
        ctatTrace,
        expectedTrace: [{
          referenceSystem: 'ctat-brd',
          productionRuleId: 'missing-rule',
          actionId: 'missing::UpdateTextField::0',
          outcome: 'correct',
        }],
        label: 'sample',
      }),
      /CTAT BRD trace missing expected step for sample/,
    );
  });
});
