import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import './tdfEdit.html';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';

const FlowRouter = (globalThis as any).FlowRouter;
const TdfsCollection = (globalThis as any).Tdfs;
const JSONEditorAny = (globalThis as any).JSONEditor;
import { meteorCallAsync } from '../..';
import { clientConsole } from '../../lib/clientLogger';
import { TDF_TOOLTIPS, getTooltipMode, setTooltipMode, injectDescriptions, updateDescriptionsInPlace, buildDescriptionCache } from '../../lib/tooltipContent';
import { ValidatorEngine, ValidationContext } from '../../lib/validatorCore';
import { createValidationSummary, applyFieldErrors, initValidationUI } from '../../lib/validatorUI';

/**
 * TDF Editor - Schema-driven editor using json-editor library
 *
 * Architecture: Client-only processing
 * - Server: Only used for initial TDF load and final save
 * - Client: All editing, validation, and UI rendering happens in browser
 */

// Fields that affect cluster mapping and require data reset when changed
const BREAKING_FIELDS = ['shuffleclusters', 'swapclusters'];

/**
 * Detect if TDF changes will break existing experiment data
 * Checks shuffle/swap settings and unit clusterlists
 */
function isBreakingTdfChange(originalTutor: any, newTutor: any) {
    if (!originalTutor || !newTutor) return false;

    const origSetspec = originalTutor.setspec || {};
    const newSetspec = newTutor.setspec || {};

    // Check setspec-level breaking fields
    for (const field of BREAKING_FIELDS) {
        if (JSON.stringify(origSetspec[field]) !== JSON.stringify(newSetspec[field])) {
            return true;
        }
    }

    // Check unit-level clusterlist changes
    const origUnits = originalTutor.unit || [];
    const newUnits = newTutor.unit || [];

    const maxUnits = Math.max(origUnits.length, newUnits.length);
    for (let i = 0; i < maxUnits; i++) {
        const origList = origUnits[i]?.learningsession?.clusterlist;
        const newList = newUnits[i]?.learningsession?.clusterlist;
        if (origList !== newList) return true;
    }

    return false;
}

// Cache the schema after first load
let cachedSchema: any = null;
const SAVE_SUCCESS_REDIRECT_DELAY_MS = 1000;

function showSaveFeedbackAndRedirect(instance: any, message: string) {
    if (instance._saveRedirectTimer) {
        Meteor.clearTimeout(instance._saveRedirectTimer);
    }

    instance.saveFeedback.set(message);
    instance._saveRedirectTimer = Meteor.setTimeout(() => {
        FlowRouter.go('/contentUpload');
    }, SAVE_SUCCESS_REDIRECT_DELAY_MS);
}

Template.tdfEdit.onCreated(function(this: any) {
    const instance = this;

    // Get TDF ID from route
    instance.tdfId = FlowRouter.getParam('tdfId');

    // Subscribe to TDF data
    instance.subscribe('tdfForEdit', instance.tdfId);

    // Reactive state
    instance.hasChanges = new ReactiveVar(false);
    instance.saving = new ReactiveVar(false);
    instance.schemaLoaded = new ReactiveVar(false);
    instance.saveFeedback = new ReactiveVar('');
    instance.tooltipMode = new ReactiveVar(getTooltipMode());
    instance.editor = null;
    instance.originalTdf = null;
    instance._hasPendingChanges = false;

    // Initialize validator engine
    instance.validator = new ValidatorEngine({ type: 'tdf', debounceMs: 300 });
    instance.validationContext = null;

    // Load schema
    loadSchema(instance);
});

Template.tdfEdit.onRendered(function(this: any) {
    const instance = this;

    // Initialize editor when both TDF and schema are ready
    instance.autorun(() => {
        if (instance.subscriptionsReady() && instance.schemaLoaded.get()) {
            const tdf = TdfsCollection.findOne(instance.tdfId);
            if (tdf && !instance.editor) {
                Meteor.defer(() => initEditor(instance, tdf));
            }
        }
    });
});

Template.tdfEdit.onDestroyed(function(this: any) {
    // Clean up editor
    if (this.editor) {
        this.editor.destroy();
        this.editor = null;
    }
    // Clean up validator
    if (this.validator) {
        this.validator.destroy();
    }
    if (this.validationAutorun) {
        this.validationAutorun.stop();
        this.validationAutorun = null;
    }
    if (this.domObserver) {
        this.domObserver.disconnect();
        this.domObserver = null;
    }
    if (this.fieldObserver) {
        this.fieldObserver.disconnect();
        this.fieldObserver = null;
    }
    if (this._inputHandler) {
        const container = document.getElementById('tdf-editor-container');
        if (container) {
            container.removeEventListener('input', this._inputHandler, true);
        }
        this._inputHandler = null;
    }
    if (this._blurHandler) {
        const container = document.getElementById('tdf-editor-container');
        if (container) {
            container.removeEventListener('blur', this._blurHandler, true);
        }
        this._blurHandler = null;
    }
    if (this._saveRedirectTimer) {
        Meteor.clearTimeout(this._saveRedirectTimer);
        this._saveRedirectTimer = null;
    }
});

