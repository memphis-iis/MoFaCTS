import { expect } from 'chai';
import { DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS } from '../fieldRegistrySections';
import {
  migrateLearnerConfigDeliverySettings,
  migrateTdfDeliverySettings,
} from './deliverySettingsMigration';

describe('deliverySettings migration', function() {
  it('migrates root deliveryparams and setspec uiSettings into tutor.deliverySettings', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          deliverySettings: {
            optimalThreshold: '0.95',
          },
          deliveryparams: {
            drill: '30000',
          },
          setspec: {
            uiSettings: {
              displayCorrectFeedback: 'false',
            },
          },
        },
      },
    });

    const tutor = (result.tdf as any).tdfs.tutor;
    expect(tutor.deliverySettings).to.deep.equal({
      optimalThreshold: 0.95,
      displayCorrectFeedback: false,
      drill: 30000,
    });
    expect(tutor.deliveryparams).to.be.undefined;
    expect(tutor.setspec.uiSettings).to.be.undefined;
  });

  it('keeps explicit deliverySettings values ahead of legacy paths and reports conflicts', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          deliverySettings: {
            drill: 1000,
            displayCorrectFeedback: true,
          },
          deliveryparams: {
            drill: '2000',
          },
          setspec: {
            uiSettings: {
              displayCorrectFeedback: 'false',
            },
          },
        },
      },
    });

    const tutor = (result.tdf as any).tdfs.tutor;
    expect(tutor.deliverySettings.drill).to.equal(1000);
    expect(tutor.deliverySettings.displayCorrectFeedback).to.equal(true);
    expect(result.warnings.filter((warning) => warning.message.includes('already defines a different value'))).to.have.length(2);
  });

  it('maps decided legacy field names and drops removed fields', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          deliveryparams: {
            forcecorrectprompt: 'Type Paris',
            readyprompt: '0',
            allowFeedbackTypeSelect: 'true',
            correctscore: '1',
            incorrectscore: '0',
            scoringEnabled: 'true',
          },
          setspec: {
            uiSettings: {
              correctMessage: 'Great.',
              incorrectMessage: 'Try again.',
              displayPerformanceDuringStudy: true,
              displayCardTimeoutAsBarOrText: false,
              correctColor: 'green',
              incorrectColor: 'orange',
              singleLineFeedback: true,
              onlyShowSimpleFeedback: true,
            },
          },
        },
      },
    });

    const settings = (result.tdf as any).tdfs.tutor.deliverySettings;
    expect(settings.forceCorrectPrompt).to.equal('Type Paris');
    expect(settings.readyPromptStringDisplayTime).to.equal(0);
    expect(settings.correctLabelText).to.equal('Great.');
    expect(settings.incorrectLabelText).to.equal('Try again.');
    expect(settings.displayPerformance).to.equal(true);
    expect(settings.displayTimeoutBar).to.equal(false);
    expect(settings.correctColor).to.equal('#008000');
    expect(settings.incorrectColor).to.equal('#ffa500');
    expect(settings.feedbackLayout).to.equal('inline');
    expect(settings.allowFeedbackTypeSelect).to.be.undefined;
    expect(settings.onlyShowSimpleFeedback).to.be.undefined;
    expect(settings.correctscore).to.be.undefined;
    expect(settings.incorrectscore).to.be.undefined;
    expect(settings.scoringEnabled).to.be.undefined;
    expect(result.warnings.filter((warning) => warning.message.includes('Legacy field')).length).to.equal(7);
    expect(result.warnings.filter((warning) => warning.message.includes('Removed field')).length).to.equal(5);
  });

  it('migrates tutor.unit[].deliverySettings and removes unit legacy fields', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          setspec: {},
          unit: [
            {
              deliverySettings: {
                feedbackLayout: 'inline',
              },
              uiSettings: {
                displayTimeoutBar: 'true',
              },
              deliveryparams: {
                reviewstudy: '6000',
              },
            },
          ],
        },
      },
    });

    const unit = (result.tdf as any).tdfs.tutor.unit[0];
    expect(unit.deliverySettings).to.deep.equal({
      feedbackLayout: 'inline',
      displayTimeoutBar: true,
      reviewstudy: 6000,
    });
    expect(unit.uiSettings).to.be.undefined;
    expect(unit.deliveryparams).to.be.undefined;
  });

  it('migrates tutor.setspec.unitTemplate[].deliverySettings and removes unit-template legacy fields', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          setspec: {
            unitTemplate: [
              {
                deliverySettings: {
                  displayTimeoutCountdown: 'true',
                },
                uiSettings: {
                  choiceButtonCols: '3',
                },
                deliveryparams: {
                  purestudy: '1',
                },
              },
            ],
          },
        },
      },
    });

    const template = (result.tdf as any).tdfs.tutor.setspec.unitTemplate[0];
    expect(template.deliverySettings).to.deep.equal({
      displayTimeoutCountdown: true,
      choiceButtonCols: 3,
      purestudy: 1,
    });
    expect(template.uiSettings).to.be.undefined;
    expect(template.deliveryparams).to.be.undefined;
  });

  it('preserves per-condition deliverySettings arrays while migrating each entry', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          setspec: {},
          unit: [
            {
              deliverySettings: {
                feedbackLayout: 'inline',
              },
              uiSettings: [
                { displayTimeoutBar: 'true' },
                { displayTimeoutBar: 'false' },
              ],
              deliveryparams: [
                { lockoutminutes: '2' },
                { lockoutminutes: '1440' },
              ],
            },
          ],
        },
      },
    });

    const unit = (result.tdf as any).tdfs.tutor.unit[0];
    expect(unit.deliverySettings).to.deep.equal([
      { feedbackLayout: 'inline', displayTimeoutBar: true, lockoutminutes: 2 },
      { feedbackLayout: 'inline', displayTimeoutBar: false, lockoutminutes: 1440 },
    ]);
    expect(unit.uiSettings).to.be.undefined;
    expect(unit.deliveryparams).to.be.undefined;
  });

  it('moves misplaced lfparameter to setspec when setspec does not define it', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          setspec: {},
          unit: [
            {
              deliveryparams: {
                lfparameter: '0.85',
                drill: '30000',
              },
            },
          ],
        },
      },
    });

    const tutor = (result.tdf as any).tdfs.tutor;
    expect(tutor.setspec.lfparameter).to.equal('0.85');
    expect(tutor.unit[0].deliverySettings.drill).to.equal(30000);
    expect(tutor.unit[0].deliverySettings.lfparameter).to.be.undefined;
    expect(result.warnings.some((warning) => warning.message.includes('was moved to tutor.setspec.lfparameter'))).to.equal(true);
  });

  it('drops misplaced duplicate lfparameter without copying it to deliverySettings', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          setspec: {
            lfparameter: '0.85',
          },
          unit: [
            {
              deliveryparams: {
                lfparameter: '0.85',
              },
            },
          ],
        },
      },
    });

    const tutor = (result.tdf as any).tdfs.tutor;
    expect(tutor.setspec.lfparameter).to.equal('0.85');
    expect(tutor.unit[0].deliverySettings).to.be.undefined;
    expect(result.warnings.some((warning) => warning.message.includes('duplicate set-spec field'))).to.equal(true);
    expect(result.warnings.some((warning) => warning.message.includes('Unknown field'))).to.equal(false);
  });

  it('reports unknown fields instead of silently copying them', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          deliveryparams: {
            madeUpField: 'surprise',
          },
          setspec: {},
        },
      },
    });

    const tutor = (result.tdf as any).tdfs.tutor;
    expect(tutor.deliverySettings).to.be.undefined;
    expect(result.warnings.some((warning) => warning.message.includes('Unknown field'))).to.equal(true);
  });

  it('reports invalid display values before using deliverySettings defaults', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          setspec: {
            uiSettings: {
              choiceButtonCols: 'many',
            },
          },
        },
      },
    });

    const tutor = (result.tdf as any).tdfs.tutor;
    expect(tutor.deliverySettings.choiceButtonCols).to.equal(DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS.choiceButtonCols);
    expect(result.warnings.some((warning) => warning.message.includes('Invalid value'))).to.equal(true);
  });

  it('drops deprecated delivery metadata that is not valid in deliverySettings schema', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          deliveryparams: {
            feedbackType: 'full',
          },
          setspec: {},
        },
      },
    });

    const tutor = (result.tdf as any).tdfs.tutor;
    expect(tutor.deliverySettings).to.be.undefined;
    expect(result.warnings.some((warning) => warning.message.includes('Removed field "feedbackType"'))).to.equal(true);
  });

  it('can keep legacy paths for inspection when requested', function() {
    const result = migrateTdfDeliverySettings({
      tdfs: {
        tutor: {
          deliveryparams: {
            drill: '30000',
          },
          setspec: {
            uiSettings: {
              displayCorrectFeedback: 'false',
            },
          },
        },
      },
    }, { removeLegacy: false });

    const tutor = (result.tdf as any).tdfs.tutor;
    expect(tutor.deliverySettings.drill).to.equal(30000);
    expect(tutor.deliverySettings.displayCorrectFeedback).to.equal(false);
    expect(tutor.deliveryparams.drill).to.equal('30000');
    expect(tutor.setspec.uiSettings.displayCorrectFeedback).to.equal('false');
  });

  it('migrates cached learner config root and every unit override to deliverySettings', function() {
    const result = migrateLearnerConfigDeliverySettings({
      source: { tdfId: 'world-countries' },
      overrides: {
        setspec: {
          audioPromptMode: 'feedback',
          uiSettings: {
            displayCorrectFeedback: 'false',
          },
        },
        deliveryparams: {
          drill: '30000',
        },
        unit: {
          '0': {
            deliverySettings: {
              feedbackLayout: 'inline',
            },
          },
          '1': {
            deliveryparams: {
              reviewstudy: '6000',
            },
            uiSettings: {
              correctMessage: 'Nice.',
            },
          },
        },
      },
    });

    const overrides = (result.config as any).overrides;
    expect(overrides.setspec.audioPromptMode).to.equal('feedback');
    expect(overrides.setspec.uiSettings).to.be.undefined;
    expect(overrides.deliveryparams).to.be.undefined;
    expect(overrides.deliverySettings.drill).to.equal(30000);
    expect(overrides.deliverySettings.displayCorrectFeedback).to.equal(false);
    expect(overrides.unit['0'].deliverySettings.feedbackLayout).to.equal('inline');
    expect(overrides.unit['1'].deliveryparams).to.be.undefined;
    expect(overrides.unit['1'].uiSettings).to.be.undefined;
    expect(overrides.unit['1'].deliverySettings.reviewstudy).to.equal(6000);
    expect(overrides.unit['1'].deliverySettings.correctLabelText).to.equal('Nice.');
    expect(result.changed).to.equal(true);
  });

  it('migrates cached learner config source unit signatures to deliverySettings', function() {
    const result = migrateLearnerConfigDeliverySettings({
      source: {
        unitSignature: [
          '{"deliveryparams":{},"unitname":"Instructions"}',
          '{"deliveryparams":{"drill":"10000"},"unitname":"Practice"}',
        ],
      },
      overrides: {
        unit: {
          '1': {
            deliverySettings: {
              displayTimeoutBar: true,
            },
          },
        },
      },
    });

    const signatures = (result.config as any).source.unitSignature;
    expect(signatures[0]).to.equal('{"deliverySettings":{},"unitname":"Instructions"}');
    expect(signatures[1]).to.equal('{"deliverySettings":{"drill":10000},"unitname":"Practice"}');
  });

  it('migrates cached learner config unit indexes generically instead of special-casing unit one', function() {
    const result = migrateLearnerConfigDeliverySettings({
      overrides: {
        unit: {
          '4': {
            deliverySettings: {
              displayTimeoutBar: true,
            },
          },
          '12': {
            deliveryparams: {
              drill: '45000',
            },
          },
        },
      },
    });

    const unit = (result.config as any).overrides.unit;
    expect(unit['4'].deliverySettings.displayTimeoutBar).to.equal(true);
    expect(unit['12'].deliverySettings.drill).to.equal(45000);
    expect(unit['12'].deliveryparams).to.be.undefined;
  });
});
