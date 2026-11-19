import { createHmac } from 'node:crypto';
import { Meteor } from 'meteor/meteor';
import { GlobalExperimentStates, Tdfs } from '../../common/Collections';
import { ProlificParticipations } from './prolificCollections';

export async function loadParticipantExportKeys(rows: any[]) {
  const userIds = [...new Set(rows.map(row => row.userId))];
  const lessonIds = [...new Set(rows.map(row => row.TDFId))];
  const [participants, roots, states] = await Promise.all([
    ProlificParticipations.find({ userId: { $in: userIds } }, { fields: { userId: 1 } }).fetchAsync(),
    Tdfs.find({ 'content.tdfs.tutor.setspec.experimentTarget': { $type: 'string', $ne: '' },
      $or: [{ _id: { $in: lessonIds } }, { 'content.tdfs.tutor.setspec.conditionTdfIds': { $in: lessonIds } }] },
    { fields: { 'content.tdfs.tutor.setspec.conditionTdfIds': 1 } }).fetchAsync(),
    GlobalExperimentStates.find({ userId: { $in: userIds }, 'experimentState.experimentTarget': { $type: 'string', $ne: '' },
      $or: [{ TDFId: { $in: lessonIds } }, { 'experimentState.conditionTdfId': { $in: lessonIds } },
        { 'experimentState.currentTdfId': { $in: lessonIds } }] },
    { fields: { userId: 1, TDFId: 1, 'experimentState.conditionTdfId': 1, 'experimentState.currentTdfId': 1 } }).fetchAsync(),
  ]);
  const byUser = new Map(participants.map(p => [p.userId, p._id]));
  const savedRoots = new Map<string, string>();
  for (const state of states as any[]) {
    for (const id of [state.TDFId, state.experimentState?.conditionTdfId, state.experimentState?.currentTdfId].filter(Boolean)) {
      const pair = JSON.stringify([state.userId, id]);
      savedRoots.set(pair, savedRoots.has(pair) && savedRoots.get(pair) !== state.TDFId ? '' : state.TDFId);
    }
  }
  const lessonRoots = new Map<string, string>();
  for (const root of roots as any[]) {
    for (const id of [root._id, ...(root.content?.tdfs?.tutor?.setspec?.conditionTdfIds ?? [])]) {
      lessonRoots.set(id, lessonRoots.has(id) && lessonRoots.get(id) !== root._id ? '' : root._id);
    }
  }
  const key = createHmac('sha256', Meteor.settings.encryptionKey).update('MoFaCTS participant history v1').digest();
  return (row: any): string | undefined => {
    if (byUser.has(row.userId)) return byUser.get(row.userId);
    const rootId = row.currentRootTdfId ?? savedRoots.get(JSON.stringify([row.userId, row.TDFId])) ?? lessonRoots.get(row.TDFId);
    if (rootId === '') throw new Error('Ambiguous experiment root for historical row');
    if (rootId) return createHmac('sha256', key).update(JSON.stringify([rootId, row.userId])).digest('hex');
  };
}
