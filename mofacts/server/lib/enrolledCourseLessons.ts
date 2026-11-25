import { normalizeOptionalStringId } from './tdfPublicationAccess';
import { curSemester } from '../../common/Definitions';
import { assignmentMemberTdfIds } from '../../common/progressiveAssignments';

type Collection = {
  find(selector: Record<string, unknown>, options: Record<string, unknown>): { fetchAsync(): Promise<any[]> };
};
type CourseCollections = { SectionUserMap: Collection; Sections: Collection; Courses: Collection; Assignments: Collection };

export async function enrolledCourseLessonIds(
  { SectionUserMap, Sections, Courses, Assignments }: CourseCollections,
  userId: string,
  releasedOnly: boolean,
) {
  const enrollmentRows = await SectionUserMap.find(
    { userId },
    { fields: { sectionId: 1 } }
  ).fetchAsync();
  const sectionIds: string[] = enrollmentRows
    .map((row: any) => normalizeOptionalStringId(row?.sectionId))
    .filter((id: string | null): id is string => typeof id === 'string');
  if (sectionIds.length === 0) {
    return [];
  }

  const uniqueSectionIds = [...new Set(sectionIds)];
  const sections = await Sections.find(
    { _id: { $in: uniqueSectionIds } },
    { fields: { _id: 1, courseId: 1 } }
  ).fetchAsync();
  const courseIds = [...new Set(
    sections
      .map((section: any) => normalizeOptionalStringId(section?.courseId))
      .filter((courseId: string | null): courseId is string => typeof courseId === 'string')
  )];
  if (courseIds.length === 0) {
    return [];
  }

  const activeCourses = await Courses.find(
    { _id: { $in: courseIds }, semester: curSemester },
    { fields: { _id: 1 } }
  ).fetchAsync();
  const activeCourseIds = activeCourses.map((course: any) => String(course?._id || '').trim()).filter(Boolean);
  if (activeCourseIds.length === 0) {
    return [];
  }

  const assignmentRows = await Assignments.find(
    { courseId: { $in: activeCourseIds } },
    { fields: { assignmentType: 1, TDFId: 1, memberTdfIds: 1, releaseAt: 1 } }
  ).fetchAsync();
  const assignedIdSet = new Set<string>();
  for (const row of assignmentRows) {
    if (releasedOnly && row.releaseAt && new Date(row.releaseAt).getTime() > Date.now()) continue;
    for (const rawId of assignmentMemberTdfIds(row)) {
      const normalizedId = normalizeOptionalStringId(rawId);
      if (normalizedId) assignedIdSet.add(normalizedId);
    }
  }
  return Array.from(assignedIdSet);
}