Template.tdfEdit.helpers({
    loading() {
        const instance = (Template.instance() as any);
        return !instance.subscriptionsReady() || !instance.schemaLoaded.get();
    },

    noData() {
        const tdf = TdfsCollection.findOne((Template.instance() as any).tdfId);
        return !tdf;
    },

    lessonName() {
        const tdf = TdfsCollection.findOne((Template.instance() as any).tdfId);
        return tdf?.content?.tdfs?.tutor?.setspec?.lessonname || 'Unknown';
    },

    conditionInfo() {
        const tdfId = (Template.instance() as any).tdfId;
        const tdf = TdfsCollection.findOne({_id: tdfId});
        if (!tdf) return null;

        // Check if this TDF is referenced as a condition in any root TDF
        const rootTdf = TdfsCollection.findOne({
            'content.tdfs.tutor.setspec.condition': tdf.content.fileName
        });

        if (!rootTdf) return null;

        const conditions = rootTdf.content.tdfs.tutor.setspec.condition || [];
        const index = conditions.indexOf(tdf.content.fileName);

        if (index === -1) return null;

        return {
            fileName: tdf.content.fileName,
            index: index + 1,  // 1-based for display
            total: conditions.length
        };
    },

    hasChanges() {
        return (Template.instance() as any).hasChanges.get();
    },

    saveFeedbackText() {
        return (Template.instance() as any).saveFeedback.get();
    },

    saveDisabled() {
        return (Template.instance() as any).hasChanges.get() ? null : 'disabled';
    },

    noneChecked() {
        return (Template.instance() as any).tooltipMode.get() === 'none' ? 'checked' : null;
    },

    briefChecked() {
        return (Template.instance() as any).tooltipMode.get() === 'brief' ? 'checked' : null;
    },

    verboseChecked() {
        return (Template.instance() as any).tooltipMode.get() === 'verbose' ? 'checked' : null;
    }
});

Template.tdfEdit.events({
    // Handle tooltip mode toggle
    'change input[name="tooltipMode"]'(event: any, instance: any) {
        const newMode = event.target.value;
        setTooltipMode(newMode);
        instance.tooltipMode.set(newMode);

        // Update descriptions in place (much faster than recreating editor)
        const container = document.getElementById('tdf-editor-container');
        if (container) {
            updateDescriptionsInPlace(container, TDF_TOOLTIPS, newMode);
        }
    },

    async 'click .save-btn'(event: any, instance: any) {
        event.preventDefault();

        if (instance.saving.get() || !instance.editor) return;

        syncFieldEditorFromDom(instance, document.activeElement);

        // Get edited tutor from json-editor
        const editedTutor = instance.editor.getValue();

        // Run json-editor schema validation
        const schemaErrors = instance.editor.validate();
        if (schemaErrors.length > 0) {
            const errorMessages = schemaErrors.map((e: any) => `${e.path}: ${e.message}`).join('\n');
            alert('Schema validation errors:\n' + errorMessages);
            return;
        }

        // Run our custom validators (immediate, no debounce)
        if (instance.validator) {
            instance.validator.validateNow();
            if (instance.validator.hasBlockingErrors()) {
                // Scroll to validation summary
                const summaryEl = document.getElementById('tdf-validation-summary');
                if (summaryEl) {
                    summaryEl.scrollIntoView({ behavior: 'smooth' });
                }
                alert('Please fix the validation errors before saving.');
                return;
            }
        }

        // Check if this is a breaking change
        const originalTutor = instance.originalTdf?.tutor;
        const breaking = isBreakingTdfChange(originalTutor, editedTutor);

        if (breaking) {
            alert('This edit changes mapping semantics and cannot overwrite this lesson version.\n\nCreate/publish a new version (vN+1) and apply the breaking changes there.');
            return;
        }

        instance.saving.set(true);

        try {
            // Handle API keys: if empty but had original, keep original encrypted value
            // If user entered new value, mark it for encryption on server
            const apiKeyUpdates: Record<string, any> = {};
            API_KEY_FIELDS.forEach((field: string) => {
                const newValue = editedTutor.setspec?.[field];
                const originalEncrypted = instance.originalApiKeys[field];

                if (!newValue && originalEncrypted) {
                    // User didn't change it - restore original encrypted value
                    if (editedTutor.setspec) {
                        editedTutor.setspec[field] = originalEncrypted;
                    }
                } else if (newValue && newValue !== originalEncrypted) {
                    // User entered new value - mark for encryption
                    apiKeyUpdates[field] = true;
                }
            });

            // Wrap back in the expected structure for storage
            // Editor edits tutor, content is { tdfs: { tutor: {...} } }
            const tdfContent = { tdfs: { tutor: editedTutor } };

            // Call server to save (server validates ownership, encrypts new API keys, and saves)
            await meteorCallAsync('saveTdfContent', instance.tdfId, tdfContent, apiKeyUpdates);

            showSaveFeedbackAndRedirect(instance, 'Saved. Returning to Content Manager...');
            instance.hasChanges.set(false);
            instance._hasPendingChanges = false;

        } catch (error: any) {
            clientConsole(1, '[TDF Edit] Error saving TDF:', error);
            alert('Error saving TDF: ' + (error.reason || error.message));
        } finally {
            instance.saving.set(false);
        }
    }
});

