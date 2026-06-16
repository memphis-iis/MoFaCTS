import { Meteor } from 'meteor/meteor';
import { curSemester } from '../../common/Definitions';
import type {
  CourseAssignmentEditorSnapshot,
  CourseAssignmentSummary,
  CourseVisibility,
  LearnerCourseSnapshotAssignment,
  LearnerCourseSnapshotCourse,
  LearnerCoursesSnapshot,
  SaveCourseAssignmentsInput,
} from '../../common/courseAssignments.contracts';
import { getCourse } from '../orm';
import { buildDashboardStatsProjection, normalizeOptionalString } from './dashboardCacheShared';
import {
  getUserRoleFlags,
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  requireUserWithRoles,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type Logger = (...args: unknown[]) => void;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};
type DueDateException = {
  assignmentId?: string;
  courseId?: string;
  TDFId?: string;
  tdfId?: string;
  classId?: string;
  date: string | number | Date;
};
const COURSE_SNAPSHOT_VERSION = 1;
const MAX_ASSIGNMENTS_PER_COURSE = 250;
const DEFAULT_COURSE_TIMEZONE = 'America/Chicago';

type Cursor<T = any> = {
  fetchAsync: () => Promise<T[]>;
  countAsync?: () => Promise<number>;
};

type CollectionLike = {
  find: (selector?: UnknownRecord, options?: UnknownRecord) => Cursor;
  findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  insertAsync: (document: UnknownRecord) => Promise<unknown>;
  updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  rawCollection: () => { aggregate: (pipeline: unknown[]) => { toArray: () => Promise<any[]> } };
};

type CourseMethodsDeps = {
  serverConsole: Logger;
  Courses: CollectionLike;
  Sections: CollectionLike;
  SectionUserMap: CollectionLike;
  Assignments: CollectionLike;
  Tdfs: CollectionLike;
  UserDashboardCache?: CollectionLike;
  CourseLearnerSnapshotCache?: CollectionLike;
  Histories: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  itemSourceSentences: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => any;
  };
  usersCollection: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => Cursor;
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  };
  sendEmail: (to: string, from: string, subject: string, text: string) => void;
  emailFrom: string;
  thisServerUrl: string;
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  getUserDisplayIdentifier: (user: any) => string;
  normalizeCanonicalId: (value: unknown) => string | null;
};

function normalizeCourseVisibility(value: unknown): CourseVisibility {
  if (value === undefined || value === null || value === '') return 'private';
  if (value === 'private' || value === 'public') return value;
  throw new Meteor.Error(400, 'Course visibility must be private or public');
}

function assertKnownFields(payload: UnknownRecord, allowedFields: string[], label: string) {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw new Meteor.Error(400, `${label} contains unknown field: ${key}`);
    }
  }
}

function normalizeTimezone(value: unknown, allowLegacyDefault = false): string {
  const timezone = typeof value === 'string' ? value.trim() : '';
  if (!timezone) {
    if (allowLegacyDefault) return DEFAULT_COURSE_TIMEZONE;
    throw new Meteor.Error(400, 'Course timezone is required');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Meteor.Error(400, 'Course timezone must be a valid IANA timezone');
  }
  return timezone;
}

function localDateTimeToUtcIso(value: string, timezone: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return value;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const utcGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcGuess));
  const partValue = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const zonedAsUtc = Date.UTC(partValue('year'), partValue('month') - 1, partValue('day'), partValue('hour'), partValue('minute'), partValue('second'));
  return new Date(utcGuess - (zonedAsUtc - utcGuess)).toISOString();
}

function parseDateLike(value: unknown, fieldName: string, timezone: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date))) {
    throw new Meteor.Error(400, `${fieldName} must be a date string, Date, or null`);
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Meteor.Error(400, `${fieldName} is invalid`);
    return value;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Meteor.Error(400, `${fieldName} must be a date string, Date, or null`);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const date = new Date(hasExplicitZone ? raw : localDateTimeToUtcIso(raw, timezone));
  if (!Number.isFinite(date.getTime())) throw new Meteor.Error(400, `${fieldName} is invalid`);
  return date;
}

function parseNullablePersistedDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeCourseDates(payload: UnknownRecord, existingCourse?: any) {
  const timezone = normalizeTimezone(payload.timezone ?? existingCourse?.timezone, !!existingCourse);
  const beginDate = parseDateLike(payload.beginDate ?? existingCourse?.beginDate ?? null, 'Course begin date', timezone);
  const endDate = parseDateLike(payload.endDate ?? existingCourse?.endDate ?? null, 'Course end date', timezone);
  if (beginDate && endDate && endDate.getTime() < beginDate.getTime()) {
    throw new Meteor.Error(400, 'Course end date must be on or after begin date');
  }
  return { timezone, beginDate, endDate };
}

function getTdfSummary(tdf: any) {
  const setspec = tdf?.content?.tdfs?.tutor?.setspec || {};
  const fileName = normalizeOptionalString(tdf?.content?.fileName) || normalizeOptionalString(tdf?.tdfFileName) || String(tdf?._id || '');
  const displayName = normalizeOptionalString(setspec.lessonname) || fileName;
  return {
    TDFId: String(tdf?._id || ''),
    fileName,
    displayName,
    tags: Array.isArray(setspec.tags) ? setspec.tags : [],
    currentStimuliSetId: tdf?.stimuliSetId ?? null,
    ownerId: String(tdf?.ownerId || ''),
    isMultiTdf: Boolean(tdf?.content?.isMultiTdf),
  };
}

function getPrimaryUserEmail(user: any): string | null {
  const canonical = normalizeOptionalString(user?.email_canonical);
  if (canonical) return canonical;
  const firstEmail = Array.isArray(user?.emails)
    ? normalizeOptionalString(user.emails.find((email: any) => normalizeOptionalString(email?.address))?.address)
    : null;
  return firstEmail;
}

function normalizeAssignmentRow(row: any, index: number, tdfTitleById: Map<string, string>, now = new Date()): CourseAssignmentSummary | null {
  const assignmentId = normalizeOptionalString(row?._id);
  const courseId = normalizeOptionalString(row?.courseId);
  const TDFId = normalizeOptionalString(row?.TDFId);
  if (!assignmentId || !courseId || !TDFId) return null;
  const releaseAt = parseNullablePersistedDate(row?.releaseAt);
  const rawOrder = Number(row?.order);
  return {
    assignmentId,
    courseId,
    TDFId,
    title: tdfTitleById.get(TDFId) || TDFId,
    order: Number.isInteger(rawOrder) && rawOrder >= 0 ? rawOrder : index,
    releaseAt,
    dueAt: parseNullablePersistedDate(row?.dueAt),
    required: row?.required !== false,
    availability: releaseAt && releaseAt.getTime() > now.getTime() ? 'scheduled' : 'available',
    createdAt: parseNullablePersistedDate(row?.createdAt),
    updatedAt: parseNullablePersistedDate(row?.updatedAt),
  };
}

function normalizeCourseDocumentForRead<T extends Record<string, any>>(course: T): T & {
  visibility: CourseVisibility;
  beginDate: Date | null;
  endDate: Date | null;
  timezone: string;
} {
  return {
    ...course,
    visibility: normalizeCourseVisibility(course?.visibility),
    beginDate: parseNullablePersistedDate(course?.beginDate),
    endDate: parseNullablePersistedDate(course?.endDate),
    timezone: normalizeTimezone(course?.timezone, true),
  };
}

