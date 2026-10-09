import { Mongo } from 'meteor/mongo';

// Server-only collections: never publish tokens, resume secrets, or bulk participant records.
export const ProlificConnections = new Mongo.Collection<any>('ProlificConnections');
export const ProlificStudies = new Mongo.Collection<any>('ProlificStudies');
export const ProlificParticipations = new Mongo.Collection<any>('ProlificParticipations');
export const ProlificOperations = new Mongo.Collection<any>('ProlificOperations');
export const ProlificReminders = new Mongo.Collection<any>('ProlificReminders');

export async function ensureProlificIndexes(collections = { ProlificConnections, ProlificStudies, ProlificParticipations, ProlificOperations, ProlificReminders }) {
  const { ProlificConnections, ProlificStudies, ProlificParticipations, ProlificOperations, ProlificReminders } = collections;
  await ProlificConnections.rawCollection().createIndex({ ownerId: 1 }, { unique: true });
  await ProlificStudies.rawCollection().createIndex({ studyId: 1 }, { unique: true });
  await ProlificStudies.rawCollection().createIndex({ rootTdfId: 1 }, { unique: true });
  await ProlificStudies.rawCollection().createIndex({ ownerId: 1, _id: 1 });
  await ProlificParticipations.rawCollection().createIndex({ submissionId: 1 }, { unique: true });
  await ProlificParticipations.rawCollection().createIndex({ participantId: 1, studyId: 1 }, { unique: true });
  await ProlificParticipations.rawCollection().createIndex({ userId: 1 }, { unique: true });
  await ProlificParticipations.rawCollection().createIndex({ studyId: 1, _id: 1 });
  await ProlificParticipations.rawCollection().createIndex({ rootTdfId: 1 });
  await ProlificReminders.rawCollection().createIndex({ participationId: 1, boundary: 1 }, { unique: true });
  await ProlificReminders.rawCollection().createIndex({ status: 1, dueAt: 1 });
  await ProlificReminders.rawCollection().createIndex({ status: 1, sentAt: 1 });
  await ProlificReminders.rawCollection().createIndex({ resumeHash: 1 }, { unique: true });
  await ProlificReminders.rawCollection().createIndex({ studyId: 1, createdAt: -1 });
  await ProlificOperations.rawCollection().createIndex({ ownerId: 1, requestId: 1 }, { unique: true });
  await ProlificOperations.rawCollection().createIndex({ ownerId: 1, kind: 1, createdAt: -1 });
  for (const key of ['testRootKey', 'testDraftKey', 'testParticipantKey']) {
    await ProlificOperations.rawCollection().createIndex({ [key]: 1 }, { unique: true, partialFilterExpression: { [key]: { $exists: true } } });
  }
  await ProlificOperations.rawCollection().createIndex({ studyId: 1, createdAt: -1 });
  await ProlificOperations.rawCollection().createIndex({ status: 1, sentAt: 1 });
  await ProlificOperations.rawCollection().createIndex({ activeStudy: 1 }, { unique: true, partialFilterExpression: { activeStudy: { $exists: true } } });
  await ProlificOperations.rawCollection().createIndex({ ownerId: 1, studyId: 1, kind: 1, status: 1, 'rows.submissionId': 1 });
}
