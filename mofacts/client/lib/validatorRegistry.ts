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
  createDeliverySettingValidatorMap,
  createStimValidatorMap,
  createTdfValidatorMap,
} from '../../common/fieldRegistry';
import { validateH5PDisplayConfig } from '../../common/lib/h5pDisplay';

// =============================================================================
// TDF VALIDATORS
// =============================================================================

export const TDF_VALIDATORS = {
  ...createTdfValidatorMap(),
  ...createDeliverySettingValidatorMap()
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
        fields: ['text', 'clozeText', 'clozeStimulus', 'imgSrc', 'audioSrc', 'videoSrc', 'h5p'],
        message: 'At least one display element required (text, cloze, image, audio, video, or H5P)'
      }
    ],
    severity: 'error'
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
   * Validate the supported Phase 1 H5P display subset.
   */
  h5pDisplayConfig: (value: any) => {
    const baseUrl = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin + '/'
      : 'https://mofacts.local/';
    return validateH5PDisplayConfig(value, baseUrl);
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

