import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import './contentEdit.html';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import { meteorCallAsync } from '../..';
import { STIM_TOOLTIPS, getTooltipMode, setTooltipMode, injectDescriptions, updateDescriptionsInPlace, buildDescriptionCache } from '../../lib/tooltipContent';
import { clientConsole } from '../../lib/clientLogger';
import { ValidatorEngine, ValidationContext } from '../../lib/validatorCore';
import { createValidationSummary, applyFieldErrors, initValidationUI } from '../../lib/validatorUI';
import { sortPropertiesModal } from '../../lib/schemaApplicabilityEditor';

const FlowRouter = (globalThis as any).FlowRouter;
const TdfsCollection = (globalThis as any).Tdfs || (globalThis as any).TdfsCollection;

function findTdf(selector: any) {
    return TdfsCollection?.findOne ? TdfsCollection.findOne(selector) : null;
}

// Simple deep clone helper to avoid shared references
const clone = (obj: any) => JSON.parse(JSON.stringify(obj));

/**
 * Content Editor - Schema-driven editor for stimulus content using json-editor library
 *
 * Architecture: Client-only processing (matches tdfEdit pattern)
 * - Server: Only used for initial TDF load and final save
 * - Client: All editing, validation, and UI rendering happens in browser
 */

// Cache the schema after first load
let cachedStimSchema: any = null;
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

Template.contentEdit.onCreated(function(this: any) {
    const instance = this;

    // Get TDF ID from route
    instance.tdfId = FlowRouter.getParam('tdfId');

    // Subscribe to TDF data
    instance.subscribe('tdfForEdit', instance.tdfId);
    instance.subscribe('files.assets.all');

    // Reactive state
    instance.hasChanges = new ReactiveVar(false);
    instance.saving = new ReactiveVar(false);
    instance.schemaLoaded = new ReactiveVar(false);
    instance.editorReady = new ReactiveVar(false);  // Track when editor has finished initializing
    instance.saveFeedback = new ReactiveVar('');
    instance.tooltipMode = new ReactiveVar(getTooltipMode());
    instance.currentClusterIndex = new ReactiveVar(0); // window start index
    instance.clusterWindowSize = new ReactiveVar(1);   // how many clusters shown at once
    instance.clustersCount = new ReactiveVar(0);
    instance.editor = null;
    instance.originalClusters = null;
    instance.originalStimuli = null;
    instance.clusters = []; // working copy of all clusters
    instance.editedClusters = {}; // index -> cluster value
    instance._hasPendingChanges = false;

    // Initialize validator engine
    instance.validator = new ValidatorEngine({ type: 'stim', debounceMs: 300 });
    instance.validationContext = null;

    // Load schema
    loadStimSchema(instance);
});

Template.contentEdit.onRendered(function(this: any) {
    const instance = this;

    // Initialize editor when both TDF and schema are ready
    instance.autorun(() => {
        if (instance.subscriptionsReady() && instance.schemaLoaded.get()) {
            const tdf = findTdf(instance.tdfId);
            if (tdf && !instance.editor) {
                Meteor.defer(() => initStimEditor(instance, tdf));
            }
        }
    });
});

Template.contentEdit.onDestroyed(function(this: any) {
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
        const container = document.getElementById('stim-editor-container');
        if (container) {
            container.removeEventListener('input', this._inputHandler, true);
        }
        this._inputHandler = null;
    }
    if (this._blurHandler) {
        const container = document.getElementById('stim-editor-container');
        if (container) {
            container.removeEventListener('blur', this._blurHandler, true);
        }
        this._blurHandler = null;
    }
    if (this._saveRedirectTimer) {
        Meteor.clearTimeout(this._saveRedirectTimer);
        this._saveRedirectTimer = null;
    }
    this._mediaAssetCache = null;
    this.clusters = [];
    this.editedClusters = {};
    if (this.clustersCount) {
        this.clustersCount.set(0);
    }
});

