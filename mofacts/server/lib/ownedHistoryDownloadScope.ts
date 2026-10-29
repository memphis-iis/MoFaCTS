import { Meteor } from 'meteor/meteor';
import { assertConditionFilenameIdAlignment, normalizeTdfIdentity, validateConditionFamilyTutor } from '../../common/lib/tdfIdentityContract';
import { canDownloadOwnedTdfData } from './contentAccessPolicy';

type RecordValue = Record<string, unknown>;
export type OwnedHistoryScopeRequest =
  | { kind: 'owned-lessons' }
  | { kind: 'lesson'; tdfId: string; includeConditions: boolean };

export type OwnedHistoryScopeDeps = {
  Tdfs: {
    find: (selector: RecordValue, options?: RecordValue) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: RecordValue, options?: RecordValue) => Promise<any>;
  };
};

const LESSON_FIELDS = {
  _id: 1,
  ownerId: 1,
  'content.fileName': 1,
  'content.tdfs.tutor.setspec.lessonname': 1,
  'content.tdfs.tutor.setspec.condition': 1,
  'content.tdfs.tutor.setspec.conditionTdfIds': 1,
  // Preserve the validator's unit presence/count contract without loading unit content.
  'content.tdfs.tutor.unit.type': 1,
};

export async function resolveOwnedHistoryDownloadScope(
  deps: OwnedHistoryScopeDeps,
  actorId: string,
  request: OwnedHistoryScopeRequest,
): Promise<{ tdfIds: string[]; lessonName?: string }> {
  if (request.kind === 'owned-lessons') {
    const lessons = await deps.Tdfs.find({ ownerId: actorId }, { fields: { _id: 1 } }).fetchAsync();
    const tdfIds = [...new Set(lessons.map(lesson => {
      const id = normalizeTdfIdentity(lesson._id);
      if (!id) throw new Meteor.Error('tdf-identity-repair-required', 'An owned lesson requires an identity repair.');
      return id;
    }))];
    if (!tdfIds.length) throw new Meteor.Error(404, 'No owned TDFs found for current user');
    return { tdfIds };
  }
  const tdf = await deps.Tdfs.findOneAsync({ _id: request.tdfId }, { fields: LESSON_FIELDS });
  if (!tdf) throw new Meteor.Error(404, 'TDF not found');
  if (!canDownloadOwnedTdfData(actorId, tdf)) throw new Meteor.Error(403, 'Not authorized to download data for this TDF');
  const tdfIds = new Set<string>([request.tdfId]);
  if (request.includeConditions) {
    const validation = validateConditionFamilyTutor(tdf.content?.tdfs?.tutor, { requireCanonicalIds: true });
    if (validation.errors.length) throw new Meteor.Error('tdf-identity-repair-required', 'This lesson family requires an identity repair.');
    const children = validation.conditionTdfIds.length
      ? await deps.Tdfs.find({ _id: { $in: validation.conditionTdfIds }, ownerId: tdf.ownerId }, { fields: { _id: 1, 'content.fileName': 1 } }).fetchAsync()
      : [];
    const names = new Map<string, string>(children.map(child => [String(child._id), typeof child.content?.fileName === 'string' ? child.content.fileName.trim() : '']));
    if (children.length !== validation.conditionTdfIds.length
      || assertConditionFilenameIdAlignment(validation.conditionFileNames, validation.conditionTdfIds, names).length) {
      throw new Meteor.Error('tdf-identity-repair-required', 'This lesson family requires an identity repair.');
    }
    for (const child of children) tdfIds.add(String(child._id));
  }
  return { tdfIds: [...tdfIds], lessonName: tdf.content?.tdfs?.tutor?.setspec?.lessonname || `tdf-${request.tdfId}` };
}

export function assertUnchangedOwnedHistoryScope(issuedTdfIds: readonly string[], currentTdfIds: readonly string[]): void {
  const current = new Set(currentTdfIds);
  if (current.size !== issuedTdfIds.length || issuedTdfIds.some(id => !current.has(id))) {
    throw new Meteor.Error(403, 'Download scope changed; request a new download');
  }
}
