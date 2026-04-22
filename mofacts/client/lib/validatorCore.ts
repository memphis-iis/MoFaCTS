/**
 * Validator Core - Execution engine with debouncing and reactive result management
 *
 * Integrates with json-editor to provide real-time validation feedback.
 * Uses ReactiveVar for Meteor reactivity.
 */

import { ReactiveVar } from 'meteor/reactive-var';
import { clientConsole } from './clientLogger';
import { TDF_VALIDATORS, STIM_VALIDATORS, VALIDATOR_TYPES } from './validatorRegistry';

declare const Tdfs: any;
declare const DynamicAssets: any;

// =============================================================================
// VALIDATOR ENGINE
// =============================================================================

/**
 * ValidatorEngine - Runs validators against editor data with debouncing
 */
export class ValidatorEngine {
  type: string;
  validators: any;
  debounceMs: number;
  results: ReactiveVar<any[]>;
  debounceTimer: any;
  context: any;
  editor: any;
  /**
   * Create a validator engine
   * @param {object} options - Configuration options
   * @param {string} options.type - 'tdf' or 'stim'
   * @param {number} options.debounceMs - Debounce delay in milliseconds (default: 300)
   */
  constructor(options: any = {}) {
    this.type = options.type || 'tdf';
    this.validators = this.type === 'stim' ? STIM_VALIDATORS : TDF_VALIDATORS;
    this.debounceMs = options.debounceMs || 300;

    // Reactive results array
    this.results = new ReactiveVar([]);

    // Internal state
    this.debounceTimer = null;
    this.context = null;
    this.editor = null;
  }

  /**
   * Initialize the engine with a json-editor instance and validation context
   * @param {JSONEditor} editor - The json-editor instance
   * @param {ValidationContext} context - Context for cross-reference lookups
   */
  init(editor: any, context: any) {
    this.editor = editor;
    this.context = context;
  }

  /**
   * Run validation with debouncing (for real-time editing)
   * Results are updated reactively via this.results ReactiveVar
   */
  validate() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this._runValidation();
    }, this.debounceMs);
  }

  /**
   * Run validation immediately without debouncing (for save action)
   * @returns {Array} Array of validation results
   */
  validateNow() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this._runValidation();
    return this.results.get();
  }

  /**
   * Internal: Execute all validators
   */
  _runValidation() {
    if (!this.editor) {
      clientConsole(1, '[ValidatorEngine] No editor initialized');
      return;
    }

    const errors = [];
    const value = this.editor.getValue();

    for (const [path, config] of Object.entries(this.validators)) {
      try {
        const fieldErrors = this._validatePath(path, value, config);
        errors.push(...fieldErrors);
      } catch (err) {
        clientConsole(1, `[ValidatorEngine] Validator error for path ${path}:`, err);
      }
    }

    this.results.set(errors);
  }

  /**
   * Validate a single schema path against all its validators
   * @param {string} path - Schema path pattern (e.g., 'setspec.lessonname', 'unit[].name')
   * @param {object} rootValue - Root value from editor
   * @param {object} config - Validator configuration
   * @returns {Array} Array of validation errors
   */
  _validatePath(path: any, rootValue: any, config: any) {
    const errors: any[] = [];
    const values = this._getValuesForPath(path, rootValue);

    for (const { value, resolvedPath } of values) {
      for (const validatorConfig of config.validators) {
        const validatorFn = (VALIDATOR_TYPES as any)[validatorConfig.type];
        if (!validatorFn) {
          clientConsole(1, `[ValidatorEngine] Unknown validator type: ${validatorConfig.type}`);
          continue;
        }

        const result = validatorFn(value, validatorConfig, this.context);

        if (!result.valid) {
          errors.push({
            path: resolvedPath,
            schemaPath: path,
            message: result.message || validatorConfig.message,
            severity: config.severity || 'error',
            breaking: config.breaking || false,
            value
          });
        }
      }
    }

    return errors;
  }

  /**
   * Resolve a path pattern to actual values in the data
   * Handles array notation like 'unit[].unitname' or '[].stims[].response'
   *
   * @param {string} path - Path pattern with [] for arrays
   * @param {object} rootValue - Root value to traverse
   * @returns {Array} Array of { value, resolvedPath } objects
   */
  _getValuesForPath(path: any, rootValue: any) {
    const results: any[] = [];

    // Handle paths that start with [] (for stimulus clusters array)
    let normalizedPath = path;
    if (path.startsWith('[].')) {
      normalizedPath = 'root' + path;
    } else if (path.startsWith('[]')) {
      normalizedPath = 'root' + path;
    }

    const parts = this._parsePathParts(normalizedPath);

    const traverse = (obj: any, pathParts: any[], currentPath: any, depth = 0) => {
      if (depth > 100) {
        clientConsole(1, '[ValidatorEngine] Validator path traversal depth exceeded');
        return;
      }

      if (pathParts.length === 0) {
        results.push({ value: obj, resolvedPath: currentPath });
        return;
      }

      const [current, ...rest] = pathParts;

      if (current.isArray) {
        // Handle array traversal
        const key = current.key;
        const target = key ? obj?.[key] : obj;

        if (Array.isArray(target)) {
          target.forEach((item, index) => {
            const newPath = key
              ? `${currentPath}.${key}[${index}]`
              : `${currentPath}[${index}]`;
            traverse(item, rest, newPath, depth + 1);
          });
        }
      } else {
        // Handle object property access
        const newPath = currentPath ? `${currentPath}.${current.key}` : current.key;
        traverse(obj?.[current.key], rest, newPath, depth + 1);
      }
    };

    traverse(rootValue, parts, 'root');
    return results;
  }

  /**
   * Parse a path string into parts with array notation info
   * @param {string} path - Path string like 'root[].stims[].response.correctResponse'
   * @returns {Array} Array of { key, isArray } objects
   */
  _parsePathParts(path: any) {
    const parts: any[] = [];
    const segments = path.split('.');

    for (const segment of segments) {
      if (segment === 'root') continue;

      if (segment.endsWith('[]')) {
        // Property that is an array: 'unit[]' or 'stims[]'
        parts.push({ key: segment.slice(0, -2), isArray: true });
      } else if (segment === '[]') {
        // Root array: '[]'
        parts.push({ key: '', isArray: true });
      } else {
        // Regular property: 'lessonname'
        parts.push({ key: segment, isArray: false });
      }
    }

    return parts;
  }

  /**
   * Get all errors (severity === 'error')
   * @returns {Array} Array of error objects
   */
  getAllErrors() {
    return this.results.get().filter((r: any) => r.severity === 'error');
  }

  /**
   * Get all warnings (severity === 'warning')
   * @returns {Array} Array of warning objects
   */
  getAllWarnings() {
    return this.results.get().filter((r: any) => r.severity === 'warning');
  }

  /**
   * Check if there are any blocking errors
   * @returns {boolean} True if there are errors
   */
  hasBlockingErrors() {
    return this.getAllErrors().length > 0;
  }

  /**
   * Check if there are any breaking changes flagged
   * @returns {boolean} True if there are breaking change errors
   */
  hasBreakingChanges() {
    return this.results.get().some((r: any) => r.breaking && r.severity === 'error');
  }

  /**
   * Get errors for a specific resolved path
   * @param {string} resolvedPath - The resolved path (e.g., 'root.unit[0].name')
   * @returns {Array} Array of errors for that path
   */
  getErrorsForPath(resolvedPath: any) {
    return this.results.get().filter((r: any) => r.path === resolvedPath);
  }

  /**
   * Destroy the engine, clearing timers
   */
  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.editor = null;
    this.context = null;
  }
}

