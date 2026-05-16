import { expect } from 'chai';
import {
  LEARNER_TDF_FIELD_DEFINITIONS,
  applyLearnerTdfConfig,
  buildLearnerTdfConfig,
  buildLearnerTdfSourceMetadata,
  normalizeLearnerTdfOverrides,
  validateLearnerTdfConfig
} from './learnerTdfConfig';

describe('learner TDF config', function() {
  function makeTdf() {
    return {
      _id: 'tdf-a',
      updatedAt: new Date('2026-05-06T14:00:00.000Z'),
      tdfs: {
        tutor: {
          setspec: {
            audioPromptMode: 'silent',
            audioInputEnabled: 'false',
            audioInputSensitivity: 60,
          },
          deliverySettings: {
            drill: 25000,
            displayPerformance: false,
            displayTimeoutBar: false
          },
          unit: [
            {
              unitname: 'Intro',
              learningsession: {},
              deliverySettings: {
                drill: 30000,
                reviewstudy: 6000,
                correctprompt: 1000,
                purestudy: 0,
                studyFirst: 0,
                displayPerformance: false
              }
            },
            {
              unitname: 'Practice',
              learningsession: {},
              deliverySettings: {
                drill: 45000,
                reviewstudy: 8000,
                correctprompt: 1500,
                purestudy: 2000,
                studyFirst: 0,
                displayPerformance: false
              }
            }
          ]
        }
      }
    };
  }

  it('applies set-spec overrides without mutating the input TDF', function() {
    const baseTdf = makeTdf();
    const original = JSON.parse(JSON.stringify(baseTdf));
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      setspec: {
        audioPromptMode: 'feedback',
        audioInputEnabled: 'true'
      },
      deliverySettings: { displayPerformance: true }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    expect(result.applied).to.equal(true);
    expect(result.tdf).to.not.equal(baseTdf);
    expect(result.tdf.tdfs.tutor.setspec.audioPromptMode).to.equal('feedback');
    expect(result.tdf.tdfs.tutor.setspec.audioInputEnabled).to.equal('true');
    expect(result.tdf.tdfs.tutor.deliverySettings.displayPerformance).to.equal(true);
    expect(JSON.parse(JSON.stringify(baseTdf))).to.deep.equal(original);
  });

  it('applies unit overrides only to the selected unit', function() {
    const baseTdf = makeTdf();
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      unit: {
        '1': {
          deliverySettings: {
            drill: 60000,
            reviewstudy: 9000,
            studyFirst: 1
          }
        }
      }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    const firstUnit = result.tdf.tdfs.tutor.unit[0];
    const secondUnit = result.tdf.tdfs.tutor.unit[1];
    expect(firstUnit).to.not.equal(undefined);
    expect(secondUnit).to.not.equal(undefined);
    expect(firstUnit!.deliverySettings.drill).to.equal(30000);
    expect(secondUnit!.deliverySettings.drill).to.equal(60000);
    expect(secondUnit!.deliverySettings.reviewstudy).to.equal(9000);
    expect(secondUnit!.deliverySettings.studyFirst).to.equal(1);
  });

  it('applies lesson-level delivery setting overrides at tutor.deliverySettings', function() {
    const baseTdf = makeTdf();
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      deliverySettings: {
        drill: 50000
      }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    expect(result.tdf.tdfs.tutor.deliverySettings.drill).to.equal(50000);
  });

  it('accepts supported delivery settings through deliverySettings', function() {
    const baseTdf = makeTdf();
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      deliverySettings: {
        displayPerformance: true,
        displayTimeoutBar: true
      },
      unit: {
        '0': {
          deliverySettings: {
            displayPerformance: true,
            displayTimeoutBar: true
          }
        }
      }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    expect(result.tdf.tdfs.tutor.deliverySettings.displayTimeoutBar).to.equal(true);
    expect((result.tdf.tdfs.tutor.unit[0]!.deliverySettings as any).displayTimeoutBar).to.equal(true);
  });

  it('offers set-spec audio fields and the minimal unit delivery settings in learner config definitions', function() {
    expect(LEARNER_TDF_FIELD_DEFINITIONS.map((definition) => definition.id)).to.deep.equal([
      'setspec.audioPromptMode',
      'setspec.audioInputEnabled',
      'unit[].deliverySettings.displayTimeoutCountdown',
      'unit[].deliverySettings.displayTimeoutBar',
      'unit[].deliverySettings.displayPerformance',
      'unit[].deliverySettings.stimuliPosition',
      'unit[].deliverySettings.displayUserAnswerInFeedback',
      'unit[].deliverySettings.fontsize',
      'unit[].deliverySettings.studyFirst'
    ]);

    const speechRecognitionField = LEARNER_TDF_FIELD_DEFINITIONS.find((definition) =>
      definition.id === 'setspec.audioInputEnabled'
    );
    expect(speechRecognitionField?.control).to.equal('select');
    expect(speechRecognitionField?.options?.map((option) => option.value)).to.deep.equal([
      'false',
      'true'
    ]);

    const userAnswerField = LEARNER_TDF_FIELD_DEFINITIONS.find((definition) =>
      definition.id === 'unit[].deliverySettings.displayUserAnswerInFeedback'
    );
    expect(userAnswerField?.control).to.equal('select');
    expect(userAnswerField?.options?.map((option) => option.value)).to.deep.equal([
      'onIncorrect',
      'true',
      'false',
      'onCorrect'
    ]);
  });

  it('makes unit delivery settings configurable even when overrides are sparse', function() {
    const baseTdf = makeTdf();
    delete (baseTdf.tdfs.tutor.unit[1] as any)!.deliverySettings;
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      unit: {
        '1': {
          deliverySettings: {
            displayPerformance: true
          }
        }
      }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    expect(result.tdf.tdfs.tutor.unit[0]!.deliverySettings.displayPerformance).to.equal(false);
    expect(result.tdf.tdfs.tutor.unit[1]!.deliverySettings.displayPerformance).to.equal(true);
  });

  it('rejects unknown paths and invalid values clearly', function() {
    const baseTdf = makeTdf();

    expect(() => normalizeLearnerTdfOverrides(baseTdf, {
      setspec: {
        shuffleclusters: '0-3',
        audioPromptMode: 'sometimes'
      },
      unit: {
        '9': {
          deliverySettings: {
            drill: 1000
          }
        },
        '0': {
          deliverySettings: {
            madeUpTiming: 5,
            purestudy: -1
          }
        }
      }
    })).to.throw('setspec.shuffleclusters is not learner configurable');
  });

  it('prunes values that match the current TDF defaults', function() {
    const baseTdf = makeTdf();
    const overrides = normalizeLearnerTdfOverrides(baseTdf, {
      setspec: {
        audioPromptMode: 'silent',
        audioInputEnabled: 'false',
        audioInputSensitivity: 50
      },
      unit: {
        '0': {
          deliverySettings: {
            drill: 30000,
            correctprompt: 5000
          }
        }
      }
    });

    expect(overrides).to.deep.equal({
      setspec: {
        audioInputSensitivity: 50
      },
      unit: {
        '0': {
          deliverySettings: {
            correctprompt: 5000
          }
        }
      }
    });
  });

  it('skips stale unit overrides but still applies valid set-spec overrides', function() {
    const baseTdf = makeTdf();
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      setspec: {
        audioPromptMode: 'question'
      },
      unit: {
        '0': {
          deliverySettings: {
            drill: 60000
          }
        }
      }
    });
    const changedTdf = makeTdf();
    changedTdf.tdfs.tutor.unit[0]!.unitname = 'Renamed Intro';

    const validation = validateLearnerTdfConfig(changedTdf, config);
    const result = applyLearnerTdfConfig(changedTdf, config);

    expect(validation.staleUnitOverrides).to.equal(true);
    expect(result.warnings).to.deep.equal(['Unit-specific learner settings are stale for this TDF and were not applied']);
    expect(result.tdf.tdfs.tutor.setspec.audioPromptMode).to.equal('question');
    expect(result.tdf.tdfs.tutor.unit[0]!.deliverySettings.drill).to.equal(30000);
  });

  it('uses unit delivery defaults in the source signature', function() {
    const baseTdf = makeTdf();
    const changedTdf = makeTdf();
    changedTdf.tdfs.tutor.unit[0]!.deliverySettings.drill = 31000;

    expect(buildLearnerTdfSourceMetadata(baseTdf, 'tdf-a').unitSignature)
      .to.not.deep.equal(buildLearnerTdfSourceMetadata(changedTdf, 'tdf-a').unitSignature);
  });
});
