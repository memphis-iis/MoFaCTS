import { clientConsole } from '../../lib/clientLogger';
import { sortPropertiesModal } from '../../lib/schemaApplicabilityEditor';

const JSONEditorAny = (globalThis as any).JSONEditor;

let cachedSchema: any = null;

const WINDOW_SIZE_OPTIONS = [1, 5, 10, 20, 50];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function formatSchemaKey(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str: string) => str.toUpperCase())
    .trim();
}

function isEmpty(value: any) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && Object.keys(value).length === 0) return true;
  return false;
}

function removeEmptyProperties(obj: any): any {
  if (Array.isArray(obj)) {
    const cleaned = obj.map((item: any) => removeEmptyProperties(item)).filter((item: any) => !isEmpty(item));
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

function addTitlesToSchema(schema: any): any {
  if (schema?.type === 'object' && schema.properties) {
    for (const key in schema.properties) {
      const prop = schema.properties[key];
      if (!prop.title || prop.title === key) {
        prop.title = formatSchemaKey(key);
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

function syncDraftEditorChrome(container: HTMLElement, editor: any, rootArg?: ParentNode | HTMLElement) {
  const root: any = rootArg || container;
  if (!root) return;

  const propertyButtons = root.matches?.('.json-editor-btntype-properties')
    ? [root]
    : root.querySelectorAll?.('.json-editor-btntype-properties');
  propertyButtons?.forEach((btn: any) => {
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    const span = btn.querySelector('span');
    if (span) {
      span.textContent = ' Edit Properties';
    }
  });

  const editJsonButtons = root.matches?.('.json-editor-btntype-editjson')
    ? [root]
    : root.querySelectorAll?.('.json-editor-btntype-editjson');
  editJsonButtons?.forEach((btn: any) => {
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    const span = btn.querySelector('span');
    if (span && !span.textContent.trim()) {
      span.textContent = ' JSON';
    }
  });

  const labels = root.matches?.('.form-group')
    ? [root]
    : root.querySelectorAll?.('.form-group');
  labels?.forEach((formGroup: any) => {
    const input = formGroup.querySelector('input, select, textarea');
    if (!input || input.closest('.je-modal')) return;
    const schemaPath = input.closest('[data-schemapath]')?.getAttribute('data-schemapath');
    if (!schemaPath) return;
    const fieldEditor = editor.getEditor(schemaPath);
    const title = fieldEditor?.schema?.title || formatSchemaKey(fieldEditor?.key || '');
    if (!title) return;

    let label = formGroup.querySelector('label');
    if (!label) {
      label = document.createElement('label');
      formGroup.insertBefore(label, input);
    }
    label.className = 'form-label';
    label.textContent = title;
    if (input.id) {
      label.setAttribute('for', input.id);
    }
  });

  const modals = root.matches?.('.je-modal')
    ? [root]
    : root.querySelectorAll?.('.je-modal');
  modals?.forEach((modal: Element) => sortPropertiesModal(modal));
}

async function loadStimSchema() {
  if (!cachedSchema) {
    const response = await fetch('/stimSchema.json');
    if (!response.ok) {
      throw new Error(`Failed to load stimulus schema: ${response.status}`);
    }
    cachedSchema = await response.json();
  }
  return cachedSchema;
}

function extractClustersSchema(schema: any) {
  const clustersSchema = clone(schema.properties?.setspec?.properties?.clusters || {});
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
  return {
    type: 'array',
    title: 'Cluster',
    items: clustersSchema.items || {}
  };
}

function getAbsoluteClusterPath(startIndex: number, relativePath: string) {
  return relativePath.replace(/^root\.(\d+)/, (_match, relativeIndex) => `root.${startIndex + Number(relativeIndex)}`);
}

function clampWindowStart(nextIndex: number, total: number, _windowSize: number) {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, nextIndex), Math.max(0, total - 1));
}

type DraftEditorHandle = {
  destroy: () => void;
  getValue: () => Record<string, unknown>;
  setValue: (value: Record<string, unknown>) => void;
  validate: () => any[];
};

export async function createContentDraftEditor(
  container: HTMLElement,
  initialValue: Record<string, unknown>,
  _onChange: (value: Record<string, unknown>) => void
): Promise<DraftEditorHandle> {
  if (!JSONEditorAny) {
    throw new Error('JSONEditor is not loaded.');
  }

  const schema = await loadStimSchema();
  const clusterSchema = extractClustersSchema(schema);

  const state: {
    rootValue: Record<string, any>;
    clusters: any[];
    currentClusterIndex: number;
    windowSize: number;
    editor: any;
    chromeObserver: MutationObserver | null;
    validationErrorsByKey: Map<string, any[]>;
  } = {
    rootValue: {},
    clusters: [],
    currentClusterIndex: 0,
    windowSize: 1,
    editor: null,
    chromeObserver: null,
    validationErrorsByKey: new Map()
  };

  container.innerHTML = `
    <div class="draft-content-editor">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <button type="button" class="btn btn-outline-secondary btn-sm draft-content-prev">Previous</button>
          <div class="small text-muted draft-content-status"></div>
          <button type="button" class="btn btn-outline-secondary btn-sm draft-content-next">Next</button>
        </div>
        <div class="d-flex align-items-center gap-2">
          <label class="small mb-0" for="draft-content-window-size">Show</label>
          <select class="form-control form-control-sm" id="draft-content-window-size" style="width:auto;">
            ${WINDOW_SIZE_OPTIONS.map((size) => `<option value="${size}">${size}</option>`).join('')}
          </select>
          <span class="small text-muted">cluster(s) at a time</span>
        </div>
      </div>
      <div class="alert alert-info py-2 px-3 small mb-3">
        Editing is windowed for performance. The full lesson stays intact, but only the visible cluster range is rendered at one time.
      </div>
      <div class="draft-content-editor-host"></div>
    </div>
  `;

  const statusElement = container.querySelector('.draft-content-status') as HTMLElement | null;
  const hostElement = container.querySelector('.draft-content-editor-host') as HTMLElement | null;
  const prevElement = container.querySelector('.draft-content-prev') as HTMLButtonElement | null;
  const nextElement = container.querySelector('.draft-content-next') as HTMLButtonElement | null;
  const sizeElement = container.querySelector('#draft-content-window-size') as HTMLSelectElement | null;

  if (!statusElement || !hostElement || !prevElement || !nextElement || !sizeElement) {
    throw new Error('Failed to initialize draft content editor controls.');
  }

  const statusEl = statusElement;
  const hostEl = hostElement;
  const prevButton = prevElement;
  const nextButton = nextElement;
  const sizeSelect = sizeElement;

  function buildValue() {
    return removeEmptyProperties({
      ...state.rootValue,
      setspec: {
        ...(state.rootValue.setspec || {}),
        clusters: clone(state.clusters)
      }
    });
  }

  function getWindowSlice() {
    const slice: any[] = [];
    for (let offset = 0; offset < state.windowSize; offset += 1) {
      const absoluteIndex = state.currentClusterIndex + offset;
      if (absoluteIndex >= state.clusters.length) break;
      slice.push(clone(state.clusters[absoluteIndex] || {}));
    }
    return slice;
  }

  function updateToolbar() {
    const total = state.clusters.length;
    if (total === 0) {
      statusEl.textContent = 'No clusters';
      prevButton.disabled = true;
      nextButton.disabled = true;
      return;
    }

    const start = state.currentClusterIndex + 1;
    const end = Math.min(state.currentClusterIndex + state.windowSize, total);
    statusEl.textContent = `Clusters ${start}-${end} of ${total}`;
    prevButton.disabled = total <= state.windowSize;
    nextButton.disabled = total <= state.windowSize;
    sizeSelect.value = String(state.windowSize);
  }

  function destroyEditor() {
    state.chromeObserver?.disconnect();
    state.chromeObserver = null;
    if (state.editor) {
      state.editor.destroy();
      state.editor = null;
    }
    hostEl.innerHTML = '';
  }

  function clearWindowValidation(start: number, count: number) {
    for (let offset = 0; offset < count; offset += 1) {
      state.validationErrorsByKey.delete(`cluster:${start + offset}`);
    }
    state.validationErrorsByKey.delete(`window:${start}`);
  }

  function persistCurrentWindow() {
    if (!state.editor) {
      return;
    }

    const start = state.currentClusterIndex;
    const windowValue = Array.isArray(state.editor.getValue()) ? state.editor.getValue() : [];
    windowValue.forEach((cluster: any, offset: number) => {
      const absoluteIndex = start + offset;
      if (absoluteIndex >= state.clusters.length) return;
      state.clusters[absoluteIndex] = clone(cluster);
    });

    const errors = state.editor.validate() || [];
    clearWindowValidation(start, windowValue.length);
    errors.forEach((error: any) => {
      const match = typeof error?.path === 'string' ? error.path.match(/^root\.(\d+)/) : null;
      if (match) {
        const absoluteIndex = start + Number(match[1]);
        const key = `cluster:${absoluteIndex}`;
        const entry = {
          ...error,
          path: getAbsoluteClusterPath(start, error.path)
        };
        const existing = state.validationErrorsByKey.get(key) || [];
        existing.push(entry);
        state.validationErrorsByKey.set(key, existing);
      } else {
        const key = `window:${start}`;
        const existing = state.validationErrorsByKey.get(key) || [];
        existing.push(error);
        state.validationErrorsByKey.set(key, existing);
      }
    });
  }

  function renderEditor() {
    destroyEditor();
    updateToolbar();

    if (state.clusters.length === 0) {
      hostEl.innerHTML = '<div class="text-muted small">No clusters to edit.</div>';
      return;
    }

    const editor = new JSONEditorAny(hostEl, {
      schema: clusterSchema,
      startval: getWindowSlice(),
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
    });

    state.editor = editor;
    editor.on('ready', () => {
      syncDraftEditorChrome(hostEl, editor);
      state.chromeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            syncDraftEditorChrome(hostEl, editor, node as HTMLElement);
          }
        }
      });
      state.chromeObserver.observe(hostEl, { childList: true, subtree: true });
    });
  }

  function moveWindow(direction: 'prev' | 'next') {
    if (state.clusters.length <= state.windowSize) {
      return;
    }

    persistCurrentWindow();
    const step = state.windowSize;
    const total = state.clusters.length;
    if (direction === 'prev') {
      const nextIndex = state.currentClusterIndex - step;
      state.currentClusterIndex = nextIndex < 0
        ? Math.max(0, total - step)
        : nextIndex;
    } else {
      const nextIndex = state.currentClusterIndex + step;
      state.currentClusterIndex = nextIndex >= total ? 0 : nextIndex;
    }
    renderEditor();
  }

  prevButton.addEventListener('click', () => moveWindow('prev'));
  nextButton.addEventListener('click', () => moveWindow('next'));
  sizeSelect.addEventListener('change', () => {
    const nextSize = Number(sizeSelect.value);
    if (!WINDOW_SIZE_OPTIONS.includes(nextSize)) {
      return;
    }
    persistCurrentWindow();
    state.windowSize = nextSize;
    state.currentClusterIndex = clampWindowStart(state.currentClusterIndex, state.clusters.length, state.windowSize);
    renderEditor();
  });

  function applyValue(value: Record<string, unknown>) {
    const normalized = removeEmptyProperties(clone(value || {}));
    state.rootValue = normalized;
    state.clusters = clone(normalized?.setspec?.clusters || []);
    state.currentClusterIndex = clampWindowStart(state.currentClusterIndex, state.clusters.length, state.windowSize);
    state.validationErrorsByKey.clear();
    renderEditor();
  }

  applyValue(initialValue);

  return {
    destroy() {
      destroyEditor();
      container.innerHTML = '';
    },
    getValue() {
      persistCurrentWindow();
      return buildValue();
    },
    setValue(value: Record<string, unknown>) {
      applyValue(value);
    },
    validate() {
      persistCurrentWindow();
      const aggregatedErrors = Array.from(state.validationErrorsByKey.values()).flat();
      if (aggregatedErrors.length > 0) {
        clientConsole(2, '[Draft Content Editor] Validation errors found:', aggregatedErrors.length);
      }
      return aggregatedErrors;
    }
  };
}
