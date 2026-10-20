import { Meteor } from 'meteor/meteor';
import {
  CONTENT_UPLOAD_BATCH_SIZE, CONTENT_UPLOAD_METADATA_COLLECTION, CONTENT_UPLOAD_TDF_FIELDS,
  publicUploadMetadata, stimuliSetCountKey, uploadMetadataReferences,
} from '../../common/lib/contentUploadMetadata';

type Doc = Record<string, any>;
type Handle = { stop: () => unknown };
type Publication = {
  userId?: string | null;
  added: (collection: string, id: string, fields: Doc) => void;
  changed: (collection: string, id: string, fields: Doc) => void;
  removed: (collection: string, id: string) => void;
  ready: () => void;
  onStop: (callback: () => void) => void;
  error: (error: Error) => void;
};
type Deps = { Tdfs: any; Stims: any; DynamicAssets: any; serverConsole: (...args: any[]) => void };

/** One subscription owns access, dependency observers, and count queries. No row computation. */
export async function publishContentUploadMetadata(publication: Publication, deps: Deps): Promise<void> {
  const userId = publication.userId;
  if (!userId) throw new Meteor.Error('not-authorized', 'Must be logged in');
  let stopped = false;
  let rootsReady = false;
  let running = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rootHandle: Handle | undefined;
  const roots = new Map<string, Doc>();
  const children = new Map<string, Doc>();
  const published = new Set<string>();
  const groups = new Map<string, { handle: Handle; clear: () => void }>();
  const dirtySets = new Map<string, string | number>();
  let referencedSets = new Map<string, string | number>();

  function send(kind: 'tdf' | 'stim' | 'count', id: string, data: Doc, root = false) {
    if (stopped) return;
    const key = `${kind}:${id}`;
    const fields = { userId, kind, data, root };
    if (published.has(key)) publication.changed(CONTENT_UPLOAD_METADATA_COLLECTION, key, fields);
    else {
      published.add(key);
      publication.added(CONTENT_UPLOAD_METADATA_COLLECTION, key, fields);
    }
  }
  function remove(kind: string, id: string) {
    const key = `${kind}:${id}`;
    if (!stopped && published.delete(key)) publication.removed(CONTENT_UPLOAD_METADATA_COLLECTION, key);
  }
  function sendTdf(id: string) {
    const root = roots.get(id);
    const doc = root || children.get(id);
    if (doc) send('tdf', id, publicUploadMetadata(doc), Boolean(root));
    else remove('tdf', id);
  }
  function fail() {
    if (!stopped) {
      deps.serverConsole('[ContentUpload] Metadata synchronization failed');
      publication.error(new Meteor.Error('metadata-sync-failed', 'Content metadata synchronization failed. Please retry.'));
    }
  }
  function schedule() {
    pending = true;
    if (stopped || !rootsReady || running || timer) return;
    timer = setTimeout(() => { timer = undefined; void drain().catch(fail); }, 25);
  }
  function merge(current: Doc, fields: Doc): Doc {
    const result = { ...current };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) delete result[key];
      else result[key] = value;
    }
    return result;
  }
  async function observe(collection: any, selector: Doc, fields: Doc,
    added: (id: string, doc: Doc) => void, removed: (id: string, doc: Doc) => void) {
    const docs = new Map<string, Doc>();
    const handle = await collection.find(selector, { fields, batchSize: CONTENT_UPLOAD_BATCH_SIZE }).observeChangesAsync({
      added(id: string, values: Doc) {
        const doc = { ...values, _id: id };
        docs.set(id, doc); added(id, doc);
      },
      changed(id: string, values: Doc) {
        const old = docs.get(id)!;
        const doc = merge(old, values);
        removed(id, old); docs.set(id, doc); added(id, doc);
      },
      removed(id: string) {
        const doc = docs.get(id);
        docs.delete(id);
        if (doc) removed(id, doc);
      },
    }) as Handle;
    if (stopped) { await handle.stop(); return { handle, clear() {} }; }
    return { handle, clear() { for (const [id, doc] of docs) removed(id, doc); docs.clear(); } };
  }

  async function synchronizeDependencies() {
    const conditionIds = new Set<string>();
    const filenames = new Set<string>();
    const nextSets = new Map<string, string | number>();
    for (const root of roots.values()) {
      const refs = uploadMetadataReferences(root);
      refs.conditions.forEach(id => conditionIds.add(id));
      refs.files.forEach(name => filenames.add(name));
      refs.sets.forEach(id => nextSets.set(stimuliSetCountKey(id), id));
    }
    for (const key of referencedSets.keys()) if (!nextSets.has(key)) remove('count', key);
    for (const [key, value] of nextSets) if (!referencedSets.has(key)) dirtySets.set(key, value);
    referencedSets = nextSets;
    const required = new Map<string, { kind: string; values: Array<string | number> }>();
    for (const [kind, values] of [
      ['condition', [...conditionIds].sort()], ['stim', [...filenames].sort()],
      ['asset', [...nextSets.values()].sort((a, b) => stimuliSetCountKey(a).localeCompare(stimuliSetCountKey(b)))],
    ] as Array<[string, Array<string | number>]>) {
      for (let offset = 0; offset < values.length; offset += CONTENT_UPLOAD_BATCH_SIZE) {
        const batch = values.slice(offset, offset + CONTENT_UPLOAD_BATCH_SIZE);
        required.set(`${kind}:${JSON.stringify(batch)}`, { kind, values: batch });
      }
    }
    for (const [key, group] of groups) if (!required.has(key)) {
      await group.handle.stop(); group.clear(); groups.delete(key);
    }
    for (const [key, { kind, values }] of required) {
      if (groups.has(key) || stopped) continue;
      let group;
      if (kind === 'condition') {
        group = await observe(deps.Tdfs, { _id: { $in: values } }, {
          'content.fileName': 1, 'content.tdfs.tutor.unit.sparcsession.pageId': 1,
          'rawStimuliFile.setspec.sparcPages.pageId': 1,
          'rawStimuliFile.setspec.sparcPages.display.unitType': 1,
        }, (id, doc) => { children.set(id, doc); sendTdf(id); }, id => { children.delete(id); sendTdf(id); });
      } else if (kind === 'stim') {
        group = await observe(deps.Stims, { 'meta.fileName': { $in: values } }, { 'meta.fileName': 1 },
          (id, doc) => send('stim', id, doc), id => remove('stim', id));
      } else {
        const dirty = (_id: string, doc: Doc) => {
          const value = doc.meta?.stimuliSetId;
          if (typeof value === 'string' || typeof value === 'number') dirtySets.set(stimuliSetCountKey(value), value);
          schedule();
        };
        group = await observe(deps.DynamicAssets.collection, { 'meta.stimuliSetId': { $in: values } },
          { 'meta.stimuliSetId': 1 }, dirty, dirty);
      }
      if (stopped) { await group.handle.stop(); return; }
      groups.set(key, group);
    }
  }

  async function updateCounts() {
    const requested = [...dirtySets].filter(([key]) => referencedSets.has(key));
    dirtySets.clear();
    for (let offset = 0; offset < requested.length && !stopped; offset += CONTENT_UPLOAD_BATCH_SIZE) {
      const batch = requested.slice(offset, offset + CONTENT_UPLOAD_BATCH_SIZE);
      const rows = await deps.DynamicAssets.collection.rawCollection().aggregate([
        { $match: { 'meta.stimuliSetId': { $in: batch.map(([, value]) => value) } } },
        { $group: { _id: '$meta.stimuliSetId', count: { $sum: 1 } } },
      ]).toArray();
      const counts = new Map(rows.map((row: Doc) => [stimuliSetCountKey(row._id), row.count]));
      for (const [key, stimuliSetId] of batch) if (referencedSets.has(key)) {
        send('count', key, { stimuliSetId, count: counts.get(key) || 0 });
      }
    }
  }
  async function drain() {
    if (stopped || running) return;
    running = true;
    try {
      do {
        pending = false;
        await synchronizeDependencies();
        await updateCounts();
      } while (pending && !stopped);
    } finally { running = false; }
  }
  publication.onStop(() => {
    stopped = true;
    if (timer) clearTimeout(timer);
    void rootHandle?.stop();
    for (const group of groups.values()) void group.handle.stop();
    groups.clear(); roots.clear(); children.clear(); dirtySets.clear(); published.clear();
  });
  try {
    const rootGroup = await observe(deps.Tdfs, { $or: [{ ownerId: userId }, { 'accessors.userId': userId }] },
      CONTENT_UPLOAD_TDF_FIELDS,
      (id, doc) => { roots.set(id, doc); sendTdf(id); schedule(); },
      id => { roots.delete(id); sendTdf(id); schedule(); });
    rootHandle = rootGroup.handle;
    if (stopped) return;
    rootsReady = true;
    await drain();
    if (!stopped) {
      publication.ready();
      deps.serverConsole('[ContentUpload] Metadata ready', { roots: roots.size, dependencyBatches: groups.size });
    }
  } catch { fail(); }
}
