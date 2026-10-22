import { expect } from 'chai';
import { DELIVERY_SETTINGS_DEFAULTS } from '../../common/fieldRegistry';
import { pickTimingRuntimeSettings } from '../../common/deliveryTimingSettings';
import { resolveCurrentDeliverySettings } from './deliverySettingsResolver';
import { getFeedbackTimeoutMs, getMainTimeoutMs, hasAnswerFeedback } from '../views/experiment/svelte/utils/timeoutUtils';

function resolve(tutorSettings: unknown, unitSettings?: unknown, experimentXCond: unknown = '') {
  const unit = { deliverySettings: unitSettings };
  const tutor = { deliverySettings: tutorSettings, unit: [unit] };
  return resolveCurrentDeliverySettings({
    tdfFile: { tdfs: { tutor } }, tutor, unit, unitIndex: 0,
    experimentXCond, unitType: 'model', silent: true,
  });
}

describe('delivery settings scope inheritance', function() {
  it('retains lesson timing for drill feedback when the unit only sets adaptive controls', function() {
    const { settings } = resolve({
      drill: 3600000, reviewstudy: 15000, correctprompt: 1500,
      forceCorrection: 'true', checkOtherAnswers: 'true', fontsize: 24,
      displayTimeoutCountdown: true,
    }, { optimalThreshold: 0.8, practiceseconds: 0 });
    expect(settings).to.include({
      drill: 3600000, reviewstudy: 15000, correctprompt: 1500,
      forceCorrection: true, checkOtherAnswers: true, fontsize: 24,
      optimalThreshold: 0.8, practiceseconds: 0, displayTimeoutCountdown: true,
    });
    const incorrect = { deliverySettings: settings, testType: 'd', isCorrect: false };
    expect(getMainTimeoutMs(incorrect)).to.equal(3600000);
    expect(hasAnswerFeedback(incorrect)).to.equal(true);
    expect(getFeedbackTimeoutMs(incorrect)).to.equal(15000);
    expect(getFeedbackTimeoutMs({ ...incorrect, isCorrect: true })).to.equal(1500);
    expect(hasAnswerFeedback({ ...incorrect, testType: 't' })).to.equal(false);
  });

  it('preserves explicit zero, false and blank unit overrides', function() {
    const { settings } = resolve({
      drill: 3600000, reviewstudy: 15000, forceCorrection: 'true',
      practicetimer: 'clock-based', displayTimeoutCountdown: true,
    }, {
      drill: 0, reviewstudy: 0, forceCorrection: false,
      practicetimer: '', displayTimeoutCountdown: false,
    });
    expect(settings).to.include({
      drill: 0, reviewstudy: 0, forceCorrection: false,
      practicetimer: '', displayTimeoutCountdown: false,
    });
    expect(hasAnswerFeedback({ deliverySettings: settings, testType: 'd', isCorrect: false })).to.equal(false);
  });

  it('inherits from the selected condition and preserves partial condition overrides', function() {
    const { settings } = resolve(
      [{ reviewstudy: 5000, drill: 10000 }, { reviewstudy: '15000', drill: '3600000', lockoutminutes: '10' }],
      [{ reviewstudy: 0 }, { optimalThreshold: '0.8' }],
      '1',
    );
    expect(settings).to.include({ reviewstudy: 15000, drill: 3600000, optimalThreshold: 0.8, lockoutminutes: 10 });
  });

  it('retains runtime defaults when neither scope supplies timing', function() {
    const result = resolve(undefined);
    expect(result.settings).to.include(DELIVERY_SETTINGS_DEFAULTS);
    expect(result.hasTutorSettings).to.equal(false);
    expect(result.hasUnitSettings).to.equal(false);
  });

  it('does not invent overrides for an absent, empty or undefined-valued scope', function() {
    for (const source of [undefined, null, {}, [], { reviewstudy: undefined }]) {
      expect(pickTimingRuntimeSettings(source, '')).to.deep.equal({});
    }
    expect(resolve({ reviewstudy: 15000 }, { reviewstudy: undefined }).settings.reviewstudy).to.equal(15000);
  });

  it('keeps lesson-level lockouts in the shared server timing overlay', function() {
    const timing = {
      ...pickTimingRuntimeSettings({ lockoutminutes: '10' }, ''),
      ...pickTimingRuntimeSettings({ optimalThreshold: 0.8 }, ''),
    };
    expect(timing.lockoutminutes).to.equal(10);
    expect({ ...timing, ...pickTimingRuntimeSettings({ lockoutminutes: 0 }, '') }.lockoutminutes).to.equal(0);
  });
});
