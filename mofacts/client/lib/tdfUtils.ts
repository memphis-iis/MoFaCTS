import { legacyTrim } from '../../common/underscoreCompat';

/**
 * TDF (Training Definition File) Utilities
 *
 * Pure functions for parsing and manipulating TDF data structures.
 * Extracted from card.js as part of C1.3 refactoring.
 *
 * @module client/lib/tdfUtils
 */

/**
 * Parse a schedule item condition string
 *
 * Converts TDF condition format from "prefix-0" to "prefix_1" (adjusts for 0-based vs 1-based indexing).
 * Returns original string if it doesn't match expected format.
 *
 * @param {string|undefined} cond - Condition string from TDF (e.g., "control-0", "experimental-2")
 * @returns {string} Parsed condition (e.g., "control_1", "experimental_3") or 'UNKNOWN'/'original'
 *
 * @example
 * parseSchedItemCondition('control-0')       // Returns: 'control_1'
 * parseSchedItemCondition('experimental-2')  // Returns: 'experimental_3'
 * parseSchedItemCondition('invalid')         // Returns: 'invalid'
 * parseSchedItemCondition(undefined)         // Returns: 'UNKNOWN'
 */
export function parseSchedItemCondition(cond: string | undefined | null): string {
  if (typeof cond === 'undefined' || !cond) {
    return 'UNKNOWN';
  }

  const fields = legacyTrim('' + cond).split('-');
  if (fields.length !== 2) {
    return cond;
  }

  const prefix = fields[0] ?? '';
  const suffix = fields[1] ?? '';
  const num = parseInt(suffix, 10);
  if (isNaN(num)) {
    return cond;
  }

  return prefix + '_' + (num + 1).toString();
}

/**
 *
 * Some older TDFs store `tdfs.tutor.unit` as a single object instead of an array.
 * This helper canonicalizes the structure so downstream code can safely assume
 * an array-based unit list when units are present.
 *
 * @param {any} tdfContent - Parsed TDF content object
 * @returns {void}
 */
export function normalizeTutorUnits(tdfContent: any): void {
  const tutor = tdfContent?.tdfs?.tutor;
  if (!tutor) {
    return;
  }

  if (tutor.unit && !Array.isArray(tutor.unit) && typeof tutor.unit === 'object') {
    tutor.unit = [tutor.unit];
  }
}

/**
 * Returns true when a TDF has a condition list but no direct unit array.
 * This indicates a condition-root TDF that resolves to child TDFs.
 *
 * @param {any} tdfContent - Parsed TDF content object
 * @returns {boolean}
 */
export function isConditionRootWithoutUnitArray(tdfContent: any): boolean {
  const hasUnitArray = Array.isArray(tdfContent?.tdfs?.tutor?.unit);
  if (hasUnitArray) {
    return false;
  }

  const conditions = tdfContent?.tdfs?.tutor?.setspec?.condition;
  return Array.isArray(conditions) && conditions.length > 0;
}