Template.contentEdit.helpers({
    loading() {
        const instance = Template.instance() as any as any;
        // Show spinner while data is loading
        return !instance.subscriptionsReady() || !instance.schemaLoaded.get();
    },

    editorReady() {
        return (Template.instance() as any).editorReady.get();
    },

    noData() {
        const tdf = findTdf((Template.instance() as any).tdfId);
        return !tdf || !tdf.rawStimuliFile?.setspec?.clusters;
    },

    lessonName() {
        const tdf = findTdf((Template.instance() as any).tdfId);
        return tdf?.content?.tdfs?.tutor?.setspec?.lessonname || 'Unknown';
    },

    conditionInfo() {
        const tdfId = (Template.instance() as any).tdfId;
        const tdf = findTdf({_id: tdfId});
        if (!tdf) return null;

        // Check if this TDF is referenced as a condition in any root TDF
        const rootTdf = findTdf({
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

    stimFileInfo() {
        // Check if specific stim file was selected via query params
        const params = FlowRouter.current().queryParams;
        if (params.stimFile) {
            return {
                filename: params.stimFile,
                stimId: params.stimId
            };
        }
        return null;
    },

    hasChanges() {
        return (Template.instance() as any).hasChanges.get();
    },

    saveFeedbackText() {
        return (Template.instance() as any).saveFeedback.get();
    },

    clustersCount() {
        const instance = Template.instance() as any as any;
        const count = instance.clustersCount?.get?.();
        if (Number.isFinite(count)) return count;
        const clusters = instance.clusters || [];
        return clusters.length;
    },

    currentClusterName() {
        const instance = Template.instance() as any as any;
        const start = instance.currentClusterIndex.get();
        const size = instance.clusterWindowSize.get();
        const total = instance.clustersCount?.get?.() ?? (instance.clusters || []).length;
        if (total === 0) return 'No clusters';
        const end = Math.min(start + size, total);
        return `Clusters ${start + 1} - ${end}`;
    },

    clusterWindowSize() {
        return (Template.instance() as any).clusterWindowSize.get();
    },

    windowSizeSelected(size: any) {
        const current = (Template.instance() as any).clusterWindowSize.get();
        return current === size ? 'selected' : null;
    },

    currentClusterNumber() {
        const instance = Template.instance() as any as any;
        const total = instance.clustersCount?.get?.() ?? (instance.clusters || []).length;
        if (total === 0) return 0;
        return instance.currentClusterIndex.get() + 1;
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

Template.contentEdit.events({
    // Handle tooltip mode toggle
    'change input[name="tooltipMode"]'(event: any, instance: any) {
        const newMode = event.target.value;
        setTooltipMode(newMode);
        instance.tooltipMode.set(newMode);

        // Update descriptions in place (much faster than recreating editor)
        const container = document.getElementById('stim-editor-container');
        if (container) {
            updateDescriptionsInPlace(container, STIM_TOOLTIPS, newMode);
        }
    },

    'click .cluster-select'(event: any, instance: any) {
        event.preventDefault();
        const idx = parseInt(event.currentTarget.getAttribute('data-index'), 10);
        if (Number.isNaN(idx)) return;
        persistCurrentWindow(instance);
        instance.currentClusterIndex.set(idx);
        renderClusterEditor(instance, idx);
    },

    'click .cluster-nav'(event: any, instance: any) {
        event.preventDefault();
        const dir = event.currentTarget.getAttribute('data-dir');
        const total = instance.clusters.length;
        const current = instance.currentClusterIndex.get();
        const step = instance.clusterWindowSize.get() || 1;
        if (total === 0) return;

        let nextIndex = current;
        if (dir === 'prev') {
            nextIndex = current - step;
            if (nextIndex < 0) {
                // wrap to last full window
                const remainder = total % step;
                nextIndex = remainder === 0 ? total - step : total - remainder;
            }
        } else if (dir === 'next') {
            nextIndex = current + step;
            if (nextIndex >= total) {
                nextIndex = 0;
            }
        }

        persistCurrentWindow(instance);
        instance.currentClusterIndex.set(nextIndex);
        renderClusterEditor(instance, nextIndex);
    },

    'change #cluster-window-size'(event: any, instance: any) {
        const newSize = parseInt(event.target.value, 10);
        if (![1, 5, 10, 20, 50].includes(newSize)) return;
        persistCurrentWindow(instance);
        instance.clusterWindowSize.set(newSize);

        // Align start index to the new window size bucket
        const start = instance.currentClusterIndex.get();
        const alignedStart = Math.min(start - (start % newSize), Math.max(0, instance.clusters.length - newSize));
        instance.currentClusterIndex.set(alignedStart);
        renderClusterEditor(instance, alignedStart);
    },

    // Generate Incorrect Responses - confirm button in modal
    'click #confirmGenerateBtn'(event: any, instance: any) {
        event.preventDefault();
        if (!instance.editor) return;

        const count = parseInt(((document.getElementById('distractorCount') as HTMLInputElement | null)?.value || '3'), 10) || 3;
        const result = generateIncorrectResponses(instance, count);

        // Close modal
        const modal = (globalThis as any).bootstrap.Modal.getInstance(document.getElementById('generateIncorrectModal') as any);
        if (modal) modal.hide();

        // Show result
        alert(`Generated ${count} incorrect response(s) for each of ${result.generated} stims (from pool of ${result.totalStims} total answers).`);
    },

    // Remove All Incorrect Responses
    'click #removeIncorrectBtn'(event: any, instance: any) {
        event.preventDefault();
        if (!instance.editor) return;

        if (!confirm('Remove all incorrect responses from all stims?\n\nThis will convert MC questions back to text input mode.')) {
            return;
        }

        const result = removeAllIncorrectResponses(instance);
        alert(`Removed incorrect responses from ${result.removed} stims.`);
    },

    async 'click .save-btn'(event: any, instance: any) {
        event.preventDefault();

        if (instance.saving.get() || !instance.editor) return;

        // Persist the current cluster window into the working set
        persistCurrentWindow(instance);

        // Use the full working set for save
        const editedClusters = instance.clusters;

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
                const summaryEl = document.getElementById('stim-validation-summary');
                if (summaryEl) {
                    summaryEl.scrollIntoView({ behavior: 'smooth' });
                }
                alert('Please fix the validation errors before saving.');
                return;
            }
        }

        instance.saving.set(true);

        try {
            // Get current TDF
            const tdf = findTdf(instance.tdfId);
            if (!tdf?.rawStimuliFile) {
                throw new Error('TDF data is not available for saving.');
            }

            // Build updated rawStimuliFile - wrap clusters back into setspec
            const updatedRawStimuli = clone(tdf.rawStimuliFile);
            updatedRawStimuli.setspec = { clusters: editedClusters };

            // We'll let the server regenerate the stimuli array from the raw file
            // This is cleaner than trying to rebuild it client-side
            await meteorCallAsync('saveTdfStimuli', instance.tdfId, updatedRawStimuli, null);

            showSaveFeedbackAndRedirect(instance, 'Saved. Returning to Content Manager...');
            instance.hasChanges.set(false);
            instance._hasPendingChanges = false;
            instance.editedClusters = {};

        } catch (error: any) {
            clientConsole(1, '[Content Edit] Error saving stimuli:', error);
            alert('Error saving stimuli: ' + (error.reason || error.message));
        } finally {
            instance.saving.set(false);
        }
    }
});

/**
 * Load the stimulus schema
 */
async function loadStimSchema(instance: any) {
    if (cachedStimSchema) {
        instance.schemaLoaded.set(true);
        return;
    }

    try {
        // Fetch schema from public folder
        const response = await fetch('/stimSchema.json');
        if (!response.ok) {
            throw new Error('Failed to load schema: ' + response.statusText);
        }
        cachedStimSchema = await response.json();
        instance.schemaLoaded.set(true);
    } catch (error: any) {
        clientConsole(1, '[Content Edit] Error loading stim schema:', error);
        alert('Error loading stimulus schema. Please refresh the page.');
    }
}

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
        const cleaned = obj
            .map(item => removeEmptyProperties(item))
            .filter(item => !isEmpty(item));
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
 * Convert long text inputs to expandable textareas and short textareas back to inputs
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
        const isLong = value.length > 50;

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

            textarea.rows = 3;
            textarea.style.resize = 'vertical';
            textarea.style.fontFamily = 'monospace';
            textarea.style.fontSize = '0.85em';
            textarea.style.overflow = 'hidden';

            // Replace input with textarea
            input.parentNode.replaceChild(textarea, input);

            // Add class to form-group to trigger full-width layout
            const formGroup = textarea.closest('.form-group');
            if (formGroup) {
                formGroup.classList.add('has-textarea');
                const colParent = formGroup.closest('[class*="col-"]');
                if (colParent) {
                    colParent.classList.add('has-textarea-parent');
                }
            }

            // Auto-expand function
            const autoExpand = () => {
                textarea.style.height = 'auto';
                const scrollHeight = textarea.scrollHeight;
                const minHeight = 50;
                const maxHeight = 400;
                textarea.style.height = Math.min(Math.max(scrollHeight, minHeight), maxHeight) + 'px';
                textarea.style.overflow = scrollHeight > maxHeight ? 'auto' : 'hidden';
            };

            textarea.addEventListener('input', autoExpand);

            // On blur, update json-editor's internal value
            if (editor && !textarea.dataset.hasBlurListener) {
                textarea.dataset.hasBlurListener = 'true';
                textarea.addEventListener('blur', () => {
                    const schemaPath = textarea.closest('[data-schemapath]')?.getAttribute('data-schemapath');
                    if (schemaPath) {
                        const fieldEditor = editor.getEditor(schemaPath);
                        if (fieldEditor && fieldEditor.setValue) {
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

        if (isShort && !hasNewlines) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = textarea.className;
            input.name = textarea.name;
            input.id = textarea.id;
            input.value = value;

            Array.from(textarea.attributes).forEach((attr: any) => {
                if (attr.name.startsWith('data-')) {
                    input.setAttribute(attr.name, attr.value);
                }
            });

            textarea.parentNode.replaceChild(input, textarea);

            const formGroup = input.closest('.form-group');
            if (formGroup) {
                formGroup.classList.remove('has-textarea');
                const colParent = formGroup.closest('[class*="col-"]');
                if (colParent) {
                    colParent.classList.remove('has-textarea-parent');
                }
            }

            if (editor && !input.dataset.hasBlurListener) {
                input.dataset.hasBlurListener = 'true';
                input.addEventListener('blur', () => {
                    const schemaPath = input.closest('[data-schemapath]')?.getAttribute('data-schemapath');
                    if (schemaPath) {
                        const fieldEditor = editor.getEditor(schemaPath);
                        if (fieldEditor && fieldEditor.setValue) {
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
 * Inject labels for form inputs that don't have them
 */
function injectLabelsForInputs(container: any, editor: any, rootArg?: any) {
    const root = rootArg || container;
    if (!root) return;

    const formGroups = root.matches && root.matches('.form-group')
        ? [root]
        : root.querySelectorAll('.form-group');

    formGroups.forEach((formGroup: any) => {
        const existingLabel = formGroup.querySelector('label');
        if (existingLabel) return;

        const input = formGroup.querySelector('input, select, textarea');
        if (!input) return;

        if (input.closest('td.compact')) return;

        const schemaPathElem = input.closest('[data-schemapath]');
        if (!schemaPathElem) return;

        const schemaPath = schemaPathElem.getAttribute('data-schemapath');
        if (!schemaPath) return;

        const editorInstance = editor.getEditor(schemaPath);
        if (!editorInstance || !editorInstance.schema) return;

        const title = editorInstance.schema.title || editorInstance.key;
        if (!title) return;

        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = title;
        label.setAttribute('for', input.id);

        input.parentNode.insertBefore(label, input);
    });
}

/**
 * Add human-readable titles to all schema properties
 */
function addTitlesToSchema(schema: any) {
    if (schema.type === 'object' && schema.properties) {
        for (const key in schema.properties) {
            const prop = schema.properties[key];

            if (!prop.title) {
                prop.title = key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();
            }

            if (prop.type === 'object') {
                addTitlesToSchema(prop);
            } else if (prop.type === 'array' && prop.items && prop.items.type === 'object') {
                addTitlesToSchema(prop.items);
            }
        }
    }
    return schema;
}

function syncClustersCount(instance: any) {
    if (!instance?.clustersCount) return;
    instance.clustersCount.set(instance.clusters.length);
}

function normalizeWindowValue(value: any) {
    return Array.isArray(value) ? value : [];
}

function updateChangeState(instance: any, windowValue: any) {
    if (!instance?.hasChanges) return;
    const baseline = instance._windowBaselineSerialized || JSON.stringify([]);
    const serialized = JSON.stringify(normalizeWindowValue(windowValue));
    const hasWindowChange = serialized !== baseline;
    const hasEditedClusters = Object.keys(instance.editedClusters || {}).length > 0;
    const hasChanges = hasWindowChange || hasEditedClusters;
    instance._hasPendingChanges = hasChanges;
    instance.hasChanges.set(hasChanges);
}

function updateClusterHeaders(instance: any, container: any) {
    if (!instance || !container) return;
    const start = instance.currentClusterIndex.get();
    const total = instance.clusters.length;
    const windowSize = instance.clusterWindowSize.get();

    for (let i = 0; i < windowSize; i++) {
        const absoluteIndex = start + i;
        if (absoluteIndex >= total) break;

        const name = `Cluster ${absoluteIndex + 1}`;
        const item = container.querySelector(`[data-schemapath="root.${i}"][data-schematype="object"]`);
        if (!item) continue;

        const header = item.querySelector('.card-header');
        if (!header) continue;

        const title = header.querySelector('.card-title, .je-object__title, h3, h4, h5, h6');
        if (title) {
            title.textContent = name;
        } else {
            header.textContent = name;
        }
    }
}

/**
 * Recompute cluster list metadata for sidebar rendering
 */
/**
 * Get a working copy of a cluster by index (edited if available)
 */
function getClusterData(instance: any, idx: any) {
    const fromEdits = instance.editedClusters[idx];
    if (fromEdits) return clone(fromEdits);
    return clone(instance.clusters[idx] || {});
}

/**
 * Persist the currently open window of clusters back into the working set
 */
function persistCurrentWindow(instance: any) {
    if (!instance.editor) return;

    const start = instance.currentClusterIndex.get();
    const value = instance.editor.getValue();
    const clustersInWindow = Array.isArray(value) ? value : [];

    clustersInWindow.forEach((cluster: any, offset: any) => {
        const idx = start + offset;
        if (idx >= instance.clusters.length) return;

        const existing = instance.clusters[idx];
        const serializedNew = JSON.stringify(cluster);
        const serializedExisting = JSON.stringify(existing);

        if (serializedNew !== serializedExisting) {
            instance.editedClusters[idx] = clone(cluster);
            instance.clusters[idx] = clone(cluster);
            instance._hasPendingChanges = true;
            instance.hasChanges.set(true);
        } else {
            delete instance.editedClusters[idx];
        }
    });

    updateChangeState(instance, instance.editor.getValue());
}

/**
 * Enhance media fields (imgSrc, audioSrc, videoSrc) with preview and upload capabilities
 */
function enhanceMediaFields(container: any, editor: any, instance: any, rootArg?: any) {
    const root = rootArg || container;
    if (!root) return;

    // Find all inputs that are media fields based on their data-schemapath
    const allInputs = root.matches && root.matches('input[type="text"]')
        ? [root]
        : root.querySelectorAll('input[type="text"]');

    if (!instance._mediaAssetCache) {
        instance._mediaAssetCache = new Map();
    }

    // Collect current media field values that look like local filenames
    const mediaFilenames = new Set();
    allInputs.forEach((input: any) => {
        const value = input.value?.trim();
        if (value && !value.includes('http://') && !value.includes('https://')) {
            if (!instance._mediaAssetCache.has(value)) {
                mediaFilenames.add(value);
            }
        }
    });

    // Batch query (globalThis as any).DynamicAssets and build lookup cache for uncached names
    if (mediaFilenames.size > 0) {
        (globalThis as any).DynamicAssets.find({ name: { $in: [...mediaFilenames] } }).forEach((asset: any) => {
            instance._mediaAssetCache.set(asset.name, asset);
        });
    }

    // Create cached resolver function (checks cache first, falls back to findOne for new values)
    const resolveMediaUrlCached = (src: any) => {
        if (!src) return '';
        if (src.includes('http://') || src.includes('https://')) return src;

        // Check cache first
        let asset = instance._mediaAssetCache.get(src);
        // Fall back to findOne for dynamically added values not in cache
        if (!asset) {
            asset = (globalThis as any).DynamicAssets.findOne({name: src});
            if (asset) instance._mediaAssetCache.set(src, asset); // Cache for future lookups
        }

        if (!asset) {
            
            return '';
        }

        // Use static (globalThis as any).DynamicAssets.link() for raw docs from cache
        let link = (globalThis as any).DynamicAssets.link({...asset});
        const pathMatch = link.match(/^https?:\/\/[^/]+(\/.+)$/);
        if (pathMatch) link = pathMatch[1];
        return link;
    };

    allInputs.forEach((input: any) => {
        // Check if this is a media field by looking at the schema path or name
        const formGroup = input.closest('.form-group');
        if (!formGroup) return;

        const label = formGroup.querySelector('label');
        const labelText = label?.textContent?.toLowerCase() || '';
        const inputName = input.name?.toLowerCase() || '';

        // Determine media type
        let mediaType = null;
        if (labelText.includes('imgsrc') || labelText.includes('image') || inputName.includes('imgsrc')) {
            mediaType = 'image';
        } else if (labelText.includes('audiosrc') || labelText.includes('audio') || inputName.includes('audiosrc')) {
            mediaType = 'audio';
        } else if (labelText.includes('videosrc') || labelText.includes('video') || inputName.includes('videosrc')) {
            mediaType = 'video';
        }

        if (!mediaType) return;

        // Skip if already enhanced
        if (input.dataset.mediaEnhanced) return;
        input.dataset.mediaEnhanced = 'true';

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'media-field-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        // Add preview area
        const preview = document.createElement('div');
        preview.className = 'media-preview';
        preview.style.display = input.value ? 'flex' : 'none';
        wrapper.appendChild(preview);

        // Add compact drop zone (icon only with tooltip)
        const dropZone = document.createElement('div');
        dropZone.className = 'media-drop-zone';
        dropZone.title = `Drop ${mediaType} or click to browse`;
        dropZone.innerHTML = `<i class="fa fa-cloud-upload drop-icon"></i><input type="file" accept="${getAcceptType(mediaType)}">`;
        wrapper.appendChild(dropZone);

        // Update preview when value changes
        const updatePreview = () => {
            const value = input.value?.trim();
            if (!value) {
                preview.style.display = 'none';
                preview.innerHTML = '';
                return;
            }

            // Resolve the media URL (uses cached lookup for performance)
            const resolvedUrl = resolveMediaUrlCached(value);

            preview.style.display = 'flex';

            if (!resolvedUrl) {
                preview.innerHTML = `<span class="media-error"><i class="fa fa-exclamation-triangle"></i> ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} not found: ${value}</span>`;
                return;
            }

            if (mediaType === 'image') {
                preview.innerHTML = `<img src="${resolvedUrl}" alt="Preview" onerror="this.outerHTML='<span class=\\'media-error\\'><i class=\\'fa fa-exclamation-triangle\\'></i> Image failed to load</span>'">`;
            } else if (mediaType === 'audio') {
                preview.innerHTML = `
                    <div class="audio-controls">
                        <audio controls src="${resolvedUrl}" onerror="this.outerHTML='<span class=\\'media-error\\'><i class=\\'fa fa-exclamation-triangle\\'></i> Audio failed to load</span>'"></audio>
                    </div>
                `;
            } else if (mediaType === 'video') {
                preview.innerHTML = `
                    <div class="video-controls">
                        <video controls src="${resolvedUrl}" onerror="this.outerHTML='<span class=\\'media-error\\'><i class=\\'fa fa-exclamation-triangle\\'></i> Video failed to load</span>'"></video>
                    </div>
                `;
            }
        };

        // Initial preview
        updatePreview();

        // Listen for input changes
        input.addEventListener('input', updatePreview);
        input.addEventListener('change', updatePreview);

        // File input handling
        const fileInput = dropZone.querySelector('input[type="file"]') as HTMLInputElement | null;

        dropZone.addEventListener('click', (e: any) => {
            if (e.target !== fileInput) {
                fileInput?.click();
            }
        });

        // Drag and drop handling
        dropZone.addEventListener('dragover', (e: any) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e: any) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleMediaUpload(files[0], mediaType, input, preview, instance);
            }
        });

        fileInput?.addEventListener('change', (e: any) => {
            if (e.target.files.length > 0) {
                handleMediaUpload(e.target.files[0], mediaType, input, preview, instance);
            }
        });
    });
}

/**
 * Get accepted file types for media input
 */
function getAcceptType(mediaType: any) {
    switch (mediaType) {
        case 'image': return 'image/*';
        case 'audio': return 'audio/*';
        case 'video': return 'video/*';
        default: return '*/*';
    }
}

/**
 * Handle media file upload using (globalThis as any).DynamicAssets (ostrio:files)
 */
async function handleMediaUpload(file: any, mediaType: any, input: any, preview: any, _instance?: any) {
    // Validate file type
    const validTypes: Record<string, string[]> = {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
        audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/m4a', 'audio/x-m4a'],
        video: ['video/mp4', 'video/webm', 'video/ogg']
    };

    if (!validTypes[mediaType]?.some(type => file.type.startsWith(type.split('/')[0]))) {
        alert(`Please select a valid ${mediaType} file.`);
        return;
    }

    // Show upload progress
    preview.style.display = 'flex';
    preview.innerHTML = `
        <div style="width: 100%;">
            <div class="d-flex align-items-center gap-2 mb-1">
                <i class="fa fa-spinner fa-spin"></i>
                <span>Uploading ${file.name}...</span>
            </div>
            <div class="progress media-upload-progress">
                <div class="progress-bar" role="progressbar" style="width: 0%"></div>
            </div>
        </div>
    `;

    try {
        // Check for existing file with same name
        const existingFile = (globalThis as any).DynamicAssets.findOne({ name: file.name, userId: Meteor.userId() });
        if (existingFile) {
            // Remove existing file before uploading new one
            await meteorCallAsync('removeAssetById', existingFile._id);
        }

        // Upload using (globalThis as any).DynamicAssets (ostrio:files)
        const upload = (globalThis as any).DynamicAssets.insert({
            file: file,
            chunkSize: 'dynamic'
        }, false);

        upload.on('progress', function(progress: any) {
            const progressBar = preview.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = progress + '%';
            }
        });

        upload.on('end', function(error: any, fileObj: any) {
            if (error) {
                clientConsole(1, '[Content Edit] Media upload error:', error);
                preview.innerHTML = `<span class="media-error"><i class="fa fa-exclamation-triangle"></i> Upload failed: ${error}</span>`;
            } else {
                // Success - update input with just the filename
                const filePath = (globalThis as any).DynamicAssets.link({...fileObj});
                input.value = file.name;
                input.dispatchEvent(new Event('change', { bubbles: true }));

                // Update preview
                preview.innerHTML = '';
                if (mediaType === 'image') {
                    preview.innerHTML = `<img src="${filePath}" alt="Preview"><span class="text-success ms-2"><i class="fa fa-check"></i> Uploaded</span>`;
                } else if (mediaType === 'audio') {
                    preview.innerHTML = `<audio controls src="${filePath}"></audio><span class="text-success ms-2"><i class="fa fa-check"></i> Uploaded</span>`;
                } else if (mediaType === 'video') {
                    preview.innerHTML = `<video controls src="${filePath}"></video><span class="text-success ms-2"><i class="fa fa-check"></i> Uploaded</span>`;
                }
            }
        });

        upload.on('error', function(error: any) {
            clientConsole(1, '[Content Edit] Media upload error:', error);
            preview.innerHTML = `<span class="media-error"><i class="fa fa-exclamation-triangle"></i> Upload failed: ${error}</span>`;
        });

        upload.start();
    } catch (error: any) {
        clientConsole(1, '[Content Edit] Media upload error:', error);
        preview.innerHTML = `<span class="media-error"><i class="fa fa-exclamation-triangle"></i> Upload failed: ${error.message || error}</span>`;
    }
}

/**
 * Initialize the json-editor for stimuli
 */
function initStimEditor(instance: any, tdf: any) {
    const container = document.getElementById('stim-editor-container');
    if (!container || !cachedStimSchema) return;

    // Apply hide-descriptions class if mode is 'none' on initial load
    const tooltipMode = instance.tooltipMode.get();
    if (tooltipMode === 'none') {
        container.classList.add('hide-descriptions');
    } else {
        container.classList.remove('hide-descriptions');
    }

    // Store original for comparison (just clusters, not the redundant setspec wrapper)
    instance.originalClusters = clone(tdf.rawStimuliFile.setspec.clusters);
    instance.originalStimuli = clone(tdf.stimuli || []);

    // Prepare data for editing - remove empty properties for cleaner display
    instance.clusters = removeEmptyProperties(clone(tdf.rawStimuliFile.setspec.clusters));
    syncClustersCount(instance);
    instance.currentClusterIndex.set(0);
    instance._hasPendingChanges = false;
    instance.hasChanges.set(false);

    // Build single-cluster schema (array with one item) so validators still run on expected paths
    const clustersSchema = clone(cachedStimSchema.properties?.setspec?.properties?.clusters || {});
    if (clustersSchema.items) {
        clustersSchema.items.title = 'Cluster';
        if (clustersSchema.items.properties?.stims) {
            clustersSchema.items.properties.stims.title = 'Stims ';
            if (clustersSchema.items.properties.stims.items) {
                clustersSchema.items.properties.stims.items.title = 'Stim';
            }
        }
    }
    addTitlesToSchema(clustersSchema);

    const singleClusterSchema = {
        type: 'array',
        title: 'Cluster',
        items: clustersSchema.items || {}
    };

    // Inject tooltip descriptions based on current mode (brief or verbose)
    instance.clusterSchema = injectDescriptions(singleClusterSchema, STIM_TOOLTIPS, tooltipMode);

    renderClusterEditor(instance, instance.currentClusterIndex.get());
}

/**
 * Render a single cluster into the editor (virtualized editing)
 */
function renderClusterEditor(instance: any, clusterIndex: any) {
    const container = document.getElementById('stim-editor-container');
    if (!container || !instance.clusterSchema) return;

    const total = instance.clusters.length;
    if (total === 0) {
        container.innerHTML = '<div class="text-muted small">No clusters to edit.</div>';
        return;
    }
    const windowSize = instance.clusterWindowSize.get();
    const safeIndex = Math.min(clusterIndex, Math.max(0, total - 1));
    instance.currentClusterIndex.set(safeIndex);

    // Tear down any existing editor/observer
    if (instance.domObserver) {
        instance.domObserver.disconnect();
        instance.domObserver = null;
    }
    if (instance.fieldObserver) {
        instance.fieldObserver.disconnect();
        instance.fieldObserver = null;
    }
    if (instance._inputHandler) {
        container.removeEventListener('input', instance._inputHandler, true);
        instance._inputHandler = null;
    }
    if (instance._blurHandler) {
        container.removeEventListener('blur', instance._blurHandler, true);
        instance._blurHandler = null;
    }
    if (instance.validationAutorun) {
        instance.validationAutorun.stop();
        instance.validationAutorun = null;
    }
    if (instance.editor) {
        instance.editor.destroy();
        instance.editor = null;
    }
    if (instance.validator) {
        instance.validator.destroy();
    }

    const slice: any[] = [];
    for (let i = 0; i < windowSize; i++) {
        const idx = safeIndex + i;
        if (idx >= instance.clusters.length) break;
        slice.push(getClusterData(instance, idx));
    }

    const options = {
        schema: instance.clusterSchema,
        startval: slice,
        theme: 'bootstrap5',
        iconlib: 'fontawesome4',
        disable_edit_json: false,
        disable_properties: false,
        disable_collapse: false,
        disable_array_add: false,
        disable_array_delete: false,
        disable_array_reorder: false,
        enable_array_copy: true,
        array_controls_top: true,
        no_additional_properties: true,
        required_by_default: false,
        display_required_only: false,
        show_opt_in: false,
        remove_empty_properties: true,
        prompt_before_delete: true,
        object_layout: 'grid',
        compact: false,
        keep_oneof_values: false
    };

    if (typeof (globalThis as any).JSONEditor === 'undefined') {
        clientConsole(1, '[Content Edit] JSONEditor not loaded. Make sure json-editor CDN is included.');
        alert('Editor library not loaded. Please refresh the page.');
        return;
    }

    instance.editor = new (globalThis as any).JSONEditor(container, options);

    let isInitializing = true;
    let modalObserverTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingActionNodes: any[] = [];

    instance.editor.on('ready', () => {
        const currentValue = instance.editor.getValue();
        if (!Array.isArray(currentValue) || currentValue.length === 0) {
            instance.editor.setValue(slice);
        }
        Meteor.defer(() => updateClusterHeaders(instance, container));

        // Mark editor as ready so loading spinner hides
        instance.editorReady.set(true);

        convertLongInputsToTextareas(container, instance.editor);
        injectLabelsForInputs(container, instance.editor);
        enhanceMediaFields(container, instance.editor, instance);
        updateClusterHeaders(instance, container);

        // Build description cache for instant mode switching
        buildDescriptionCache(container, STIM_TOOLTIPS);

        // Move array field descriptions to after the items container
        moveArrayDescriptionsToEnd(container);

        // Change "properties" button text
        container.querySelectorAll('.json-editor-btntype-properties').forEach(btn => {
            const span = btn.querySelector('span');
            if (span && span.textContent.trim().toLowerCase() === 'properties') {
                span.textContent = ' Edit Properties';
            }
        });

        instance._hasPendingChanges = instance._hasPendingChanges || false;

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
            const summaryContainer = document.getElementById('stim-validation-summary');
            if (summaryContainer) {
                summaryContainer.innerHTML = createValidationSummary(errors, warnings);
                initValidationUI(summaryContainer, container);
            }

            // Apply field-level styling
            applyFieldErrors(container, results);
        });

        const baselineValue = instance.editor.getValue();
        instance._windowBaselineSerialized = JSON.stringify(normalizeWindowValue(baselineValue));
        updateChangeState(instance, baselineValue);
        isInitializing = false;
    });

    // Listen for changes
    instance.editor.on('change', () => {
        if (isInitializing) return;
        updateChangeState(instance, instance.editor.getValue());

        // Run validation (debounced)
        instance.validator.validate();
    });

    // Convert long inputs to textareas on-the-fly, and revert on blur if short
    const handleInput = (event: any) => {
        const target = event.target;
        if (target && target.matches && target.matches('input[type="text"]')) {
            convertLongInputsToTextareas(container, instance.editor, target);
        }
    };
    const handleBlur = (event: any) => {
        const target = event.target;
        if (target && target.matches && target.matches('textarea.form-control')) {
            if (!target.closest('.je-modal')) {
                convertLongInputsToTextareas(container, instance.editor, target);
            }
        }
    };
    container.addEventListener('input', handleInput, true);
    container.addEventListener('blur', handleBlur, true);
    instance._inputHandler = handleInput;
    instance._blurHandler = handleBlur;

    // Process newly-added fields only (avoid full-container rescans)
    let fieldObserverTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingFieldNodes: any[] = [];
    const processFieldNodes = () => {
        const nodesToProcess = pendingFieldNodes;
        pendingFieldNodes = [];
        fieldObserverTimer = null;

        nodesToProcess.forEach(node => {
            if (node.nodeType !== 1) return;
            convertLongInputsToTextareas(container, instance.editor, node);
            injectLabelsForInputs(container, instance.editor, node);
            enhanceMediaFields(container, instance.editor, instance, node);
        });
        updateClusterHeaders(instance, container);
    };
    const fieldObserver = new MutationObserver((mutations: any) => {
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

    const processPendingNodes = () => {
        const nodesToProcess = pendingActionNodes;
        pendingActionNodes = [];
        modalObserverTimer = null;

        nodesToProcess.forEach(node => {
            if (node.nodeType !== 1) return;

            // Find je-modal in this specific added node
            const modals = node.classList?.contains('je-modal') ? [node] :
                (node.querySelectorAll ? Array.from(node.querySelectorAll('.je-modal')) : []);

            for (const modal of modals) {
                // Skip if already processed
                if (modal.dataset.labelsProcessed) continue;
                modal.dataset.labelsProcessed = 'true';

                sortPropertiesModal(modal);
            }

            // Fix "properties" button text in added nodes only
            const buttons = node.classList?.contains('json-editor-btntype-properties') ? [node] :
                (node.querySelectorAll ? node.querySelectorAll('.json-editor-btntype-properties') : []);
            buttons.forEach((btn: any) => {
                const span = btn.querySelector('span');
                if (span && span.textContent.trim().toLowerCase() === 'properties') {
                    span.textContent = ' Edit Properties';
                }
            });
        });
    };

    const observer = new MutationObserver((mutations: any) => {
        let sawActionable = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;

                const hasModal = node.classList?.contains('je-modal') || (node.querySelector && node.querySelector('.je-modal'));
                const hasPropsButton = node.classList?.contains('json-editor-btntype-properties') ||
                    (node.querySelector && node.querySelector('.json-editor-btntype-properties'));

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
}

/**
 * Generate incorrect responses for all stims by selecting from other correct answers across ALL clusters
 * @param {Object} instance - Template instance with editor
 * @param {number} count - Number of distractors per stim
 * @returns {Object} - { generated: number, totalStims: number }
 */
function generateIncorrectResponses(instance: any, count: any) {
    persistCurrentWindow(instance);
    const clusters = instance.clusters.map(clone);
    let generated = 0;
    let totalStims = 0;

    // First pass: collect ALL correct answers from ALL stims across ALL clusters
    const allAnswers: any[] = [];
    clusters.forEach((cluster: any) => {
        if (!cluster.stims) return;
        cluster.stims.forEach((stim: any) => {
            const answer = stim.response?.correctResponse;
            if (answer) {
                allAnswers.push(answer);
                totalStims++;
            }
        });
    });

    // Second pass: for each stim, select random distractors from all OTHER answers
    clusters.forEach((cluster: any) => {
        if (!cluster.stims) return;

        cluster.stims.forEach((stim: any) => {
            const currentAnswer = stim.response?.correctResponse;
            if (!currentAnswer) return;

            const distractors = [];
            if (count > 0 && allAnswers.length > 1) {
                const used = new Set([currentAnswer]);
                const maxAttempts = Math.max(20, allAnswers.length * 2);
                let attempts = 0;
                while (distractors.length < count && attempts < maxAttempts) {
                    const candidate = allAnswers[Math.floor(Math.random() * allAnswers.length)];
                    if (!used.has(candidate)) {
                        used.add(candidate);
                        distractors.push(candidate);
                    }
                    attempts++;
                }
            }

            // Ensure response object exists and set incorrectResponses
            if (!stim.response) stim.response = {};
            stim.response.incorrectResponses = distractors;
            generated++;
        });
    });

    // Mark all clusters as edited and refresh state
    clusters.forEach((cluster: any, idx: any) => {
        instance.editedClusters[idx] = clone(cluster);
    });
    instance.clusters = clusters;
    syncClustersCount(instance);
    instance._hasPendingChanges = true;
    instance.hasChanges.set(true);
    renderClusterEditor(instance, instance.currentClusterIndex.get());
    return { generated, totalStims };
}

/**
 * Remove all incorrect responses from all stims
 * @param {Object} instance - Template instance with editor
 * @returns {Object} - { removed: number }
 */
function removeAllIncorrectResponses(instance: any) {
    persistCurrentWindow(instance);
    const clusters = instance.clusters.map(clone);
    let removed = 0;

    clusters.forEach((cluster: any) => {
        if (!cluster.stims) return;

        cluster.stims.forEach((stim: any) => {
            if (stim.response?.incorrectResponses?.length > 0) {
                stim.response.incorrectResponses = [];
                removed++;
            }
        });
    });

    clusters.forEach((cluster: any, idx: any) => {
        instance.editedClusters[idx] = clone(cluster);
    });
    instance.clusters = clusters;
    syncClustersCount(instance);
    instance._hasPendingChanges = true;
    instance.hasChanges.set(true);
    renderClusterEditor(instance, instance.currentClusterIndex.get());
    return { removed };
}







