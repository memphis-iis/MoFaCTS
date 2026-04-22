import { Meteor } from 'meteor/meteor';
import { curSemester } from '../../common/Definitions';
import { getCourse } from '../orm';
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
type DueDateException = { tdfId: string; classId: string; date: string | number | Date };

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
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  getUserDisplayIdentifier: (user: any) => string;
  normalizeCanonicalId: (value: unknown) => string | null;
};

function getSetAMinusB<T>(arrayA: T[], arrayB: T[]) {
  const a = new Set(arrayA);
  const b = new Set(arrayB);
  const difference = new Set([...a].filter((x) => !b.has(x)));
  return Array.from(difference);
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
        courses.push(getCourse(course));
      }
      return courses;
    } catch (e: unknown) {
      deps.serverConsole('getAllCourses ERROR,', e);
      return null;
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
            beginDate: 1,
            sectionId: '$section._id',
          },
        },
      ]).toArray();
    } catch (e: unknown) {
      deps.serverConsole('getAllCourseSections ERROR,', e);
      return null;
    }
  }

  async function getAllCoursesForInstructor(this: MethodContext, instructorId: string) {
    instructorId = await resolveInstructorForCaller(this, instructorId);
    deps.serverConsole('getAllCoursesForInstructor:', instructorId);
    return await deps.Courses.find({ teacherUserId: instructorId, semester: curSemester }).fetchAsync();
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
      deps.serverConsole('getAllCourseAssignmentsForInstructor ERROR,', instructorId, ',', e);
      return null;
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

  async function editCourseAssignments(this: MethodContext, newCourseAssignment: { courseId: string; tdfs: string[] }) {
    try {
      await assertCanManageCourse(this, newCourseAssignment.courseId);
      deps.serverConsole('editCourseAssignments:', newCourseAssignment);
      const newTdfs = newCourseAssignment.tdfs;
      const curCourseAssignments = await deps.Assignments.rawCollection().aggregate([
        {
          $lookup: {
            from: 'tdfs',
            localField: 'TDFId',
            foreignField: '_id',
            as: 'TDF',
          },
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
          $unwind: { path: '$TDF' },
        },
        {
          $match: {
            'course._id': newCourseAssignment.courseId,
          },
        },
        {
          $project: {
            fileName: '$TDF.content.fileName',
            TDFId: '$TDF._id',
            courseId: '$course._id',
          },
        },
      ]).toArray();
      const existingTdfs = curCourseAssignments.map((courseAssignment: { fileName: string }) => courseAssignment.fileName);

      const tdfsAdded = getSetAMinusB(newTdfs, existingTdfs);
      const tdfsRemoved = getSetAMinusB(existingTdfs, newTdfs);

      const tdfNamesAndIDs = await deps.Tdfs.find().fetchAsync();
      const tdfNameIDMap: Record<string, string> = {};
      for (const tdfNamesAndID of tdfNamesAndIDs) {
        tdfNameIDMap[tdfNamesAndID.content.fileName] = tdfNamesAndID._id;
      }

      deps.serverConsole('editCourseAssignments: Adding', tdfsAdded.length, 'TDFs, removing', tdfsRemoved.length, 'TDFs');
      for (const tdfName of tdfsAdded) {
        const TDFId = tdfNameIDMap[tdfName as string];
        await deps.Assignments.insertAsync({ courseId: newCourseAssignment.courseId, TDFId });
      }
      for (const tdfName of tdfsRemoved) {
        const TDFId = tdfNameIDMap[tdfName as string];
        await deps.Assignments.removeAsync({ courseId: newCourseAssignment.courseId, TDFId });
      }
      updateUserAssignments(newCourseAssignment.courseId);
      return newCourseAssignment;
    } catch (e: unknown) {
      deps.serverConsole('editCourseAssignments ERROR for courseId:', newCourseAssignment.courseId, ',', e);
      return null;
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
          content: '$TDF.content',
          TDFId: 1,
          courseId: 1,
        },
      },
    ]).toArray();
    deps.serverConsole('Found', assignmentTdfFileNamesRet.length, 'assigned TDFs');

    const assignmentTdfFileNamesByCourseIdMap: Record<string, Array<{ TDFId: string; displayName: string }>> = {};
    for (const assignment of assignmentTdfFileNamesRet) {
      const courseId = String(assignment.courseId);
      if (!assignmentTdfFileNamesByCourseIdMap[courseId]) {
        assignmentTdfFileNamesByCourseIdMap[courseId] = [];
      }
      assignmentTdfFileNamesByCourseIdMap[courseId]!.push({
        TDFId: assignment.TDFId,
        displayName: assignment.content.tdfs.tutor.setspec.lessonname,
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
      deps.serverConsole('getTdfNamesAssignedByInstructor ERROR,', e);
      return null;
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
      deps.serverConsole('getTdfNamesByOwnerId ERROR,', e);
      return null;
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
    if (!roleFlags.admin || !deps.normalizeCanonicalId(mycourse.teacherUserId)) {
      mycourse.teacherUserId = actingUserId;
    }
    deps.serverConsole('addCourse:' + JSON.stringify(mycourse));
    const courseId = await deps.Courses.insertAsync(mycourse);
    for (const sectionName of mycourse.sections) {
      await deps.Sections.insertAsync({ courseId, sectionName });
    }
    return courseId;
  }

  async function editCourse(this: MethodContext, mycourse: { _id: string; courseId: string; sections: string[] } & UnknownRecord) {
    const targetCourseId = deps.normalizeCanonicalId(mycourse._id) || deps.normalizeCanonicalId(mycourse.courseId);
    const { course, actingUserId, roleFlags } = await assertCanManageCourse(this, targetCourseId || '');
    if (!roleFlags.admin) {
      mycourse.teacherUserId = actingUserId;
    } else if (!deps.normalizeCanonicalId(mycourse.teacherUserId)) {
      mycourse.teacherUserId = course.teacherUserId;
    }
    deps.serverConsole('editCourse:' + JSON.stringify(mycourse));
    await deps.Courses.updateAsync({ _id: mycourse._id }, mycourse);
    const newSections = mycourse.sections;
    const curCourseSections = await deps.Sections.find({ courseId: mycourse.courseId }).fetchAsync();
    const oldSections = curCourseSections.map((section: { sectionName: string }) => section.sectionName);
    deps.serverConsole('old/new', oldSections, newSections);

    const sectionsAdded = getSetAMinusB(newSections, oldSections);
    const sectionsRemoved = getSetAMinusB(oldSections, newSections);
    deps.serverConsole('sectionsAdded,', sectionsAdded);
    deps.serverConsole('sectionsRemoved,', sectionsRemoved);

    for (const sectionName of sectionsAdded) {
      await deps.Sections.insertAsync({ courseId: mycourse.courseId, sectionName });
    }
    for (const sectionName of sectionsRemoved) {
      await deps.Sections.removeAsync({ courseId: mycourse.courseId, sectionName });
    }

    return mycourse.courseId;
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
    }

    return true;
  }

  async function addUserDueDateException(this: MethodContext, userId: string, tdfId: string, classId: string, date: string | number | Date) {
    await assertCanManageCourse(this, classId);
    deps.serverConsole('addUserDueDateException', userId, tdfId, date);
    const exception = {
      tdfId,
      classId,
      date,
    };
    const user = await deps.usersCollection.findOneAsync({ _id: userId });
    if (user.dueDateExceptions) {
      user.dueDateExceptions.push(exception);
    } else {
      user.dueDateExceptions = [exception];
    }
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
      const exception = exceptions.find((item: DueDateException) => item.tdfId == tdfId);
      if (exception) {
        const exceptionDate = new Date(exception.date);
        return exceptionDate.toLocaleDateString();
      }
    }
    return false;
  }

  async function removeUserDueDateException(this: MethodContext, userId: string, tdfId: string, classId?: string) {
    if (classId) {
      await assertCanManageCourse(this, classId);
    } else {
      await requireTeacherOrAdmin(this);
    }
    deps.serverConsole('removeUserDueDateException', userId, tdfId);
    const user = await deps.usersCollection.findOneAsync({ _id: userId });
    if (user.dueDateExceptions) {
      const exceptionIndex = (user.dueDateExceptions as DueDateException[]).findIndex((item: DueDateException) => item.tdfId == tdfId);
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
    editCourseAssignments,
    getTdfAssignmentsByCourseIdMap,
    resolveAssignedRootTdfIdsForUser,
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
