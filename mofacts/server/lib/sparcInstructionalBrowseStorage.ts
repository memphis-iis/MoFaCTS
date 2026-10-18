import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import type { SparcLibraryImage } from '../../common/lib/sparcFigureLibrary';
import type { SparcPrimitiveContent } from '../../../learning-components/runtime/sparcMoveLibraryContract';
import { SPARC_INSTRUCTIONAL_COMPONENT_KINDS } from '../../common/lib/sparcInstructionalLibrary';

export type InstructionalComponentSummary = {
  id: string; kind: string; content?: SparcPrimitiveContent; image?: SparcLibraryImage;
  target: string; move: string; createdAt: Date;
};
/** Only shared display fields cross the admin boundary; vectors and generation context stay server-only. */
export function createInstructionalBrowseStore(assetDescriptions: (ids: string[]) => Promise<Map<string, string>>) {
  const visible = { $or: [{ kind: 'image', ready: true }, { kind: { $in: SPARC_INSTRUCTIONAL_COMPONENT_KINDS.filter(kind => kind !== 'image') } }] };
  const inspect = async (ids: string[]): Promise<InstructionalComponentSummary[]> => {
    if (ids.length > 24) throw new Error('Instructional inspection page exceeds 24 entries');
    const rows = await SparcInstructionalLibrary.find({ ...visible, _id: { $in: ids } }).fetchAsync();
    const images = rows.filter(row => row.kind === 'image');
    const descriptions = images.length ? await assetDescriptions(images.map(row => row._id)) : new Map<string, string>();
    return rows.map(row => {
      if (row.kind === 'image' && 'imageModel' in row) {
        const assetId = row._id;
        const description = descriptions.get(assetId);
        if (!description) throw new Error('Instructional image is missing its completed asset description');
        return { id: row._id, kind: 'image', target: '', move: '', createdAt: row.createdAt,
          image: { assetId, description, createdAt: row.createdAt.toISOString(), model: row.imageModel } };
      }
      if (!('content' in row)) throw new Error('Invalid instructional component');
      return { id: row._id, kind: row.kind, content: row.content, target: row.target, move: row.move, createdAt: row.createdAt };
    });
  };
  return { inspect };
}
