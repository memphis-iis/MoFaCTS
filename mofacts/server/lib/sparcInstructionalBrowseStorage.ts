import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import type { SparcLibraryImage } from '../../common/lib/sparcFigureLibrary';
import type { SparcPrimitiveContent } from '../../../learning-components/runtime/sparcMoveLibraryContract';

export type InstructionalComponentSummary = {
  id: string; kind: string; content?: SparcPrimitiveContent; image?: SparcLibraryImage;
  target: string; move: string; reusable: boolean; createdAt: Date;
};
/** Only shared display fields cross the admin boundary; vectors and generation context stay server-only. */
export function createInstructionalBrowseStore(assetDescriptions: (ids: string[]) => Promise<Map<string, string>>) {
  const visible = { $or: [{ kind: 'image', ready: true }, { kind: { $in: ['feedback', 'explanation', 'richContent', 'question'] } }] };
  const inspect = async (ids: string[]): Promise<InstructionalComponentSummary[]> => {
    if (ids.length > 24) throw new Error('Instructional inspection page exceeds 24 entries');
    const rows = await SparcInstructionalLibrary.find({ ...visible, _id: { $in: ids } }).fetchAsync();
    const images = rows.filter(row => row.kind === 'image');
    const descriptions = images.length ? await assetDescriptions(images.map(row => 'currentAssetId' in row && row.currentAssetId ? row.currentAssetId : row._id)) : new Map<string, string>();
    return rows.map(row => {
      if (row.kind === 'image' && 'imageModel' in row) {
        const assetId = row.currentAssetId ?? row._id;
        const description = descriptions.get(assetId);
        if (!description) throw new Error('Instructional image is missing its completed asset description');
        return { id: row._id, kind: 'image', target: '', move: '', reusable: row.reusable, createdAt: row.createdAt,
          image: { libraryId: row._id, assetId, description, createdAt: row.createdAt.toISOString(), model: row.imageModel, reusable: row.reusable, revision: row.revision ?? 0 } };
      }
      if (!('content' in row)) throw new Error('Invalid instructional component');
      return { id: row._id, kind: row.kind, content: row.content, target: row.target, move: row.move, reusable: row.reusable, createdAt: row.createdAt };
    });
  };
  return {
    inspect,
    async page(after: string) {
      const rows = await SparcInstructionalLibrary.find({ ...visible, _id: { $gt: after } }, { fields: { _id: 1 }, sort: { _id: 1 }, limit: 25 }).fetchAsync();
      const entries = await inspect(rows.slice(0, 24).map(row => row._id));
      const byId = new Map(entries.map(entry => [entry.id, entry]));
      return { entries: rows.slice(0, 24).map(row => byId.get(row._id)!), nextCursor: rows.length > 24 ? rows[23]!._id : null };
    },
  };
}