/**
 * Load the TDF schema
 */
async function loadSchema(instance: any) {
    if (cachedSchema) {
        instance.schemaLoaded.set(true);
        return;
    }

    try {
        // Fetch schema from public folder
        const response = await fetch('/tdfSchema.json');
        if (!response.ok) {
            throw new Error('Failed to load schema: ' + response.statusText);
        }
        cachedSchema = await response.json();
        instance.schemaLoaded.set(true);
    } catch (error: any) {
        clientConsole(1, '[TDF Edit] Error loading TDF schema:', error);
        alert('Error loading TDF schema. Please refresh the page.');
    }
}

// API key fields that are stored encrypted - clear for display, allow re-entry
const API_KEY_FIELDS = ['speechAPIKey', 'textToSpeechAPIKey'];

/**
 * Check if a value is considered "empty" for display purposes
 */
function isEmpty(value: any) {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'object' && Object.keys(value).length === 0) return true;
    return false;
}

/**
 * Recursively remove empty properties from an object
 * This makes json-editor only render fields that actually have data
 */
function removeEmptyProperties(obj: any): any {
    if (Array.isArray(obj)) {
        const cleaned: any[] = obj
            .map((item: any) => removeEmptyProperties(item))
            .filter((item: any) => !isEmpty(item));
        return cleaned.length > 0 ? cleaned : [];
    }
    if (obj !== null && typeof obj === 'object') {
        const cleaned: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            const cleanedValue = removeEmptyProperties(value);
            if (!isEmpty(cleanedValue)) {
                cleaned[key] = cleanedValue;
            }
        }
        return Object.keys(cleaned).length > 0 ? cleaned : {};
    }
    return obj;
}

function normalizeEditorValue(value: any) {
    return value && typeof value === 'object' ? value : {};
}

function updateChangeState(instance: any, value: any) {
    if (!instance?.hasChanges) return;
    const baseline = instance._baselineSerialized || JSON.stringify({});
    const serialized = JSON.stringify(normalizeEditorValue(value));
    const hasChanges = serialized !== baseline;
    instance._hasPendingChanges = hasChanges;
    instance.hasChanges.set(hasChanges);
}

function syncFieldEditorFromDom(instance: any, target: any) {
    if (!instance?.editor || !target?.matches) return false;
    if (!target.matches('input[type="text"], textarea, select')) return false;
    if (target.closest('.je-modal')) return false;

    const schemaPath = target.closest('[data-schemapath]')?.getAttribute('data-schemapath');
    if (!schemaPath || schemaPath === 'root') return false;

    const fieldEditor = instance.editor.getEditor(schemaPath);
    if (!fieldEditor || typeof fieldEditor.getValue !== 'function' || typeof fieldEditor.setValue !== 'function') {
        return false;
    }

    const nextValue = target.value;
    if (fieldEditor.getValue() === nextValue) return false;

    fieldEditor.setValue(nextValue);
    return true;
}

/**
 * Convert long text inputs to expandable textareas and short textareas back to inputs
 * Makes it easier to edit fields with long content (like calculateProbability)
 * @param {HTMLElement} container - The container element
 * @param {JSONEditor} editor - The json-editor instance (optional, needed for textarea blur updates)
 */
