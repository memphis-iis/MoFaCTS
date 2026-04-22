/**
 * Validator Registry - Configuration-driven validation rules for TDF and Stimulus editors
 *
 * Follows the same pattern as tooltipContent.js:
 * - Field paths use dot notation matching json-editor schema paths
 * - Array items use [] notation (e.g., 'unit[].unitname', '[].stims[].response')
 *
 * Each validator config has:
 * - validators: Array of validator definitions
 * - severity: 'error' (blocks save) or 'warning' (informational)
 * - breaking: true if changing this field resets student progress
 */

import {
  createDeliveryParamValidatorMap,
  createStimValidatorMap,
  createTdfValidatorMap,
} from '../../common/fieldRegistry';

// =============================================================================
// TDF VALIDATORS
// =============================================================================

export const TDF_VALIDATORS = {
  // ---------------------------------------------------------------------------
  // REQUIRED FIELDS (Critical - Error)
  // ---------------------------------------------------------------------------
  'setspec.lessonname': {
    validators: [
      { type: 'required', message: 'Lesson name is required' }
    ],
    severity: 'error'
  },

  'setspec.stimulusfile': {
    validators: [
      { type: 'required', message: 'Stimulus file is required' }
    ],
    severity: 'error'
  },

  // ---------------------------------------------------------------------------
  // FORMAT VALIDATION (Error)
  // ---------------------------------------------------------------------------
  'setspec.lfparameter': {
    validators: [
      { type: 'range', min: 0, max: 1, message: 'Must be between 0 and 1' }
    ],
    severity: 'error'
  },

  'setspec.audioInputSensitivity': {
    validators: [
      { type: 'range', min: 20, max: 80, message: 'Must be between 20 and 80 dB' }
    ],
    severity: 'warning'
  },

  'setspec.audioPromptQuestionSpeakingRate': {
    validators: [
      { type: 'range', min: 0.25, max: 4.0, message: 'Must be between 0.25 and 4.0' }
    ],
    severity: 'warning'
  },

  'setspec.audioPromptFeedbackSpeakingRate': {
    validators: [
      { type: 'range', min: 0.25, max: 4.0, message: 'Must be between 0.25 and 4.0' }
    ],
    severity: 'warning'
  },

  'setspec.audioPromptSpeakingRate': {
    validators: [
      { type: 'range', min: 0.25, max: 4.0, message: 'Must be between 0.25 and 4.0' }
    ],
    severity: 'warning'
  },

  // ---------------------------------------------------------------------------
  // CLUSTER/SHUFFLE SETTINGS (Breaking Changes)
  // ---------------------------------------------------------------------------
  'setspec.shuffleclusters': {
    validators: [
      { type: 'clusterRangeFormat', message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-3 4-7")' }
    ],
    severity: 'error',
    breaking: true
  },

  'setspec.swapclusters': {
    validators: [
      { type: 'clusterRangeFormat', message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-3 4-7")' }
    ],
    severity: 'error',
    breaking: true
  },

  // ---------------------------------------------------------------------------
  // UNIT-LEVEL VALIDATION
  // ---------------------------------------------------------------------------
  'unit[].learningsession.clusterlist': {
    validators: [
      { type: 'clusterlistFormat', message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-6 12-17")' },
      { type: 'clusterlistBounds', message: 'Cluster index out of bounds' }
    ],
    severity: 'error',
    breaking: true
  },

  'unit[].assessmentsession.clusterlist': {
    validators: [
      { type: 'clusterlistFormat', message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-6 12-17")' },
      { type: 'clusterlistBounds', message: 'Cluster index out of bounds' }
    ],
    severity: 'error',
    breaking: true
  },

  'unit[].deliveryparams.drill': {
    validators: [
      { type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }
    ],
    severity: 'error'
  },

  'unit[].deliveryparams.purestudy': {
    validators: [
      { type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }
    ],
    severity: 'error'
  },

  'unit[].deliveryparams.reviewstudy': {
    validators: [
      { type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }
    ],
    severity: 'error'
  },

  'unit[].deliveryparams.correctprompt': {
    validators: [
      { type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }
    ],
    severity: 'error'
  },

  'unit[].deliveryparams.practiceseconds': {
    validators: [
      { type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }
    ],
    severity: 'error'
  },

  'unit[].deliveryparams.optimalThreshold': {
    validators: [
      { type: 'range', min: 0, max: 1, message: 'Must be between 0 and 1' }
    ],
    severity: 'error'
  },

  'unit[].instructionminseconds': {
    validators: [
      { type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }
    ],
    severity: 'error'
  },

  'unit[].instructionmaxseconds': {
    validators: [
      { type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }
    ],
    severity: 'error'
  },

  // ---------------------------------------------------------------------------
  // VIDEO SESSION VALIDATION
  // ---------------------------------------------------------------------------
  'unit[].videosession.videosource': {
    validators: [
      { type: 'url', message: 'Must be a valid URL' }
    ],
    severity: 'warning'
  },

  ...createTdfValidatorMap(),
  ...createDeliveryParamValidatorMap()
};

// =============================================================================
// STIMULUS VALIDATORS
// =============================================================================

export const STIM_VALIDATORS = {
  // ---------------------------------------------------------------------------
  // REQUIRED FIELDS
  // ---------------------------------------------------------------------------
  '[].stims': {
    validators: [
      { type: 'nonEmptyArray', message: 'Each cluster must have at least one stimulus' }
    ],
    severity: 'error'
  },

  // ---------------------------------------------------------------------------
  // DISPLAY VALIDATION
  // ---------------------------------------------------------------------------
  '[].stims[].display': {
    validators: [
      {
        type: 'atLeastOneOf',
        fields: ['text', 'clozeText', 'clozeStimulus', 'imgSrc', 'audioSrc', 'videoSrc'],
        message: 'At least one display element required (text, cloze, image, audio, or video)'
      }
    ],
    severity: 'error'
  },

  // ---------------------------------------------------------------------------
  // MEDIA FILE VALIDATION
  // ---------------------------------------------------------------------------
  '[].stims[].display.imgSrc': {
    validators: [
      { type: 'mediaExists', mediaType: 'image', message: 'Image file not found' }
    ],
    severity: 'warning'
  },

  '[].stims[].display.audioSrc': {
    validators: [
      { type: 'mediaExists', mediaType: 'audio', message: 'Audio file not found' }
    ],
    severity: 'warning'
  },

  '[].stims[].display.videoSrc': {
    validators: [
      { type: 'urlOrMediaExists', mediaType: 'video', message: 'Video file not found and not a valid URL' }
    ],
    severity: 'warning'
  },

  // Cluster-level media
  '[].imageStimulus': {
    validators: [
      { type: 'mediaExists', mediaType: 'image', message: 'Cluster image file not found' }
    ],
    severity: 'warning'
  },

  '[].audioStimulus': {
    validators: [
      { type: 'mediaExists', mediaType: 'audio', message: 'Cluster audio file not found' }
    ],
    severity: 'warning'
  },

  '[].videoStimulus': {
    validators: [
      { type: 'urlOrMediaExists', mediaType: 'video', message: 'Cluster video not found and not a valid URL' }
    ],
    severity: 'warning'
  },

  // ---------------------------------------------------------------------------
  // FORMAT VALIDATION
  // ---------------------------------------------------------------------------
  '[].stims[].parameter': {
    validators: [
      { type: 'parameterFormat', message: 'Parameter should be "number,number" format (e.g., "0,.7")' }
    ],
    severity: 'warning'
  },

  '[].stims[].optimalProb': {
    validators: [
      { type: 'numeric', message: 'optimalProb must be a number' }
    ],
    severity: 'error'
  },

  // ---------------------------------------------------------------------------
  // WARNINGS
  // ---------------------------------------------------------------------------
  '[].stims[].response.correctResponse': {
    validators: [
      { type: 'required', message: 'Correct response is required' },
      { type: 'invisibleUnicode', message: 'Contains invisible characters (U+0080-U+00FF) that will be stripped' }
    ],
    severity: 'error'
  },

  '[].stims[].response.incorrectResponses': {
    validators: [
      { type: 'invisibleUnicodeArray', message: 'Contains invisible characters (U+0080-U+00FF) that will be stripped' },
      { type: 'mcRequiresIncorrect', message: 'Multiple choice questions should have incorrect responses defined' }
    ],
    severity: 'warning'
  },

  ...createStimValidatorMap()

  // NOTE: responseType validator removed - image detection is now automatic via isImagePath()
};

// =============================================================================
// VALIDATOR TYPE IMPLEMENTATIONS
// =============================================================================

/**
 * Built-in validator implementations
 * Each returns { valid: boolean, message?: string }
 */
export const VALIDATOR_TYPES = {
  /**
   * Check if value is non-empty
   */
  required: (value: any) => {
    const valid = value !== null && value !== undefined && value !== '';
    return { valid };
  },

  /**
   * Check if value is a non-negative integer
   */
  nonNegativeInteger: (value: any) => {
    if (value === '' || value === null || value === undefined) {
      return { valid: true }; // Optional field
    }
    const num = Number(value);
    return {
      valid: Number.isInteger(num) && num >= 0
    };
  },

  /**
   * Check if value is within a numeric range
   */
  range: (value: any, config: any) => {
    if (value === '' || value === null || value === undefined) {
      return { valid: true }; // Optional field
    }
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, message: 'Must be a number' };
    }
    return {
      valid: num >= config.min && num <= config.max
    };
  },

  /**
   * Check if value is a valid URL
   */
  url: (value: any) => {
    if (!value) return { valid: true }; // Optional field
    try {
      new URL(value);
      return { valid: true };
    } catch {
      // Also allow relative URLs starting with /
      if (value.startsWith('/')) {
        return { valid: true };
      }
      return { valid: false };
    }
  },

  /**
   * Check if array is non-empty
   */
  nonEmptyArray: (value: any) => {
    return {
      valid: Array.isArray(value) && value.length > 0
    };
  },

  /**
   * Check if object has at least one of the specified fields with a value
   */
  atLeastOneOf: (value: any, config: any) => {
    if (!value || typeof value !== 'object') {
      return { valid: false };
    }
    const hasOne = config.fields.some((field: any) => {
      const val = value[field];
      return val !== null && val !== undefined && val !== '';
    });
    return { valid: hasOne };
  },

  /**
   * Validate clusterlist format: "0-6 12-17" or "0-6"
   */
  clusterlistFormat: (value: any) => {
    if (!value) return { valid: true }; // Optional field

    // Allow single numbers, ranges, or space-separated combinations
    // Examples: "0-6", "0-6 12-17", "1 2 3", "0-3 4-6 7-9"
    const pattern = /^(\d+(-\d+)?(\s+\d+(-\d+)?)*)?$/;
    return {
      valid: pattern.test(value.trim())
    };
  },

  /**
   * Validate cluster indices are within bounds
   */
  clusterlistBounds: (value: any, config: any, context: any) => {
    if (!value) return { valid: true };

    const clusterCount = context.getClusterCount();
    if (clusterCount === 0) {
      return { valid: true }; // Can't validate without cluster data
    }

    // Parse all indices from the clusterlist
    const indices = [];
    const parts = value.trim().split(/\s+/);
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (isNaN(start) || isNaN(end)) continue;
        indices.push(start, end);
      } else {
        const num = Number(part);
        if (!isNaN(num)) indices.push(num);
      }
    }

    // Check all indices are within bounds
    for (const idx of indices) {
      if (idx < 0 || idx >= clusterCount) {
        return {
          valid: false,
          message: `Cluster index ${idx} out of bounds (0-${clusterCount - 1})`
        };
      }
    }

    return { valid: true };
  },

  /**
   * Validate cluster range format for shuffleclusters/swapclusters
   */
  clusterRangeFormat: (value: any) => {
    if (!value) return { valid: true }; // Optional field

    // Format: "0-3 4-7" or "0-3"
    const pattern = /^(\d+-\d+)(\s+\d+-\d+)*$/;
    return {
      valid: pattern.test(value.trim())
    };
  },

  /**
   * Check if value is one of allowed enum values
   */
  enum: (value: any, config: any) => {
    if (!value) return { valid: true }; // Optional field
    return {
      valid: config.values.includes(value)
    };
  },

  /**
   * Validate parameter format: "number,number" like "0,.7"
   */
  parameterFormat: (value: any) => {
    if (!value) return { valid: true }; // Optional field

    // Allow formats like "0,.7", "0.5,0.7", ".5,.7"
    const pattern = /^-?\d*\.?\d*,-?\d*\.?\d*$/;
    return {
      valid: pattern.test(value.trim())
    };
  },

  /**
   * Check if media file exists in DynamicAssets
   */
  mediaExists: (value: any, config: any, context: any) => {
    if (!value) return { valid: true }; // Optional field

    // External URLs are assumed valid
    if (/^(https?:|data:|blob:|\/\/)/i.test(String(value).trim())) {
      return { valid: true };
    }

    const exists = context.mediaAssetExists(value);
    return { valid: exists };
  },

  /**
   * Check if value is either a URL or an existing media file
   */
  urlOrMediaExists: (value: any, config: any, context: any) => {
    if (!value) return { valid: true }; // Optional field

    // External URLs are valid
    if (/^(https?:|data:|blob:|\/\/)/i.test(String(value).trim())) {
      return { valid: true };
    }

    // Check if it's a local media file
    const exists = context.mediaAssetExists(value);
    return { valid: exists };
  },

  /**
   * Conditional warning: warn if condition is met but this field is empty
   */
  conditionalWarning: (value: any, config: any, context: any) => {
    const conditionValue = context.get(config.conditionPath);
    if (conditionValue !== config.conditionValue) {
      return { valid: true }; // Condition not met, no warning
    }
    // Condition is met, warn if this field is empty
    if (!value) {
      return { valid: false };
    }
    return { valid: true };
  },

  /**
   * Check if value is numeric (number or numeric string)
   */
  numeric: (value: any) => {
    if (value === '' || value === null || value === undefined) {
      return { valid: true }; // Optional field
    }
    const num = Number(value);
    return {
      valid: !isNaN(num) && isFinite(num)
    };
  },

  /**
   * Check for invisible unicode characters (U+0080-U+00FF) that get stripped
   * These can cause answer matching issues
   */
  invisibleUnicode: (value: any) => {
    if (!value || typeof value !== 'string') {
      return { valid: true };
    }
    // Match characters in the U+0080 to U+00FF range (Latin-1 Supplement)
    // These are often invisible or cause issues in text processing
    const invisiblePattern = /[\u0080-\u00FF]/;
    return {
      valid: !invisiblePattern.test(value)
    };
  },

  /**
   * Check for invisible unicode in an array of strings or a single string
   */
  invisibleUnicodeArray: (value: any) => {
    if (!value) {
      return { valid: true };
    }

    const invisiblePattern = /[\u0080-\u00FF]/;

    // Handle single string
    if (typeof value === 'string') {
      return { valid: !invisiblePattern.test(value) };
    }

    // Handle array of strings
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && invisiblePattern.test(item)) {
          return { valid: false };
        }
      }
    }

    return { valid: true };
  },

  /**
   * Check if MC questions have incorrectResponses
   * This is a heuristic based on display text containing "?"
   */
  mcRequiresIncorrect: (value: any, _config: any, _context: any) => {
    // If incorrectResponses is provided, it's valid
    if (value && (Array.isArray(value) ? value.length > 0 : value !== '')) {
      return { valid: true };
    }

    // Check if this looks like a question (has display text with ?)
    // This is checked at the response level, so we need to look at sibling display
    // For now, we'll just return valid since we can't easily access siblings
    // The Python validator does this check, but it's complex in JS
    return { valid: true };
  }
};

