import type { Collection } from 'mongodb';
import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { Courses, Sections, SectionUserMap } from '../../common/Collections';

export async function commitCourseEdit(courseId: string, originalOwner: string, fields: Record<string, unknown>, existing: unknown, additions: unknown) {
  if (!Array.isArray(existing) || !Array.isArray(additions) ||
      additions.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Meteor.Error(400, 'Reload the course editor to edit sections by ID');
  }
  const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
  try {
    await session.withTransaction(async () => {
      const owner = await Courses.rawCollection().updateOne(
        { _id: courseId, teacherUserId: originalOwner }, { $set: fields, $currentDate: { updatedAt: true } }, { session });
      if (!owner.matchedCount) throw new Meteor.Error(409, 'Course ownership changed. Reload before editing.');
      const sections = Sections.rawCollection() as unknown as Collection<{ _id: string; courseId: string; sectionName: string }>;
      const current = await sections.find({ courseId }, { projection: { sectionName: 1 }, session }).toArray();
      const byId = new Map(current.map(row => [row._id, row.sectionName]));
      const names = additions.map(name => name.trim());
      const removed: string[] = [];
      const renamed: { sectionId: string; sectionName: string }[] = [];
      for (const row of existing) {
        if (!row || typeof row.sectionId !== 'string' || typeof row.originalName !== 'string' ||
            typeof row.sectionName !== 'string' || typeof row.remove !== 'boolean') {
          throw new Meteor.Error(400, 'Invalid section edit');
        }
        if (!byId.has(row.sectionId) || byId.get(row.sectionId) !== row.originalName) {
          throw new Meteor.Error(409, 'Course sections changed. Reload before editing.');
        }
        byId.delete(row.sectionId);
        if (row.remove) {
          removed.push(row.sectionId);
        } else {
          const name = row.sectionName.trim();
          if (!name) throw new Meteor.Error(400, 'Section name is required');
          names.push(name);
          if (name !== row.originalName) renamed.push({ sectionId: row.sectionId, sectionName: name });
        }
      }
      if (byId.size) throw new Meteor.Error(409, 'Course sections changed. Reload before editing.');
      if (!names.length || new Set(names).size !== names.length) throw new Meteor.Error(400, 'Keep at least one section and give each a distinct name');
      for (const row of renamed) await sections.updateOne({ _id: row.sectionId, courseId }, { $set: { sectionName: row.sectionName } }, { session });
      if (removed.length) {
        await SectionUserMap.rawCollection().deleteMany({ sectionId: { $in: removed } }, { session });
        await sections.deleteMany({ courseId, _id: { $in: removed } }, { session });
      }
      if (additions.length) await sections.insertMany(additions.map(name => ({ _id: Random.id(), courseId, sectionName: name.trim() })), { session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await session.endSession();
  }
}
