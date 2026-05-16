
/**
 * @fileoverview Unit tests for DeliverySettings validator (Phase 4)
 * Tests sanitization, validation, deprecation warnings, and telemetry
 */

import { expect } from 'chai';
import {
  sanitizeDeliverySettings,
  getDeprecatedFields,
  getUnknownFields,
  getDeprecationReport,
  resetWarningState,
} from './deliverySettingsValidator';
import { DEFAULT_DELIVERY_SETTINGS } from '../views/experiment/svelte/machine/constants';
const sanitizeDeliverySettingsAny = (
  input?: unknown,
  options?: { silent?: boolean }
): Record<string, unknown> => sanitizeDeliverySettings(input as Record<string, unknown>, options);
const DEFAULTS: Record<string, unknown> = DEFAULT_DELIVERY_SETTINGS as Record<string, unknown>;


describe('DeliverySettings Validator (Phase 4)', function() {
  beforeEach(function() {
    // Reset warning state before each test
    resetWarningState();
  });

  describe('sanitizeDeliverySettingsAny()', function() {
    it('should return defaults when given empty object', function() {
      const result = sanitizeDeliverySettingsAny({});
      expect(result).to.deep.equal(DEFAULTS);
      expect(result.displayCorrectAnswerInIncorrectFeedback).to.equal(true);
    });

    it('should return defaults when given null/undefined', function() {
      const result1 = sanitizeDeliverySettingsAny(null);
      const result2 = sanitizeDeliverySettingsAny(undefined);
      const result3 = sanitizeDeliverySettingsAny();

      expect(result1).to.deep.equal(DEFAULTS);
      expect(result2).to.deep.equal(DEFAULTS);
      expect(result3).to.deep.equal(DEFAULTS);
    });

    it('should preserve valid registry fields', function() {
      const input = {
        stimuliPosition: 'left',
        correctLabelText: 'Great!',
        choiceButtonCols: 3,
      };

      const result = sanitizeDeliverySettingsAny(input);

      expect(result.stimuliPosition).to.equal('left');
      expect(result.correctLabelText).to.equal('Great!');
      expect(result.choiceButtonCols).to.equal(3);
    });

    it('should ignore removed feedback fields instead of aliasing them', function() {
      const input = {
        stimuliPosition: 'left',
        showStimuliBox: true,
        displayPerformanceDuringTrial: true,
        correctMessage: 'Great!',
        incorrectMessage: 'Try again',
        singleLineFeedback: true,
        onlyShowSimpleFeedback: true,
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal('left');
      expect(result.correctMessage).to.be.undefined;
      expect(result.incorrectMessage).to.be.undefined;
      expect(result.singleLineFeedback).to.be.undefined;
      expect(result.onlyShowSimpleFeedback).to.be.undefined;
      expect(result.correctLabelText).to.equal(DEFAULTS.correctLabelText);
      expect(result.incorrectLabelText).to.equal(DEFAULTS.incorrectLabelText);
      expect(result.feedbackLayout).to.equal(DEFAULTS.feedbackLayout);
      expect(result.showStimuliBox).to.be.undefined;
      expect(result.displayPerformanceDuringTrial).to.be.undefined;
    });

    it('should ignore unknown fields', function() {
      const input = {
        stimuliPosition: 'left',
        unknownField123: 'value',
        anotherUnknown: 42,
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal('left');
      expect(result.unknownField123).to.be.undefined;
      expect(result.anotherUnknown).to.be.undefined;
    });

    it('should use defaults for invalid values', function() {
      const input = {
        stimuliPosition: 'invalid', // Invalid enum
        choiceButtonCols: 10, // Invalid number (> 4)
        correctLabelText: '', // Invalid string (empty)
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal(DEFAULTS.stimuliPosition);
      expect(result.choiceButtonCols).to.equal(DEFAULTS.choiceButtonCols);
      expect(result.correctLabelText).to.equal(DEFAULTS.correctLabelText);
    });

    it('should coerce string booleans to actual booleans', function() {
      const input = {
        displayCorrectFeedback: 'true',
        displayTimeoutBar: 'false',
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.displayCorrectFeedback).to.equal(true);
      expect(result.displayTimeoutBar).to.equal(false);
      expect(typeof result.displayCorrectFeedback).to.equal('boolean');
      expect(typeof result.displayTimeoutBar).to.equal('boolean');
    });

    it('should coerce string numbers to actual numbers', function() {
      const input = {
        choiceButtonCols: '3',
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.choiceButtonCols).to.equal(3);
      expect(typeof result.choiceButtonCols).to.equal('number');
    });

    it('should validate color hex codes', function() {
      const input1 = {
        correctColor: '#28a745', // Valid 6-char hex
        incorrectColor: '#dc3545', // Valid 6-char hex
      };

      const result1 = sanitizeDeliverySettingsAny(input1, { silent: true });
      expect(result1.correctColor).to.equal('#28a745');
      expect(result1.incorrectColor).to.equal('#dc3545');

      const input2 = {
        correctColor: '#0f0', // Valid 3-char hex
        incorrectColor: 'not a color',
      };

      const result2 = sanitizeDeliverySettingsAny(input2, { silent: true });
      expect(result2.correctColor).to.equal('#0f0');
      expect(result2.incorrectColor).to.equal(DEFAULTS.incorrectColor);
    });

    it('should handle the current registry-backed delivery settings', function() {
      const input = {
        stimuliPosition: 'left',
        isVideoSession: true,
        videoUrl: 'https://example.com/video.mp4',
        displayCorrectFeedback: true,
        displayIncorrectFeedback: true,
        correctLabelText: 'Excellent!',
        incorrectLabelText: 'Try again',
        correctColor: '#00ff00',
        incorrectColor: '#ff0000',
        displayUserAnswerInFeedback: 'onCorrect',
        feedbackLayout: 'inline',
        displayCorrectAnswerInIncorrectFeedback: true,
        displayPerformance: true,
        displayTimeoutBar: true,
        displayTimeoutCountdown: true,
        choiceButtonCols: 3,
        inputPlaceholderText: 'Enter answer',
        continueButtonText: 'Next',
        skipStudyButtonText: 'Skip it',
        caseSensitive: true,
        displayQuestionNumber: true,
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal('left');
      expect(result.isVideoSession).to.equal(true);
      expect(result.videoUrl).to.equal('https://example.com/video.mp4');
      expect(result.displayCorrectFeedback).to.equal(true);
      expect(result.displayIncorrectFeedback).to.equal(true);
      expect(result.correctLabelText).to.equal('Excellent!');
      expect(result.incorrectLabelText).to.equal('Try again');
      expect(result.correctColor).to.equal('#00ff00');
      expect(result.incorrectColor).to.equal('#ff0000');
      expect(result.displayUserAnswerInFeedback).to.equal('onCorrect');
      expect(result.feedbackLayout).to.equal('inline');
      expect(result.displayCorrectAnswerInIncorrectFeedback).to.equal(true);
      expect(result.displayPerformance).to.equal(true);
      expect(result.displayTimeoutBar).to.equal(true);
      expect(result.displayTimeoutCountdown).to.equal(true);
      expect(result.choiceButtonCols).to.equal(3);
      expect(result.inputPlaceholderText).to.equal('Enter answer');
      expect(result.continueButtonText).to.equal('Next');
      expect(result.skipStudyButtonText).to.equal('Skip it');
      expect(result.caseSensitive).to.equal(true);
      expect(result.displayQuestionNumber).to.equal(true);
    });
  });

  describe('getDeprecatedFields()', function() {
    it('should return empty array for clean settings', function() {
      const input = {
        stimuliPosition: 'left',
        displayCorrectFeedback: true,
      };

      const result = getDeprecatedFields(input);
      expect(result).to.be.an('array').that.is.empty;
    });

    it('should not classify removed fields as deprecated when no guidance is registered', function() {
      const input = {
        stimuliPosition: 'left',
        displaySubmitButton: true,
        displayConfirmButton: true,
        showStimuliBox: true,
        displayPerformanceDuringTrial: true,
        suppressFeedbackDisplay: false,
      };

      const result = getDeprecatedFields(input);
      expect(result).to.be.empty;
    });

    it('should handle empty/null input', function() {
      expect(getDeprecatedFields({})).to.be.empty;
      expect(getDeprecatedFields(null as unknown as Record<string, unknown>)).to.be.empty;
      expect(getDeprecatedFields(undefined)).to.be.empty;
    });
  });

  describe('getUnknownFields()', function() {
    it('should return empty array for clean settings', function() {
      const input = {
        stimuliPosition: 'left',
        displayCorrectFeedback: true,
      };

      const result = getUnknownFields(input);
      expect(result).to.be.an('array').that.is.empty;
    });

    it('should detect unknown fields', function() {
      const input = {
        stimuliPosition: 'left',
        unknownField1: 'value',
        anotherUnknown: 42,
      };

      const result = getUnknownFields(input);
      expect(result).to.have.lengthOf(2);
      expect(result).to.include('unknownField1');
      expect(result).to.include('anotherUnknown');
    });

    it('should include removed fields as unknown when no deprecation guidance is registered', function() {
      const input = {
        showStimuliBox: true,
        unknownField: 'value',
      };

      const result = getUnknownFields(input);
      expect(result).to.have.lengthOf(2);
      expect(result).to.include('unknownField');
      expect(result).to.include('showStimuliBox');
    });

    it('should handle empty/null input', function() {
      expect(getUnknownFields({})).to.be.empty;
      expect(getUnknownFields(null as unknown as Record<string, unknown>)).to.be.empty;
      expect(getUnknownFields(undefined)).to.be.empty;
    });
  });

  describe('getDeprecationReport()', function() {
    it('should generate complete report', function() {
      const input = {
        stimuliPosition: 'left',
        showStimuliBox: true,
        displayPerformanceDuringTrial: true,
        unknownField: 'value',
      };

      const report = getDeprecationReport(input, 'tdf123', 'My TDF');

      expect(report).to.have.property('tdfId', 'tdf123');
      expect(report).to.have.property('tdfName', 'My TDF');
      expect(report).to.have.property('timestamp');
      expect(report).to.have.property('deprecatedFields').that.is.an('array');
      expect(report).to.have.property('unknownFields').that.is.an('array');
      expect(report).to.have.property('deprecatedCount', 0);
      expect(report).to.have.property('unknownCount', 3);
      expect(report).to.have.property('needsMigration', true);
    });

    it('should indicate no migration needed for clean settings', function() {
      const input = {
        stimuliPosition: 'left',
        displayCorrectFeedback: true,
      };

      const report = getDeprecationReport(input, 'tdf456', 'Clean TDF');

      expect(report.deprecatedCount).to.equal(0);
      expect(report.unknownCount).to.equal(0);
      expect(report.needsMigration).to.equal(false);
    });
  });

  describe('Edge Cases', function() {
    it('should handle string "0" and "1" as numbers', function() {
      const input = {
        choiceButtonCols: '0',
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.choiceButtonCols).to.equal(DEFAULTS.choiceButtonCols);
    });

    it('should handle valid string number boundaries', function() {
      const input = {
        choiceButtonCols: '1', // Valid (1-4)
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.choiceButtonCols).to.equal(1); // Valid
    });

    it('should handle mixed case field names (should not match)', function() {
      const input = {
        StimuliPosition: 'left', // Wrong case
        stimuliPosition: 'left', // Correct case
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal('left');
      expect(result.StimuliPosition).to.be.undefined;
    });

    it('should handle very long string values', function() {
      const input = {
        correctLabelText: 'A'.repeat(200), // > 100 chars (invalid)
        incorrectLabelText: 'B'.repeat(50), // Valid
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.correctLabelText).to.equal(DEFAULTS.correctLabelText); // Invalid, use default
      expect(result.incorrectLabelText).to.equal('B'.repeat(50)); // Valid
    });

    it('should handle empty string values', function() {
      const input = {
        correctLabelText: '', // Invalid (must be > 0 length)
        videoUrl: '', // Valid (optional)
      };

      const result = sanitizeDeliverySettingsAny(input, { silent: true });

      expect(result.correctLabelText).to.equal(DEFAULTS.correctLabelText); // Invalid, use default
      expect(result.videoUrl).to.equal(''); // Valid
    });
  });
});






