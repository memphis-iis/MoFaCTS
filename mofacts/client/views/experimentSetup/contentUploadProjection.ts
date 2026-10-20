import { uploadMetadataReferences, stimuliSetCountKey, type ContentUploadMetadata } from '../../../common/lib/contentUploadMetadata';
import { buildContentUploadSummaries } from './contentUploadSummaries';

/** Keep one summary per root. Recompute only roots whose metadata/dependencies changed. */
export function createContentUploadProjection() {
  let previous = new Map<string, ContentUploadMetadata>();
  const summaries = new Map<string, any>();
  return (records: ContentUploadMetadata[]) => {
    const current = new Map(records.map(record => [record._id, record]));
    const changed = new Set([...previous.keys(), ...current.keys()].filter(key =>
      JSON.stringify(previous.get(key)) !== JSON.stringify(current.get(key))));
    const roots = records.filter(record => record.kind === 'tdf' && record.root);
    const rootIds = new Set(roots.map(root => root.data._id as string));
    for (const id of summaries.keys()) if (!rootIds.has(id)) summaries.delete(id);
    const tdfs = records.filter(record => record.kind === 'tdf').map(record => record.data);
    const stims = records.filter(record => record.kind === 'stim').map(record => record.data as { _id: string });
    const counts = records.filter(record => record.kind === 'count')
      .map(record => record.data as { stimuliSetId: string | number; count: number });
    for (const root of roots) {
      const refs = uploadMetadataReferences(root.data);
      const affected = !summaries.has(root.data._id) || changed.has(root._id)
        || refs.conditions.some(id => changed.has(`tdf:${id}`))
        || refs.sets.some(id => changed.has(`count:${stimuliSetCountKey(id)}`))
        || [...changed].some(key => [previous.get(key), current.get(key)]
          .some(record => record?.kind === 'stim' && refs.files.includes(record.data.meta?.fileName)));
      if (affected) {
        const [summary] = buildContentUploadSummaries([root.data], tdfs, stims, counts);
        summaries.set(root.data._id, summary);
      }
    }
    previous = current;
    const sorted = [...summaries.values()].sort((a, b) => {
      const left = String(a.lessonName); const right = String(b.lessonName);
      return left < right ? -1 : left > right ? 1 : String(a._id) < String(b._id) ? -1 : 1;
    });
    return { ids: sorted.map(row => String(row._id)), summaries: Object.fromEntries(sorted.map(row => [row._id, row])) };
  };
}
