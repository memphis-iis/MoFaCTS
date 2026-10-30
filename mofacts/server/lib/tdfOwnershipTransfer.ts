import { Meteor } from 'meteor/meteor';
import { assertConditionFilenameIdAlignment, validateConditionFamilyTutor } from '../../common/lib/tdfIdentityContract';
import { createLessonFamilyResolver, LESSON_FAMILY_ROOT_FIELDS, type LessonFamilyTdfCollection } from './tdfLessonFamilyResolver';

type RecordData = Record<string, any>;
type TransferStorage = {
  tdfs: LessonFamilyTdfCollection;
  userExists: (userId: string) => Promise<boolean>;
  updateOwners: (tdfIds: string[], currentOwnerId: string, newOwnerId: string) => Promise<number>;
};
type TransferDeps = {
  transaction: <T>(work: (storage: TransferStorage) => Promise<T>) => Promise<T>;
};

/** Ownership is a lesson-family contract. Resolve and validate every member
 * inside the same snapshot transaction that changes their owners.
 */
export function createTdfOwnershipTransfer(deps: TransferDeps) {
  return async (tdfId: string, actingUserId: string, newOwnerId: string) => deps.transaction(async storage => {
    const target = await storage.tdfs.findOneAsync({ _id: tdfId }, { fields: { ownerId: 1 } });
    if (!target) throw new Meteor.Error(404, 'TDF not found');
    if (target.ownerId !== actingUserId) {
      throw new Meteor.Error(403, 'Only current owner can transfer ownership');
    }
    const resolver = createLessonFamilyResolver({ tdfs: storage.tdfs });
    const family = await resolver.resolveLessonFamilyForTdf(tdfId, {
      ...LESSON_FAMILY_ROOT_FIELDS, ownerId: 1, tdfAvailability: 1,
    });
    if (!family) throw new Meteor.Error(404, 'TDF not found');
    if (!await storage.userExists(newOwnerId)) throw new Meteor.Error(400, 'New owner does not exist');

    const members = new Map<string, RecordData>();
    for (const member of [...family.roots, ...family.children]) members.set(member._id, member);
    const roots = family.roots.filter(root => validateConditionFamilyTutor(root.content?.tdfs?.tutor).isConditionRoot);
    if (roots.length > 1) {
      throw new Meteor.Error('tdf-identity-repair-required', 'A condition belongs to more than one experiment root.');
    }
    for (const member of members.values()) {
      if (member.ownerId !== actingUserId) {
        throw new Meteor.Error('tdf-identity-repair-required', 'Every lesson-family member must have the same current owner.');
      }
      if (member.tdfAvailability === 'repair-required') {
        throw new Meteor.Error('tdf-identity-repair-required', 'This lesson family requires an identity repair.');
      }
      const validation = validateConditionFamilyTutor(member.content?.tdfs?.tutor, { requireCanonicalIds: true });
      if (!validation.isConditionRoot) continue;
      if (validation.errors.length) throw new Meteor.Error('tdf-identity-repair-required', 'This lesson family has invalid condition identities.');
      const namesById = new Map<string, string>(family.children.map(child => [child._id, child.content?.fileName]));
      if (validation.conditionTdfIds.some(id => !members.has(id))
        || assertConditionFilenameIdAlignment(validation.conditionFileNames, validation.conditionTdfIds, namesById).length) {
        throw new Meteor.Error('tdf-identity-repair-required', 'This lesson family has missing or misaligned conditions.');
      }
    }
    // Check the siblings' parent references as well, so a shared condition cannot
    // silently split a second experiment when its first root is transferred.
    const parents = await resolver.findRootsForChildRefs({ childRefs: Array.from(members.keys()), fields: { _id: 1 } });
    if (parents.some(parent => !members.has(parent._id))) {
      throw new Meteor.Error('tdf-identity-repair-required', 'A condition is referenced by another experiment root.');
    }
    const ids = Array.from(members.keys());
    if (await storage.updateOwners(ids, actingUserId, newOwnerId) !== ids.length) {
      throw new Meteor.Error('ownership-transfer-conflict', 'Lesson ownership changed during transfer. No ownership was transferred.');
    }
    return ids.length;
  });
}
