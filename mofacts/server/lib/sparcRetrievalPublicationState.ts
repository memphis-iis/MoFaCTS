type Publication = {
  added(collection: string, id: string, fields: { embedding: number[] }): void;
  changed(collection: string, id: string, fields: { embedding: number[] }): void;
  removed(collection: string, id: string): void;
};
type Entry = { embedding: number[]; contentUseKeys: string[]; published: boolean };

function keys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(key => typeof key !== 'string' || !/^(entry|text|payload|image|video):.+$/.test(key))) {
    throw new Error('SPARC retrieval requires complete content-use metadata');
  }
  return [...new Set(value)];
}

/** Server-only eligibility; the browser receives only unseen entry IDs and vectors. */
export function createSparcRetrievalPublicationState(publication: Publication, collection: string, prefix: string) {
  const entries = new Map<string, Entry>();
  const uses = new Map<string, string[]>();
  const useCounts = new Map<string, number>();
  const entriesByKey = new Map<string, Set<string>>();

  const refresh = (id: string, embeddingChanged = false) => {
    const entry = entries.get(id)!;
    const eligible = entry.contentUseKeys.every(key => !useCounts.has(key));
    if (eligible && !entry.published) publication.added(collection, prefix + id, { embedding: [...entry.embedding] });
    else if (!eligible && entry.published) publication.removed(collection, prefix + id);
    else if (eligible && embeddingChanged) publication.changed(collection, prefix + id, { embedding: [...entry.embedding] });
    entry.published = eligible;
  };

  const removeEntry = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    if (entry.published) publication.removed(collection, prefix + id);
    for (const key of entry.contentUseKeys) {
      const ids = entriesByKey.get(key)!;
      ids.delete(id);
      if (!ids.size) entriesByKey.delete(key);
    }
    entries.delete(id);
  };

  const updateUse = (id: string, next: string[]) => {
    const previous = uses.get(id) ?? [];
    const affected = new Set<string>();
    for (const key of previous) {
      const count = useCounts.get(key)! - 1;
      if (count) useCounts.set(key, count); else useCounts.delete(key);
      for (const entryId of entriesByKey.get(key) ?? []) affected.add(entryId);
    }
    for (const key of next) {
      useCounts.set(key, (useCounts.get(key) ?? 0) + 1);
      for (const entryId of entriesByKey.get(key) ?? []) affected.add(entryId);
    }
    if (next.length) uses.set(id, next); else uses.delete(id);
    for (const entryId of affected) refresh(entryId);
  };
  return {
    setUse(id: string, value: unknown) { updateUse(id, keys(value)); },
    removeUse(id: string) { updateUse(id, []); },
    setEntry(id: string, fields: { embedding?: unknown; contentUseKeys?: unknown }) {
      const previous = entries.get(id);
      const embedding = Object.hasOwn(fields, 'embedding') ? fields.embedding : previous?.embedding;
      const contentUseKeys = Object.hasOwn(fields, 'contentUseKeys') ? fields.contentUseKeys : previous?.contentUseKeys;
      if (!Array.isArray(embedding) || !embedding.length || embedding.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error('SPARC retrieval requires a valid embedding');
      }
      const nextKeys = keys(contentUseKeys);
      for (const key of previous?.contentUseKeys ?? []) {
        const ids = entriesByKey.get(key)!;
        ids.delete(id);
        if (!ids.size) entriesByKey.delete(key);
      }
      entries.set(id, { embedding: [...embedding], contentUseKeys: nextKeys, published: previous?.published ?? false });
      for (const key of nextKeys) {
        const ids = entriesByKey.get(key) ?? new Set<string>();
        ids.add(id); entriesByKey.set(key, ids);
      }
      refresh(id, !!previous && fields.embedding !== undefined);
    },
    removeEntry,
  };
}