function convertLongInputsToTextareas(container: any, editor: any, rootArg?: any) {
    const root = rootArg || container;
    if (!root) return;

    // Find all text inputs and convert to textarea if long
    const inputs = root.matches && root.matches('input[type="text"]')
        ? [root]
        : root.querySelectorAll('input[type="text"]');

    inputs.forEach((input: any) => {
        const value = input.value || '';
        const hasNewlines = value.includes('\n');
        const isLong = value.length > 50; // Threshold for "long" content (50 chars)

        // Convert to textarea if it has newlines or is long
        if (hasNewlines || isLong) {
            const textarea = document.createElement('textarea');

            // Copy attributes
            textarea.className = input.className;
            textarea.name = input.name;
            textarea.id = input.id;
            textarea.value = value;

            // Copy data attributes
            Array.from(input.attributes).forEach((attr: any) => {
                if (attr.name.startsWith('data-')) {
                    textarea.setAttribute(attr.name, attr.value);
                }
            });

            // Always start with 3 rows regardless of content length
            textarea.rows = 3;

            // Style the textarea
            textarea.style.resize = 'vertical';
            textarea.style.fontFamily = 'monospace';
            textarea.style.fontSize = '0.85em';
            textarea.style.overflow = 'hidden'; // Hide scrollbar for auto-expand

            // Replace input with textarea
            input.parentNode.replaceChild(textarea, input);

            // Add class to form-group to trigger full-width layout
            const formGroup = textarea.closest('.form-group');
            if (formGroup) {
                formGroup.classList.add('has-textarea');

                // Also add class to parent column div (Bootstrap grid)
                const colParent = formGroup.closest('[class*="col-"]');
                if (colParent) {
                    colParent.classList.add('has-textarea-parent');
                }
            }

            // Auto-expand/shrink function to adjust height based on content
            const autoExpand = () => {
                textarea.style.height = 'auto'; // Reset height
                const scrollHeight = textarea.scrollHeight;
                const minHeight = 50; // Minimum height (about 3 rows)
                const maxHeight = 400; // Maximum height before scrolling
                textarea.style.height = Math.min(Math.max(scrollHeight, minHeight), maxHeight) + 'px';

                // Show scrollbar if we hit max height
                if (scrollHeight > maxHeight) {
                    textarea.style.overflow = 'auto';
                } else {
                    textarea.style.overflow = 'hidden';
                }
            };

            // Auto-expand/shrink as user types (but don't expand initially)
            textarea.addEventListener('input', autoExpand);

            // On blur, update json-editor's internal value so it knows about changes
            // (Since we replaced the original input, json-editor lost its event listeners)
            // Mark as having blur listener to avoid duplicates
            if (editor && !textarea.dataset.hasBlurListener) {
                textarea.dataset.hasBlurListener = 'true';
                textarea.addEventListener('blur', () => {
                    const schemaPath = textarea.closest('[data-schemapath]')?.getAttribute('data-schemapath');
                    if (schemaPath) {
                        const fieldEditor = editor.getEditor(schemaPath);
                        if (fieldEditor && fieldEditor.setValue) {
                            // Only update if value actually changed
                            const currentValue = fieldEditor.getValue();
                            if (currentValue !== textarea.value) {
                                fieldEditor.setValue(textarea.value);
                            }
                        }
                    }
                });
            }
        }
    });

    // Find all textareas and convert back to input if short
    // Exclude textareas inside .je-modal (JSON edit modal)
    const textareas = root.matches && root.matches('textarea.form-control')
        ? [root]
        : root.querySelectorAll('textarea.form-control:not(.je-modal textarea)');

    textareas.forEach((textarea: any) => {
        // Skip JSON edit modal textareas
        if (textarea.closest('.je-modal')) return;

        const value = textarea.value || '';
        const hasNewlines = value.includes('\n');
        const isShort = value.length <= 50;

        // Convert back to input if it's short and has no newlines
        if (isShort && !hasNewlines) {
            const input = document.createElement('input');
            input.type = 'text';

            // Copy attributes
            input.className = textarea.className;
            input.name = textarea.name;
            input.id = textarea.id;
            input.value = value;

            // Copy data attributes
            Array.from(textarea.attributes).forEach((attr: any) => {
                if (attr.name.startsWith('data-')) {
                    input.setAttribute(attr.name, attr.value);
                }
            });

            // Replace textarea with input
            textarea.parentNode.replaceChild(input, textarea);

            // Remove classes from form-group and parent column
            const formGroup = input.closest('.form-group');
            if (formGroup) {
                formGroup.classList.remove('has-textarea');

                const colParent = formGroup.closest('[class*="col-"]');
                if (colParent) {
                    colParent.classList.remove('has-textarea-parent');
                }
            }

            // On blur, update json-editor's internal value so it knows about changes
            // (Since we replaced the original textarea, json-editor lost its event listeners)
            // Mark as having blur listener to avoid duplicates
            if (editor && !input.dataset.hasBlurListener) {
                input.dataset.hasBlurListener = 'true';
                input.addEventListener('blur', () => {
                    const schemaPath = input.closest('[data-schemapath]')?.getAttribute('data-schemapath');
                    if (schemaPath) {
                        const fieldEditor = editor.getEditor(schemaPath);
                        if (fieldEditor && fieldEditor.setValue) {
                            // Only update if value actually changed
                            const currentValue = fieldEditor.getValue();
                            if (currentValue !== input.value) {
                                fieldEditor.setValue(input.value);
                            }
                        }
                    }
                });
            }
        }
    });
}

