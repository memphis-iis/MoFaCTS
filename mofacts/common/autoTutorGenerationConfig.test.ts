import { expect } from 'chai';
import {
  AUTO_TUTOR_DEFAULT_UTTERANCE_TEMPERATURE,
  AUTO_TUTOR_SCORING_TEMPERATURE,
  parseAutoTutorTemperature,
} from '../../learning-components/units/autotutor/AutoTutorGenerationConfig';

describe('AutoTutor generation config', function() {
  it('keeps scoring and utterance temperatures explicit', function() {
    expect(AUTO_TUTOR_SCORING_TEMPERATURE).to.equal(0.2);
    expect(AUTO_TUTOR_DEFAULT_UTTERANCE_TEMPERATURE).to.equal(0.45);
  });

  it('uses the default temperature when the field is omitted', function() {
    expect(parseAutoTutorTemperature(
      undefined,
      'autotutorsession.utteranceTemperature',
      AUTO_TUTOR_DEFAULT_UTTERANCE_TEMPERATURE,
    )).to.equal(AUTO_TUTOR_DEFAULT_UTTERANCE_TEMPERATURE);
  });

  it('accepts authored temperatures in the OpenRouter range', function() {
    expect(parseAutoTutorTemperature(0, 'autotutorsession.utteranceTemperature', 0.45)).to.equal(0);
    expect(parseAutoTutorTemperature(1.25, 'autotutorsession.utteranceTemperature', 0.45)).to.equal(1.25);
    expect(parseAutoTutorTemperature(2, 'autotutorsession.utteranceTemperature', 0.45)).to.equal(2);
  });

  it('fails clearly for invalid authored temperatures', function() {
    for (const value of [-0.1, 2.1, Number.NaN, '0.4']) {
      expect(() => parseAutoTutorTemperature(
        value,
        'autotutorsession.utteranceTemperature',
        0.45,
      )).to.throw('AutoTutor runtime requires autotutorsession.utteranceTemperature to be between 0 and 2');
    }
  });
});
