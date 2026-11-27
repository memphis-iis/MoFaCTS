import { MongoInternals } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { Tdfs } from '../../common/Collections';
import { prolificCompletionUrl } from '../../common/prolific';
import { ProlificStudies } from './prolificCollections';

export type ProlificStudyBinding = {
  ownerId: string;
  rootTdfId: string;
  studyId: string;
  accountId: string;
  workspaceId: string;
  projectId: string;
  currency: 'USD' | 'GBP';
  reminderText: string;
  updatedAt: Date;
  testSetupOperationId?: string;
  sourceStudyId?: string;
  testUrl?: string;
};

export async function saveProlificStudyBinding(binding: ProlificStudyBinding, expectedRevision: number): Promise<void> {
  const { ownerId, rootTdfId, studyId } = binding;
  const tdfs = Tdfs.rawCollection();
  const studies = ProlificStudies.rawCollection();
  const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
  try {
    await session.withTransaction(async () => {
      const rootSelector = { _id: rootTdfId, ownerId, tdfAvailability: 'available' };
      const root = await tdfs.findOne(rootSelector, { session, projection: {
        tdfRevision: 1,
        'content.tdfs.tutor.setspec.experimentTarget': 1,
        'content.tdfs.tutor.setspec.experimentPasswordRequired': 1,
        'content.tdfs.tutor.setspec.prolificCompletionUrl': 1,
      } });
      if (!root) throw new Error('prolific.accessDenied');
      const spec = root.content?.tdfs?.tutor?.setspec;
      if (spec?.experimentTarget !== studyId || [true, 'true'].includes(spec.experimentPasswordRequired)) {
        throw new Error('prolific.invalidConfiguration');
      }
      prolificCompletionUrl(spec.prolificCompletionUrl);

      const existing = await studies.findOne({ $or: [{ studyId }, { rootTdfId }] }, { session });
      if (existing && (existing.ownerId !== ownerId || existing.rootTdfId !== rootTdfId || existing.studyId !== studyId
        || existing.accountId !== binding.accountId || existing.projectId !== binding.projectId || existing.workspaceId !== binding.workspaceId
        || (binding.testSetupOperationId && existing.testSetupOperationId !== binding.testSetupOperationId))) {
        throw new Error('prolific.identityConflict');
      }

      if (!existing) {
        if ((root.tdfRevision ?? 0) !== expectedRevision) throw new Error('prolific.setupChanged');
        // A first binding and a family transfer must both write the lesson root.
        // This makes either transaction retry if it read a stale ownership/binding snapshot.
        const changed = await tdfs.updateOne(rootSelector, { $inc: { tdfRevision: 1 } }, { session });
        if (changed.modifiedCount !== 1) throw new Error('prolific.setupChanged');
      }
      await studies.updateOne({ studyId, ownerId, rootTdfId }, {
        $set: binding, $setOnInsert: { _id: Random.id() },
      }, { upsert: true, session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } catch (error: unknown) {
    if ((error as { code?: number } | null)?.code === 11000) throw new Error('prolific.identityConflict');
    throw error;
  } finally {
    await session.endSession();
  }
}
