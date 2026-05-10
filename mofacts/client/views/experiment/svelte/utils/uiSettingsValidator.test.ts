
/**
 * @fileoverview Unit tests for UISettings validator (Phase 4)
 * Tests sanitization, validation, deprecation warnings, and telemetry
 */

import { expect } from 'chai';
import {
  sanitizeUiSettings,
  getDeprecatedFields,
  getUnknownFields,
  getDeprecationReport,
  resetWarningState,
} from './uiSettingsValidator';
import { DEFAULT_UI_SETTINGS } from '../machine/constants';
const sanitizeUiSettingsAny = (
  input?: unknown,
  options?: { silent?: boolean }
): Record<string, unknown> => sanitizeUiSettings(input as Record<string, unknown>, options);
const DEFAULTS: Record<string, unknown> = DEFAULT_UI_SETTINGS as Record<string, unknown>;


describe('UISettings Validator (Phase 4)', function() {
  beforeEach(function() {
    // Reset warning state before each test
    resetWarningState();
  });

  describe('sanitizeUiSettingsAny()', function() {
    it('should return defaults when given empty object', function() {
      const result = sanitizeUiSettingsAny({});
      expect(result).to.deep.equal(DEFAULTS);
    });

    it('should return defaults when given null/undefined', function() {
      const result1 = sanitizeUiSettingsAny(null);
      const result2 = sanitizeUiSettingsAny(undefined);
      const result3 = sanitizeUiSettingsAny();

      expect(result1).to.deep.equal(DEFAULTS);
      expect(result2).to.deep.equal(DEFAULTS);
      expect(result3).to.deep.equal(DEFAULTS);
    });

    it('should preserve valid registry fields', function() {
      const input = {
        stimuliPosition: 'left',
        correctMessage: 'Great!',
        choiceButtonCols: 3,
      };

      const result = sanitizeUiSettingsAny(input);

      expect(result.stimuliPosition).to.equal('left');
      expect(result.correctMessage).to.equal('Great!');
      expect(result.choiceButtonCols).to.equal(3);
    });

    it('should ignore fields that were removed from the registry', function() {
      const input = {
        stimuliPosition: 'left',
        showStimuliBox: true,
        displayPerformanceDuringTrial: true,
        correctMessage: 'Great!',
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal('left');
      expect(result.correctMessage).to.equal('Great!');
      expect(result.showStimuliBox).to.be.undefined;
      expect(result.displayPerformanceDuringTrial).to.be.undefined;
    });

    it('should ignore unknown fields', function() {
      const input = {
        stimuliPosition: 'left',
        unknownField123: 'value',
        anotherUnknown: 42,
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal('left');
      expect(result.unknownField123).to.be.undefined;
      expect(result.anotherUnknown).to.be.undefined;
    });

    it('should use defaults for invalid values', function() {
      const input = {
        stimuliPosition: 'invalid', // Invalid enum
        choiceButtonCols: 10, // Invalid number (> 4)
        correctMessage: '', // Invalid string (empty)
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal(DEFAULTS.stimuliPosition);
      expect(result.choiceButtonCols).to.equal(DEFAULTS.choiceButtonCols);
      expect(result.correctMessage).to.equal(DEFAULTS.correctMessage);
    });

    it('should coerce string booleans to actual booleans', function() {
      const input = {
        displayCorrectFeedback: 'true',
        displayTimeoutBar: 'false',
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.displayCorrectFeedback).to.equal(true);
      expect(result.displayTimeoutBar).to.equal(false);
      expect(typeof result.displayCorrectFeedback).to.equal('boolean');
      expect(typeof result.displayTimeoutBar).to.equal('boolean');
    });

    it('should coerce string numbers to actual numbers', function() {
      const input = {
        choiceButtonCols: '3',
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.choiceButtonCols).to.equal(3);
      expect(typeof result.choiceButtonCols).to.equal('number');
    });

    it('should validate color hex codes', function() {
      const input1 = {
        correctColor: '#28a745', // Valid 6-char hex
        incorrectColor: '#dc3545', // Valid 6-char hex
      };

      const result1 = sanitizeUiSettingsAny(input1, { silent: true });
      expect(result1.correctColor).to.equal('#28a745');
      expect(result1.incorrectColor).to.equal('#dc3545');

      const input2 = {
        correctColor: '#0f0', // Valid 3-char hex
        incorrectColor: 'not a color',
      };

      const result2 = sanitizeUiSettingsAny(input2, { silent: true });
      expect(result2.correctColor).to.equal('#0f0');
      expect(result2.incorrectColor).to.equal(DEFAULTS.incorrectColor);
    });

    it('should handle the current registry-backed UI settings', function() {
      const input = {
        stimuliPosition: 'left',
        isVideoSession: true,
        videoUrl: 'https://example.com/video.mp4',
        displayCorrectFeedback: true,
        displayIncorrectFeedback: true,
        correctMessage: 'Excellent!',
        incorrectMessage: 'Try again',
        correctColor: '#00ff00',
        incorrectColor: '#ff0000',
        displayUserAnswerInFeedback: 'onCorrect',
        singleLineFeedback: true,
        onlyShowSimpleFeedback: 'onIncorrect',
        displayCorrectAnswerInIncorrectFeedback: true,
        displayPerformance: true,
        displayTimeoutBar: true,
        choiceButtonCols: 3,
        displaySubmitButton: false,
        inputPlaceholderText: 'Enter answer',
        displayConfirmButton: true,
        continueButtonText: 'Next',
        skipStudyButtonText: 'Skip it',
        caseSensitive: true,
        displayQuestionNumber: true,
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal('left');
      expect(result.isVideoSession).to.equal(true);
      expect(result.videoUrl).to.equal('https://example.com/video.mp4');
      expect(result.displayCorrectFeedback).to.equal(true);
      expect(result.displayIncorrectFeedback).to.equal(true);
      expect(result.correctMessage).to.equal('Excellent!');
      expect(result.incorrectMessage).to.equal('Try again');
      expect(result.correctColor).to.equal('#00ff00');
      expect(result.incorrectColor).to.equal('#ff0000');
      expect(result.displayUserAnswerInFeedback).to.equal('onCorrect');
      expect(result.singleLineFeedback).to.equal(true);
      expect(result.onlyShowSimpleFeedback).to.equal('onIncorrect');
      expect(result.displayCorrectAnswerInIncorrectFeedback).to.equal(true);
      expect(result.displayPerformance).to.equal(true);
      expect(result.displayTimeoutBar).to.equal(true);
      expect(result.choiceButtonCols).to.equal(3);
      expect(result.displaySubmitButton).to.equal(false);
      expect(result.inputPlaceholderText).to.equal('Enter answer');
      expect(result.displayConfirmButton).to.equal(true);
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

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.choiceButtonCols).to.equal(DEFAULTS.choiceButtonCols);
    });

    it('should handle valid string number boundaries', function() {
      const input = {
        choiceButtonCols: '1', // Valid (1-4)
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.choiceButtonCols).to.equal(1); // Valid
    });

    it('should handle mixed case field names (should not match)', function() {
      const input = {
        StimuliPosition: 'left', // Wrong case
        stimuliPosition: 'left', // Correct case
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal('left');
      expect(result.StimuliPosition).to.be.undefined;
    });

    it('should handle very long string values', function() {
      const input = {
        correctMessage: 'A'.repeat(200), // > 100 chars (invalid)
        incorrectMessage: 'B'.repeat(50), // Valid
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.correctMessage).to.equal(DEFAULTS.correctMessage); // Invalid, use default
      expect(result.incorrectMessage).to.equal('B'.repeat(50)); // Valid
    });

    it('should handle empty string values', function() {
      const input = {
        correctMessage: '', // Invalid (must be > 0 length)
        videoUrl: '', // Valid (optional)
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.correctMessage).to.equal(DEFAULTS.correctMessage); // Invalid, use default
      expect(result.videoUrl).to.equal(''); // Valid
    });
  });
});






