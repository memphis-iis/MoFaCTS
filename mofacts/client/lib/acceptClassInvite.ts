import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { meteorCallAsync } from './meteorAsync';

export async function acceptClassInvite(teacherId: string, sectionId: string): Promise<void> {
  const userId = Meteor.userId();
  if (!userId) {
    throw new Error('Class invitation requires a signed-in learner.');
  }

  await meteorCallAsync('addUserToTeachersClass', teacherId, sectionId);
  const [teachers, sections] = await Promise.all([
    meteorCallAsync('getAllTeachers') as Promise<any[]>,
    meteorCallAsync('getAllCourseSections') as Promise<any[]>,
  ]);
  const teacher = Array.isArray(teachers)
    ? teachers.find((row: any) => String(row?._id || '').trim() === teacherId)
    : null;
  const curClass = Array.isArray(sections)
    ? sections.find((row: any) => String(row?.sectionId || '').trim() === sectionId)
    : null;

  await meteorCallAsync(
    'setUserLoginData',
    'section-invite',
    Session.get('loginMode') || 'password',
    teacher || { _id: teacherId },
    curClass || { sectionId, teacherUserId: teacherId },
  );
  Session.set('curTeacher', teacher || { _id: teacherId });
  Session.set('curClass', curClass || { sectionId, teacherUserId: teacherId });
}
