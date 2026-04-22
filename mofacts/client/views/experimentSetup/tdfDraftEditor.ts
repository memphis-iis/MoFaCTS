import { clientConsole } from '../../lib/clientLogger';

const JSONEditorAny = (globalThis as any).JSONEditor;

let cachedSchema: any = null;

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

  const objectNodes = root.matches?.('[data-schemapath][data-schematype="object"]')
    ? [root]
    : root.querySelectorAll?.('[data-schemapath][data-schematype="object"]');
  objectNodes?.forEach((node: any) => {
    const schemaPath = node.getAttribute('data-schemapath');
    if (!schemaPath || schemaPath === 'root') return;
    const objectEditor = editor.getEditor(schemaPath);
    const title = objectEditor?.schema?.title || formatSchemaKey(objectEditor?.key || '');
    if (!title) return;

    const titleEl = node.querySelector(':scope > .card-header .card-title, :scope > .card-header h3, :scope > .card-header h4, :scope > .card-header h5, :scope > .card-header h6, :scope > .je-object__title');
    if (titleEl && !/^Unit\s+\d+$/i.test(titleEl.textContent?.trim() || '')) {
      titleEl.textContent = title;
    }
  });
}

async function loadTdfSchema() {
  if (!cachedSchema) {
    const response = await fetch('/tdfSchema.json');
    if (!response.ok) {
      throw new Error(`Failed to load TDF schema: ${response.status}`);
    }
    cachedSchema = await response.json();
  }
  return cachedSchema;
}

type DraftEditorHandle = {
  destroy: () => void;
  getValue: () => Record<string, unknown>;
  setValue: (value: Record<string, unknown>) => void;
  validate: () => any[];
};

export async function createTdfDraftEditor(
  container: HTMLElement,
  initialValue: Record<string, unknown>,
  onChange: (value: Record<string, unknown>) => void
): Promise<DraftEditorHandle> {
  if (!JSONEditorAny) {
    throw new Error('JSONEditor is not loaded.');
  }

  const schema = await loadTdfSchema();
  const editorValue = removeEmptyProperties(initialValue);
  const wrappedSchema = {
    type: 'object',
    properties: {
      tutor: schema.properties?.tutor || {}
    },
    required: ['tutor']
  };
  addTitlesToSchema(wrappedSchema);

  let isApplyingValue = false;
  let chromeObserver: MutationObserver | null = null;
  const editor = new JSONEditorAny(container, {
    schema: wrappedSchema,
    startval: { tutor: editorValue },
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

  editor.on('change', () => {
    if (isApplyingValue) {
      return;
    }
    try {
      const value = editor.getValue()?.tutor || {};
      onChange(value);
    } catch (error) {
      clientConsole(1, '[Draft TDF Editor] Change handling failed:', error);
    }
  });

  editor.on('ready', () => {
    syncDraftEditorChrome(container, editor);
    chromeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          syncDraftEditorChrome(container, editor, node as HTMLElement);
        }
      }
    });
    chromeObserver.observe(container, { childList: true, subtree: true });
  });

  return {
    destroy() {
      chromeObserver?.disconnect();
      editor.destroy();
    },
    getValue() {
      return editor.getValue()?.tutor || {};
    },
    setValue(value: Record<string, unknown>) {
      isApplyingValue = true;
      editor.setValue({ tutor: removeEmptyProperties(value) });
      isApplyingValue = false;
    },
    validate() {
      return editor.validate();
    }
  };
}