// =============================================================================
// VALIDATION CONTEXT
// =============================================================================

/**
 * ValidationContext - Provides data access for cross-reference validation
 * Used by validators to look up data in the TDF, stimulus file, or media assets
 */
export class ValidationContext {
  instance: any;
  _mediaCache: Map<any, any>;
  _clusterCountCache: number | null;
  /**
   * Create a validation context
   * @param {object} instance - Meteor template instance
   */
  constructor(instance: any) {
    this.instance = instance;
    this._mediaCache = new Map();
    this._clusterCountCache = null;
  }

  /**
   * Get a value from the editor by path
   * @param {string} path - Dot-notation path like 'setspec.lessonname'
   * @returns {*} The value at that path, or null
   */
  get(path: any) {
    const editor = this.instance.editor;
    if (!editor) return null;

    const value = editor.getValue();
    const parts = path.split('.');
    let current = value;

    for (const part of parts) {
      if (current === null || current === undefined) return null;
      current = current[part];
    }

    return current;
  }

  /**
   * Get the number of clusters in the stimulus data
   * @returns {number} Cluster count, or 0 if unknown
   */
  getClusterCount() {
    // Return cached value if available
    if (this._clusterCountCache !== null) {
      return this._clusterCountCache;
    }

    // For TDF editor, look up from the linked stimulus file
    const tdfId = this.instance.tdfId;
    if (tdfId) {
      const tdf = typeof Tdfs !== 'undefined' ? Tdfs.findOne(tdfId) : null;
      if (tdf?.rawStimuliFile?.setspec?.clusters) {
        this._clusterCountCache = tdf.rawStimuliFile.setspec.clusters.length;
        return this._clusterCountCache;
      }
    }

    // For stim editor, count from current editor value
    const editor = this.instance.editor;
    if (editor) {
      const value = editor.getValue();
      if (Array.isArray(value)) {
        this._clusterCountCache = value.length;
        return this._clusterCountCache;
      }
    }

    return 0;
  }

  /**
   * Check if a local media reference is canonical and exists in DynamicAssets.
   * Canonical format: /cdn/storage/Assets/<assetId>/original/<filename>
   */
  mediaAssetExists(reference: any) {
    if (!reference || typeof reference !== 'string') return false;
    const trimmed = reference.trim();
    if (!trimmed) return false;

    // Check cache first
    if (this._mediaCache.has(trimmed)) {
      return this._mediaCache.get(trimmed);
    }

    const cdnMatch = trimmed.match(/^\/?cdn\/storage\/Assets\/([^/]+)\/original\/[^/?#]+$/i);
    const dynamicMatch = trimmed.match(/^\/?dynamic-assets\/([A-Za-z0-9_-]+)(?:\/|$)/i);
    const assetId = cdnMatch?.[1] || dynamicMatch?.[1] || '';
    const exists = Boolean(assetId) && typeof DynamicAssets !== 'undefined'
      ? !!DynamicAssets.findOne({ _id: assetId })
      : false;

    this._mediaCache.set(trimmed, exists);
    return exists;
  }

  /**
   * Check if a stimulus file exists (for TDF validation)
   * @param {string} filename - The stimulus filename
   * @returns {boolean} True if the stimulus file exists
   */
  stimulusFileExists(filename: any) {
    if (!filename) return false;

    // The stimulus file is embedded in the TDF during upload
    // So if we have rawStimuliFile, it exists
    const tdfId = this.instance.tdfId;
    if (tdfId) {
      const tdf = typeof Tdfs !== 'undefined' ? Tdfs.findOne(tdfId) : null;
      return !!tdf?.rawStimuliFile;
    }

    return false;
  }

  /**
   * Clear all caches (call when data changes significantly)
   */
  clearCache() {
    this._mediaCache.clear();
    this._clusterCountCache = null;
  }
}





