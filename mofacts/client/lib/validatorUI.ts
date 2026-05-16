/**
 * Validator UI - Display components for validation errors and warnings
 *
 * Provides:
 * - Validation summary panel with collapsible error/warning lists
 * - Field-level error highlighting
 * - Jump-to-field functionality
 */

import DOMPurify from 'dompurify';
import { clientConsole } from './clientLogger';

// =============================================================================
// CONSTANTS
// =============================================================================

const ERROR_ICON = '<i class="fa fa-exclamation-circle"></i>';
const WARNING_ICON = '<i class="fa fa-exclamation-triangle"></i>';

type ValidationResult = {
  path: string;
  message: string;
  severity: 'error' | 'warning';
  breaking?: boolean;
};

// =============================================================================
// VALIDATION SUMMARY PANEL
// =============================================================================

/**
 * Create the validation summary panel HTML
 * @param {Array} errors - Array of error objects
 * @param {Array} warnings - Array of warning objects
 * @returns {string} HTML string for the summary panel
 */
export function createValidationSummary(errors: ValidationResult[], warnings: ValidationResult[]): string {
  if (errors.length === 0 && warnings.length === 0) {
    return '';
  }

  let html = '<div class="validation-summary">';

  // Errors section
  if (errors.length > 0) {
    const hasBreaking = errors.some(e => e.breaking);
    html += `
      <div class="validation-errors alert alert-danger mb-2">
        <div class="d-flex align-items-center">
          ${ERROR_ICON}
          <strong class="ms-2">${errors.length} Error${errors.length !== 1 ? 's' : ''}</strong>
          ${hasBreaking ? '<span class="badge bg-warning text-dark ms-2">Breaking Changes</span>' : ''}
          <button type="button" class="btn btn-sm btn-link ms-auto toggle-validation-details p-0" data-target="error">
            <i class="fa fa-chevron-down"></i>
          </button>
        </div>
        <ul class="validation-list error-list mb-0 mt-2" style="display: none;">
          ${errors.map(e => createValidationItem(e)).join('')}
        </ul>
      </div>
    `;
  }

  // Warnings section
  if (warnings.length > 0) {
    html += `
      <div class="validation-warnings alert alert-warning mb-2">
        <div class="d-flex align-items-center">
          ${WARNING_ICON}
          <strong class="ms-2">${warnings.length} Warning${warnings.length !== 1 ? 's' : ''}</strong>
          <button type="button" class="btn btn-sm btn-link ms-auto toggle-validation-details p-0" data-target="warning">
            <i class="fa fa-chevron-down"></i>
          </button>
        </div>
        <ul class="validation-list warning-list mb-0 mt-2" style="display: none;">
          ${warnings.map(e => createValidationItem(e)).join('')}
        </ul>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

/**
 * Create HTML for a single validation item
 * @param {object} error - Validation error/warning object
 * @returns {string} HTML string for the item
 */
function createValidationItem(error: ValidationResult): string {
  const path = DOMPurify.sanitize(error.path);
  const message = DOMPurify.sanitize(error.message);
  const displayPath = formatPathForDisplay(error.path);

  return `
    <li class="validation-item" data-path="${path}">
      <a href="#" class="jump-to-field text-decoration-none">${displayPath}</a>: ${message}
      ${error.breaking ? '<span class="badge bg-warning text-dark ms-1" title="Changing this will reset student progress">Breaking</span>' : ''}
    </li>
  `;
}

/**
 * Format a schema path for human-readable display
 * @param {string} path - Schema path like 'root.unit[0].deliverySettings.drill'
 * @returns {string} Formatted path like 'Unit 1 > Delivery Settings > Drill'
 */
function formatPathForDisplay(path: string): string {
  return path
    .replace(/^root\.?/, '')
    .replace(/\[(\d+)\]/g, (_match, num) => ` ${parseInt(num, 10) + 1}`) // Convert 0-indexed to 1-indexed
    .replace(/\./g, ' > ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase to spaces
    .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
    .replace(/ > ([a-z])/g, (_match, letter) => ` > ${letter.toUpperCase()}`); // Capitalize after >
}

// =============================================================================
// FIELD-LEVEL ERROR DISPLAY
// =============================================================================

/**
 * Apply error/warning styling to fields in the editor
 * @param {HTMLElement} container - The editor container element
 * @param {Array} results - Array of validation results (errors and warnings)
 */
export function applyFieldErrors(container: HTMLElement, results: ValidationResult[]): void {
  if (!container) return;

  // Remove existing error styling
  container.querySelectorAll('.validation-error-field').forEach((el) => {
    el.classList.remove('validation-error-field');
  });
  container.querySelectorAll('.validation-warning-field').forEach((el) => {
    el.classList.remove('validation-warning-field');
  });
  container.querySelectorAll('.field-validation-message').forEach((el) => {
    el.remove();
  });

  // Group results by path to avoid duplicate messages
  const resultsByPath = new Map();
  for (const result of results) {
    const existing = resultsByPath.get(result.path);
    if (!existing || result.severity === 'error') {
      resultsByPath.set(result.path, result);
    }
  }

  // Apply new error styling
  for (const [path, result] of resultsByPath) {
    // Convert our path format to json-editor's data-schemapath format
    const schemaPath = convertToSchemaPath(path);
    const fieldEl = container.querySelector(`[data-schemapath="${schemaPath}"]`);

    if (fieldEl) {
      const input = fieldEl.querySelector('input, select, textarea');
      if (input) {
        // Add styling class
        input.classList.add(
          result.severity === 'error' ? 'validation-error-field' : 'validation-warning-field'
        );

        // Add inline message if not already present
        const existingMsg = fieldEl.querySelector('.field-validation-message');
        if (!existingMsg) {
          const msg = document.createElement('small');
          msg.className = `field-validation-message d-block mt-1 text-${result.severity === 'error' ? 'danger' : 'warning'}`;
          msg.innerHTML = `${result.severity === 'error' ? ERROR_ICON : WARNING_ICON} <span class="ms-1">${DOMPurify.sanitize(result.message)}</span>`;

          // Insert after input (or after existing small text)
          const insertAfter = input.nextElementSibling?.tagName === 'SMALL'
            ? input.nextElementSibling
            : input;
          insertAfter.parentNode?.insertBefore(msg, insertAfter.nextSibling);
        }
      }
    }
  }
}

/**
 * Convert our path format to json-editor's data-schemapath format
 * Our format: 'root.unit[0].deliverySettings.drill'
 * json-editor format: 'root.unit.0.deliverySettings.drill'
 *
 * @param {string} path - Our path format
 * @returns {string} json-editor schemapath format
 */
function convertToSchemaPath(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.$1');
}

// =============================================================================
// JUMP TO FIELD
// =============================================================================

/**
 * Scroll to and highlight a field in the editor
 * @param {HTMLElement} container - The editor container element
 * @param {string} path - The path to jump to
 */
function jumpToField(container: HTMLElement, path: string): void {
  if (!container || !path) return;

  const schemaPath = convertToSchemaPath(path);
  const fieldEl = container.querySelector(`[data-schemapath="${schemaPath}"]`);

  if (!fieldEl) {
    clientConsole(1, '[ValidatorUI] Could not find field for path:', path);
    return;
  }

  // Expand collapsed parent sections
  expandParentSections(fieldEl);

  // Scroll the field into view
  fieldEl.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  // Add highlight animation
  fieldEl.classList.add('validation-highlight');
  setTimeout(() => {
    fieldEl.classList.remove('validation-highlight');
  }, 2000);

  // Focus the input if present
  const input = fieldEl.querySelector('input, select, textarea');
  if (input) {
    setTimeout(() => (input as HTMLElement).focus(), 300);
  }
}

/**
 * Expand collapsed parent sections to reveal a field
 * @param {HTMLElement} fieldEl - The field element to reveal
 */
function expandParentSections(fieldEl: Element): void {
  let parent = fieldEl.parentElement;

  while (parent) {
    // Check for Bootstrap collapse
    if (parent.classList.contains('collapse') && !parent.classList.contains('show')) {
      // Find the toggle button
      const toggleId = parent.id;
      if (toggleId) {
        const toggle = document.querySelector(`[data-bs-target="#${toggleId}"], [data-target="#${toggleId}"]`);
        if (toggle) {
          (toggle as HTMLElement).click();
        }
      }
    }

    // Check for json-editor collapsed arrays/objects
    if (parent.classList.contains('je-child-editor-holder')) {
      const collapsed = parent.style.display === 'none';
      if (collapsed) {
        // Find parent card and click collapse toggle
        const card = parent.closest('.card, .je-object__container');
        if (card) {
          const collapseBtn = card.querySelector('.json-editor-btn-collapse');
          if (collapseBtn) {
            (collapseBtn as HTMLElement).click();
          }
        }
      }
    }

    parent = parent.parentElement;
  }
}

// =============================================================================
// EVENT HANDLER INITIALIZATION
// =============================================================================

/**
 * Initialize event handlers for the validation summary panel
 * @param {HTMLElement} summaryEl - The validation summary container element
 * @param {HTMLElement} editorContainer - The editor container element
 */
export function initValidationUI(summaryEl: HTMLElement, editorContainer: HTMLElement): void {
  if (!summaryEl) return;

  // Toggle details expand/collapse
  summaryEl.querySelectorAll('.toggle-validation-details').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const alert = btn.closest('.alert');
      const list = alert?.querySelector('.validation-list');
      const icon = btn.querySelector('i');

      if (list && icon) {
        const listEl = list as HTMLElement;
        const isHidden = listEl.style.display === 'none';
        listEl.style.display = isHidden ? 'block' : 'none';
        icon.classList.toggle('fa-chevron-down', !isHidden);
        icon.classList.toggle('fa-chevron-up', isHidden);
      }
    });
  });

  // Jump to field links
  summaryEl.querySelectorAll('.jump-to-field').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const item = link.closest('.validation-item');
      const path = (item as HTMLElement | null)?.dataset.path;
      if (path && editorContainer) {
        jumpToField(editorContainer, path);
      }
    });
  });
}