/**
 * Move array field descriptions from before items to after items container
 * json-editor places <p> descriptions before array items, this moves them after
 */
function moveArrayDescriptionsToEnd(container: any) {
    // Find all array-type fields
    const arrayFields = container.querySelectorAll('[data-schematype="array"]');

    arrayFields.forEach((arrayEl: any) => {
        // Find the <p> description that's a direct child
        const descP = arrayEl.querySelector(':scope > p');
        if (!descP) return;

        // Find the items container (the card that holds array items)
        const itemsContainer = arrayEl.querySelector(':scope > .card.card-body');
        if (!itemsContainer) return;

        // Move description after the items container
        itemsContainer.after(descP);
    });
}

/**
 * Inject labels for form inputs that don't have them
 * Bootstrap 5 theme doesn't render labels, so we add them manually
 */
function injectLabelsForInputs(container: any, editor: any, rootArg?: any) {
    const root = rootArg || container;
    if (!root) return;

    // Find all inputs/selects/textareas in form-groups
    const formGroups = root.matches && root.matches('.form-group')
        ? [root]
        : root.querySelectorAll('.form-group');

    formGroups.forEach((formGroup: any) => {
        // Check if this form-group already has a label
        const existingLabel = formGroup.querySelector('label');
        if (existingLabel) return;  // Already has a label, skip

        // Find the input/select/textarea
        const input = formGroup.querySelector('input, select, textarea');
        if (!input) return;  // No input found, skip

        // Skip if input is in a table (table headers serve as labels)
        if (input.closest('td.compact')) return;

        // Get the schema path from the closest parent with data-schemapath
        const schemaPathElem = input.closest('[data-schemapath]');
        if (!schemaPathElem) return;

        const schemaPath = schemaPathElem.getAttribute('data-schemapath');
        if (!schemaPath) return;

        // Get the editor instance for this path to extract the title
        const editorInstance = editor.getEditor(schemaPath);
        if (!editorInstance || !editorInstance.schema) return;

        // Get the title from the schema
        const title = editorInstance.schema.title || editorInstance.key;
        if (!title) return;

        // Create and inject the label
        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = title;
        label.setAttribute('for', input.id);

        // Insert label before the input
        input.parentNode.insertBefore(label, input);
    });
}

/**
 * Initialize the json-editor
 */
