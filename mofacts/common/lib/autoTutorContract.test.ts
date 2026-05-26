import { expect } from 'chai';

import { parseAutoTutorScoreEnvelope, parseAutoTutorUtteranceEnvelope, validateAutoTutorContent } from './autoTutorContract';

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
            maxTurns: 20,
            graduation: {
              requiredExpectationCount: 1,
              maxActiveMisconceptions: 0,
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

  it('rejects graduation counts that exceed the authored script', function() {
    const tdf = buildValidTdf();
    tdf.tutor.unit[0]!.autotutorsession.graduation.requiredExpectationCount = 2;
    tdf.tutor.unit[0]!.autotutorsession.graduation.maxActiveMisconceptions = 2;

    const result = validateAutoTutorContent({
      tdf,
      stimuli: buildValidStimuli(),
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include(
      'tutor.unit[0].autotutorsession.graduation.requiredExpectationCount cannot exceed 1 required expectations'
    );
    expect(result.errors).to.include(
      'tutor.unit[0].autotutorsession.graduation.maxActiveMisconceptions cannot exceed 1 authored misconceptions'
    );
  });

  it('rejects invalid AutoTutor utterance temperature', function() {
    const tdf = buildValidTdf();
    (tdf.tutor.unit[0]!.autotutorsession as Record<string, unknown>).utteranceTemperature = 2.5;

    const result = validateAutoTutorContent({
      tdf,
      stimuli: buildValidStimuli(),
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include(
      'tutor.unit[0].autotutorsession.utteranceTemperature must be a number between 0 and 2'
    );
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

  it('parses the required AutoTutor score JSON envelope', function() {
    const envelope = parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {
        E1: {
          current: false,
          coverage: 0.4,
          evidence: 'mentioned intervals',
          missing: ['repeated samples'],
          frontier: 0.4,
          coherence: 0.7,
          centrality: 0.8,
          priority: 0.57,
        },
      },
      misconceptionScores: {
        M1: { current: true, confidence: 0.9, evidence: 'said 95% chance', repaired: false },
      },
      answerQuality: 'partial',
      learnerContribution: {
        type: 'assertion',
        confidence: 0.9,
        evidence: 'Learner made a content claim.',
      },
      learnerQuestion: {
        current: false,
        answerableFromAuthoredContent: false,
      },
    }));

    const expectation = envelope.expectationScores.E1;
    const misconception = envelope.misconceptionScores.M1;
    expect(expectation).to.not.equal(undefined);
    expect(misconception).to.not.equal(undefined);
    if (!expectation || !misconception) {
      throw new Error('Parsed envelope omitted expected test fixture IDs');
    }

    expect(expectation.coverage).to.equal(0.4);
    expect(misconception.confidence).to.equal(0.9);
    expect(misconception.repaired).to.equal(false);
    expect(envelope.learnerContribution.type).to.equal('assertion');
    expect(envelope.answerQuality).to.equal('partial');
  });

  it('parses repaired misconception state with repair evidence', function() {
    const envelope = parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {
        E1: {
          current: false,
          coverage: 0.2,
          evidence: 'named the population mean but not repeated sampling',
          frontier: 0.2,
          coherence: 0.6,
          centrality: 0.7,
          priority: 0.42,
        },
      },
      misconceptionScores: {
        M1: {
          current: false,
          confidence: 0,
          repaired: true,
          repairEvidence: 'The learner answered the repair question by identifying the population mean.',
        },
      },
      answerQuality: 'partial',
      learnerContribution: {
        type: 'assertion',
        confidence: 0.8,
      },
      learnerQuestion: {
        current: false,
        answerableFromAuthoredContent: false,
      },
    }));

    expect(envelope.misconceptionScores.M1).to.include({
      current: false,
      confidence: 0,
      repaired: true,
      repairEvidence: 'The learner answered the repair question by identifying the population mean.',
    });
  });

  it('parses the score envelope when the model wraps JSON in a fenced block', function() {
    const envelope = parseAutoTutorScoreEnvelope(`\`\`\`json
{
  "expectationScores": {
    "E1": {
      "current": true,
      "coverage": 0.85,
      "evidence": "mentioned repeated sampling",
      "frontier": 0.85,
      "coherence": 0.7,
      "centrality": 0.6,
      "priority": 0.755
    }
  },
  "misconceptionScores": {},
  "answerQuality": "high",
  "learnerContribution": {
    "type": "assertion",
    "confidence": 0.9
  },
  "learnerQuestion": {
    "current": false,
    "answerableFromAuthoredContent": false
  }
}
\`\`\``);

    expect(envelope.expectationScores.E1?.current).to.equal(true);
    expect(envelope.answerQuality).to.equal('high');
  });

  it('parses the required AutoTutor utterance JSON envelope', function() {
    const envelope = parseAutoTutorUtteranceEnvelope(JSON.stringify({
      targetType: 'misconception',
      targetId: 'M1',
      selectedMove: 'correction',
      tutorMessage: 'The parameter is fixed after the interval is computed. What happens over repeated samples?',
    }));

    expect(envelope.targetType).to.equal('misconception');
    expect(envelope.targetId).to.equal('M1');
    expect(envelope.selectedMove).to.equal('correction');
    expect(envelope.tutorMessage).to.contain('parameter is fixed');
  });

  it('parses null utterance target IDs for ID-less targets', function() {
    const envelope = parseAutoTutorUtteranceEnvelope(JSON.stringify({
      targetType: 'completion',
      targetId: null,
      selectedMove: 'final_answer_prompt',
      tutorMessage: 'Great. Now restate the whole interpretation in one answer.',
    }));

    expect(envelope.targetType).to.equal('completion');
    expect(envelope.targetId).to.equal(undefined);
    expect(envelope.selectedMove).to.equal('final_answer_prompt');
  });

  it('fails clearly when the model returns malformed JSON', function() {
    expect(() => parseAutoTutorScoreEnvelope('{ not json')).to.throw(
      'AutoTutor response envelope is not valid JSON'
    );
  });

  it('fails clearly when score missing elements are not strings', function() {
    expect(() => parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {
        E1: {
          current: false,
          coverage: 0.4,
          missing: ['repeated samples', 42],
          frontier: 0.4,
          coherence: 0.7,
          centrality: 0.8,
          priority: 0.57,
        },
      },
      misconceptionScores: {},
      answerQuality: 'partial',
      learnerContribution: {
        type: 'assertion',
        confidence: 0.9,
      },
      learnerQuestion: {
        current: false,
        answerableFromAuthoredContent: false,
      },
    }))).to.throw('AutoTutor score response expectationScores.E1.missing must be a string array');
  });

  it('fails clearly when learner contribution type is invalid', function() {
    expect(() => parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {},
      misconceptionScores: {},
      answerQuality: 'low',
      learnerContribution: {
        type: 'shrug',
        confidence: 0.8,
      },
      learnerQuestion: {
        current: false,
        answerableFromAuthoredContent: false,
      },
    }))).to.throw('AutoTutor score response learnerContribution.type is invalid');
  });
});
