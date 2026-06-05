import { expect } from 'chai';

import { parseAutoTutorScoreEnvelope, parseAutoTutorUtteranceEnvelope, validateAutoTutorContent } from './autoTutorContract';

function buildValidTdf() {
  return {
    tutor: {
      setspec: {
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
                expectationRelationships: {
                  E1: {},
                },
                misconceptions: [
                  {
                    id: 'M1',
                    label: 'posterior probability',
                    misconception: 'There is a 95% chance this interval contains the mean.',
                    detectionCues: ['95% chance the mean is inside'],
                    contrastWithExpectations: ['E1'],
                    correction: 'The parameter is fixed after the interval is computed.',
                    repairQuestion: 'What happens over repeated samples?',
                    repairCriteria: 'Repair when the learner describes repeated interval coverage.',
                    acceptableRepairAnswers: ['About 95% of repeated intervals contain the mean.'],
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

  it('requires an effective model for AutoTutor units without requiring stored provider keys', function() {
    const tdf = buildValidTdf();
    delete (tdf.tutor.setspec as Record<string, unknown>).openRouterModel;

    const result = validateAutoTutorContent({
      tdf,
      stimuli: buildValidStimuli(),
    });

    expect(result.valid).to.equal(false);
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

  it('rejects malformed AutoTutor expectation relationships', function() {
    const stimuli = buildValidStimuli();
    const script = stimuli.setspec.clusters[0]?.stims[0]?.autoTutor as Record<string, unknown> | undefined;
    expect(script).to.not.equal(undefined);
    if (!script) {
      throw new Error('Test fixture missing AutoTutor script');
    }
    script.expectationRelationships = {
      E1: {
        E2: 0.7,
        E1: 1.2,
      },
      E3: {
        E1: 0.5,
      },
    };

    const result = validateAutoTutorContent({
      tdf: buildValidTdf(),
      stimuli,
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include(
      'setspec.clusters[0].stims[0].autoTutor.expectationRelationships.E1.E2 references unknown expectation "E2"'
    );
    expect(result.errors).to.include(
      'setspec.clusters[0].stims[0].autoTutor.expectationRelationships.E1.E1 must be a number from 0 to 1'
    );
    expect(result.errors).to.include(
      'setspec.clusters[0].stims[0].autoTutor.expectationRelationships.E3 must reference a known expectation and contain target weights'
    );
  });

  it('rejects malformed AutoTutor expectation relationship provenance', function() {
    const stimuli = buildValidStimuli();
    const script = stimuli.setspec.clusters[0]?.stims[0]?.autoTutor as Record<string, unknown> | undefined;
    expect(script).to.not.equal(undefined);
    if (!script) {
      throw new Error('Test fixture missing AutoTutor script');
    }
    script.expectationRelationshipProvenance = {
      graphVersion: '',
      generatedAt: '2026-06-05T00:00:00.000Z',
      model: 'google/gemini-embedding-001',
      attemptedModels: [],
      metric: 'cosine_similarity_normalized_vectors',
      scoreTransform: 'clamp_negative_to_zero',
      sourceKeyType: 'profile',
      cacheKey: 'cache',
    };

    const result = validateAutoTutorContent({
      tdf: buildValidTdf(),
      stimuli,
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include(
      'setspec.clusters[0].stims[0].autoTutor.expectationRelationshipProvenance.graphVersion must be a non-empty string'
    );
    expect(result.errors).to.include(
      'setspec.clusters[0].stims[0].autoTutor.expectationRelationshipProvenance.attemptedModels must be a non-empty string array'
    );
    expect(result.errors).to.include(
      'setspec.clusters[0].stims[0].autoTutor.expectationRelationshipProvenance.sourceKeyType must be "tdf" or "user"'
    );
  });

  it('rejects malformed misconception repair criteria fields', function() {
    const stimuli = buildValidStimuli();
    const firstMisconception = stimuli.setspec.clusters[0]?.stims[0]?.autoTutor.misconceptions[0];
    expect(firstMisconception).to.not.equal(undefined);
    if (!firstMisconception) {
      throw new Error('Test fixture missing first misconception');
    }
    firstMisconception.repairCriteria = '';
    (firstMisconception as unknown as Record<string, unknown>).acceptableRepairAnswers = [
      'About 95% of repeated intervals contain the mean.',
      42,
    ];

    const result = validateAutoTutorContent({
      tdf: buildValidTdf(),
      stimuli,
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include(
      'setspec.clusters[0].stims[0].autoTutor.misconceptions[0].repairCriteria must be a non-empty string when present'
    );
    expect(result.errors).to.include(
      'setspec.clusters[0].stims[0].autoTutor.misconceptions[0].acceptableRepairAnswers must be a non-empty string array when present'
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
    expect(expectation.frontier).to.equal(0);
    expect(expectation.priority).to.equal(0);
    expect(misconception.confidence).to.equal(0.9);
    expect(misconception.repaired).to.equal(false);
    expect(envelope.learnerContribution.type).to.equal('assertion');
    expect(envelope.answerQuality).to.equal('partial');
  });

  it('defaults missing question answerability to false when the learner did not ask a question', function() {
    const envelope = parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {
        E1: {
          current: true,
          coverage: 0.8,
          evidence: 'described a concrete request',
        },
      },
      misconceptionScores: {},
      answerQuality: 'high',
      learnerContribution: {
        type: 'assertion',
        confidence: 0.9,
      },
      learnerQuestion: {
        current: false,
      },
    }));

    expect(envelope.learnerQuestion).to.deep.equal({
      current: false,
      answerableFromAuthoredContent: false,
    });
  });

  it('still requires question answerability when the learner asked a question', function() {
    expect(() => parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {},
      misconceptionScores: {},
      answerQuality: 'partial',
      learnerContribution: {
        type: 'question',
        confidence: 0.9,
      },
      learnerQuestion: {
        current: true,
      },
    }))).to.throw('AutoTutor score response learnerQuestion.answerableFromAuthoredContent must be boolean');
  });

  it('parses repaired misconception state with repair evidence', function() {
    const envelope = parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {
        E1: {
          current: false,
          coverage: 0.2,
          evidence: 'named the population mean but not repeated sampling',
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
      "evidence": "mentioned repeated sampling"
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
    expect(envelope.expectationScores.E1?.frontier).to.equal(0);
    expect(envelope.expectationScores.E1?.priority).to.equal(0);
    expect(envelope.answerQuality).to.equal('high');
  });

  it('leaves planner-owned graph metrics unset when parsing scorer output', function() {
    const envelope = parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {
        E1: {
          current: true,
          coverage: 0.8,
        },
      },
      misconceptionScores: {},
      answerQuality: 'high',
      learnerContribution: {
        type: 'assertion',
        confidence: 0.9,
      },
      learnerQuestion: {
        current: false,
        answerableFromAuthoredContent: false,
      },
    }));

    expect(envelope.expectationScores.E1?.frontier).to.equal(0);
    expect(envelope.expectationScores.E1?.coherence).to.equal(0);
    expect(envelope.expectationScores.E1?.centrality).to.equal(0);
    expect(envelope.expectationScores.E1?.priority).to.equal(0);
  });

  it('derives missing expectation current from valid coverage', function() {
    const envelope = parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {
        E1: {
          coverage: 0.7,
          evidence: 'described feelings tied to needs',
        },
        E2: {
          coverage: 0,
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
    }));

    expect(envelope.expectationScores.E1?.current).to.equal(true);
    expect(envelope.expectationScores.E2?.current).to.equal(false);
  });

  it('parses only scoreable expectations and ignores frozen expectation fields', function() {
    const envelope = parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {
        E1: {
          current: true,
          coverage: 0.8,
          coherence: 'already covered',
          centrality: null,
        },
        E2: {
          current: true,
          coverage: 0.9,
        },
      },
      misconceptionScores: {},
      answerQuality: 'high',
      learnerContribution: {
        type: 'assertion',
        confidence: 0.9,
      },
      learnerQuestion: {
        current: false,
        answerableFromAuthoredContent: false,
      },
    }), {
      scoreableExpectationIds: ['E2'],
      frozenExpectationIds: ['E1'],
    });

    expect(Object.keys(envelope.expectationScores)).to.deep.equal(['E2']);
    expect(envelope.expectationScores.E2?.coverage).to.equal(0.9);
  });

  it('fails clearly when a score-scoped response omits a scoreable expectation', function() {
    expect(() => parseAutoTutorScoreEnvelope(JSON.stringify({
      expectationScores: {},
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
    }), {
      scoreableExpectationIds: ['E2'],
      frozenExpectationIds: ['E1'],
    })).to.throw('AutoTutor score response omitted expectation "E2"');
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

  it('rejects tutor messages that expose internal rubric IDs', function() {
    expect(() => parseAutoTutorUtteranceEnvelope(JSON.stringify({
      targetType: 'expectation',
      targetId: 'E4',
      selectedMove: 'prompt',
      tutorMessage: 'You are doing the key E4 move. Can you restate it?',
    }))).to.throw('AutoTutor utterance response tutorMessage must not expose internal expectation or misconception IDs');
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
