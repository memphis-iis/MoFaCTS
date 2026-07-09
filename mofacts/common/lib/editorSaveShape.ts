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

function overlayEditorValue(sourceValue: unknown, editorValue: unknown, sourceHadValue: boolean): unknown | typeof PRUNE {
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
      const value = overlayEditorValue(sourceArray[index], item, sourceHadItem);
      return value === PRUNE ? cloneJsonLike(item) : value;
    });
    return overlaid;
  }

  if (isPlainRecord(editorValue)) {
    const sourceRecord = isPlainRecord(sourceValue) ? sourceValue : {};
    const merged: UnknownRecord = sourceHadValue ? cloneJsonLike(sourceRecord) : {};
    for (const [key, childEditorValue] of Object.entries(editorValue)) {
      const childSourceHadValue = hasOwn(sourceRecord, key);
      const childValue = overlayEditorValue(sourceRecord[key], childEditorValue, childSourceHadValue);
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
  editorContent: T
): T {
  const overlaid = overlayEditorValue(sourceContent, editorContent, isPlainRecord(sourceContent));
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

