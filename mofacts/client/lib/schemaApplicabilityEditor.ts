import {
  detectTdfUnitType,
  unitTypeApplies,
  type TdfUnitType,
} from '../../common/fieldApplicability';

type JsonEditorLike = {
  getEditor?: (path: string) => any;
  getValue?: () => any;
};

type ApplicabilityController = {
  sync: (node?: Element | Document | null) => void;
  destroy: () => void;
};

function asArray(value: unknown): readonly TdfUnitType[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is TdfUnitType =>
        entry === 'learning' || entry === 'assessment' || entry === 'video' || entry === 'instructions'
      )
    : undefined;
}

function getUnitPathFromConfigPath(path: string): string | null {
  const standard = path.match(/^(root(?:\.tutor)?\.unit\.\d+)(?:\.|$)/);
  if (standard?.[1]) {
    return standard[1];
  }
  const template = path.match(/^(root(?:\.tutor)?\.setspec\.unitTemplate\.\d+)(?:\.|$)/);
  return template?.[1] || null;
}

function getUnitValue(editor: JsonEditorLike, unitPath: string | null): unknown {
  if (!unitPath) {
    return null;
  }
  const unitEditor = editor.getEditor?.(unitPath);
  if (unitEditor?.getValue) {
    return unitEditor.getValue();
  }
  const value = editor.getValue?.();
  const parts = unitPath.split('.').slice(1);
  return parts.reduce((acc: any, part) => acc?.[part], value);
}

function getObjectPathFromButton(button: Element): string | null {
  const objectNode = button.closest('[data-schemapath]');
  return objectNode?.getAttribute('data-schemapath') || null;
}

function getSchemaForProperty(editor: JsonEditorLike, objectPath: string, key: string): Record<string, unknown> {
  const directSchema = editor.getEditor?.(`${objectPath}.${key}`)?.schema;
  if (directSchema && typeof directSchema === 'object') {
    return directSchema;
  }
  const objectSchema = editor.getEditor?.(objectPath)?.schema;
  const propertySchema = objectSchema?.properties?.[key];
  return propertySchema && typeof propertySchema === 'object' ? propertySchema : {};
}

function propertyApplies(schema: Record<string, unknown>, unitType: TdfUnitType | null): boolean {
  if (schema['x-editor'] === false) {
    return false;
  }
  return unitTypeApplies(asArray(schema['x-appliesToUnitTypes']), unitType);
}

function normalizeLabel(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function checkboxPropertyKey(editor: JsonEditorLike, objectPath: string, group: Element): string | null {
  const input = group.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  const value = input?.value || input?.getAttribute('name') || '';
  if (value && !value.includes('[') && !value.includes('.')) {
    return value;
  }
  const text = group.textContent?.trim() || '';
  if (!text) {
    return null;
  }
  const objectSchema = editor.getEditor?.(objectPath)?.schema;
  const properties = objectSchema?.properties || {};
  const normalizedText = normalizeLabel(text);
  for (const [key, schema] of Object.entries(properties)) {
    const title = typeof (schema as Record<string, unknown>).title === 'string'
      ? String((schema as Record<string, unknown>).title)
      : key;
    if (normalizeLabel(key) === normalizedText || normalizeLabel(title) === normalizedText) {
      return key;
    }
  }
  return null;
}

function filterPropertiesModal(editor: JsonEditorLike, modal: Element, objectPath: string | null): void {
  if (!objectPath || !/\.((uiSettings)|(deliveryparams))$/.test(objectPath)) {
    return;
  }
  const unitPath = getUnitPathFromConfigPath(objectPath);
  if (!unitPath) {
    return;
  }
  const unitType = detectTdfUnitType(getUnitValue(editor, unitPath));
  modal.querySelectorAll(':scope > .form-group').forEach((group) => {
    const key = checkboxPropertyKey(editor, objectPath, group);
    if (!key) {
      return;
    }
    const schema = getSchemaForProperty(editor, objectPath, key);
    if (!propertyApplies(schema, unitType)) {
      (group as HTMLElement).remove();
    }
  });
}

export function installSchemaApplicabilityControls(
  container: HTMLElement,
  editor: JsonEditorLike
): ApplicabilityController {
  let activePropertiesObjectPath: string | null = null;

  const clickHandler = (event: Event) => {
    const target = event.target as Element | null;
    const button = target?.closest?.('.json-editor-btntype-properties');
    if (!button) {
      return;
    }
    activePropertiesObjectPath = getObjectPathFromButton(button);
  };

  const sync = (node?: Element | Document | null) => {
    const root = node || container;
    const modals = root instanceof Element && root.classList.contains('je-modal')
      ? [root]
      : Array.from(root.querySelectorAll?.('.je-modal') || []);
    for (const modal of modals) {
      filterPropertiesModal(editor, modal, activePropertiesObjectPath);
    }
  };

  container.addEventListener('click', clickHandler, true);

  return {
    sync,
    destroy() {
      container.removeEventListener('click', clickHandler, true);
    },
  };
}
