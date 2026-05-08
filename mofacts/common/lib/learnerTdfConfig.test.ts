import { expect } from 'chai';
import {
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
            audioInputSensitivity: 60,
            uiSettings: {
              displayPerformance: false,
              displayTimeoutBar: false
            }
          },
          deliveryparams: {
            drill: 25000,
            showhistory: false
          },
          unit: [
            {
              unitname: 'Intro',
              uiSettings: {
                displayPerformance: false
              },
              deliveryparams: {
                drill: 30000,
                reviewstudy: 6000,
                correctprompt: 1000,
                purestudy: 0
              }
            },
            {
              unitname: 'Practice',
              uiSettings: {
                displayPerformance: false
              },
              deliveryparams: {
                drill: 45000,
                reviewstudy: 8000,
                correctprompt: 1500,
                purestudy: 2000
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
        audioInputSensitivity: 45,
        uiSettings: { displayPerformance: true }
      }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    expect(result.applied).to.equal(true);
    expect(result.tdf).to.not.equal(baseTdf);
    expect(result.tdf.tdfs.tutor.setspec.audioPromptMode).to.equal('feedback');
    expect(result.tdf.tdfs.tutor.setspec.audioInputSensitivity).to.equal(45);
    expect(result.tdf.tdfs.tutor.setspec.uiSettings.displayPerformance).to.equal(true);
    expect(JSON.parse(JSON.stringify(baseTdf))).to.deep.equal(original);
  });

  it('applies unit overrides only to the selected unit', function() {
    const baseTdf = makeTdf();
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      unit: {
        '1': {
          deliveryparams: {
            drill: 60000,
            reviewstudy: 9000
          }
        }
      }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    const firstUnit = result.tdf.tdfs.tutor.unit[0];
    const secondUnit = result.tdf.tdfs.tutor.unit[1];
    expect(firstUnit).to.not.equal(undefined);
    expect(secondUnit).to.not.equal(undefined);
    expect(firstUnit!.deliveryparams.drill).to.equal(30000);
    expect(secondUnit!.deliveryparams.drill).to.equal(60000);
    expect(secondUnit!.deliveryparams.reviewstudy).to.equal(9000);
  });

  it('applies lesson-level delivery parameter overrides at tutor.deliveryparams', function() {
    const baseTdf = makeTdf();
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      deliveryparams: {
        drill: 50000,
        showhistory: true
      }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    expect(result.tdf.tdfs.tutor.deliveryparams.drill).to.equal(50000);
    expect(result.tdf.tdfs.tutor.deliveryparams.showhistory).to.equal(true);
  });

  it('accepts all supported UI settings through the registry allowlist', function() {
    const baseTdf = makeTdf();
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      setspec: {
        uiSettings: {
          displayPerformance: true,
          displayTimeoutBar: true
        }
      },
      unit: {
        '0': {
          uiSettings: {
            displayPerformance: true,
            displayTimeoutBar: true
          }
        }
      }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    expect(result.tdf.tdfs.tutor.setspec.uiSettings.displayTimeoutBar).to.equal(true);
    expect((result.tdf.tdfs.tutor.unit[0]!.uiSettings as any).displayTimeoutBar).to.equal(true);
  });

  it('makes unit UI settings configurable even when overrides are sparse', function() {
    const baseTdf = makeTdf();
    delete (baseTdf.tdfs.tutor.unit[1] as any)!.uiSettings;
    const config = buildLearnerTdfConfig(baseTdf, 'tdf-a', {
      unit: {
        '1': {
          uiSettings: {
            displayPerformance: true
          }
        }
      }
    });

    const result = applyLearnerTdfConfig(baseTdf, config);

    expect(result.tdf.tdfs.tutor.unit[0]!.uiSettings.displayPerformance).to.equal(false);
    expect(result.tdf.tdfs.tutor.unit[1]!.uiSettings.displayPerformance).to.equal(true);
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
          deliveryparams: {
            drill: 1000
          }
        },
        '0': {
          deliveryparams: {
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
        audioInputSensitivity: 50
      },
      unit: {
        '0': {
          deliveryparams: {
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
          deliveryparams: {
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
          deliveryparams: {
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
    expect(result.tdf.tdfs.tutor.unit[0]!.deliveryparams.drill).to.equal(30000);
  });

  it('uses unit delivery defaults in the source signature', function() {
    const baseTdf = makeTdf();
    const changedTdf = makeTdf();
    changedTdf.tdfs.tutor.unit[0]!.deliveryparams.drill = 31000;

    expect(buildLearnerTdfSourceMetadata(baseTdf, 'tdf-a').unitSignature)
      .to.not.deep.equal(buildLearnerTdfSourceMetadata(changedTdf, 'tdf-a').unitSignature);
  });
});
