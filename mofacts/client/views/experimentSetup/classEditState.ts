import { curSemester } from '../../../common/Definitions';

export type CourseVisibility = 'private' | 'public';

export type CourseSection = {
  _id?: string;
  courseId: string;
  courseName: string;
  teacherUserId?: string;
  teacheruserid?: string;
  semester?: string;
  beginDate?: Date | string | null;
  endDate?: Date | string | null;
  timezone?: string;
  visibility?: CourseVisibility;
  sectionId?: string;
  sectionName?: string;
  sections?: string[];
};

export type EditableCourse = {
  courseId: string | undefined;
  courseName: string;
  teacherUserId: string | null;
  semester: string;
  beginDate: Date | string | null;
  endDate: Date | string | null;
  timezone: string;
  visibility: CourseVisibility;
  sections: string[];
};

export type SectionLink = {
  sectionId: string;
  courseName: string;
  sectionName: string;
  teacherUserId: string;
};

export type CourseManagementData = Readonly<{
  courses: EditableCourse[];
  sectionLinks: SectionLink[];
}>;

export function defaultCourseDraft(teacherUserId: string | null, timezone: string): EditableCourse {
  return {
    courseId: undefined,
    courseName: '',
    teacherUserId,
    semester: curSemester,
    beginDate: null,
    endDate: null,
    timezone,
    visibility: 'private',
    sections: [],
  };
}

export function normalizeSectionNames(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((sectionName) => sectionName.trim())
    .filter(Boolean);
}

export function sectionNamesText(sections: string[]): string {
  return sections.join('\n');
}

export function toDatetimeLocalValue(value: unknown, timezone?: string): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value as string | number | Date);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  if (timezone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const partValue = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${partValue('year')}-${partValue('month')}-${partValue('day')}T${partValue('hour')}:${partValue('minute')}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildCourseManagementData(
  allCourseSections: CourseSection[],
  teacherUserId: string | null,
  fallbackTimezone: string,
): CourseManagementData {
  const coursesById: Record<string, EditableCourse> = {};
  const sectionLinks: SectionLink[] = [];

  for (const courseSection of allCourseSections) {
    if (String(courseSection.teacherUserId || courseSection.teacheruserid || '') !== String(teacherUserId || '')) {
      continue;
    }
    if (!coursesById[courseSection.courseId]) {
      coursesById[courseSection.courseId] = {
        courseId: courseSection.courseId,
        courseName: courseSection.courseName,
        teacherUserId: courseSection.teacherUserId || courseSection.teacheruserid || teacherUserId,
        semester: courseSection.semester || curSemester,
        beginDate: courseSection.beginDate || null,
        endDate: courseSection.endDate || null,
        timezone: courseSection.timezone || fallbackTimezone,
        visibility: courseSection.visibility === 'public' ? 'public' : 'private',
        sections: [],
      };
    }
    const sectionId = String(courseSection.sectionId || '').trim();
    const sectionName = String(courseSection.sectionName || '').trim();
    if (sectionId && sectionName) {
      coursesById[courseSection.courseId]!.sections.push(sectionName);
      sectionLinks.push({
        sectionId,
        courseName: courseSection.courseName,
        sectionName,
        teacherUserId: String(courseSection.teacherUserId || courseSection.teacheruserid || ''),
      });
    }
  }

  return {
    courses: Object.values(coursesById),
    sectionLinks,
  };
}

export function coursePayloadFromDraft(draft: EditableCourse): EditableCourse {
  return {
    ...draft,
    courseName: draft.courseName.trim(),
    beginDate: draft.beginDate || null,
    endDate: draft.endDate || null,
    timezone: draft.timezone.trim(),
    visibility: draft.visibility === 'public' ? 'public' : 'private',
    sections: draft.sections.map((section) => section.trim()).filter(Boolean),
  };
}
