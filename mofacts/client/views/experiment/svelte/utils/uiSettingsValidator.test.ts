
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

    it('should preserve valid kept fields', function() {
      const input = {
        stimuliPosition: 'left',
        displayFeedback: false,
        correctMessage: 'Great!',
        timeoutThreshold: 5,
      };

      const result = sanitizeUiSettingsAny(input);

      expect(result.stimuliPosition).to.equal('left');
      expect(result.displayFeedback).to.equal(false);
      expect(result.correctMessage).to.equal('Great!');
      expect(result.timeoutThreshold).to.equal(5);
    });

    it('should ignore deprecated fields', function() {
      const input = {
        stimuliPosition: 'left',
        showStimuliBox: true, // deprecated
        displayPerformanceDuringTrial: true, // deprecated
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
        timeoutThreshold: -5, // Invalid number (< 0)
        choiceButtonCols: 10, // Invalid number (> 4)
        fadeInDuration: 10000, // Invalid number (> 5000)
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal(DEFAULTS.stimuliPosition);
      expect(result.timeoutThreshold).to.equal(DEFAULTS.timeoutThreshold);
      expect(result.choiceButtonCols).to.equal(DEFAULTS.choiceButtonCols);
      expect(result.fadeInDuration).to.equal(DEFAULTS.fadeInDuration);
    });

    it('should coerce string booleans to actual booleans', function() {
      const input = {
        displayFeedback: 'true',
        displayTimeoutBar: 'false',
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.displayFeedback).to.equal(true);
      expect(result.displayTimeoutBar).to.equal(false);
      expect(typeof result.displayFeedback).to.equal('boolean');
      expect(typeof result.displayTimeoutBar).to.equal('boolean');
    });

    it('should coerce string numbers to actual numbers', function() {
      const input = {
        timeoutThreshold: '5',
        choiceButtonCols: '3',
        fadeInDuration: '500',
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.timeoutThreshold).to.equal(5);
      expect(result.choiceButtonCols).to.equal(3);
      expect(result.fadeInDuration).to.equal(500);
      expect(typeof result.timeoutThreshold).to.equal('number');
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
        incorrectColor: 'red', // Invalid (not hex)
      };

      const result2 = sanitizeUiSettingsAny(input2, { silent: true });
      expect(result2.correctColor).to.equal('#0f0');
      expect(result2.incorrectColor).to.equal(DEFAULTS.incorrectColor);
    });

    it('should handle all 25 kept fields', function() {
      const input = {
        // Layout & Display (5)
        stimuliPosition: 'left',
        isVideoSession: true,
        videoUrl: 'https://example.com/video.mp4',
        fadeInDuration: 500,
        fadeOutDuration: 300,

        // Feedback Settings (10)
        displayFeedback: false,
        displayCorrectFeedback: true,
        displayIncorrectFeedback: true,
        correctMessage: 'Excellent!',
        incorrectMessage: 'Try again',
        correctColor: '#00ff00',
        incorrectColor: '#ff0000',
        displayUserAnswerInFeedback: 'onCorrect',
        singleLineFeedback: true,
        onlyShowSimpleFeedback: 'onIncorrect',

        // Performance & Timeouts
        displayTimeoutBar: true,
        timeoutThreshold: 5,

        // Multiple Choice Settings (2)
        displayMultipleChoiceButtons: true,
        choiceButtonCols: 3,

        // Text Input Settings (3)
        displayTextInput: true,
        displaySubmitButton: false,
        inputPlaceholderText: 'Enter answer',

        // Audio & SR Settings (2)
        enableAudio: false,
        enableSpeechRecognition: true,

        // Miscellaneous (1)
        caseSensitive: true,
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.stimuliPosition).to.equal('left');
      expect(result.isVideoSession).to.equal(true);
      expect(result.videoUrl).to.equal('https://example.com/video.mp4');
      expect(result.fadeInDuration).to.equal(500);
      expect(result.fadeOutDuration).to.equal(300);

      expect(result.displayFeedback).to.equal(false);
      expect(result.displayCorrectFeedback).to.equal(true);
      expect(result.displayIncorrectFeedback).to.equal(true);
      expect(result.correctMessage).to.equal('Excellent!');
      expect(result.incorrectMessage).to.equal('Try again');
      expect(result.correctColor).to.equal('#00ff00');
      expect(result.incorrectColor).to.equal('#ff0000');
      expect(result.displayUserAnswerInFeedback).to.equal('onCorrect');
      expect(result.singleLineFeedback).to.equal(true);
      expect(result.onlyShowSimpleFeedback).to.equal('onIncorrect');

      expect(result.displayTimeoutBar).to.equal(true);
      expect(result.timeoutThreshold).to.equal(5);

      expect(result.displayMultipleChoiceButtons).to.equal(true);
      expect(result.choiceButtonCols).to.equal(3);

      expect(result.displayTextInput).to.equal(true);
      expect(result.displaySubmitButton).to.equal(false);
      expect(result.inputPlaceholderText).to.equal('Enter answer');

      expect(result.enableAudio).to.equal(false);
      expect(result.enableSpeechRecognition).to.equal(true);

      expect(result.caseSensitive).to.equal(true);
    });
  });

  describe('getDeprecatedFields()', function() {
    it('should return empty array for clean settings', function() {
      const input = {
        stimuliPosition: 'left',
        displayFeedback: true,
      };

      const result = getDeprecatedFields(input);
      expect(result).to.be.an('array').that.is.empty;
    });

    it('should detect deprecated fields', function() {
      const input = {
        stimuliPosition: 'left',
        showStimuliBox: true, // deprecated
        displayPerformanceDuringTrial: true, // deprecated
        suppressFeedbackDisplay: false, // deprecated
      };

      const result = getDeprecatedFields(input);
      expect(result).to.have.lengthOf(3);
      expect(result).to.include('showStimuliBox');
      expect(result).to.include('displayPerformanceDuringTrial');
      expect(result).to.include('suppressFeedbackDisplay');
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
        displayFeedback: true,
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

    it('should not include deprecated fields as unknown', function() {
      const input = {
        showStimuliBox: true, // deprecated, not unknown
        unknownField: 'value', // unknown
      };

      const result = getUnknownFields(input);
      expect(result).to.have.lengthOf(1);
      expect(result).to.include('unknownField');
      expect(result).to.not.include('showStimuliBox');
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
        showStimuliBox: true, // deprecated
        displayPerformanceDuringTrial: true, // deprecated
        unknownField: 'value', // unknown
      };

      const report = getDeprecationReport(input, 'tdf123', 'My TDF');

      expect(report).to.have.property('tdfId', 'tdf123');
      expect(report).to.have.property('tdfName', 'My TDF');
      expect(report).to.have.property('timestamp');
      expect(report).to.have.property('deprecatedFields').that.is.an('array');
      expect(report).to.have.property('unknownFields').that.is.an('array');
      expect(report).to.have.property('deprecatedCount', 2);
      expect(report).to.have.property('unknownCount', 1);
      expect(report).to.have.property('needsMigration', true);
    });

    it('should indicate no migration needed for clean settings', function() {
      const input = {
        stimuliPosition: 'left',
        displayFeedback: true,
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
        timeoutThreshold: '0', // Invalid (must be > 0)
        choiceButtonCols: '1', // Valid (1-4)
      };

      const result = sanitizeUiSettingsAny(input, { silent: true });

      expect(result.timeoutThreshold).to.equal(DEFAULTS.timeoutThreshold); // Invalid, use default
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






