import { expect } from 'chai';

import { parseAutoTutorResponseEnvelope, validateAutoTutorContent } from './autoTutorContract';

function buildValidTdf() {
  return {
    tutor: {
      setspec: {
        openRouterApiKey: 'test-key',
        openRouterModel: 'openai/gpt-4.1-mini',
      },
      unit: [
        {
          unitname: 'AutoTutor',
          autotutorsession: {
            cluster: 0,
            graduation: {
              minExpectationScore: 1,
              requireNoCurrentMisconceptions: true,
              maxTurns: 20,
            },
          },
        },
      ],
    },
  };
}

function buildValidStimuli() {
  return {
    setspec: {
      clusters: [
        {
          stims: [
            {
              display: {
                text: 'What does a 95% confidence interval mean?',
              },
              autoTutor: {
                id: 'stats_confidence_interval_001',
                topic: 'Confidence intervals',
                learningGoal: 'Explain the repeated-sampling interpretation.',
                idealAnswer: 'The procedure captures the true mean in about 95% of repeated samples.',
                expectations: [
                  {
                    id: 'E1',
                    label: 'repeated sampling',
                    proposition: 'The 95% refers to repeated-sampling success.',
                    hints: ['Think about repeated samples.'],
                    prompts: [{ stem: 'About 95% of intervals would...', target: 'contain the mean' }],
                    assertion: 'The 95% describes the long-run procedure.',
                  },
                ],
                misconceptions: [
                  {
                    id: 'M1',
                    label: 'posterior probability',
                    misconception: 'There is a 95% chance this interval contains the mean.',
                    detectionCues: ['95% chance the mean is inside'],
                    contrastWithExpectations: ['E1'],
                    correction: 'The parameter is fixed after the interval is computed.',
                    repairQuestion: 'What happens over repeated samples?',
                  },
                ],
                dialogPolicy: {
                  allowAnyOrder: true,
                  requiredExpectations: ['E1'],
                  optionalExpectations: [],
                  completionRule: 'Complete when E1 is current and no misconceptions are current.',
                },
                summary: 'Confidence intervals describe long-run interval procedure reliability.',
              },
            },
          ],
        },
      ],
    },
  };
}

describe('AutoTutor content contract', function() {
  it('accepts a valid AutoTutor TDF and stimulus pair', function() {
    const result = validateAutoTutorContent({
      tdf: buildValidTdf(),
      stimuli: buildValidStimuli(),
    });

    expect(result).to.deep.equal({ valid: true, errors: [] });
  });

  it('requires a browser-available OpenRouter key and effective model for AutoTutor units', function() {
    const tdf = buildValidTdf();
    delete (tdf.tutor.setspec as Record<string, unknown>).openRouterApiKey;
    delete (tdf.tutor.setspec as Record<string, unknown>).openRouterModel;

    const result = validateAutoTutorContent({
      tdf,
      stimuli: buildValidStimuli(),
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include('tutor.setspec.openRouterApiKey is required for AutoTutor units');
    expect(result.errors).to.include('tutor.unit[0].autotutorsession requires openRouterModel or tutor.setspec.openRouterModel');
  });

  it('requires AutoTutor content on the first stim in the referenced cluster', function() {
    const stimuli = buildValidStimuli();
    const firstStim = stimuli.setspec.clusters[0]?.stims[0] as Record<string, unknown> | undefined;
    expect(firstStim).to.not.equal(undefined);
    delete firstStim?.autoTutor;

    const result = validateAutoTutorContent({
      tdf: buildValidTdf(),
      stimuli,
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include('setspec.clusters[0].stims[0] is missing autoTutor script');
  });

  it('rejects misconception references to unknown expectations', function() {
    const stimuli = buildValidStimuli();
    const firstMisconception = stimuli.setspec.clusters[0]?.stims[0]?.autoTutor.misconceptions[0];
    expect(firstMisconception).to.not.equal(undefined);
    if (!firstMisconception) {
      throw new Error('Test fixture missing first misconception');
    }
    firstMisconception.contrastWithExpectations = ['E2'];

    const result = validateAutoTutorContent({
      tdf: buildValidTdf(),
      stimuli,
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include(
      'setspec.clusters[0].stims[0].autoTutor.misconceptions[0].contrastWithExpectations references unknown expectation "E2"'
    );
  });

  it('parses the required AutoTutor response JSON envelope', function() {
    const envelope = parseAutoTutorResponseEnvelope(JSON.stringify({
      tutorMessage: 'Good start. What happens over repeated samples?',
      stateUpdate: {
        expectations: {
          E1: { current: false, evidence: 'not yet stated' },
        },
        misconceptions: {
          M1: { current: true, evidence: 'said 95% chance' },
        },
        answerQuality: 'partial',
        studentAskedQuestion: false,
        selectedMove: 'correction',
      },
    }));

    const expectation = envelope.stateUpdate.expectations.E1;
    const misconception = envelope.stateUpdate.misconceptions.M1;
    expect(expectation).to.not.equal(undefined);
    expect(misconception).to.not.equal(undefined);
    if (!expectation || !misconception) {
      throw new Error('Parsed envelope omitted expected test fixture IDs');
    }

    expect(envelope.tutorMessage).to.equal('Good start. What happens over repeated samples?');
    expect(expectation.current).to.equal(false);
    expect(misconception.current).to.equal(true);
    expect(envelope.stateUpdate.selectedMove).to.equal('correction');
  });

  it('parses the required envelope when the model wraps JSON in a fenced block', function() {
    const envelope = parseAutoTutorResponseEnvelope(`\`\`\`json
{
  "tutorMessage": "Good start. What happens over repeated samples?",
  "stateUpdate": {
    "expectations": {
      "E1": { "current": true, "evidence": "mentioned repeated sampling" }
    },
    "misconceptions": {},
    "answerQuality": "high",
    "studentAskedQuestion": false,
    "selectedMove": "summary"
  }
}
\`\`\``);

    expect(envelope.stateUpdate.expectations.E1?.current).to.equal(true);
    expect(envelope.stateUpdate.selectedMove).to.equal('summary');
  });

  it('fails clearly when the model returns malformed JSON', function() {
    expect(() => parseAutoTutorResponseEnvelope('{ not json')).to.throw(
      'AutoTutor response envelope is not valid JSON'
    );
  });
});