function initEditor(instance: any, tdf: any) {
    const container = document.getElementById('tdf-editor-container');
    if (!container || !cachedSchema) return;

    // Apply hide-descriptions class if mode is 'none' on initial load
    const tooltipMode = instance.tooltipMode.get();
    if (tooltipMode === 'none') {
        container.classList.add('hide-descriptions');
    } else {
        container.classList.remove('hide-descriptions');
    }

    // Store original for comparison (keep encrypted values)
    instance.originalTdf = JSON.parse(JSON.stringify(tdf.content.tdfs));

    // Track which API keys had values (so we know to keep them if not re-entered)
    instance.originalApiKeys = {};
    API_KEY_FIELDS.forEach((field: string) => {
        if (tdf.content.tdfs.tutor?.setspec?.[field]) {
            instance.originalApiKeys[field] = tdf.content.tdfs.tutor.setspec[field];
        }
    });

    // Create a copy for editing with API keys cleared (they're encrypted gibberish)
    let tutorData = JSON.parse(JSON.stringify(tdf.content.tdfs.tutor));
    API_KEY_FIELDS.forEach((field: string) => {
        if (tutorData.setspec?.[field]) {
            tutorData.setspec[field] = ''; // Clear for display - user can re-enter
        }
    });

    // Remove empty properties so json-editor only shows populated fields
    // Users can add new fields via the Properties button
    tutorData = removeEmptyProperties(tutorData);

    // Extract the tutor schema (the main part we want to edit)
    const tutorSchema = cachedSchema.properties?.tutor || cachedSchema;

    // Add human-readable titles to all properties so labels show
    // Converts camelCase to Title Case (e.g., "lessonname" -> "Lessonname", "audioInputEnabled" -> "Audio Input Enabled")
    function addTitlesToSchema(schema: any): any {
        if (schema.type === 'object' && schema.properties) {
            for (const key in schema.properties) {
                const prop = schema.properties[key];

                // Add title if not present - convert camelCase to readable
                if (!prop.title) {
                    // Insert space before capital letters, capitalize first letter
                    prop.title = key
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (str: any) => str.toUpperCase())
                        .trim();
                }

                // Recursively process nested structures
                if (prop.type === 'object') {
                    addTitlesToSchema(prop);
                } else if (prop.type === 'array' && prop.items && prop.items.type === 'object') {
                    addTitlesToSchema(prop.items);
                }
            }
        }
        return schema;
    }
    addTitlesToSchema(tutorSchema);

    // Inject tooltip descriptions based on current mode (brief or verbose)
    const schemaWithDescriptions = injectDescriptions(tutorSchema, TDF_TOOLTIPS, tooltipMode);

    // Configure json-editor options
    // Key: use startval to populate existing data (pre-filtered to remove empty values)
    const options = {
        schema: schemaWithDescriptions,
        startval: tutorData,
        theme: 'bootstrap5',
        iconlib: 'fontawesome4',
        disable_edit_json: false,
        disable_properties: false,   // Keep Properties button to add new fields
        disable_collapse: false,
        disable_array_add: false,
        disable_array_delete: false,
        disable_array_reorder: false,
        enable_array_copy: true,
        array_controls_top: true,
        no_additional_properties: true,
        required_by_default: false,
        display_required_only: false,
        show_opt_in: false,  // Don't need checkboxes - we pre-filter instead
        remove_empty_properties: true,   // Don't include empty in getValue()
        prompt_before_delete: true,
        object_layout: 'grid',  // Grid layout forces labels to show
        compact: false,  // Compact mode hides labels, so keep this false
        keep_oneof_values: false  // Don't keep values when switching types
    };

    // Initialize the editor
    // JSONEditor is loaded via CDN and available globally
    if (typeof JSONEditorAny === 'undefined') {
        clientConsole(1, '[TDF Edit] JSONEditor not loaded. Make sure json-editor CDN is included.');
        alert('Editor library not loaded. Please refresh the page.');
        return;
    }

    instance.editor = new JSONEditorAny(container, options);

    // Flag to skip change detection during initialization
    let isInitializing = true;

    // After editor is ready, ensure all data is loaded
    instance.editor.on('ready', () => {
        // Ensure the editor has initial data in case startval didn't populate
        const currentValue = instance.editor.getValue();
        if (!currentValue || Object.keys(currentValue).length === 0) {
            instance.editor.setValue(tutorData);
        }

        // Convert long text inputs to textareas for easier editing
        convertLongInputsToTextareas(container, instance.editor);

        // Inject labels for all form fields that don't have them
        // Bootstrap 5 theme doesn't render labels by default, so we add them manually
        injectLabelsForInputs(container, instance.editor);

        // Build description cache for instant mode switching
        buildDescriptionCache(container, TDF_TOOLTIPS);

        // Move array field descriptions to after the items container
        moveArrayDescriptionsToEnd(container);

        // Change "properties" button text to "Edit Properties"
        container.querySelectorAll('.json-editor-btntype-properties').forEach(btn => {
            const span = btn.querySelector('span');
            if (span && span.textContent.trim().toLowerCase() === 'properties') {
                span.textContent = ' Edit Properties';
            }
        });

        // Use editor's normalized value as the baseline for change detection
        // This prevents false "unsaved changes" due to json-editor normalizing data
        instance.originalTdf.tutor = instance.editor.getValue();
        const baselineValue = instance.editor.getValue();
        instance._baselineSerialized = JSON.stringify(normalizeEditorValue(baselineValue));
        updateChangeState(instance, baselineValue);

        // Initialize validator with editor and context
        instance.validationContext = new ValidationContext(instance);
        instance.validator.init(instance.editor, instance.validationContext);

        // Run initial validation
        instance.validator.validate();

        // Set up reactive validation UI updates
        instance.validationAutorun = Tracker.autorun(() => {
            const results = instance.validator.results.get();
            const errors = results.filter((r: any) => r.severity === 'error');
            const warnings = results.filter((r: any) => r.severity === 'warning');

            // Update summary panel
            const summaryContainer = document.getElementById('tdf-validation-summary');
            if (summaryContainer) {
                summaryContainer.innerHTML = createValidationSummary(errors, warnings);
                initValidationUI(summaryContainer, container);
            }

            // Apply field-level styling
            applyFieldErrors(container, results);
        });

        // Done initializing - now track real changes
        isInitializing = false;
    });

    // Listen for changes
    instance.editor.on('change', () => {
        // Skip change detection during initialization
        if (isInitializing) return;

        updateChangeState(instance, instance.editor.getValue());

        // Run validation (debounced)
        instance.validator.validate();
        injectMCButtons(instance);
    });

    // Convert long inputs to textareas on-the-fly, and revert on blur if short
    const handleInput = (event: any) => {
        const target = event.target;
        if (target && target.matches && target.matches('input[type="text"]')) {
            convertLongInputsToTextareas(container, instance.editor, target);
        }

        if (syncFieldEditorFromDom(instance, target)) {
            updateChangeState(instance, instance.editor.getValue());
            instance.validator.validate();
        }
    };
    const handleBlur = (event: any) => {
        const target = event.target;
        if (target && target.matches && target.matches('textarea.form-control')) {
            if (!target.closest('.je-modal')) {
                convertLongInputsToTextareas(container, instance.editor, target);
            }
        }

        if (syncFieldEditorFromDom(instance, target)) {
            updateChangeState(instance, instance.editor.getValue());
            instance.validator.validate();
        }
    };
    container.addEventListener('input', handleInput, true);
    container.addEventListener('blur', handleBlur, true);
    instance._inputHandler = handleInput;
    instance._blurHandler = handleBlur;

    // Process newly-added fields only (avoid full-container rescans)
    let fieldObserverTimer: any = null;
    let pendingFieldNodes: any[] = [];
    const processFieldNodes = () => {
        const nodesToProcess = pendingFieldNodes;
        pendingFieldNodes = [];
        fieldObserverTimer = null;

        nodesToProcess.forEach((node: any) => {
            if (node.nodeType !== 1) return;
            convertLongInputsToTextareas(container, instance.editor, node);
            injectLabelsForInputs(container, instance.editor, node);
        });
    };
    const fieldObserver = new MutationObserver((mutations) => {
        let sawActionable = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                pendingFieldNodes.push(node);
                sawActionable = true;
            }
        }
        if (!sawActionable) return;
        if (fieldObserverTimer) return;
        fieldObserverTimer = setTimeout(processFieldNodes, 75);
    });
    fieldObserver.observe(container, { childList: true, subtree: true });
    instance.fieldObserver = fieldObserver;

    // Watch for modal opens and reorder property checkboxes
    // Available (unchecked) at top, in-use (checked) at bottom
    let modalObserverTimer: any = null;
    let pendingActionNodes: any[] = [];

    const processPendingNodes = () => {
        const nodesToProcess = pendingActionNodes;
        pendingActionNodes = [];
        modalObserverTimer = null;

        nodesToProcess.forEach((node: any) => {
            if (node.nodeType !== 1) return;

            // Fix "properties" button text in added nodes only
            const buttons = node.classList?.contains('json-editor-btntype-properties') ? [node] :
                (node.querySelectorAll ? node.querySelectorAll('.json-editor-btntype-properties') : []);
            buttons.forEach((btn: any) => {
                const span = btn.querySelector('span');
                if (span && span.textContent.trim().toLowerCase() === 'properties') {
                    span.textContent = ' Edit Properties';
                }
            });

            // Find je-modal in this specific added node
            const modals = node.classList?.contains('je-modal') ? [node] :
                (node.querySelectorAll ? Array.from(node.querySelectorAll('.je-modal')) : []);

            for (const modal of modals) {
                // Skip if already processed
                if (modal.dataset.labelsProcessed) continue;
                modal.dataset.labelsProcessed = 'true';

                // Reorder: unchecked properties first, checked last
                const formGroups = modal.querySelectorAll(':scope > .form-group');
                if (formGroups.length > 0) {
                    const groupArray = Array.from(formGroups);
                    groupArray.sort((a: any, b: any) => {
                        const aChecked = a.querySelector('input[type="checkbox"]')?.checked ? 1 : 0;
                        const bChecked = b.querySelector('input[type="checkbox"]')?.checked ? 1 : 0;
                        return aChecked - bChecked;
                    });
                    groupArray.forEach((group: any) => modal.appendChild(group));
                }
            }
        });
    };

    const observer = new MutationObserver((mutations) => {
        let sawActionable = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;

                const nodeEl = node as any;
                const hasModal = nodeEl.classList?.contains('je-modal') || (nodeEl.querySelector && nodeEl.querySelector('.je-modal'));
                const hasPropsButton = nodeEl.classList?.contains('json-editor-btntype-properties') ||
                    (nodeEl.querySelector && nodeEl.querySelector('.json-editor-btntype-properties'));

                if (!hasModal && !hasPropsButton) continue;

                pendingActionNodes.push(node);
                sawActionable = true;
            }
        }

        if (!sawActionable) return;
        if (modalObserverTimer) return;

        modalObserverTimer = setTimeout(processPendingNodes, 75);
    });
    observer.observe(container, { childList: true, subtree: true });
    instance.domObserver = observer;

    // Inject MC toggle buttons for learning session units (after a short delay to ensure DOM is ready)
    setTimeout(() => injectMCButtons(instance), 200);
}

