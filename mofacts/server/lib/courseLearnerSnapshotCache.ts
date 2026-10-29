import type {
  CourseAssignmentSummary,
  CourseAssignmentTdfSummary,
  CourseVisibility,
  LearnerCourseSnapshotAssignment,
  LearnerCourseSnapshotCourse,
  LearnerCoursesSnapshot,
} from '../../common/courseAssignments.contracts';
import { assignmentMemberTdfIds } from '../../common/progressiveAssignments';
import { buildDashboardStatsProjection, normalizeOptionalString } from '../methods/dashboardCacheShared';
import { getUserRoleFlags, type MethodAuthorizationDeps } from './methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type Logger = (...args: unknown[]) => void;
type Cursor<T = any> = {
  fetchAsync: () => Promise<T[]>;
};

type CollectionLike = {
  find: (selector?: UnknownRecord, options?: UnknownRecord) => Cursor;
  findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
};

type TdfSummary = {
  hasConfigurableSettings?: boolean;
  TDFId: string;
  title: string;
  displayName: string;
  fileName: string;
  tags: string[];
  contentLanguage?: string;
  recommendedUiLocales?: string[];
  translationStatus?: string;
  currentStimuliSetId: string | number | null;
};

type CourseAssignmentSummaryNormalizer = (
  row: any,
  index: number,
  tdfSummaryById: Map<string, CourseAssignmentTdfSummary>,
  now?: Date,
) => CourseAssignmentSummary | null;

export type CourseLearnerSnapshotCacheDeps = {
  serverConsole: Logger;
  Courses: CollectionLike;
  Sections: CollectionLike;
  SectionUserMap: CollectionLike;
  Assignments: CollectionLike;
  Tdfs: CollectionLike;
  usersCollection: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => Cursor;
  };
  UserDashboardCache: CollectionLike;
  CourseLearnerSnapshotCache: CollectionLike;
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  getUserDisplayIdentifier: (user: any) => string;
  normalizeCourseVisibility: (value: unknown) => CourseVisibility;
  normalizeTimezone: (value: unknown, allowLegacyDefault?: boolean) => string;
  parseNullablePersistedDate: (value: unknown) => Date | null;
  normalizeAssignmentRow: CourseAssignmentSummaryNormalizer;
  getTdfSummariesByIds: (tdfIds: string[]) => Promise<Map<string, TdfSummary>>;
  now?: () => number;
};

export const COURSE_SNAPSHOT_VERSION = 5 as const;
const MAX_SNAPSHOT_BUILD_ATTEMPTS = 2;

export function courseIsDateVisible(parseNullablePersistedDate: (value: unknown) => Date | null, course: any, now = new Date()) {
  const beginDate = parseNullablePersistedDate(course?.beginDate);
  const endDate = parseNullablePersistedDate(course?.endDate);
  return (!beginDate || now.getTime() >= beginDate.getTime()) && (!endDate || now.getTime() <= endDate.getTime());
}

function updateCount(result: unknown): unknown {
  if (typeof result === 'number') return result;
  if (result && typeof result === 'object') {
    const maybeResult = result as { modifiedCount?: number; matchedCount?: number; numberAffected?: number };
    return maybeResult.modifiedCount ?? maybeResult.matchedCount ?? maybeResult.numberAffected ?? result;
  }
  return result;
}

function assignmentLanguageMetadata(tdf: TdfSummary): { contentLanguage?: string; recommendedUiLocales?: string[]; translationStatus?: string } {
  const metadata: { contentLanguage?: string; recommendedUiLocales?: string[]; translationStatus?: string } = {};
  if (typeof tdf.contentLanguage === 'string') {
    metadata.contentLanguage = tdf.contentLanguage;
  }
  if (Array.isArray(tdf.recommendedUiLocales)) {
    metadata.recommendedUiLocales = tdf.recommendedUiLocales;
  }
  if (typeof tdf.translationStatus === 'string') {
    metadata.translationStatus = tdf.translationStatus;
  }
  return metadata;
}