function getSetAMinusB<T>(arrayA: T[], arrayB: T[]) {
  const a = new Set(arrayA);
  const b = new Set(arrayB);
  const difference = new Set([...a].filter((x) => !b.has(x)));
  return Array.from(difference);
}

function throwLoggedCourseOperationError(
  deps: CourseMethodsDeps,
  operation: string,
  error: unknown,
  ...context: unknown[]
): never {
  deps.serverConsole(`${operation} ERROR,`, ...context, error);
  if (error instanceof Meteor.Error) {
    throw error;
  }
  throw new Meteor.Error('course-operation-failed', `${operation} failed`);
}

export function createCourseMethods(deps: CourseMethodsDeps) {
  async function requireTeacherOrAdmin(thisArg: MethodContext) {
    const actingUserId = requireAuthenticatedUser(thisArg.userId, 'Must be logged in', 401);
    const roleFlags = await getUserRoleFlags(deps.getMethodAuthorizationDeps(), actingUserId, ['admin', 'teacher'] as const);
    if (!roleFlags.admin && !roleFlags.teacher) {
      throw new Meteor.Error(403, 'Teacher or admin access required');
    }
    return { actingUserId, roleFlags };
  }

  async function assertCanManageCourse(thisArg: MethodContext, courseId: string) {
    const { actingUserId, roleFlags } = await requireTeacherOrAdmin(thisArg);
    const normalizedCourseId = deps.normalizeCanonicalId(courseId);
    if (!normalizedCourseId) {
      throw new Meteor.Error(400, 'Course id is required');
    }
    const course = await deps.Courses.findOneAsync({ _id: normalizedCourseId });
    if (!course) {
      throw new Meteor.Error(404, 'Course not found');
    }
    if (!roleFlags.admin && String(course.teacherUserId || '') !== actingUserId) {
      throw new Meteor.Error(403, 'Can only manage your own course');
    }
    return { course, actingUserId, roleFlags };
  }

  async function resolveInstructorForCaller(thisArg: MethodContext, requestedInstructorId: string) {
    const { actingUserId, roleFlags } = await requireTeacherOrAdmin(thisArg);
    const normalizedInstructorId = deps.normalizeCanonicalId(requestedInstructorId) || actingUserId;
    if (!roleFlags.admin && normalizedInstructorId !== actingUserId) {
      throw new Meteor.Error(403, 'Can only access your own instructor data');
    }
    return normalizedInstructorId;
  }

  function requireCourseSnapshotDeps() {
    if (!deps.CourseLearnerSnapshotCache || !deps.UserDashboardCache) {
      throw new Meteor.Error(500, 'Course learner snapshot cache dependencies are not registered');
    }
    return {
      CourseLearnerSnapshotCache: deps.CourseLearnerSnapshotCache,
      UserDashboardCache: deps.UserDashboardCache,
    };
  }

  async function invalidateCourseSnapshotForUser(userId: string, reason: string) {
    const { CourseLearnerSnapshotCache } = requireCourseSnapshotDeps();
    await CourseLearnerSnapshotCache.updateAsync(
      { userId, version: COURSE_SNAPSHOT_VERSION },
      { $set: { invalidatedAt: new Date(), rebuildReason: reason } }
    );
  }

  async function invalidateCourseSnapshotsForCourse(courseId: string, reason: string) {
    const { CourseLearnerSnapshotCache } = requireCourseSnapshotDeps();
    const sections = await deps.Sections.find({ courseId }, { fields: { _id: 1 } }).fetchAsync();
    const sectionIds = sections.map((section: any) => String(section?._id || '')).filter(Boolean);
    const enrolledRows = sectionIds.length > 0
      ? await deps.SectionUserMap.find({ sectionId: { $in: sectionIds } }, { fields: { userId: 1 } }).fetchAsync()
      : [];
    const enrolledUserIds = [...new Set(enrolledRows.map((row: any) => normalizeOptionalString(row?.userId)).filter(Boolean))];
    if (enrolledUserIds.length > 0) {
      await CourseLearnerSnapshotCache.updateAsync(
        { userId: { $in: enrolledUserIds }, version: COURSE_SNAPSHOT_VERSION },
        { $set: { invalidatedAt: new Date(), rebuildReason: reason } },
        { multi: true }
      );
    }
    const publicResult = await CourseLearnerSnapshotCache.updateAsync(
      { publicCourseIds: courseId, version: COURSE_SNAPSHOT_VERSION },
      { $set: { invalidatedAt: new Date(), rebuildReason: reason } },
      { multi: true }
    );
    deps.serverConsole('[CourseSnapshot] invalidated course snapshots', { courseId, reason, enrolledCount: enrolledUserIds.length, publicResult });
  }

  async function invalidateCourseSnapshotsForAssignment(assignmentId: string, reason: string) {
    const { CourseLearnerSnapshotCache } = requireCourseSnapshotDeps();
    const result = await CourseLearnerSnapshotCache.updateAsync(
      { assignmentIds: assignmentId, version: COURSE_SNAPSHOT_VERSION },
      { $set: { invalidatedAt: new Date(), rebuildReason: reason } },
      { multi: true }
    );
    deps.serverConsole('[CourseSnapshot] invalidated assignment snapshots', { assignmentId, reason, result });
  }

  async function getTdfSummariesByIds(tdfIds: string[]) {
    if (tdfIds.length === 0) return new Map<string, ReturnType<typeof getTdfSummary>>();
    const tdfs = await deps.Tdfs.find(
      { _id: { $in: [...new Set(tdfIds)] } },
      {
        fields: {
          _id: 1,
          ownerId: 1,
          accessors: 1,
          stimuliSetId: 1,
          'content.fileName': 1,
          'content.isMultiTdf': 1,
          'content.tdfs.tutor.setspec.lessonname': 1,
          'content.tdfs.tutor.setspec.tags': 1,
        },
      }
    ).fetchAsync();
    return new Map(tdfs.map((tdf: any) => [String(tdf._id), getTdfSummary(tdf)]));
  }

  async function fetchNormalizedAssignmentSummaries(courseId: string) {
    const rows = await deps.Assignments.find(
      { courseId },
      { fields: { _id: 1, courseId: 1, TDFId: 1, order: 1, releaseAt: 1, dueAt: 1, required: 1, createdAt: 1, updatedAt: 1 } }
    ).fetchAsync();
    const summariesById = await getTdfSummariesByIds(rows.map((row: any) => String(row?.TDFId || '')).filter(Boolean));
    const titleById = new Map(Array.from(summariesById.entries()).map(([tdfId, summary]) => [tdfId, summary.displayName]));
    return rows
      .map((row: any, index: number) => normalizeAssignmentRow(row, index, titleById))
      .filter((row: CourseAssignmentSummary | null): row is CourseAssignmentSummary => !!row)
      .sort((a: CourseAssignmentSummary, b: CourseAssignmentSummary) => a.order - b.order || a.title.localeCompare(b.title) || a.assignmentId.localeCompare(b.assignmentId));
  }

  async function getSourceSentences(stimuliSetId: string | number) {
    const sourceSentencesRet = deps.itemSourceSentences.find({ stimuliSetId });
    return sourceSentencesRet.sourceSentences;
  }

  async function getAllCourses(this: MethodContext) {
    await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
      userId: this.userId,
      roles: ['admin'],
      notLoggedInMessage: 'Must be logged in',
      notLoggedInCode: 401,
      forbiddenMessage: 'Admin access required',
      forbiddenCode: 403,
    });
    try {
      const coursesRet = await deps.Courses.find().fetchAsync();
      const courses = [];
      for (const course of coursesRet) {
        courses.push(getCourse(normalizeCourseDocumentForRead(course)));
      }
      return courses;
    } catch (e: unknown) {
      throwLoggedCourseOperationError(deps, 'getAllCourses', e);
    }
  }

  async function getAllCourseSections(this: MethodContext) {
    if (!this.userId) {
      throw new Meteor.Error(401, 'Must be logged in');
    }
    try {
      deps.serverConsole('getAllCourseSections');
      return await deps.Courses.rawCollection().aggregate([
        {
          $match: { semester: curSemester },
        },
        {
          $lookup: {
            from: 'section',
            localField: '_id',
            foreignField: 'courseId',
            as: 'section',
          },
        },
        {
          $unwind: {
            path: '$section',
          },
        },
        {
          $project: {
            _id: 0,
            sectionName: '$section.sectionName',
            courseId: '$_id',
            courseName: 1,
            teacherUserId: 1,
            semester: 1,
            visibility: { $ifNull: ['$visibility', 'private'] },
            beginDate: 1,
            endDate: 1,
            timezone: { $ifNull: ['$timezone', DEFAULT_COURSE_TIMEZONE] },
            sectionId: '$section._id',
          },
        },
      ]).toArray();
    } catch (e: unknown) {
      throwLoggedCourseOperationError(deps, 'getAllCourseSections', e);
    }
  }

  async function getAllCoursesForInstructor(this: MethodContext, instructorId: string) {
    instructorId = await resolveInstructorForCaller(this, instructorId);
    deps.serverConsole('getAllCoursesForInstructor:', instructorId);
    const courses = await deps.Courses.find(
      { teacherUserId: instructorId, semester: curSemester },
      { fields: { _id: 1, courseName: 1, teacherUserId: 1, semester: 1, visibility: 1, beginDate: 1, endDate: 1, timezone: 1 } }
    ).fetchAsync();
    return courses.map(normalizeCourseDocumentForRead);
  }

  async function getAllCourseAssignmentsForInstructor(this: MethodContext, instructorId: string) {
    try {
      instructorId = await resolveInstructorForCaller(this, instructorId);
      deps.serverConsole('getAllCourseAssignmentsForInstructor:' + instructorId);
      return await deps.Assignments.rawCollection().aggregate([
        {
          $lookup: {
            from: 'tdfs',
            localField: 'TDFId',
            foreignField: '_id',
            as: 'TDF',
          },
        },
        {
          $unwind: { path: '$TDF' },
        },
        {
          $lookup: {
            from: 'course',
            localField: 'courseId',
            foreignField: '_id',
            as: 'course',
          },
        },
        {
          $unwind: { path: '$course' },
        },
        {
          $match: {
            'course.teacherUserId': instructorId,
            'course.semester': curSemester,
          },
        },
        {
          $project: {
            _id: 0,
            fileName: '$TDF.content.fileName',
            courseName: '$course.courseName',
            courseId: '$course._id',
          },
        },
      ]).toArray();
    } catch (e: unknown) {
      throwLoggedCourseOperationError(deps, 'getAllCourseAssignmentsForInstructor', e, instructorId);
    }
  }

  async function getAssignedTdfIdsForSection(sectionId: string) {
    const section = await deps.Sections.findOneAsync({ _id: sectionId });
    if (!section) {
      return [];
    }
    const courseId = section.courseId;
    const course = await deps.Courses.findOneAsync({ _id: courseId });
    if (!course || course.semester !== curSemester) {
      return [];
    }
    const rows = await deps.Assignments.find(
      { courseId },
      { fields: { TDFId: 1 } }
    ).fetchAsync();
    return rows
      .map((row: any) => String(row?.TDFId || '').trim())
      .filter((id: string) => id.length > 0);
  }

  async function updateUserAssignments(courseId: string) {
    deps.serverConsole('updateUserAssignments', courseId);
    const sections = await deps.Sections.find({ courseId }).fetchAsync();
    const students = [];
    for (const section of sections) {
      const studentsInSection = await deps.SectionUserMap.find({ sectionId: section._id }).fetchAsync();
      for (const student of studentsInSection) {
        students.push({ studentId: student.userId, sectionId: section._id });
      }
    }
    deps.serverConsole('updateUserAssignments: Processing', students.length, 'students');
    for (const student of students) {
      const assignedTDFs = await getAssignedTdfIdsForSection(student.sectionId);
      const user = await deps.usersCollection.findOneAsync({ _id: student.studentId });
      const loginParams = user?.loginParams || {};
      loginParams.assignedTDFs = assignedTDFs;
      await deps.usersCollection.updateAsync({ _id: student.studentId }, { $set: { loginParams } });
    }
  }

  async function sendCourseAssignmentEmail(userId: string, course: any, section: any) {
    const student = await deps.usersCollection.findOneAsync(
      { _id: userId },
      { fields: { username: 1, email_canonical: 1, emails: 1 } }
    );
    const to = getPrimaryUserEmail(student);
    if (!to) {
      throw new Meteor.Error(400, 'Cannot send course assignment email because the learner account has no email address');
    }
    const baseUrl = normalizeOptionalString(deps.thisServerUrl);
    if (!baseUrl) {
      throw new Meteor.Error(500, 'Cannot send course assignment email because ROOT_URL is not configured');
    }
    const from = normalizeOptionalString(deps.emailFrom);
    if (!from) {
      throw new Meteor.Error(500, 'Cannot send course assignment email because emailFrom is not configured');
    }
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const coursesUrl = `${normalizedBaseUrl}/courses`;
    const courseName = String(course?.courseName || 'your course');
    const sectionName = String(section?.sectionName || 'your section');
    const subject = `MoFaCTS course assignment: ${courseName}`;
    const displayName = deps.getUserDisplayIdentifier(student) || 'learner';
    const text = [
      `Hello ${displayName},`,
      '',
      `You have been assigned to ${courseName} (${sectionName}) in MoFaCTS.`,
      '',
      `Open MoFaCTS: ${normalizedBaseUrl}`,
      `Go directly to Courses: ${coursesUrl}`,
      '',
      'After signing in, choose Courses from the Learn menu. Your assigned course will appear at the top of the Courses page. Select Start or Continue on an assignment to begin practicing.',
      '',
      'If you do not see the course after signing in, contact your instructor.',
    ].join('\n');
    deps.sendEmail(to, from, subject, text);
  }

  async function getCourseAssignmentEditorSnapshot(this: MethodContext, courseId: string): Promise<CourseAssignmentEditorSnapshot> {
    const { course } = await assertCanManageCourse(this, courseId);
    const assignments = await fetchNormalizedAssignmentSummaries(String(course._id));
    const { actingUserId, roleFlags } = await requireTeacherOrAdmin(this);
    const tdfSelector = roleFlags.admin
      ? {}
      : { $or: [{ ownerId: actingUserId }, { 'accessors.userId': actingUserId }] };
    const assignableTdfs = await deps.Tdfs.find(
      tdfSelector,
      {
        fields: {
          _id: 1,
          ownerId: 1,
          accessors: 1,
          'content.fileName': 1,
          'content.tdfs.tutor.setspec.lessonname': 1,
          'content.tdfs.tutor.setspec.tags': 1,
        },
      }
    ).fetchAsync();
    return {
      course: {
        courseId: String(course._id),
        courseName: String(course.courseName || ''),
        visibility: normalizeCourseVisibility(course.visibility),
        teacherUserId: String(course.teacherUserId || ''),
      },
      assignments,
      assignableTdfs: assignableTdfs.map(getTdfSummary)
        .filter((tdf: any) => tdf.TDFId)
        .map((tdf: any) => ({
          TDFId: tdf.TDFId,
          fileName: tdf.fileName,
          displayName: tdf.displayName,
          tags: tdf.tags,
          ownerId: tdf.ownerId,
        }))
        .sort((a: any, b: any) => a.displayName.localeCompare(b.displayName) || a.fileName.localeCompare(b.fileName)),
    };
  }

  function validateAssignmentInput(raw: unknown, index: number, timezone: string) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Meteor.Error(400, `Assignment row ${index + 1} must be an object`);
    }
    const row = raw as UnknownRecord;
    assertKnownFields(row, ['assignmentId', 'TDFId', 'order', 'releaseAt', 'dueAt', 'required'], `Assignment row ${index + 1}`);
    const TDFId = normalizeOptionalString(row.TDFId);
    if (!TDFId) throw new Meteor.Error(400, `Assignment row ${index + 1} requires TDFId`);
    const releaseAt = parseDateLike(row.releaseAt ?? null, `Assignment row ${index + 1} release date`, timezone);
    const dueAt = parseDateLike(row.dueAt ?? null, `Assignment row ${index + 1} due date`, timezone);
    if (releaseAt && dueAt && dueAt.getTime() < releaseAt.getTime()) {
      throw new Meteor.Error(400, `Assignment row ${index + 1} due date must be on or after release date`);
    }
    const clientOrder = Number(row.order);
    if (!Number.isInteger(clientOrder) || clientOrder < 0) {
      throw new Meteor.Error(400, `Assignment row ${index + 1} order must be a non-negative integer`);
    }
    if (row.required !== true && row.required !== false) {
      throw new Meteor.Error(400, `Assignment row ${index + 1} required must be true or false`);
    }
    return {
      assignmentId: normalizeOptionalString(row.assignmentId),
      TDFId,
      order: index,
      releaseAt,
      dueAt,
      required: row.required === true,
    };
  }

  async function saveCourseAssignments(this: MethodContext, input: SaveCourseAssignmentsInput) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Meteor.Error(400, 'Assignment save payload must be an object');
    }
    assertKnownFields(input as unknown as UnknownRecord, ['courseId', 'assignments'], 'Assignment save payload');
    const { course } = await assertCanManageCourse(this, input.courseId);
    const timezone = normalizeTimezone(course.timezone, true);
    if (!Array.isArray(input.assignments)) {
      throw new Meteor.Error(400, 'Assignments must be an array');
    }
    if (input.assignments.length > MAX_ASSIGNMENTS_PER_COURSE) {
      throw new Meteor.Error(400, `A course can have at most ${MAX_ASSIGNMENTS_PER_COURSE} assignments`);
    }
    const normalizedRows = input.assignments.map((row: unknown, index: number) => validateAssignmentInput(row, index, timezone));
    const duplicateTdfIds = normalizedRows
      .map((row) => row.TDFId)
      .filter((tdfId, index, all) => all.indexOf(tdfId) !== index);
    if (duplicateTdfIds.length > 0) {
      throw new Meteor.Error(400, `Duplicate TDF assignments are not allowed: ${[...new Set(duplicateTdfIds)].join(', ')}`);
    }
    const tdfSummaries = await getTdfSummariesByIds(normalizedRows.map((row) => row.TDFId));
    for (const row of normalizedRows) {
      if (!tdfSummaries.has(row.TDFId)) {
        throw new Meteor.Error(404, `Assignable TDF not found: ${row.TDFId}`);
      }
    }
    const existingRows = await deps.Assignments.find(
      { courseId: String(course._id) },
      { fields: { _id: 1, courseId: 1, TDFId: 1 } }
    ).fetchAsync();
    const existingById = new Map(existingRows.map((row: any) => [String(row._id), row]));
    const existingByTdfId = new Map(existingRows.map((row: any) => [String(row.TDFId), row]));
    const keepIds = new Set<string>();
    const now = new Date();
    let membershipChanged = false;
    const changedAssignmentIds = new Set<string>();

    for (const row of normalizedRows) {
      const existing = row.assignmentId ? existingById.get(row.assignmentId) : existingByTdfId.get(row.TDFId);
      if (row.assignmentId && !existing) {
        throw new Meteor.Error(400, `Assignment id does not belong to this course: ${row.assignmentId}`);
      }
      if (existing) {
        keepIds.add(String(existing._id));
        changedAssignmentIds.add(String(existing._id));
        await deps.Assignments.updateAsync(
          { _id: existing._id, courseId: String(course._id) },
          {
            $set: {
              TDFId: row.TDFId,
              order: row.order,
              releaseAt: row.releaseAt,
              dueAt: row.dueAt,
              required: row.required,
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
            },
          }
        );
      } else {
        membershipChanged = true;
        const insertedId = await deps.Assignments.insertAsync({
          courseId: String(course._id),
          TDFId: row.TDFId,
          order: row.order,
          releaseAt: row.releaseAt,
          dueAt: row.dueAt,
          required: row.required,
          createdAt: now,
          updatedAt: now,
        });
        if (insertedId) changedAssignmentIds.add(String(insertedId));
      }
    }

    for (const existing of existingRows) {
      if (!keepIds.has(String(existing._id))) {
        membershipChanged = true;
        changedAssignmentIds.add(String(existing._id));
        await deps.Assignments.removeAsync({ _id: existing._id, courseId: String(course._id) });
      }
    }

    if (membershipChanged) {
      await updateUserAssignments(String(course._id));
    }
    await invalidateCourseSnapshotsForCourse(String(course._id), 'assignment-updated');
    for (const assignmentId of changedAssignmentIds) {
      await invalidateCourseSnapshotsForAssignment(assignmentId, 'assignment-updated');
    }
    return await getCourseAssignmentEditorSnapshot.call(this, String(course._id));
  }

  async function editCourseAssignments(this: MethodContext, newCourseAssignment: { courseId: string; tdfs: string[] }) {
    try {
      await assertCanManageCourse(this, newCourseAssignment.courseId);
      if (!Array.isArray(newCourseAssignment.tdfs)) {
        throw new Meteor.Error(400, 'Legacy assignment payload requires a tdfs array');
      }
      const fileNames = newCourseAssignment.tdfs.map((fileName) => String(fileName || '').trim()).filter(Boolean);
      const tdfs = await deps.Tdfs.find(
        { 'content.fileName': { $in: fileNames } },
        { fields: { _id: 1, 'content.fileName': 1 } }
      ).fetchAsync();
      const tdfIdByFileName = new Map(tdfs.map((tdf: any) => [String(tdf?.content?.fileName || ''), String(tdf?._id || '')]));
      const missingFileNames = fileNames.filter((fileName) => !tdfIdByFileName.get(fileName));
      if (missingFileNames.length > 0) {
        throw new Meteor.Error(400, `Could not resolve TDF file name(s): ${missingFileNames.join(', ')}`);
      }
      const result = await saveCourseAssignments.call(this, {
        courseId: newCourseAssignment.courseId,
        assignments: fileNames.map((fileName, order) => ({
          TDFId: tdfIdByFileName.get(fileName)!,
          order,
          releaseAt: null,
          dueAt: null,
          required: true,
        })),
      });
      return result;
    } catch (e: unknown) {
      throwLoggedCourseOperationError(deps, 'editCourseAssignments', e, newCourseAssignment.courseId);
    }
  }

  async function getTdfAssignmentsByCourseIdMap(this: MethodContext, instructorId: string) {
    instructorId = await resolveInstructorForCaller(this, instructorId);
    deps.serverConsole('getTdfAssignmentsByCourseIdMap', instructorId);
    const assignmentTdfFileNamesRet = await deps.Assignments.rawCollection().aggregate([
      {
        $lookup: {
          from: 'course',
          localField: 'courseId',
          foreignField: '_id',
          as: 'course',
        },
      },
      {
        $match: {
          'course.semester': curSemester,
          'course.teacherUserId': instructorId,
        },
      },
      {
        $lookup: {
          from: 'tdfs',
          localField: 'TDFId',
          foreignField: '_id',
          as: 'TDF',
        },
      },
      {
        $unwind: {
          path: '$TDF',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          assignmentId: '$_id',
          content: '$TDF.content',
          TDFId: 1,
          courseId: 1,
          dueAt: 1,
        },
      },
    ]).toArray();
    deps.serverConsole('Found', assignmentTdfFileNamesRet.length, 'assigned TDFs');

    const assignmentTdfFileNamesByCourseIdMap: Record<string, Array<{ assignmentId: string; TDFId: string; displayName: string; dueAt: unknown }>> = {};
    for (const assignment of assignmentTdfFileNamesRet) {
      const courseId = String(assignment.courseId);
      if (!assignmentTdfFileNamesByCourseIdMap[courseId]) {
        assignmentTdfFileNamesByCourseIdMap[courseId] = [];
      }
      assignmentTdfFileNamesByCourseIdMap[courseId]!.push({
        assignmentId: assignment._id || assignment.assignmentId,
        TDFId: assignment.TDFId,
        displayName: assignment.content.tdfs.tutor.setspec.lessonname,
        dueAt: assignment.dueAt || null,
      });
    }
    return assignmentTdfFileNamesByCourseIdMap;
  }

  async function resolveAssignedRootTdfIdsForUser(userId: string) {
    const enrollmentRows = await deps.SectionUserMap.find(
      { userId },
      { fields: { sectionId: 1 } }
    ).fetchAsync();
    const sectionIds: string[] = enrollmentRows
      .map((row: any) => deps.normalizeCanonicalId(row?.sectionId))
      .filter((id: string | null): id is string => typeof id === 'string');
    if (sectionIds.length === 0) {
      return [];
    }

    const uniqueSectionIds = [...new Set(sectionIds)];
    const sections = await deps.Sections.find(
      { _id: { $in: uniqueSectionIds } },
      { fields: { _id: 1, courseId: 1 } }
    ).fetchAsync();
    const courseIds = [...new Set(
      sections
        .map((section: any) => deps.normalizeCanonicalId(section?.courseId))
        .filter((courseId: string | null): courseId is string => typeof courseId === 'string')
    )];
    if (courseIds.length === 0) {
      return [];
    }

    const activeCourses = await deps.Courses.find(
      { _id: { $in: courseIds }, semester: curSemester },
      { fields: { _id: 1 } }
    ).fetchAsync();
    const activeCourseIds = activeCourses.map((course: any) => String(course?._id || '').trim()).filter(Boolean);
    if (activeCourseIds.length === 0) {
      return [];
    }

    const assignmentRows = await deps.Assignments.find(
      { courseId: { $in: activeCourseIds } },
      { fields: { TDFId: 1 } }
    ).fetchAsync();
    const assignedIdSet = new Set<string>();
    for (const row of assignmentRows) {
      const normalizedId = deps.normalizeCanonicalId((row as any)?.TDFId);
      if (normalizedId) {
        assignedIdSet.add(normalizedId);
      }
    }
    return Array.from(assignedIdSet);
  }

  function courseIsDateVisible(course: any, now = new Date()) {
    const beginDate = parseNullablePersistedDate(course?.beginDate);
    const endDate = parseNullablePersistedDate(course?.endDate);
    return (!beginDate || now.getTime() >= beginDate.getTime()) && (!endDate || now.getTime() <= endDate.getTime());
  }

  async function rebuildLearnerCoursesSnapshot(userId: string, reason: string): Promise<LearnerCoursesSnapshot> {
    const { CourseLearnerSnapshotCache, UserDashboardCache } = requireCourseSnapshotDeps();
    const roleFlags = await getUserRoleFlags(deps.getMethodAuthorizationDeps(), userId, ['admin', 'teacher'] as const);
    const enrollmentRows = await deps.SectionUserMap.find({ userId }, { fields: { sectionId: 1 } }).fetchAsync();
    const sectionIds = enrollmentRows.map((row: any) => normalizeOptionalString(row?.sectionId)).filter((id: string | null): id is string => !!id);
    const sections = sectionIds.length > 0
      ? await deps.Sections.find({ _id: { $in: sectionIds } }, { fields: { _id: 1, courseId: 1 } }).fetchAsync()
      : [];
    const enrolledCourseIds = [...new Set(sections.map((section: any) => normalizeOptionalString(section?.courseId)).filter((id: string | null): id is string => !!id))];
    const now = new Date();
    const courseSelector: any = {
      $or: [
        { visibility: 'public' },
        { _id: { $in: enrolledCourseIds } },
      ],
    };
    if (roleFlags.teacher) {
      courseSelector.$or.push({ teacherUserId: userId });
    }
    if (roleFlags.admin) {
      courseSelector.$or.push({ teacherUserId: { $exists: true } });
    }
    const rawCourses = await deps.Courses.find(
      courseSelector,
      { fields: { _id: 1, courseName: 1, visibility: 1, teacherUserId: 1, beginDate: 1, endDate: 1, timezone: 1 } }
    ).fetchAsync();
    const visibleCourses = rawCourses.filter((course: any) => {
      const visibility = normalizeCourseVisibility(course.visibility);
      if (roleFlags.admin || String(course.teacherUserId || '') === userId) return true;
      if (visibility === 'public' || enrolledCourseIds.includes(String(course._id))) {
        return courseIsDateVisible(course, now);
      }
      return false;
    });
    const courseIds = visibleCourses.map((course: any) => String(course._id));
    const assignmentRows = courseIds.length > 0
      ? await deps.Assignments.find(
        { courseId: { $in: courseIds } },
        { fields: { _id: 1, courseId: 1, TDFId: 1, order: 1, releaseAt: 1, dueAt: 1, required: 1, createdAt: 1, updatedAt: 1 } }
      ).fetchAsync()
      : [];
    const tdfSummaries = await getTdfSummariesByIds(assignmentRows.map((row: any) => String(row?.TDFId || '')).filter(Boolean));
    const titleById = new Map(Array.from(tdfSummaries.entries()).map(([tdfId, summary]) => [tdfId, summary.displayName]));
    const dashboardCache = await UserDashboardCache.findOneAsync({ userId });
    const assignmentsByCourseId = new Map<string, LearnerCourseSnapshotAssignment[]>();
    for (const row of assignmentRows) {
      const summary = normalizeAssignmentRow(row, 0, titleById, now);
      if (!summary) continue;
      const tdf = tdfSummaries.get(summary.TDFId);
      if (!tdf) continue;
      const progressProjection = buildDashboardStatsProjection(dashboardCache?.tdfStats?.[summary.TDFId], null);
      const releaseAt = summary.releaseAt;
      const ordinaryLearner = !roleFlags.admin && String(visibleCourses.find((course: any) => String(course._id) === summary.courseId)?.teacherUserId || '') !== userId;
      const availability: LearnerCourseSnapshotAssignment['availability'] = releaseAt && releaseAt.getTime() > now.getTime() && ordinaryLearner ? 'scheduled' : 'available';
      const enriched: LearnerCourseSnapshotAssignment = {
        ...summary,
        availability,
        fileName: tdf.fileName,
        tags: tdf.tags,
        currentStimuliSetId: tdf.currentStimuliSetId,
        ...progressProjection,
      };
      const list = assignmentsByCourseId.get(summary.courseId) || [];
      list.push(enriched);
      assignmentsByCourseId.set(summary.courseId, list);
    }
    const teacherIds = [...new Set(visibleCourses.map((course: any) => normalizeOptionalString(course?.teacherUserId)).filter((id: string | null): id is string => !!id))];
    const teachers = teacherIds.length > 0
      ? await deps.usersCollection.find({ _id: { $in: teacherIds } }, { fields: { _id: 1, username: 1, email_canonical: 1, emails: 1 } }).fetchAsync()
      : [];
    const teacherById = new Map(teachers.map((teacher: any) => [String(teacher._id), deps.getUserDisplayIdentifier(teacher)]));
    const toSnapshotCourse = (course: any, membership: LearnerCourseSnapshotCourse['membership']): LearnerCourseSnapshotCourse => ({
      courseId: String(course._id),
      courseName: String(course.courseName || ''),
      visibility: normalizeCourseVisibility(course.visibility),
      beginDate: parseNullablePersistedDate(course.beginDate),
      endDate: parseNullablePersistedDate(course.endDate),
      timezone: normalizeTimezone(course.timezone, true),
      teacherUserId: String(course.teacherUserId || ''),
      teacherDisplayName: teacherById.get(String(course.teacherUserId || '')) || String(course.teacherUserId || ''),
      membership,
      assignments: (assignmentsByCourseId.get(String(course._id)) || [])
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    });
    const assignedCourses: LearnerCourseSnapshotCourse[] = [];
    const publicCourses: LearnerCourseSnapshotCourse[] = [];
    for (const course of visibleCourses) {
      const courseId = String(course._id);
      const isTeacherCourse = String(course.teacherUserId || '') === userId;
      if (enrolledCourseIds.includes(courseId) || isTeacherCourse || roleFlags.admin) {
        assignedCourses.push(toSnapshotCourse(course, roleFlags.admin ? 'admin' : isTeacherCourse ? 'teacher' : 'assigned'));
      } else if (normalizeCourseVisibility(course.visibility) === 'public') {
        publicCourses.push(toSnapshotCourse(course, 'public'));
      }
    }
    const snapshot: LearnerCoursesSnapshot = {
      version: COURSE_SNAPSHOT_VERSION,
      userId,
      generatedAt: Date.now(),
      assignedCourses: assignedCourses.sort((a, b) => a.courseName.localeCompare(b.courseName)),
      publicCourses: publicCourses.sort((a, b) => a.courseName.localeCompare(b.courseName)),
      invalidatedAt: null,
      source: 'rebuilt',
    };
    await CourseLearnerSnapshotCache.updateAsync(
      { userId, version: COURSE_SNAPSHOT_VERSION },
      {
        $set: {
          userId,
          version: COURSE_SNAPSHOT_VERSION,
          generatedAt: new Date(snapshot.generatedAt),
          invalidatedAt: null,
          assignedCourseIds: snapshot.assignedCourses.map((course) => course.courseId),
          publicCourseIds: snapshot.publicCourses.map((course) => course.courseId),
          assignmentIds: [...new Set([...snapshot.assignedCourses, ...snapshot.publicCourses].flatMap((course) => course.assignments.map((assignment) => assignment.assignmentId)))],
          tdfIds: [...new Set([...snapshot.assignedCourses, ...snapshot.publicCourses].flatMap((course) => course.assignments.map((assignment) => assignment.TDFId)))],
          snapshot,
          rebuildReason: reason,
        },
      },
      { upsert: true }
    );
    return snapshot;
  }

  async function getLearnerCoursesSnapshot(this: MethodContext): Promise<LearnerCoursesSnapshot> {
    const userId = requireAuthenticatedUser(this.userId, 'Must be logged in', 401);
    const { CourseLearnerSnapshotCache } = requireCourseSnapshotDeps();
    const existing = await CourseLearnerSnapshotCache.findOneAsync({ userId, version: COURSE_SNAPSHOT_VERSION });
    if (existing?.snapshot && existing.invalidatedAt === null && existing.version === COURSE_SNAPSHOT_VERSION) {
      return {
        ...(existing.snapshot as LearnerCoursesSnapshot),
        source: 'cache',
        invalidatedAt: null,
      };
    }
    const reason = existing ? (existing.version !== COURSE_SNAPSHOT_VERSION ? 'version' : 'invalidated') : 'missing';
    return await rebuildLearnerCoursesSnapshot(userId, reason);
  }

  async function getTdfsAssignedToStudent(this: MethodContext, userId: string, curSectionId: string) {
    deps.serverConsole('getTdfsAssignedToStudent', userId, curSectionId);
    const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in', 401);
    if (!userId || !curSectionId) {
      throw new Meteor.Error(400, 'User and section are required');
    }

    const roleFlags = await getUserRoleFlags(deps.getMethodAuthorizationDeps(), actingUserId, ['admin', 'teacher'] as const);
    const callerIsAdmin = roleFlags.admin;
    const callerIsTeacher = roleFlags.teacher;
    const isSelfRequest = actingUserId === userId;
    if (!isSelfRequest && !callerIsAdmin && !callerIsTeacher) {
      throw new Meteor.Error(403, 'Permission denied');
    }

    const pipeline = [
      { $match: { _id: curSectionId } },
      {
        $lookup: {
          from: 'course',
          let: { courseId: '$courseId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$courseId'] },
                    { $eq: ['$semester', curSemester] },
                  ],
                },
              },
            },
          ],
          as: 'course',
        },
      },
      { $unwind: { path: '$course', preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: 'section_user_map',
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$sectionId', curSectionId] },
                    { $eq: ['$userId', userId] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'enrollment',
        },
      },
      {
        $lookup: {
          from: 'assessments',
          localField: 'course._id',
          foreignField: 'courseId',
          as: 'assignments',
        },
      },
      {
        $project: {
          'course.teacherUserId': 1,
          enrollment: 1,
          'assignments.TDFId': 1,
        },
      },
    ];

    const results = await deps.Sections.rawCollection().aggregate(pipeline).toArray();
    const result = results[0];
    if (!result) {
      const sectionExists = await deps.Sections.findOneAsync({ _id: curSectionId }, { fields: { _id: 1 } });
      if (!sectionExists) {
        throw new Meteor.Error(404, 'Section not found');
      }
      return [];
    }

    const enrolled = Array.isArray(result.enrollment) && result.enrollment.length > 0;
    const teacherOwnsCourse = callerIsTeacher &&
      String(result.course?.teacherUserId || '') === this.userId;
    if (!enrolled && !callerIsAdmin && !teacherOwnsCourse) {
      throw new Meteor.Error(403, 'User is not enrolled in this section');
    }

    const assignments = Array.isArray(result.assignments) ? result.assignments : [];
    const assignedIdSet = new Set<string>();
    for (const row of assignments) {
      const id = deps.normalizeCanonicalId(row?.TDFId);
      if (id) assignedIdSet.add(id);
    }
    return Array.from(assignedIdSet);
  }

  async function getTdfNamesAssignedByInstructor(this: MethodContext, instructorID: string) {
    try {
      instructorID = await resolveInstructorForCaller(this, instructorID);
      let assignmentTdfFileNames = await deps.Courses.rawCollection().aggregate([
        {
          $lookup: {
            from: 'assessments',
            localField: '_id',
            foreignField: 'courseId',
            as: 'assessment',
          },
        },
        {
          $unwind: { path: '$assessment' },
        },
        {
          $lookup: {
            from: 'tdfs',
            localField: 'assessment.TDFId',
            foreignField: '_id',
            as: 'TDF',
          },
        },
        {
          $unwind: { path: '$TDF' },
        },
        {
          $match: {
            semester: curSemester,
            teacherUserId: instructorID,
          },
        },
        {
          $project: {
            _id: 0,
            fileName: '$TDF.content.fileName',
            TDFId: '$TDF._id',
          },
        },
      ]).toArray();
      assignmentTdfFileNames = [...new Set(assignmentTdfFileNames.map((item: { fileName?: string; TDFId?: string }) => item.fileName || item.TDFId))];
      deps.serverConsole('assignmentTdfFileNames', assignmentTdfFileNames);
      return assignmentTdfFileNames;
    } catch (e: unknown) {
      throwLoggedCourseOperationError(deps, 'getTdfNamesAssignedByInstructor', e);
    }
  }

  async function getTdfNamesByOwnerId(ownerId: string) {
    deps.serverConsole('getTdfNamesByOwnerId', ownerId);
    try {
      const tdfs = await deps.Tdfs.find({ ownerId }).fetchAsync();
      const ownedTdfFileNames = tdfs.map((tdf: { content?: { fileName?: string }; _id: string }) => tdf.content?.fileName || tdf._id);
      deps.serverConsole('ownedTdfFileNames count:', ownedTdfFileNames.length);
      return ownedTdfFileNames;
    } catch (e: unknown) {
      throwLoggedCourseOperationError(deps, 'getTdfNamesByOwnerId', e);
    }
  }

  async function getAllTeachers(this: MethodContext) {
    const query = { roles: 'teacher' };
    deps.serverConsole('getAllTeachers', query);
    if (!this.userId) {
      throw new Meteor.Error(401, 'Must be logged in');
    }
    const allTeachers = await deps.usersCollection.find(query, {
      fields: {
        _id: 1,
        username: 1,
        email_canonical: 1,
        'emails.address': 1,
      },
    }).fetchAsync();

    return allTeachers.map((teacher: any) => ({
      ...teacher,
      username: deps.getUserDisplayIdentifier(teacher),
      displayIdentifier: deps.getUserDisplayIdentifier(teacher),
    }));
  }

  async function addCourse(this: MethodContext, mycourse: { sections: string[] } & UnknownRecord) {
    const { actingUserId, roleFlags } = await requireTeacherOrAdmin(this);
    assertKnownFields(mycourse, ['courseId', 'courseName', 'teacherUserId', 'semester', 'beginDate', 'endDate', 'timezone', 'visibility', 'sections'], 'Course');
    const { beginDate, endDate, timezone } = normalizeCourseDates(mycourse);
    const sections = Array.isArray(mycourse.sections) ? mycourse.sections.map((section) => String(section || '').trim()).filter(Boolean) : [];
    if (!normalizeOptionalString(mycourse.courseName)) {
      throw new Meteor.Error(400, 'Course name is required');
    }
    const teacherUserId = roleFlags.admin && deps.normalizeCanonicalId(mycourse.teacherUserId)
      ? deps.normalizeCanonicalId(mycourse.teacherUserId)
      : actingUserId;
    const courseDoc = {
      courseName: String(mycourse.courseName),
      teacherUserId,
      semester: normalizeOptionalString(mycourse.semester) || curSemester,
      beginDate,
      endDate,
      timezone,
      visibility: normalizeCourseVisibility(mycourse.visibility),
    };
    deps.serverConsole('addCourse:' + JSON.stringify(courseDoc));
    const courseId = await deps.Courses.insertAsync(courseDoc);
    for (const sectionName of sections) {
      await deps.Sections.insertAsync({ courseId, sectionName });
    }
    await invalidateCourseSnapshotsForCourse(String(courseId), 'course-added');
    return courseId;
  }

  async function editCourse(this: MethodContext, mycourse: { _id: string; courseId: string; sections: string[] } & UnknownRecord) {
    assertKnownFields(mycourse, ['_id', 'courseId', 'courseName', 'teacherUserId', 'semester', 'beginDate', 'endDate', 'timezone', 'visibility', 'sections'], 'Course');
    const targetCourseId = deps.normalizeCanonicalId(mycourse._id) || deps.normalizeCanonicalId(mycourse.courseId);
    const { course, actingUserId, roleFlags } = await assertCanManageCourse(this, targetCourseId || '');
    const { beginDate, endDate, timezone } = normalizeCourseDates(mycourse, course);
    if (!normalizeOptionalString(mycourse.courseName)) {
      throw new Meteor.Error(400, 'Course name is required');
    }
    const teacherUserId = roleFlags.admin && deps.normalizeCanonicalId(mycourse.teacherUserId)
      ? deps.normalizeCanonicalId(mycourse.teacherUserId)
      : (!roleFlags.admin ? actingUserId : course.teacherUserId);
    const visibility = mycourse.visibility === undefined
      ? normalizeCourseVisibility(course.visibility)
      : normalizeCourseVisibility(mycourse.visibility);
    const courseUpdate = {
      $set: {
        courseName: String(mycourse.courseName),
        teacherUserId,
        semester: normalizeOptionalString(mycourse.semester) || course.semester || curSemester,
        beginDate,
        endDate,
        timezone,
        visibility,
      },
    };
    deps.serverConsole('editCourse:' + JSON.stringify(courseUpdate));
    await deps.Courses.updateAsync({ _id: targetCourseId }, courseUpdate);
    const newSections = Array.isArray(mycourse.sections) ? mycourse.sections.map((section) => String(section || '').trim()).filter(Boolean) : [];
    const curCourseSections = await deps.Sections.find({ courseId: targetCourseId }).fetchAsync();
    const oldSections = curCourseSections.map((section: { sectionName: string }) => section.sectionName);
    deps.serverConsole('old/new', oldSections, newSections);

    const sectionsAdded = getSetAMinusB(newSections, oldSections);
    const sectionsRemoved = getSetAMinusB(oldSections, newSections);
    deps.serverConsole('sectionsAdded,', sectionsAdded);
    deps.serverConsole('sectionsRemoved,', sectionsRemoved);

    for (const sectionName of sectionsAdded) {
      await deps.Sections.insertAsync({ courseId: targetCourseId, sectionName });
    }
    for (const sectionName of sectionsRemoved) {
      await deps.Sections.removeAsync({ courseId: targetCourseId, sectionName });
    }

    await invalidateCourseSnapshotsForCourse(String(targetCourseId), 'course-updated');
    return targetCourseId;
  }

  async function addUserToTeachersClass(this: MethodContext, teacherID: string, sectionId: string) {
    const userId = this.userId;
    deps.serverConsole('addUserToTeachersClass', userId, teacherID, sectionId);
    if (!userId) {
      throw new Meteor.Error(401, 'Must be logged in');
    }
    if (!teacherID || !sectionId) {
      throw new Meteor.Error(400, 'Teacher and section are required');
    }

    const section = await deps.Sections.findOneAsync({ _id: sectionId });
    if (!section) {
      throw new Meteor.Error(404, 'Section not found');
    }
    const course = await deps.Courses.findOneAsync({ _id: section.courseId });
    if (!course) {
      throw new Meteor.Error(404, 'Course not found');
    }
    const teacherUserId = String(course.teacherUserId || '');
    if (!teacherUserId || teacherUserId !== String(teacherID)) {
      throw new Meteor.Error(403, 'Teacher does not own this section');
    }

    const existingMappingCount = await deps.SectionUserMap.find({ sectionId, userId }).countAsync?.() || 0;
    deps.serverConsole('existingMapping', existingMappingCount);
    if (existingMappingCount === 0) {
      deps.serverConsole('new user, inserting into section_user_mapping', [sectionId, userId]);
      await deps.SectionUserMap.insertAsync({ sectionId, userId });
      await updateUserAssignments(String(course._id));
      await invalidateCourseSnapshotForUser(userId, 'membership-updated');
      await invalidateCourseSnapshotsForCourse(String(course._id), 'membership-updated');
      await sendCourseAssignmentEmail(userId, course, section);
    }

    return true;
  }

  async function resolveAssignmentForDueDateException(this: MethodContext, classId: string, tdfId: string, assignmentId?: string | null) {
    await assertCanManageCourse(this, classId);
    const selector = assignmentId
      ? { _id: assignmentId, courseId: classId, TDFId: tdfId }
      : { courseId: classId, TDFId: tdfId };
    const assignment = await deps.Assignments.findOneAsync(selector, { fields: { _id: 1, courseId: 1, TDFId: 1 } });
    if (!assignment) {
      throw new Meteor.Error(404, 'Course assignment not found for due date exception');
    }
    return assignment;
  }

  async function addUserDueDateException(this: MethodContext, userId: string, tdfId: string, classId: string, date: string | number | Date, assignmentId?: string) {
    const assignment = await resolveAssignmentForDueDateException.call(this, classId, tdfId, assignmentId || null);
    deps.serverConsole('addUserDueDateException', userId, tdfId, date, assignment._id);
    const now = new Date();
    const exception = {
      assignmentId: String(assignment._id),
      courseId: classId,
      TDFId: tdfId,
      date,
      createdAt: now,
      updatedAt: now,
    };
    const user = await deps.usersCollection.findOneAsync({ _id: userId });
    const dueDateExceptions = Array.isArray(user.dueDateExceptions) ? user.dueDateExceptions : [];
    const existingIndex = dueDateExceptions.findIndex((item: DueDateException) => item.assignmentId === exception.assignmentId);
    if (existingIndex >= 0) {
      dueDateExceptions[existingIndex] = {
        ...dueDateExceptions[existingIndex],
        ...exception,
        createdAt: dueDateExceptions[existingIndex].createdAt || now,
        updatedAt: now,
      };
    } else {
      dueDateExceptions.push(exception);
    }
    user.dueDateExceptions = dueDateExceptions;
    await deps.usersCollection.updateAsync({ _id: userId }, user);
  }

  async function checkForTDFData(tdfId: string) {
    const userId = Meteor.userId();
    deps.serverConsole('checkForTDFData', tdfId, userId);
    const tdf = await deps.Histories.findOneAsync({
      TDFId: tdfId,
      userId,
      $and: [
        { levelUnitType: { $ne: 'schedule' } },
        { levelUnitType: { $ne: 'Instruction' } },
      ],
    });
    return !!tdf;
  }

  async function checkForUserException(this: MethodContext, userId: string, tdfId: string) {
    await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
      actingUserId: this.userId,
      subjectUserId: userId,
      roles: ['admin'],
      notLoggedInMessage: 'Must be logged in',
      notLoggedInCode: 401,
      forbiddenMessage: 'Can only read your own due date exceptions',
      forbiddenCode: 403,
    });
    deps.serverConsole('checkForUserException', userId, tdfId);
    const user = await deps.usersCollection.findOneAsync({ _id: userId });
    if (user.dueDateExceptions) {
      const exceptions = user.dueDateExceptions as DueDateException[];
      const assignment = await deps.Assignments.findOneAsync({ TDFId: tdfId }, { fields: { _id: 1 } });
      const exception = exceptions.find((item: DueDateException) => (
        (assignment && item.assignmentId === String(assignment._id)) ||
        item.tdfId == tdfId ||
        item.TDFId == tdfId
      ));
      if (exception) {
        const exceptionDate = new Date(exception.date);
        return exceptionDate.toLocaleDateString();
      }
    }
    return false;
  }

  async function removeUserDueDateException(this: MethodContext, userId: string, tdfId: string, classId?: string, assignmentId?: string) {
    if (classId) {
      await assertCanManageCourse(this, classId);
    } else {
      await requireTeacherOrAdmin(this);
    }
    deps.serverConsole('removeUserDueDateException', userId, tdfId);
    const user = await deps.usersCollection.findOneAsync({ _id: userId });
    if (user.dueDateExceptions) {
      const assignment = classId
        ? await deps.Assignments.findOneAsync({ courseId: classId, TDFId: tdfId }, { fields: { _id: 1 } })
        : null;
      const resolvedAssignmentId = assignmentId || (assignment ? String(assignment._id) : null);
      const exceptionIndex = (user.dueDateExceptions as DueDateException[]).findIndex((item: DueDateException) => (
        (resolvedAssignmentId && item.assignmentId === resolvedAssignmentId) ||
        item.tdfId == tdfId ||
        item.TDFId == tdfId
      ));
      if (exceptionIndex > -1) {
        user.dueDateExceptions.splice(exceptionIndex, 1);
      } else {
        deps.serverConsole('removeUserDueDateException ERROR, no exception found', userId, tdfId);
      }
    }
    await deps.usersCollection.updateAsync({ _id: userId }, user);
  }

  return {
    getSourceSentences,
    getAllCourses,
    getAllCourseSections,
    getAllCoursesForInstructor,
    getAllCourseAssignmentsForInstructor,
    getCourseAssignmentEditorSnapshot,
    saveCourseAssignments,
    editCourseAssignments,
    getTdfAssignmentsByCourseIdMap,
    resolveAssignedRootTdfIdsForUser,
    getLearnerCoursesSnapshot,
    invalidateCourseSnapshotForUser,
    invalidateCourseSnapshotsForCourse,
    invalidateCourseSnapshotsForAssignment,
    getTdfsAssignedToStudent,
    getTdfNamesAssignedByInstructor,
    getTdfNamesByOwnerId,
    getAllTeachers,
    addCourse,
    editCourse,
    addUserToTeachersClass,
    addUserDueDateException,
    checkForTDFData,
    checkForUserException,
    removeUserDueDateException,
  };
}