/**
 * Inject MC toggle buttons for each unit that has a learningsession
 * @param {Object} instance - Template instance with editor
 */
function injectMCButtons(instance: any) {
    if (!instance.editor) return;

    const unitsEditor = instance.editor.getEditor('root.unit');
    const units = unitsEditor ? unitsEditor.getValue() : (instance.editor.getValue()?.unit || []);
    if (!Array.isArray(units)) return;

    if (!instance._mcButtonState) {
        instance._mcButtonState = [];
    }

    units.forEach((unit: any, idx: any) => {
        // Only show button for units with learningsession
        if (!unit?.learningsession) {
            const unitEditor = instance.editor.getEditor(`root.unit.${idx}`);
            const unitContainer = unitEditor?.container;
            const unitHeader = unitContainer
                ? (unitContainer.querySelector(':scope > h3') ||
                   unitContainer.querySelector(':scope > .card-header') ||
                   unitContainer.querySelector(':scope > .je-header') ||
                   unitContainer.querySelector(':scope > .je-object__title') ||
                   unitContainer.querySelector(':scope > span > button')?.parentElement)
                : null;
            const existing = unitHeader?.querySelector('.mc-toggle-btn');
            if (existing) existing.remove();
            instance._mcButtonState[idx] = null;
            return;
        }

        // Use json-editor's getEditor API to find the unit's editor instance
        const unitEditor = instance.editor.getEditor(`root.unit.${idx}`);
        if (!unitEditor || !unitEditor.container) return;

        const unitContainer = unitEditor.container;

        // Find the header element - json-editor creates a header row for collapsible objects
        let unitHeader = unitContainer.querySelector(':scope > h3') ||
                         unitContainer.querySelector(':scope > .card-header') ||
                         unitContainer.querySelector(':scope > .je-header') ||
                         unitContainer.querySelector(':scope > .je-object__title') ||
                         unitContainer.querySelector(':scope > span > button')?.parentElement;
        if (!unitHeader) return;

        // Check current state
        const isEnabled = unit.buttontrial === 'true';
        const previousState = instance._mcButtonState[idx];
        const existing = unitHeader.querySelector('.mc-toggle-btn');

        if (existing && previousState === isEnabled) {
            return;
        }

        // Create or update toggle button
        const btn = existing || document.createElement('button');
        btn.className = `btn btn-sm mc-toggle-btn ms-2 ${isEnabled ? 'btn-success' : 'btn-outline-secondary'}`;
        btn.type = 'button';
        btn.innerHTML = isEnabled
            ? '<i class="fa fa-check-square"></i> MC Mode'
            : '<i class="fa fa-square-o"></i> Text Mode';
        btn.title = isEnabled
            ? 'Click to switch to text input mode'
            : 'Click to enable multiple choice mode';

        if (!existing) {
            btn.onclick = (e: any) => {
                e.preventDefault();
                e.stopPropagation();
                toggleUnitMC(instance, idx);
            };
            unitHeader.appendChild(btn);
        }

        instance._mcButtonState[idx] = isEnabled;
    });
}