export function createCourseLearnerSnapshotCacheHelpers(deps: CourseLearnerSnapshotCacheDeps) {
  const currentTime = deps.now ?? Date.now;

  async function invalidateCourseSnapshotForUser(userId: string, reason: string) {
    const result = await deps.CourseLearnerSnapshotCache.updateAsync(
      { userId, version: COURSE_SNAPSHOT_VERSION },
      { $set: { invalidatedAt: new Date(), rebuildReason: reason } }
    );
    deps.serverConsole('[CourseSnapshot] invalidated user snapshot', { userId, reason, result: updateCount(result) });
  }

  async function invalidateCourseSnapshotsForCourse(courseId: string, reason: string) {
    const course = await deps.Courses.findOneAsync(
      { _id: courseId },
      { fields: { _id: 1, visibility: 1 } }
    );
    const courseIsPublic = deps.normalizeCourseVisibility(course?.visibility) === 'public';
    const sections = await deps.Sections.find({ courseId }, { fields: { _id: 1 } }).fetchAsync();
    const sectionIds = sections.map((section: any) => String(section?._id || '')).filter(Boolean);
    const enrolledRows = sectionIds.length > 0
      ? await deps.SectionUserMap.find({ sectionId: { $in: sectionIds } }, { fields: { userId: 1 } }).fetchAsync()
      : [];
    const enrolledUserIds = [...new Set(enrolledRows.map((row: any) => normalizeOptionalString(row?.userId)).filter(Boolean))];
    let enrolledResult: unknown = 0;
    if (enrolledUserIds.length > 0) {
      enrolledResult = await deps.CourseLearnerSnapshotCache.updateAsync(
        { userId: { $in: enrolledUserIds }, version: COURSE_SNAPSHOT_VERSION },
        { $set: { invalidatedAt: new Date(), rebuildReason: reason } },
        { multi: true }
      );
    }
    const viewerSelector = courseIsPublic
      ? { version: COURSE_SNAPSHOT_VERSION }
      : { $or: [{ assignedCourseIds: courseId }, { publicCourseIds: courseId }], version: COURSE_SNAPSHOT_VERSION };
    const viewerResult = await deps.CourseLearnerSnapshotCache.updateAsync(
      viewerSelector,
      { $set: { invalidatedAt: new Date(), rebuildReason: reason } },
      { multi: true }
    );
    deps.serverConsole('[CourseSnapshot] invalidated course snapshots', {
      courseId,
      reason,
      viewerScope: courseIsPublic ? 'all-current-public-course-viewers' : 'cached-course-viewers',
      enrolledCount: enrolledUserIds.length,
      enrolledResult: updateCount(enrolledResult),
      viewerResult: updateCount(viewerResult),
    });
  }

  async function invalidateCourseSnapshotsForAssignment(assignmentId: string, reason: string) {
    const result = await deps.CourseLearnerSnapshotCache.updateAsync(
      { assignmentIds: assignmentId, version: COURSE_SNAPSHOT_VERSION },
      { $set: { invalidatedAt: new Date(), rebuildReason: reason } },
      { multi: true }
    );
    deps.serverConsole('[CourseSnapshot] invalidated assignment snapshots', { assignmentId, reason, result: updateCount(result) });
  }

  async function cachedSnapshotAssignmentsExist(existing: any) {
    const assignmentIds: string[] = Array.isArray(existing?.assignmentIds)
      ? [...new Set<string>(existing.assignmentIds.map((id: unknown) => normalizeOptionalString(id)).filter((id: string | null): id is string => !!id))]
      : [];
    if (assignmentIds.length === 0) {
      return true;
    }
    const rows = await deps.Assignments.find(
      { _id: { $in: assignmentIds } },
      { fields: { _id: 1 } },
    ).fetchAsync();
    const liveIds = new Set(rows.map((row: any) => normalizeOptionalString(row?._id)).filter((id: string | null): id is string => !!id));
    return assignmentIds.every((assignmentId) => liveIds.has(assignmentId));
  }

  async function rebuildLearnerCoursesSnapshot(userId: string, reason: string, attempt = 1): Promise<LearnerCoursesSnapshot> {
    const now = new Date(currentTime());
    let expiresAt: number | null = null;
    const includeBoundary = (time: number) => {
      if (time > now.getTime() && (expiresAt === null || time < expiresAt)) expiresAt = time;
    };
    deps.serverConsole('[CourseSnapshot] rebuilding derived snapshot', { reason });
    const roleFlags = await getUserRoleFlags(deps.getMethodAuthorizationDeps(), userId, ['admin', 'teacher'] as const);
    const enrollmentRows = await deps.SectionUserMap.find({ userId }, { fields: { sectionId: 1 } }).fetchAsync();
    const sectionIds = enrollmentRows.map((row: any) => normalizeOptionalString(row?.sectionId)).filter((id: string | null): id is string => !!id);
    const sections = sectionIds.length > 0
      ? await deps.Sections.find({ _id: { $in: sectionIds } }, { fields: { _id: 1, courseId: 1 } }).fetchAsync()
      : [];
    const enrolledCourseIds = [...new Set(sections.map((section: any) => normalizeOptionalString(section?.courseId)).filter((id: string | null): id is string => !!id))];
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
    for (const course of rawCourses) {
      if (roleFlags.admin || String(course.teacherUserId || '') === userId) continue;
      const beginDate = deps.parseNullablePersistedDate(course.beginDate);
      const endDate = deps.parseNullablePersistedDate(course.endDate);
      if (beginDate) includeBoundary(beginDate.getTime());
      // Courses remain visible through their end timestamp, so the first
      // changed millisecond is one later. Include hidden future courses too.
      if (endDate) includeBoundary(endDate.getTime() + 1);
    }
    const visibleCourses = rawCourses.filter((course: any) => {
      const visibility = deps.normalizeCourseVisibility(course.visibility);
      if (roleFlags.admin || String(course.teacherUserId || '') === userId) return true;
      if (visibility === 'public' || enrolledCourseIds.includes(String(course._id))) {
        return courseIsDateVisible(deps.parseNullablePersistedDate, course, now);
      }
      return false;
    });
    const courseIds = visibleCourses.map((course: any) => String(course._id));
    const assignmentRows = courseIds.length > 0
      ? await deps.Assignments.find(
        { courseId: { $in: courseIds } },
        { fields: { _id: 1, courseId: 1, assignmentType: 1, TDFId: 1, title: 1, memberTdfIds: 1, order: 1, releaseAt: 1, dueAt: 1, required: 1, createdAt: 1, updatedAt: 1 } }
      ).fetchAsync()
      : [];
    const visibleSections = courseIds.length > 0
      ? await deps.Sections.find(
        { courseId: { $in: courseIds } },
        { fields: { _id: 1, courseId: 1, sectionName: 1 } },
      ).fetchAsync()
      : [];
    const sectionsByCourseId = new Map<string, Array<{ sectionId: string; sectionName: string }>>();
    for (const section of visibleSections) {
      const courseId = normalizeOptionalString(section?.courseId);
      const sectionId = normalizeOptionalString(section?._id);
      if (!courseId || !sectionId) continue;
      const list = sectionsByCourseId.get(courseId) || [];
      list.push({
        sectionId,
        sectionName: normalizeOptionalString(section?.sectionName) || sectionId,
      });
      sectionsByCourseId.set(courseId, list);
    }
    for (const [courseId, sections] of sectionsByCourseId.entries()) {
      sectionsByCourseId.set(courseId, sections.sort((a, b) => a.sectionName.localeCompare(b.sectionName)));
    }
    const tdfSummaries = await deps.getTdfSummariesByIds(assignmentRows.flatMap(assignmentMemberTdfIds));
    const dashboardCache = await deps.UserDashboardCache.findOneAsync({ userId });
    const assignmentsByCourseId = new Map<string, LearnerCourseSnapshotAssignment[]>();
    const visibleCourseById = new Map(visibleCourses.map((course: any) => [String(course._id), course]));
    const enrolledCourseIdSet = new Set(enrolledCourseIds);
    for (const row of assignmentRows) {
      const summary = deps.normalizeAssignmentRow(row, 0, tdfSummaries, now);
      if (!summary) continue;
      const releaseAt = summary.releaseAt;
      const course = visibleCourseById.get(summary.courseId);
      const ordinaryLearner = !roleFlags.admin && String(course?.teacherUserId || '') !== userId;
      const canLaunchCourseAssignment = enrolledCourseIdSet.has(summary.courseId) || !ordinaryLearner;
      const availability: LearnerCourseSnapshotAssignment['availability'] = !canLaunchCourseAssignment
        ? 'unavailable'
        : releaseAt && releaseAt.getTime() > now.getTime() && ordinaryLearner ? 'scheduled' : 'available';
      if (ordinaryLearner && canLaunchCourseAssignment && releaseAt) includeBoundary(releaseAt.getTime());
      // Due dates change the overdue label after the timestamp; they do not
      // change assignment availability or impose a submission lock.
      if (summary.dueAt) includeBoundary(summary.dueAt.getTime() + 1);
      let enriched: LearnerCourseSnapshotAssignment;
      if (summary.assignmentType === 'progressive') {
        enriched = {
          ...summary,
          availability,
          members: summary.members.map((member) => ({
            ...member,
            ...buildDashboardStatsProjection(dashboardCache?.tdfStats?.[member.TDFId], null),
          })),
        };
      } else {
        const tdf = tdfSummaries.get(summary.TDFId);
        if (!tdf) continue;
        enriched = {
          ...summary,
          availability,
          fileName: tdf.fileName,
          tags: tdf.tags,
          ...assignmentLanguageMetadata(tdf),
          currentStimuliSetId: tdf.currentStimuliSetId,
          hasConfigurableSettings: tdf.hasConfigurableSettings === true,
          ...buildDashboardStatsProjection(dashboardCache?.tdfStats?.[summary.TDFId], null),
        };
      }
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
      visibility: deps.normalizeCourseVisibility(course.visibility),
      beginDate: deps.parseNullablePersistedDate(course.beginDate),
      endDate: deps.parseNullablePersistedDate(course.endDate),
      timezone: deps.normalizeTimezone(course.timezone, true),
      teacherUserId: String(course.teacherUserId || ''),
      teacherDisplayName: teacherById.get(String(course.teacherUserId || '')) || String(course.teacherUserId || ''),
      membership,
      joinableSections: membership === 'public'
        ? sectionsByCourseId.get(String(course._id)) || []
        : [],
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
      } else if (deps.normalizeCourseVisibility(course.visibility) === 'public') {
        publicCourses.push(toSnapshotCourse(course, 'public'));
      }
    }
    const snapshot: Omit<LearnerCoursesSnapshot, 'serverNow'> = {
      version: COURSE_SNAPSHOT_VERSION,
      userId,
      generatedAt: now.getTime(),
      expiresAt,
      assignedCourses: assignedCourses.sort((a, b) => a.courseName.localeCompare(b.courseName)),
      publicCourses: publicCourses.sort((a, b) => a.courseName.localeCompare(b.courseName)),
      invalidatedAt: null,
      source: 'rebuilt',
    };
    await deps.CourseLearnerSnapshotCache.updateAsync(
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
          tdfIds: [...new Set([...snapshot.assignedCourses, ...snapshot.publicCourses].flatMap((course) => course.assignments.flatMap(assignmentMemberTdfIds)))],
          snapshot,
          rebuildReason: reason,
        },
      },
      { upsert: true }
    );
    const serverNow = currentTime();
    if (snapshot.expiresAt !== null && serverNow >= snapshot.expiresAt) {
      deps.serverConsole('[CourseSnapshot] boundary-crossed during derived snapshot rebuild', { attempt });
      if (attempt >= MAX_SNAPSHOT_BUILD_ATTEMPTS) {
        throw new Error('Course snapshot could not be read before its next time boundary. Try again.');
      }
      return await rebuildLearnerCoursesSnapshot(userId, 'boundary-crossed', attempt + 1);
    }
    return { ...snapshot, serverNow };
  }

  async function ensureLearnerCoursesSnapshot(userId: string): Promise<LearnerCoursesSnapshot> {
    const existing = await deps.CourseLearnerSnapshotCache.findOneAsync({ userId, version: COURSE_SNAPSHOT_VERSION });
    if (existing?.snapshot && existing.invalidatedAt === null && existing.version === COURSE_SNAPSHOT_VERSION) {
      const expiresAt = existing.snapshot.expiresAt;
      if (expiresAt !== null && (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt))) {
        return await rebuildLearnerCoursesSnapshot(userId, 'invalid-expiry');
      }
      if (expiresAt !== null && currentTime() >= expiresAt) {
        return await rebuildLearnerCoursesSnapshot(userId, 'expired');
      }
      const dashboard = await deps.UserDashboardCache.findOneAsync({ userId }, { fields: { lastUpdated: 1 } });
      if (dashboard?.lastUpdated && new Date(dashboard.lastUpdated).getTime() > new Date(existing.generatedAt).getTime()) {
        return await rebuildLearnerCoursesSnapshot(userId, 'dashboard-updated');
      }
      if (!await cachedSnapshotAssignmentsExist(existing)) {
        return await rebuildLearnerCoursesSnapshot(userId, 'stale-assignment-reference');
      }
      const serverNow = currentTime();
      if (expiresAt !== null && serverNow >= expiresAt) {
        return await rebuildLearnerCoursesSnapshot(userId, 'expired');
      }
      return {
        ...(existing.snapshot as Omit<LearnerCoursesSnapshot, 'serverNow'>),
        serverNow,
        source: 'cache',
        invalidatedAt: null,
      };
    }
    const reason = existing ? (existing.version !== COURSE_SNAPSHOT_VERSION ? 'version' : 'invalidated') : 'missing';
    return await rebuildLearnerCoursesSnapshot(userId, reason);
  }

  return {
    ensureLearnerCoursesSnapshot,
    invalidateCourseSnapshotForUser,
    invalidateCourseSnapshotsForCourse,
    invalidateCourseSnapshotsForAssignment,
  };
}
