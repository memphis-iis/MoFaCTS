type UnknownRecord = Record<string, unknown>;

const PRUNE = Symbol('prune-editor-only-empty-value');

function isPlainRecord(value: unknown): value is UnknownRecord {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function hasOwn(value: unknown, key: string): boolean {
  return isPlainRecord(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function cloneJsonLike<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonLike(item)) as T;
  }
  if (isPlainRecord(value)) {
    const cloned: UnknownRecord = {};
    for (const [key, childValue] of Object.entries(value)) {
      cloned[key] = cloneJsonLike(childValue);
    }
    return cloned as T;
  }
  return value;
}

function isEmptyEditorDefault(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return isPlainRecord(value) && Object.keys(value).length === 0;
}

/** Clean editor defaults without interpreting fields whose schema marks them ignored. */
export function removeEmptyEditorProperties(value: unknown, schema: UnknownRecord = {}): any {
  if (schema.format === 'ignored') return cloneJsonLike(value);
  if (Array.isArray(value)) {
    const itemSchema = isPlainRecord(schema.items) ? schema.items : {};
    return value.map(item => removeEmptyEditorProperties(item, itemSchema))
      .filter(item => !isEmptyEditorDefault(item));
  }
  if (isPlainRecord(value)) {
    const properties = isPlainRecord(schema.properties) ? schema.properties : {};
    const cleaned: UnknownRecord = {};
    for (const [key, child] of Object.entries(value)) {
      const childSchema = isPlainRecord(properties[key]) ? properties[key] : {};
      const next = removeEmptyEditorProperties(child, childSchema);
      if (childSchema.format === 'ignored' || !isEmptyEditorDefault(next)) cleaned[key] = next;
    }
    return cleaned;
  }
  return value;
}

function overlayEditorValue(sourceValue: unknown, editorValue: unknown, sourceHadValue: boolean, schema: UnknownRecord): unknown | typeof PRUNE {
  if (schema.format === 'ignored') return cloneJsonLike(editorValue);
  if (!sourceHadValue && isEmptyEditorDefault(editorValue)) {
    return PRUNE;
  }

  if (Array.isArray(editorValue)) {
    if (!sourceHadValue && editorValue.length === 0) {
      return PRUNE;
    }
    const sourceArray = Array.isArray(sourceValue) ? sourceValue : [];
    const overlaid = editorValue.map((item, index) => {
      const sourceHadItem = index < sourceArray.length;
      const value = overlayEditorValue(sourceArray[index], item, sourceHadItem, isPlainRecord(schema.items) ? schema.items : {});
      return value === PRUNE ? cloneJsonLike(item) : value;
    });
    return overlaid;
  }

  if (isPlainRecord(editorValue)) {
    const sourceRecord = isPlainRecord(sourceValue) ? sourceValue : {};
    const merged: UnknownRecord = sourceHadValue ? cloneJsonLike(sourceRecord) : {};
    const properties = isPlainRecord(schema.properties) ? schema.properties : {};
    // Opaque metadata travels with the editor's unit, not its previous array
    // position. Do not merge old object members or copy it onto a new unit.
    for (const [key, property] of Object.entries(properties)) {
      if (isPlainRecord(property) && property.format === 'ignored') delete merged[key];
    }
    for (const [key, childEditorValue] of Object.entries(editorValue)) {
      const childSourceHadValue = hasOwn(sourceRecord, key);
      const childValue = overlayEditorValue(sourceRecord[key], childEditorValue, childSourceHadValue,
        isPlainRecord(properties[key]) ? properties[key] : {});
      if (childValue === PRUNE) {
        delete merged[key];
      } else {
        merged[key] = childValue;
      }
    }
    if (!sourceHadValue && Object.keys(merged).length === 0) {
      return PRUNE;
    }
    return merged;
  }

  return cloneJsonLike(editorValue);
}

export function mergeEditorContentPreservingSourceShape<T extends UnknownRecord>(
  sourceContent: unknown,
  editorContent: T,
  schema: UnknownRecord = {}
): T {
  const overlaid = overlayEditorValue(sourceContent, editorContent, isPlainRecord(sourceContent), schema);
  return (overlaid === PRUNE ? cloneJsonLike(editorContent) : overlaid) as T;
}

export function buildStimulusEditorRawStimuliSavePayload(
  sourceRawStimuliFile: unknown,
  editedClusters: unknown[]
): UnknownRecord {
  const source = isPlainRecord(sourceRawStimuliFile) ? cloneJsonLike(sourceRawStimuliFile) : {};
  const sourceSetspec = isPlainRecord(source.setspec) ? source.setspec : {};
  source.setspec = {
    ...sourceSetspec,
    clusters: cloneJsonLike(editedClusters),
  };
  return source;
}