/**
 * Toggle MC mode for a specific unit
 * @param {Object} instance - Template instance with editor
 * @param {number} unitIndex - Index of the unit to toggle
 */
function toggleUnitMC(instance: any, unitIndex: any) {
    // Get the unit's editor instance
    const unitEditor = instance.editor.getEditor(`root.unit.${unitIndex}`);
    if (!unitEditor) return;

    // Get current value
    const unit = unitEditor.getValue();
    const newButtonTrial = unit.buttontrial === 'true' ? 'false' : 'true';

    // Add properties if they don't exist (enables them in json-editor)
    if (typeof unitEditor.addObjectProperty === 'function') {
        if (!Object.prototype.hasOwnProperty.call(unit, 'buttontrial')) {
            unitEditor.addObjectProperty('buttontrial');
        }
        if (!Object.prototype.hasOwnProperty.call(unit, 'buttonorder') && newButtonTrial === 'true') {
            unitEditor.addObjectProperty('buttonorder');
        }
    }

    // Set values using sub-editors
    const buttonTrialEditor = instance.editor.getEditor(`root.unit.${unitIndex}.buttontrial`);
    if (buttonTrialEditor) {
        buttonTrialEditor.setValue(newButtonTrial);
    }

    if (newButtonTrial === 'true') {
        const buttonOrderEditor = instance.editor.getEditor(`root.unit.${unitIndex}.buttonorder`);
        if (buttonOrderEditor) {
            buttonOrderEditor.setValue('random');
        }
    }

    // Mark as changed
    instance.hasChanges.set(true);

    // Re-inject buttons after editor updates
    setTimeout(() => injectMCButtons(instance), 100);
}




