import "../common/Collections";
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/alanning:roles';
import { asyncMethods, methods } from './serverComposition';
import sinon from 'sinon';
import { Random } from 'meteor/random';
import { expect } from 'chai';
import { compressHistoryRecord } from '../common/historyCompression';

const MeteorAny = Meteor as any;
const MeteorUsersAny = Meteor.users as any;
const AssignmentsAny = (globalThis as any).Assignments as any;
const CoursesAny = (globalThis as any).Courses as any;
const DynamicSettingsAny = (globalThis as any).DynamicSettings as any;
const GlobalExperimentStatesAny = (globalThis as any).GlobalExperimentStates as any;
const HistoriesAny = (globalThis as any).Histories as any;
const StimulusCrowdStatsAny = (globalThis as any).StimulusCrowdStats as any;
const SectionsAny = (globalThis as any).Sections as any;
const SectionUserMapAny = (globalThis as any).SectionUserMap as any;
const TdfsAny = (globalThis as any).Tdfs as any;
const UserDashboardCacheAny = (globalThis as any).UserDashboardCache as any;
const UserMetricsAny = (globalThis as any).UserMetrics as any;
const UserTimesLogAny = (globalThis as any).UserTimesLog as any;
const UserUploadQuotaAny = (globalThis as any).UserUploadQuota as any;
const AuditLogAny = (globalThis as any).AuditLog as any;
const AuthThrottleStateAny = (globalThis as any).AuthThrottleState as any;
const PasswordResetTokensAny = (globalThis as any).PasswordResetTokens as any;

(Meteor.settings as any).auth.requireEmailVerification = false;

type RemovableCollection = {
  removeAsync: (selector: Record<string, never>) => Promise<unknown>;
};

function requireRemovableCollection(collection: unknown, name: string): RemovableCollection {
  if (
    !collection ||
    typeof collection !== 'object' ||
    typeof (collection as Partial<RemovableCollection>).removeAsync !== 'function'
  ) {
    throw new Error(`Expected ${name} to expose removeAsync in Meteor integration tests`);
  }
  return collection as RemovableCollection;
}

async function clearServerCompositionCollections() {
  const collections: Array<[string, unknown]> = [
    ['AuditLog', AuditLogAny],
    ['Assignments', AssignmentsAny],
    ['AuthThrottleState', AuthThrottleStateAny],
    ['Courses', CoursesAny],
    ['DynamicSettings', DynamicSettingsAny],
    ['GlobalExperimentStates', GlobalExperimentStatesAny],
    ['Histories', HistoriesAny],
    ['StimulusCrowdStats', StimulusCrowdStatsAny],
    ['Meteor.users', MeteorUsersAny],
    ['PasswordResetTokens', PasswordResetTokensAny],
    ['Sections', SectionsAny],
    ['SectionUserMap', SectionUserMapAny],
    ['Tdfs', TdfsAny],
    ['UserDashboardCache', UserDashboardCacheAny],
    ['UserMetrics', UserMetricsAny],
    ['UserTimesLog', UserTimesLogAny],
    ['UserUploadQuota', UserUploadQuotaAny],
    ['Meteor.roleAssignment', (Meteor as any).roleAssignment],
  ];

  await Promise.all(
    collections.map(([name, collection]) => requireRemovableCollection(collection, name).removeAsync({})),
  );
}

function createServerHistoryRecord(overrides: Record<string, unknown> = {}) {
  return compressHistoryRecord({
    historySchemaVersion: 1,
    userId: 'current-user',
    TDFId: 'history-root',
    stimuliSetId: 'set-1',
    stimulusKC: 'kc-1',
    clusterKC: 'cluster-1',
    KCId: 'kc-1',
    KCDefault: 'kc-1',
    KCCluster: 'cluster-1',
    anonStudentId: 'student-1',
    sessionID: 'session-1',
    levelUnit: 0,
    levelUnitType: 'model',
    time: 2000,
    problemStartTime: 1000,
    selection: 'answer',
    action: 'respond',
    outcome: 'correct',
    typeOfResponse: 'text',
    responseValue: 'answer',
    input: 'answer',
    displayedStimulus: { text: 'Prompt' },
    eventType: '',
    ...overrides,
  });
}

describe('server auth and session methods', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('writes auth.signupCompleted for native signup', async function() {
    const email = `signup-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    const result = await methods.signUpUser.call({}, email, password);
    const auditEntry = await AuditLogAny.findOneAsync({
      action: 'auth.signupCompleted',
      targetUserId: result.userId
    }) as any;

    expect(auditEntry).to.exist;
    expect(auditEntry.details.emailCanonical).to.equal(email.toLowerCase());
    expect(auditEntry.details.loginType).to.equal('password');
  });

  it('does not expose a reset token in requestPasswordReset responses', async function() {
    const email = `reset-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    await methods.signUpUser.call({}, email, password);
    const result = await methods.requestPasswordReset.call({}, email);

    expect(result).to.have.property('success', true);
    expect(result).to.not.have.property('token');
  });

  it('logs canonical email changes when populateSSOProfile updates the account email', async function() {
    const originalEmail = `original-${Random.id()}@example.com`;
    const nextEmail = `updated-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    const result = await methods.signUpUser.call({}, originalEmail, password);
    const userId = result.userId;

    await MeteorUsersAny.updateAsync({_id: userId}, {$set: {
      services: {
        google: {
          email: nextEmail,
          refreshToken: Random.id()
        }
      }
    }});

    const populateResult = await methods.populateSSOProfile.call({ userId }, userId);
    const updatedUser = await MeteorUsersAny.findOneAsync({_id: userId}) as any;
    const auditEntry = await AuditLogAny.findOneAsync({
      action: 'auth.emailChanged',
      targetUserId: userId
    }) as any;

    expect(populateResult).to.equal(`success: ${nextEmail}`);
    expect(updatedUser.email_canonical).to.equal(nextEmail.toLowerCase());
    expect(auditEntry).to.exist;
    expect(auditEntry.details.previousEmailCanonical).to.equal(originalEmail.toLowerCase());
    expect(auditEntry.details.nextEmailCanonical).to.equal(nextEmail.toLowerCase());
    expect(auditEntry.details.source).to.equal('populateSSOProfile');
  });

  it('clears loginParams and records auth.sessionRevoked', async function() {
    const email = `session-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;
    const loginParams = {
      entryPoint: Random.id(),
      curTeacher: Random.id(),
      curClass: Random.id(),
      loginMode: 'test',
      authSessionState: 'active'
    };

    const result = await methods.signUpUser.call({}, email, password);
    const userId = result.userId;

    await MeteorUsersAny.updateAsync({_id: userId}, {$set: { loginParams }});

    const userAsyncStub = sinon.stub(MeteorAny, 'userAsync').resolves({
      _id: userId,
      loginParams
    });
    const userIdStub = sinon.stub(MeteorAny, 'userId').returns(userId);

    try {
      await methods.clearLoginData.call({ userId });
    } finally {
      userAsyncStub.restore();
      userIdStub.restore();
    }

    const updatedUser = await MeteorUsersAny.findOneAsync({_id: userId}) as any;
    const auditEntry = await AuditLogAny.findOneAsync({
      action: 'auth.sessionRevoked',
      actorUserId: userId,
      targetUserId: userId
    }) as any;

    expect(updatedUser.loginParams.entryPoint).to.equal(null);
    expect(updatedUser.loginParams.curTeacher).to.equal(null);
    expect(updatedUser.loginParams.curClass).to.equal(null);
    expect(updatedUser.loginParams.loginMode).to.equal(null);
    expect(updatedUser.loginParams.authSessionState).to.equal(null);
    expect(auditEntry).to.exist;
    expect(auditEntry.details.reason).to.equal('clearLoginData');
  });

  it('blocks admin user deletion when the target owns authored content', async function() {
    const adminEmail = `admin-${Random.id()}@example.com`;
    const userEmail = `owner-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    const adminResult = await methods.signUpUser.call({}, adminEmail, password);
    const userResult = await methods.signUpUser.call({}, userEmail, password);
    const adminUserId = adminResult.userId;
    const targetUserId = userResult.userId;

    await Roles.addUsersToRolesAsync(adminUserId, 'admin');
    await TdfsAny.insertAsync({
      _id: Random.id(),
      ownerId: targetUserId,
      content: { fileName: 'owned-lesson.tdf' }
    });

    try {
      await methods.userAdminDeleteUser.call({ userId: adminUserId }, targetUserId);
      expect.fail('Expected user deletion to be blocked');
    } catch (error: any) {
      expect(error.error).to.equal('delete-user-blocked');
      expect(error.reason).to.contain('owns 1 lesson');
    }

    const stillExists = await MeteorUsersAny.findOneAsync({ _id: targetUserId });
    expect(stillExists).to.exist;
  });

  it('deletes a user and cleans up obvious user-scoped records when no authored content exists', async function() {
    const adminEmail = `admin-${Random.id()}@example.com`;
    const userEmail = `delete-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    const adminResult = await methods.signUpUser.call({}, adminEmail, password);
    const userResult = await methods.signUpUser.call({}, userEmail, password);
    const adminUserId = adminResult.userId;
    const targetUserId = userResult.userId;

    await Roles.addUsersToRolesAsync(adminUserId, 'admin');
    await HistoriesAny.insertAsync({ _id: Random.id(), userId: targetUserId, TDFId: Random.id() });
    await GlobalExperimentStatesAny.insertAsync({ _id: Random.id(), userId: targetUserId, TDFId: Random.id() });
    await SectionUserMapAny.insertAsync({ _id: Random.id(), userId: targetUserId, sectionId: Random.id() });
    await UserTimesLogAny.insertAsync({ _id: Random.id(), userId: targetUserId });
    await UserMetricsAny.insertAsync({ _id: targetUserId, score: 1 });
    await PasswordResetTokensAny.insertAsync({ _id: Random.id(), userId: targetUserId, tokenHash: Random.id() });
    await UserDashboardCacheAny.insertAsync({ _id: Random.id(), userId: targetUserId });
    await UserUploadQuotaAny.insertAsync({ _id: Random.id(), userId: targetUserId, date: '2026-04-12' });

    const result = await methods.userAdminDeleteUser.call({ userId: adminUserId }, targetUserId);

    expect(result.RESULT).to.equal('SUCCESS');
    expect(await MeteorUsersAny.findOneAsync({ _id: targetUserId })).to.equal(undefined);
    expect(await HistoriesAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await GlobalExperimentStatesAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await SectionUserMapAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await UserTimesLogAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await UserMetricsAny.findOneAsync({ _id: targetUserId })).to.equal(undefined);
    expect(await PasswordResetTokensAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await UserDashboardCacheAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await UserUploadQuotaAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
  });
});

describe('public TDF and stimulus method authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('denies unauthenticated public TDF lookup by id', async function() {
    await TdfsAny.insertAsync({
      _id: 'private-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 101,
      content: {
        fileName: 'private.json',
        tdfs: { tutor: { setspec: { lessonname: 'Private', userselect: 'false' } } },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call({}, 'private-tdf');
      expect.fail('Expected unauthenticated TDF lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(401);
    }
  });

  it('allows owner public TDF lookup by id', async function() {
    await TdfsAny.insertAsync({
      _id: 'owned-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 102,
      content: {
        fileName: 'owned.json',
        tdfs: { tutor: { setspec: { lessonname: 'Owned', userselect: 'false' } } },
      },
    });

    const tdf = await (asyncMethods.getTdfById as any).call({ userId: 'owner-user' }, 'owned-tdf');

    expect(tdf._id).to.equal('owned-tdf');
  });

  it('blocks direct TDF lookup for a student with an active course assignment', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-direct-block',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-direct-block',
      courseId: 'course-direct-block',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-direct-block',
      userId: 'assigned-student',
      sectionId: 'section-direct-block',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-direct-block',
      courseId: 'course-direct-block',
      TDFId: 'assigned-direct-tdf',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-direct-tdf',
      ownerId: 'teacher-user',
      stimuliSetId: 108,
      accessors: [{ userId: 'assigned-student' }],
      content: {
        fileName: 'AssignedDirect.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Direct', userselect: 'true' } } },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call({ userId: 'assigned-student' }, 'assigned-direct-tdf');
      expect.fail('Expected direct assigned TDF lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Launch this TDF through its active course assignment');
    }
  });

  it('allows active course-assignment TDF lookup with matching launch context', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-launch-context',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-launch-context',
      courseId: 'course-launch-context',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-launch-context',
      userId: 'assigned-student',
      sectionId: 'section-launch-context',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-launch-context',
      courseId: 'course-launch-context',
      TDFId: 'assigned-context-tdf',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-context-tdf',
      ownerId: 'teacher-user',
      stimuliSetId: 109,
      content: {
        fileName: 'AssignedContext.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Context', userselect: 'false' } } },
      },
    });

    const tdf = await (asyncMethods.getTdfById as any).call(
      { userId: 'assigned-student' },
      'assigned-context-tdf',
      {
        courseAssignment: {
          assignmentId: 'assignment-launch-context',
          courseId: 'course-launch-context',
          TDFId: 'assigned-context-tdf',
          launchSource: 'courses',
        },
      },
    );

    expect(tdf._id).to.equal('assigned-context-tdf');
  });

  it('blocks direct condition-child lookup for a student with an active root course assignment', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-condition-direct-block',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-condition-direct-block',
      courseId: 'course-condition-direct-block',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-condition-direct-block',
      userId: 'assigned-student',
      sectionId: 'section-condition-direct-block',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-condition-direct-block',
      courseId: 'course-condition-direct-block',
      TDFId: 'assigned-condition-root',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition-root',
      ownerId: 'teacher-user',
      stimuliSetId: 112,
      content: {
        fileName: 'AssignedConditionRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Assigned Condition Root',
              userselect: 'true',
              conditionTdfIds: ['assigned-condition-child'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition-child',
      ownerId: 'teacher-user',
      stimuliSetId: 113,
      accessors: [{ userId: 'assigned-student' }],
      content: {
        fileName: 'AssignedConditionChild.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Condition Child', userselect: 'true' } } },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call({ userId: 'assigned-student' }, 'assigned-condition-child');
      expect.fail('Expected direct assigned condition-child TDF lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Launch this TDF through its active course assignment');
    }
  });

  it('allows condition-child TDF lookup with matching root course-assignment launch context', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-condition-launch-context',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-condition-launch-context',
      courseId: 'course-condition-launch-context',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-condition-launch-context',
      userId: 'assigned-student',
      sectionId: 'section-condition-launch-context',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-condition-launch-context',
      courseId: 'course-condition-launch-context',
      TDFId: 'assigned-condition-context-root',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition-context-root',
      ownerId: 'teacher-user',
      stimuliSetId: 114,
      content: {
        fileName: 'AssignedConditionContextRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Assigned Condition Context Root',
              userselect: 'false',
              conditionTdfIds: ['assigned-condition-context-child'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition-context-child',
      ownerId: 'teacher-user',
      stimuliSetId: 115,
      content: {
        fileName: 'AssignedConditionContextChild.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Condition Context Child', userselect: 'false' } } },
      },
    });

    const tdf = await (asyncMethods.getTdfById as any).call(
      { userId: 'assigned-student' },
      'assigned-condition-context-child',
      {
        courseAssignment: {
          assignmentId: 'assignment-condition-launch-context',
          courseId: 'course-condition-launch-context',
          TDFId: 'assigned-condition-context-root',
          launchSource: 'courses',
        },
      },
    );

    expect(tdf._id).to.equal('assigned-condition-context-child');
  });

  it('allows public course-assignment TDF lookup without section enrollment', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-launch-public',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
      visibility: 'public',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-launch-public',
      courseId: 'course-launch-public',
      TDFId: 'assigned-public-tdf',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-public-tdf',
      ownerId: 'teacher-user',
      stimuliSetId: 111,
      content: {
        fileName: 'AssignedPublic.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Public', userselect: 'false' } } },
      },
    });

    const tdf = await (asyncMethods.getTdfById as any).call(
      { userId: 'not-enrolled-student' },
      'assigned-public-tdf',
      {
        courseAssignment: {
          assignmentId: 'assignment-launch-public',
          courseId: 'course-launch-public',
          TDFId: 'assigned-public-tdf',
          launchSource: 'courses',
        },
      },
    );

    expect(tdf._id).to.equal('assigned-public-tdf');
  });

  it('rejects course-assignment TDF lookup when the current user is not enrolled in that course', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-launch-unenrolled',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-launch-unenrolled',
      courseId: 'course-launch-unenrolled',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-launch-unenrolled',
      courseId: 'course-launch-unenrolled',
      TDFId: 'assigned-unenrolled-tdf',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-unenrolled-tdf',
      ownerId: 'teacher-user',
      stimuliSetId: 110,
      accessors: [{ userId: 'not-enrolled-student' }],
      content: {
        fileName: 'AssignedUnenrolled.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Unenrolled', userselect: 'true' } } },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call(
        { userId: 'not-enrolled-student' },
        'assigned-unenrolled-tdf',
        {
          courseAssignment: {
            assignmentId: 'assignment-launch-unenrolled',
            courseId: 'course-launch-unenrolled',
            TDFId: 'assigned-unenrolled-tdf',
            launchSource: 'courses',
          },
        },
      );
      expect.fail('Expected unenrolled course-assignment TDF lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course assignment launch context is not available for current user');
    }
  });

  it('denies unrelated user public TDF lookup by filename', async function() {
    await TdfsAny.insertAsync({
      _id: 'filename-private-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 103,
      content: {
        fileName: 'filename-private.json',
        tdfs: { tutor: { setspec: { lessonname: 'Filename Private', userselect: 'false' } } },
      },
    });

    try {
      await (asyncMethods.getTdfByFileName as any).call({ userId: 'other-user' }, 'filename-private.json');
      expect.fail('Expected unrelated user TDF lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('requires course context when an enrolled student loads condition children of an assigned root', async function() {
    await CoursesAny.insertAsync({
      _id: 'assigned-course',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'assigned-section',
      courseId: 'assigned-course',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'assigned-enrollment',
      userId: 'assigned-student',
      sectionId: 'assigned-section',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assigned-row',
      courseId: 'assigned-course',
      TDFId: 'assigned-root',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-root',
      ownerId: 'teacher-user',
      stimuliSetId: 106,
      content: {
        fileName: 'AssignedRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Assigned Root',
              userselect: 'false',
              condition: ['AssignedCondition.json'],
              conditionTdfIds: ['assigned-condition'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition',
      ownerId: 'teacher-user',
      stimuliSetId: 107,
      content: {
        fileName: 'AssignedCondition.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Assigned Condition',
              userselect: 'false',
            },
          },
        },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call({ userId: 'assigned-student' }, 'assigned-condition');
      expect.fail('Expected assigned condition-child lookup without course context to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Launch this TDF through its active course assignment');
    }

    try {
      await (asyncMethods.getTdfByFileName as any).call({ userId: 'assigned-student' }, 'AssignedCondition.json');
      expect.fail('Expected assigned condition-child filename lookup without course context to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Launch this TDF through its active course assignment');
    }

    const byCourseContext = await (asyncMethods.getTdfById as any).call(
      { userId: 'assigned-student' },
      'assigned-condition',
      {
        courseAssignment: {
          assignmentId: 'assigned-row',
          courseId: 'assigned-course',
          TDFId: 'assigned-root',
          launchSource: 'courses',
        },
      },
    );

    expect(byCourseContext._id).to.equal('assigned-condition');
  });

  it('denies unrelated user public stimulus lookup by stimuliSetId', async function() {
    await TdfsAny.insertAsync({
      _id: 'stim-private-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 104,
      rawStimuliFile: {
        setspec: { clusters: [] },
      },
      stimuli: [
        { stimulusKC: 2, clusterKC: 1, correctResponse: 'answer' },
      ],
      content: {
        fileName: 'stim-private.json',
        tdfs: { tutor: { setspec: { lessonname: 'Stim Private', userselect: 'false' } } },
      },
    });

    try {
      await (asyncMethods.getStimuliSetById as any).call({ userId: 'other-user' }, 104);
      expect.fail('Expected unrelated user stimulus lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('allows owner public stimulus lookup by stimuliSetId', async function() {
    await TdfsAny.insertAsync({
      _id: 'stim-owned-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 105,
      rawStimuliFile: {
        setspec: { clusters: [] },
      },
      stimuli: [
        { stimulusKC: 3, clusterKC: 1, correctResponse: 'answer' },
      ],
      content: {
        fileName: 'stim-owned.json',
        tdfs: { tutor: { setspec: { lessonname: 'Stim Owned', userselect: 'false' } } },
      },
    });

    const stimuli = await (asyncMethods.getStimuliSetById as any).call({ userId: 'owner-user' }, 105);

    expect(stimuli).to.have.length(1);
    expect(stimuli[0].stimulusKC).to.equal(3);
  });

  it('persists AutoTutor expectation relationships into raw and flat stimuli for any authorized accessor', async function() {
    const autoTutor = {
      id: 'script-1',
      topic: 'Communication',
      learningGoal: 'Explain communication concepts.',
      idealAnswer: 'Communication supports connection with clear observations and requests.',
      expectations: [
        { id: 'E1', label: 'connection', proposition: 'NVC supports connection.', assertion: 'NVC supports connection.' },
        { id: 'E2', label: 'request', proposition: 'NVC requests leave room for no.', assertion: 'NVC requests leave room for no.' },
      ],
      misconceptions: [],
      dialogPolicy: {
        requiredExpectations: ['E1', 'E2'],
      },
      summary: 'NVC supports connection with clear requests.',
    };
    await TdfsAny.insertAsync({
      _id: 'autotutor-derived-tdf',
      ownerId: 'owner-user',
      accessors: [{ userId: 'student-user' }],
      stimuliSetId: 108,
      stimulusFileName: 'autotutor-stims.json',
      rawStimuliFile: {
        setspec: {
          clusters: [
            {
              clusterKC: 108000,
              stims: [
                {
                  stimulusKC: 108001,
                  display: { text: 'What is NVC for?' },
                  autoTutor,
                },
              ],
            },
          ],
        },
      },
      stimuli: [
        {
          stimulusKC: 108001,
          clusterKC: 108000,
          correctResponse: '__AUTOTUTOR_SESSION__',
          display: { text: 'What is NVC for?' },
          autoTutor,
        },
      ],
      content: {
        fileName: 'autotutor-tdf.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'AutoTutor Derived',
              stimulusfile: 'autotutor-stims.json',
              openRouterModel: 'openai/test-model',
              userselect: 'false',
            },
            unit: [
              {
                autotutorsession: {
                  cluster: 0,
                  maxTurns: 10,
                  graduation: {
                    requiredExpectationCount: 1,
                    maxActiveMisconceptions: 0,
                  },
                },
              },
            ],
          },
        },
      },
    });
    const expectationRelationships = {
      E1: { E2: 0.75 },
      E2: { E1: 0.75 },
    };
    const provenance = {
      graphVersion: 'autotutor-expectation-relationships-v1',
      generatedAt: '2026-06-05T00:00:00.000Z',
      model: 'google/gemini-embedding-001',
      attemptedModels: ['google/gemini-embedding-001'],
      metric: 'cosine_similarity_normalized_vectors',
      scoreTransform: 'clamp_negative_to_zero',
      sourceKeyType: 'user',
      cacheKey: 'test-cache-key',
    };

    const result = await (asyncMethods.persistAutoTutorExpectationRelationships as any).call(
      { userId: 'student-user' },
      'autotutor-derived-tdf',
      0,
      'script-1',
      expectationRelationships,
      provenance,
    );

    expect(result.success).to.equal(true);
    const updated = await TdfsAny.findOneAsync({ _id: 'autotutor-derived-tdf' });
    const rawAutoTutor = updated.rawStimuliFile.setspec.clusters[0].stims[0].autoTutor;
    const flatAutoTutor = updated.stimuli[0].autoTutor;
    expect(rawAutoTutor.expectationRelationships).to.deep.equal(expectationRelationships);
    expect(rawAutoTutor.expectationRelationshipProvenance).to.deep.equal(provenance);
    expect(flatAutoTutor.expectationRelationships).to.deep.equal(expectationRelationships);
    expect(flatAutoTutor.expectationRelationshipProvenance).to.deep.equal(provenance);
  });

  it('allows experiment participants to access stimuli for their assigned condition TDF', async function() {
    await TdfsAny.insertAsync({
      _id: 'condition-root-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 106,
      content: {
        fileName: 'AllConditionsRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Condition Root',
              experimentTarget: 'flashcardtest-fast',
              userselect: 'false',
              condition: ['Keywordflashcard2.json'],
              conditionTdfIds: ['condition-child-tdf'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'condition-child-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 107,
      rawStimuliFile: {
        setspec: { clusters: [] },
      },
      stimuli: [
        { stimulusKC: 4, clusterKC: 1, correctResponse: 'answer' },
      ],
      content: {
        fileName: 'Keywordflashcard2.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Keyword Flashcard 2',
              experimentTarget: 'kf2',
              userselect: 'false',
            },
          },
        },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: { experimentTarget: 'flashcardtest-fast' },
      loginParams: { loginMode: 'experiment' },
    });
    await GlobalExperimentStatesAny.insertAsync({
      userId: 'current-user',
      TDFId: 'condition-root-tdf',
      experimentState: {
        currentRootTdfId: 'condition-root-tdf',
        currentTdfId: 'condition-child-tdf',
        conditionTdfId: 'condition-child-tdf',
        experimentTarget: 'flashcardtest-fast',
        lastActionTimeStamp: Date.now(),
      },
    });

    const stimuli = await (asyncMethods.getStimuliSetById as any).call({ userId: 'current-user' }, 107);

    expect(stimuli).to.have.length(1);
    expect(stimuli[0].stimulusKC).to.equal(4);
  });

  it('keeps stimulus display map reads callable for the client sync path', async function() {
    expect(asyncMethods.getStimDisplayTypeMap).to.be.a('function');
    expect(asyncMethods.getStimDisplayTypeMapVersion).to.be.a('function');
  });

  it('does not expose helper-only content and analytics methods publicly', function() {
    expect(asyncMethods.getUserIdforUsername).to.equal(undefined);
    expect(asyncMethods.getStimSetFromLearningSessionByClusterList).to.equal(undefined);
    expect(asyncMethods.getUserLastFeedbackTypeFromHistory).to.equal(undefined);
    expect(asyncMethods.getSourceSentences).to.equal(undefined);
    expect(asyncMethods.checkForTDFData).to.equal(undefined);
    expect(asyncMethods.getTdfNamesByOwnerId).to.equal(undefined);
    expect(asyncMethods.resolveAssignedRootTdfIdsForUser).to.equal(undefined);
  });

  it('projects public experiment-target lookup instead of returning the full TDF anonymously', async function() {
    await TdfsAny.insertAsync({
      _id: 'experiment-root',
      ownerId: 'owner-user',
      stimuliSetId: 106,
      stimuli: [{ stimulusKC: 4 }],
      rawStimuliFile: { setspec: { clusters: [{ stims: [] }] } },
      content: {
        isMultiTdf: true,
        fileName: 'experiment-root.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Experiment Root',
              experimentTarget: 'study-a',
              experimentPasswordRequired: false,
              srfilterclose: 'false',
              speechAPIKey: 'encrypted-speech-key',
              textToSpeechAPIKey: 'encrypted-tts-key',
              condition: ['condition-a.json'],
            },
            deliverySettings: {
              experimentLoginText: 'Participant ID',
              privateAdminNote: 'do not expose',
            },
            unit: [{ unitname: 'private unit' }],
          },
        },
      },
    });

    const entry = await (asyncMethods.getTdfByExperimentTarget as any).call({}, 'study-a');

    expect(entry._id).to.equal('experiment-root');
    expect(entry.stimuli).to.equal(undefined);
    expect(entry.rawStimuliFile).to.equal(undefined);
    expect(entry.content.fileName).to.equal(undefined);
    expect(entry.content.tdfs.tutor.unit).to.equal(undefined);
    expect(entry.content.tdfs.tutor.setspec.speechAPIKey).to.equal(undefined);
    expect(entry.content.tdfs.tutor.setspec.textToSpeechAPIKey).to.equal(undefined);
    expect(entry.content.tdfs.tutor.setspec.srfilterclose).to.equal('false');
    expect(entry.content.tdfs.tutor.deliverySettings).to.deep.equal({
      experimentLoginText: 'Participant ID',
    });
  });

  it('returns the full experiment TDF for an authenticated authorized caller', async function() {
    await TdfsAny.insertAsync({
      _id: 'owned-experiment-root',
      ownerId: 'owner-user',
      stimuliSetId: 107,
      content: {
        fileName: 'owned-experiment-root.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Owned Experiment Root',
              experimentTarget: 'study-b',
              userselect: 'false',
            },
            unit: [{ unitname: 'owner-visible unit' }],
          },
        },
      },
    });

    const tdf = await (asyncMethods.getTdfByExperimentTarget as any).call({ userId: 'owner-user' }, 'study-b');

    expect(tdf._id).to.equal('owned-experiment-root');
    expect(tdf.content.fileName).to.equal('owned-experiment-root.json');
    expect(tdf.content.tdfs.tutor.unit).to.have.length(1);
  });
});

describe('learner analytics method authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('denies cross-user learner history helper reads', async function() {
    try {
      await (asyncMethods.getLearningHistoryForUnit as any).call(
        { userId: 'current-user' },
        'other-user',
        'tdf-1',
        0
      );
      expect.fail('Expected cross-user learning history read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies cross-user SPARC history helper reads', async function() {
    try {
      await (asyncMethods.getSparcHistoryForUnit as any).call(
        { userId: 'current-user' },
        'other-user',
        'tdf-1',
        0
      );
      expect.fail('Expected cross-user SPARC history read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('returns explicit identity fields for learning history reconstruction', async function() {
    await HistoriesAny.insertAsync({
      _id: 'learning-history-explicit-identity',
      userId: 'current-user',
      TDFId: 'tdf-identity',
      levelUnit: 0,
      levelUnitType: 'model',
      time: 1000,
      problemStartTime: 900,
      outcome: 'correct',
      eventType: 'sparc',
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      CFCorrectAnswer: 'Alpha',
      responseKey: 'Alpha',
      responseDuration: 75,
      practiceDurationMs: 75,
      responseValue: 'Alpha',
      CFEndLatency: 100,
      CFFeedbackLatency: 100,
    });

    const rows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-identity',
      0
    );

    expect(rows).to.have.length(1);
    expect(rows[0]).to.deep.include({
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      eventType: 'sparc',
      levelUnitType: 'model',
      responseKey: 'Alpha',
      responseDuration: 75,
      practiceDurationMs: 75,
      responseValue: 'Alpha',
      problemStartTime: 900,
    });
  });

  it('returns prior-unit model history for later units unless unit-scoped history is requested', async function() {
    await HistoriesAny.insertAsync({
      _id: 'sparc-model-unit-1',
      userId: 'current-user',
      TDFId: 'tdf-shared-model',
      levelUnit: 1,
      levelUnitType: 'model',
      time: 1000,
      outcome: 'correct',
      eventType: 'sparc',
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      responseKey: 'Alpha',
      responseDuration: 75,
    });
    await HistoriesAny.insertAsync({
      _id: 'flashcard-model-unit-2',
      userId: 'current-user',
      TDFId: 'tdf-shared-model',
      levelUnit: 2,
      levelUnitType: 'model',
      time: 2000,
      outcome: 'incorrect',
      eventType: '',
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      responseKey: 'Alpha',
      responseDuration: 90,
    });

    const cumulativeRows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-shared-model',
      2,
      false
    );
    expect(cumulativeRows.map((row: any) => row.time)).to.deep.equal([1000, 2000]);
    expect(cumulativeRows.map((row: any) => row.eventType)).to.deep.equal(['sparc', '']);

    const unitScopedRows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-shared-model',
      2,
      true
    );
    expect(unitScopedRows.map((row: any) => row.time)).to.deep.equal([2000]);
  });

  it('returns course-scoped learning history across assigned TDFs without server-side cluster filtering', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-a',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-course-a',
      courseId: 'course-a',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-course-a',
      userId: 'current-user',
      sectionId: 'section-course-a',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-a',
      courseId: 'course-a',
      TDFId: 'tdf-current',
      order: 0,
      required: true,
    });
    const baseRow = {
      userId: 'current-user',
      levelUnitType: 'model',
      clusterKC: 'fractions.lcd',
      KCCluster: 'fractions.lcd',
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      KCId: 'stim-a',
      responseKey: 'answer',
      outcome: 'correct',
    };
    await HistoriesAny.insertAsync({
      ...baseRow,
      _id: 'course-current-tdf',
      TDFId: 'tdf-current',
      levelUnit: 4,
      time: 2000,
      courseAssignment: {
        assignmentId: 'assignment-a',
        courseId: 'course-a',
        TDFId: 'tdf-current',
        launchSource: 'courses',
      },
    });
    await HistoriesAny.insertAsync({
      ...baseRow,
      _id: 'course-prior-tdf-same-cluster',
      TDFId: 'tdf-prior',
      levelUnit: 9,
      time: 1000,
      stimuliSetId: 'other-set',
      stimulusKC: 'other-stim',
      KCId: 'other-stim',
      courseAssignment: {
        assignmentId: 'assignment-prior',
        courseId: 'course-a',
        TDFId: 'tdf-prior',
        launchSource: 'courses',
      },
    });
    await HistoriesAny.insertAsync({
      ...baseRow,
      _id: 'course-other-cluster',
      TDFId: 'tdf-current',
      levelUnit: 1,
      time: 1500,
      clusterKC: 'fractions.unlike',
      KCCluster: 'fractions.unlike',
      courseAssignment: {
        assignmentId: 'assignment-a',
        courseId: 'course-a',
        TDFId: 'tdf-current',
        launchSource: 'courses',
      },
    });
    await HistoriesAny.insertAsync({
      ...baseRow,
      _id: 'course-other-course',
      TDFId: 'tdf-other-course',
      levelUnit: 1,
      time: 1700,
      courseAssignment: {
        assignmentId: 'assignment-other',
        courseId: 'course-b',
        TDFId: 'tdf-other-course',
        launchSource: 'courses',
      },
    });

    const rows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-current',
      4,
      false,
      {
        courseAssignment: {
          assignmentId: 'assignment-a',
          courseId: 'course-a',
          TDFId: 'tdf-current',
          launchSource: 'courses',
        },
      }
    );

    expect(rows.map((row: any) => row._id)).to.deep.equal([
      'course-prior-tdf-same-cluster',
      'course-other-cluster',
      'course-current-tdf',
    ]);
    expect(rows.map((row: any) => row.TDFId)).to.deep.equal(['tdf-prior', 'tdf-current', 'tdf-current']);
    expect(rows[0]).to.deep.include({
      stimuliSetId: 'other-set',
      stimulusKC: 'other-stim',
      clusterKC: 'fractions.lcd',
    });
  });

  it('allows course-scoped learning history without caller-provided cluster KCs', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-a',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-course-a',
      courseId: 'course-a',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-course-a',
      userId: 'current-user',
      sectionId: 'section-course-a',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-a',
      courseId: 'course-a',
      TDFId: 'tdf-current',
      order: 0,
      required: true,
    });

    const rows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-current',
      4,
      false,
      {
        courseAssignment: {
          assignmentId: 'assignment-a',
          courseId: 'course-a',
          TDFId: 'tdf-current',
          launchSource: 'courses',
        },
      }
    );

    expect(rows).to.deep.equal([]);
  });

  it('allows public course-scoped learning history without section enrollment', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-public-history',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
      visibility: 'public',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-public-history',
      courseId: 'course-public-history',
      TDFId: 'tdf-public-history',
      order: 0,
      required: true,
    });

    const rows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-public-history',
      4,
      false,
      {
        courseAssignment: {
          assignmentId: 'assignment-public-history',
          courseId: 'course-public-history',
          TDFId: 'tdf-public-history',
          launchSource: 'courses',
        },
      }
    );

    expect(rows).to.deep.equal([]);
  });

  it('rejects course-scoped learning history when the current user is not enrolled in that course', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-unenrolled-history',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-unenrolled-history',
      courseId: 'course-unenrolled-history',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-unenrolled-history',
      courseId: 'course-unenrolled-history',
      TDFId: 'tdf-unenrolled-history',
      order: 0,
      required: true,
    });

    try {
      await (asyncMethods.getLearningHistoryForUnit as any).call(
        { userId: 'current-user' },
        'current-user',
        'tdf-unenrolled-history',
        4,
        false,
        {
          courseAssignment: {
            assignmentId: 'assignment-unenrolled-history',
            courseId: 'course-unenrolled-history',
            TDFId: 'tdf-unenrolled-history',
            launchSource: 'courses',
          },
        }
      );
      expect.fail('Expected unenrolled course-scoped learning history read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course assignment history context is not available for current user');
    }
  });

  it('returns exact-unit durable SPARC history with canonical extension fields', async function() {
    const sparcExtension = {
      documentId: 'doc-1',
      sourceAddress: {
        documentId: 'doc-1',
        nodeId: 'node-1',
      },
      practiceObservation: {
        observationId: 'obs-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'node-1',
        },
        time: 1000,
        problemStartTime: 900,
        outcome: 'correct',
        responseValue: '4',
      },
    };
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-model',
      historySchemaVersion: 1,
      userId: 'current-user',
      TDFId: 'tdf-sparc',
      sessionID: 'session-1',
      levelUnit: 2,
      levelUnitType: 'model',
      time: 1000,
      recordedServerTime: 1100,
      eventId: 1,
      problemStartTime: 900,
      outcome: 'correct',
      eventType: 'sparc',
      responseValue: '4',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      responseKC: 'response-a',
      responseKey: '4',
      sparc: sparcExtension,
      serverOnlyLargePayload: {
        shouldNotHydrateToClient: true,
        nested: {
          rawDocument: 'not part of the SPARC resume projection',
        },
      },
    });
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-state-transition',
      historySchemaVersion: 1,
      userId: 'current-user',
      TDFId: 'tdf-sparc',
      sessionID: 'session-1',
      levelUnit: 2,
      levelUnitType: 'sparc',
      time: 1200,
      recordedServerTime: 1300,
      eventId: 2,
      problemStartTime: 1150,
      outcome: 'study',
      eventType: 'sparc',
      responseValue: 'next',
      sparc: {
        documentId: 'doc-1',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'node-2',
        },
      },
    });
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-other-user',
      userId: 'other-user',
      TDFId: 'tdf-sparc',
      levelUnit: 2,
      levelUnitType: 'sparc',
      time: 900,
      eventType: 'sparc',
      sparc: { documentId: 'doc-ignored' },
    });
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-other-unit',
      userId: 'current-user',
      TDFId: 'tdf-sparc',
      levelUnit: 1,
      levelUnitType: 'sparc',
      time: 950,
      eventType: 'sparc',
      sparc: { documentId: 'doc-ignored' },
    });
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-non-sparc-event',
      userId: 'current-user',
      TDFId: 'tdf-sparc',
      levelUnit: 2,
      levelUnitType: 'sparc',
      time: 975,
      eventType: 'h5p',
      sparc: { documentId: 'doc-ignored' },
    });

    const rows = await (asyncMethods.getSparcHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-sparc',
      2
    );

    expect(rows.map((row: any) => row._id)).to.deep.equal([
      'sparc-history-model',
      'sparc-history-state-transition',
    ]);
    expect(rows[0]).to.deep.include({
      TDFId: 'tdf-sparc',
      sessionID: 'session-1',
      userId: 'current-user',
      levelUnit: 2,
      levelUnitType: 'model',
      eventType: 'sparc',
      stimulusKC: 'stim-a',
      responseKC: 'response-a',
      responseKey: '4',
    });
    expect(rows[0].sparc).to.deep.equal(sparcExtension);
    expect(rows[0]).not.to.have.property('serverOnlyLargePayload');
    expect(rows[1]).to.have.nested.property('sparc.documentId', 'doc-1');
  });

  it('counts one completed assessment trial per H5P summary row on resume', async function() {
    const baseRecord = {
      userId: 'current-user',
      TDFId: 'h5p-assessment',
      levelUnit: 0,
      levelUnitType: 'schedule',
      studentResponseType: 'ATTEMPT',
      outcome: 'correct',
    };

    await HistoriesAny.insertAsync({
      ...baseRecord,
      _id: 'h5p-summary',
      action: 'respond',
      h5p: { eventType: 'summary', contentId: 'h5p-1' },
    });
    await HistoriesAny.insertAsync({
      ...baseRecord,
      _id: 'h5p-part-1',
      action: 'h5p interaction',
      h5p: { eventType: 'part', contentId: 'h5p-1', subContentId: 'blank-0' },
    });
    await HistoriesAny.insertAsync({
      ...baseRecord,
      _id: 'h5p-part-2',
      action: 'h5p interaction',
      h5p: { eventType: 'part', contentId: 'h5p-1', subContentId: 'blank-1' },
    });
    await HistoriesAny.insertAsync({
      ...baseRecord,
      _id: 'ordinary-assessment-row',
    });

    const count = await (asyncMethods.getAssessmentCompletedTrialCountFromHistory as any).call(
      { userId: 'current-user' },
      'current-user',
      'h5p-assessment',
      0
    );

    expect(count).to.equal(2);
  });

  it('denies cross-user experiment-state and recent-TDF reads', async function() {
    try {
      await (asyncMethods.getExperimentState as any).call({ userId: 'current-user' }, 'other-user', 'tdf-1');
      expect.fail('Expected cross-user experiment state read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }

    try {
      await (asyncMethods.getLastTDFAccessed as any).call({ userId: 'current-user' }, 'other-user');
      expect.fail('Expected cross-user recent TDF read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('derives experiment-state creation actor from method context', async function() {
    await TdfsAny.insertAsync({
      _id: 'state-tdf',
      ownerId: 'current-user',
      content: {
        fileName: 'state-tdf.json',
        tdfs: { tutor: { setspec: { lessonname: 'State TDF', userselect: 'false' } } },
      },
    });

    await (asyncMethods.createExperimentState as any).call(
      { userId: 'current-user' },
      { currentTdfId: 'state-tdf', currentRootTdfId: 'state-tdf' },
      'other-user'
    );

    expect(await GlobalExperimentStatesAny.findOneAsync({ userId: 'other-user' })).to.equal(undefined);
    const stateDoc = await GlobalExperimentStatesAny.findOneAsync({ userId: 'current-user', TDFId: 'state-tdf' }) as any;
    expect(stateDoc).to.exist;
  });
});

describe('system method authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('requires admin access for server status and verbosity controls', async function() {
    try {
      await methods.getServerStatus.call({ userId: 'student-user' });
      expect.fail('Expected server status to require admin access');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }

    try {
      await methods.setVerbosity.call({ userId: 'student-user' }, 1);
      expect.fail('Expected verbosity changes to require admin access');
    } catch (error: any) {
      expect(error.error).to.equal('not-authorized');
    }
  });

  it('requires login user-agent updates to target the current user', async function() {
    try {
      await methods.logUserAgentAndLoginTime.call({ userId: 'current-user' }, 'other-user', 'test-agent');
      expect.fail('Expected cross-user login status update to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('requires auth for debug logging and self-only error reports', async function() {
    try {
      await methods.debugLog.call({}, 'anonymous log');
      expect.fail('Expected anonymous debug logging to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(401);
    }

    try {
      await methods.sendUserErrorReport.call(
        { userId: 'current-user' },
        'other-user',
        'description',
        '/test',
        {},
        'agent',
        [],
        {}
      );
      expect.fail('Expected cross-user error report to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('requires admin access to initialize client verbosity settings', async function() {
    try {
      await methods.ensureClientVerbositySetting.call({ userId: 'student-user' });
      expect.fail('Expected client verbosity initialization to require admin access');
    } catch (error: any) {
      expect(error.error).to.equal('not-authorized');
    }
  });
});

describe('condition count method authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('denies unauthenticated condition count updates', async function() {
    await TdfsAny.insertAsync({
      _id: 'condition-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'condition-root.json',
        tdfs: { tutor: { setspec: { lessonname: 'Root', userselect: 'true', condition: ['a.json'] } } },
      },
    });

    try {
      await (asyncMethods.updateTdfConditionCounts as any).call({}, 'condition-root', [1]);
      expect.fail('Expected unauthenticated condition count update to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(401);
    }
  });

  it('denies condition count resets by unrelated users', async function() {
    await TdfsAny.insertAsync({
      _id: 'condition-reset-root',
      ownerId: 'owner-user',
      conditionCounts: [3],
      content: {
        fileName: 'condition-reset-root.json',
        tdfs: { tutor: { setspec: { lessonname: 'Root', userselect: 'false', condition: ['a.json'] } } },
      },
    });

    try {
      await (asyncMethods.resetTdfConditionCounts as any).call({ userId: 'other-user' }, 'condition-reset-root');
      expect.fail('Expected unrelated condition count reset to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies history insertion for another user', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'history-root.json',
        tdfs: { tutor: { setspec: { lessonname: 'History Root', userselect: 'true' } } },
      },
    });

    try {
      await (asyncMethods.insertHistory as any).call({ userId: 'current-user' }, {
        userId: 'other-user',
        TDFId: 'history-root',
      });
      expect.fail('Expected cross-user history insertion to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('rejects non-canonical history envelopes before writing', async function() {
    try {
      await (asyncMethods.insertHistory as any).call({ userId: 'current-user' }, {
        userId: 'current-user',
        TDFId: 'history-incomplete',
      });
      expect.fail('Expected incomplete history insertion to be rejected');
    } catch (error: any) {
      expect(error.error).to.equal(400);
      expect(error.reason).to.contain('History record missing canonical core fields');
    }

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-incomplete',
    });
    expect(insertedHistory).to.equal(undefined);
  });

  it('rejects oversized history wire payloads before writing', async function() {
    try {
      await (asyncMethods.insertHistory as any).call(
        { userId: 'current-user' },
        createServerHistoryRecord({
          TDFId: 'history-oversized',
          CFNote: 'x'.repeat(40 * 1024),
        })
      );
      expect.fail('Expected oversized history insertion to be rejected');
    } catch (error: any) {
      expect(error.error).to.equal(400);
      expect(error.reason).to.contain('History wire payload exceeds');
    }

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-oversized',
    });
    expect(insertedHistory).to.equal(undefined);
  });

  it('rejects unsupported history schema versions before writing', async function() {
    try {
      await (asyncMethods.insertHistory as any).call(
        { userId: 'current-user' },
        createServerHistoryRecord({
          TDFId: 'history-unsupported-version',
          historySchemaVersion: 2,
        })
      );
      expect.fail('Expected unsupported history schema version to be rejected');
    } catch (error: any) {
      expect(error.error).to.equal(400);
      expect(error.reason).to.equal('History record historySchemaVersion must be 1');
    }

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-unsupported-version',
    });
    expect(insertedHistory).to.equal(undefined);
  });

  it('rejects oversized history extension fields before writing', async function() {
    try {
      await (asyncMethods.insertHistory as any).call(
        { userId: 'current-user' },
        createServerHistoryRecord({
          TDFId: 'history-extension-oversized',
          CFNote: 'x'.repeat(20 * 1024),
        })
      );
      expect.fail('Expected oversized history extension insertion to be rejected');
    } catch (error: any) {
      expect(error.error).to.equal(400);
      expect(error.reason).to.contain('History extension field CFNote exceeds');
    }

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-extension-oversized',
    });
    expect(insertedHistory).to.equal(undefined);
  });

  it('allows regular TDF history insertion when experiment state currentTdfId is the root', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-regular',
      ownerId: 'owner-user',
      stimuliSetId: 'set-1',
      content: {
        fileName: 'history-regular.json',
        tdfs: { tutor: { setspec: { lessonname: 'History Regular', userselect: 'true' } } },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: {},
      loginParams: {},
    });
    await GlobalExperimentStatesAny.insertAsync({
      userId: 'current-user',
      TDFId: 'history-regular',
      experimentState: {
        currentRootTdfId: 'history-regular',
        currentTdfId: 'history-regular',
        lastActionTimeStamp: Date.now(),
      },
    });

    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-regular' })
    );

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-regular',
    }) as any;
    expect(insertedHistory).to.exist;
    expect(insertedHistory.historySchemaVersion).to.equal(1);
  });

  it('updates stimulus crowd stats only after an accepted history insert', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-crowd-stats',
      ownerId: 'owner-user',
      stimuliSetId: 'set-1',
      content: {
        fileName: 'history-crowd-stats.json',
        tdfs: { tutor: { setspec: { lessonname: 'Crowd Stats', userselect: 'true' } } },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: {},
      loginParams: {},
    });

    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-crowd-stats', outcome: 'correct' })
    );
    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-crowd-stats', outcome: 'incorrect' })
    );

    const stat = await StimulusCrowdStatsAny.findOneAsync({ stimulusKey: 'set-1:kc-1' }) as any;
    expect(stat).to.exist;
    expect(stat.correctCount).to.equal(1);
    expect(stat.incorrectCount).to.equal(1);
    expect(stat.totalCount).to.equal(2);
    expect(stat.KCId).to.equal('kc-1');
  });

  it('does not double-count duplicate H5P idempotency submissions', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-h5p-crowd-stats',
      ownerId: 'owner-user',
      stimuliSetId: 'set-1',
      content: {
        fileName: 'history-h5p-crowd-stats.json',
        tdfs: { tutor: { setspec: { lessonname: 'Crowd Stats H5P', userselect: 'true' } } },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: {},
      loginParams: {},
    });

    const h5p = { idempotencyKey: 'h5p-key-1', eventType: 'summary' };
    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-h5p-crowd-stats', h5p })
    );
    const duplicateResult = await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-h5p-crowd-stats', h5p })
    );

    const stat = await StimulusCrowdStatsAny.findOneAsync({ stimulusKey: 'set-1:kc-1' }) as any;
    expect(duplicateResult).to.deep.equal({ duplicate: true });
    expect(stat.totalCount).to.equal(1);
    expect(stat.correctCount).to.equal(1);
  });

  it('returns scoped batched stimulus crowd stats for the current deck', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-crowd-read',
      ownerId: 'owner-user',
      stimuliSetId: 'set-1',
      content: {
        fileName: 'history-crowd-read.json',
        tdfs: { tutor: { setspec: { lessonname: 'Crowd Stats Read', userselect: 'true' } } },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: {},
      loginParams: {},
    });
    await StimulusCrowdStatsAny.insertAsync({
      stimulusKey: 'set-1:kc-1',
      stimuliSetId: 'set-1',
      stimulusKC: 'kc-1',
      KCId: 'kc-1',
      correctCount: 3,
      incorrectCount: 2,
      totalCount: 5,
      lastOutcomeAt: 1000,
      updatedAt: new Date(),
    });
    await StimulusCrowdStatsAny.insertAsync({
      stimulusKey: 'other-set:kc-1',
      stimuliSetId: 'other-set',
      stimulusKC: 'kc-1',
      KCId: 'kc-1',
      correctCount: 99,
      incorrectCount: 99,
      totalCount: 198,
      lastOutcomeAt: 1000,
      updatedAt: new Date(),
    });

    const stats = await (asyncMethods.getStimulusCrowdStatsForDeck as any).call(
      { userId: 'current-user' },
      'history-crowd-read',
      ['kc-1', 'missing-kc']
    );

    expect(stats).to.deep.equal([{
      stimulusKey: 'set-1:kc-1',
      stimuliSetId: 'set-1',
      stimulusKC: 'kc-1',
      KCId: 'kc-1',
      correctCount: 3,
      incorrectCount: 2,
      totalCount: 5,
    }]);
  });

  it('denies stimulus crowd stats reads for inaccessible TDFs', async function() {
    await TdfsAny.insertAsync({
      _id: 'private-crowd-read',
      ownerId: 'owner-user',
      stimuliSetId: 'set-1',
      content: {
        fileName: 'private-crowd-read.json',
        tdfs: { tutor: { setspec: { lessonname: 'Private Crowd Stats', userselect: 'false' } } },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: {},
      loginParams: {},
    });

    try {
      await (asyncMethods.getStimulusCrowdStatsForDeck as any).call(
        { userId: 'current-user' },
        'private-crowd-read',
        ['kc-1']
      );
      expect.fail('Expected inaccessible crowd stats read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('allows history insertion for a condition assigned in root experiment state', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'AllConditionsRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'History Root',
              experimentTarget: 'flashcardtest',
              userselect: 'false',
              condition: ['Generalflashcard1.json'],
              conditionTdfIds: ['history-condition'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'history-condition',
      ownerId: 'owner-user',
      content: {
        fileName: 'Generalflashcard1.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'General Flashcard 1',
              experimentTarget: 'GF1',
              userselect: 'false',
            },
          },
        },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: { experimentTarget: 'flashcardtest' },
      loginParams: { loginMode: 'experiment' },
    });
    await GlobalExperimentStatesAny.insertAsync({
      userId: 'current-user',
      TDFId: 'history-root',
      experimentState: {
        currentRootTdfId: 'history-root',
        currentTdfId: 'history-condition',
        conditionTdfId: 'history-condition',
        experimentTarget: 'flashcardtest',
        lastActionTimeStamp: Date.now(),
      },
    });

    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-condition' })
    );

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-condition',
    }) as any;
    expect(insertedHistory).to.exist;
  });

  it('allows condition history insertion when assignment state only has currentTdfId', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'AllConditionsRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'History Root',
              experimentTarget: 'flashcardtest',
              userselect: 'false',
              condition: ['Generalflashcard1.json'],
              conditionTdfIds: ['history-condition'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'history-condition',
      ownerId: 'owner-user',
      content: {
        fileName: 'Generalflashcard1.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'General Flashcard 1',
              experimentTarget: 'GF1',
              userselect: 'false',
            },
          },
        },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: { experimentTarget: 'flashcardtest' },
      loginParams: { loginMode: 'experiment' },
    });
    await GlobalExperimentStatesAny.insertAsync({
      userId: 'current-user',
      TDFId: 'history-root',
      experimentState: {
        currentRootTdfId: 'history-root',
        currentTdfId: 'history-condition',
        experimentTarget: 'flashcardtest',
        lastActionTimeStamp: Date.now(),
      },
    });

    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-condition' })
    );

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-condition',
    }) as any;
    expect(insertedHistory).to.exist;
  });

  it('does not expose raw all-history TDF reads as a public method', function() {
    expect(asyncMethods.getHistoryByTDFID).to.equal(undefined);
  });

  it('denies adaptive-learning outcomes for another user', async function() {
    await TdfsAny.insertAsync({
      _id: 'adaptive-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'adaptive-root.json',
        tdfs: { tutor: { setspec: { lessonname: 'Adaptive Root', userselect: 'true' } } },
      },
      stimuli: [],
    });

    try {
      await (asyncMethods.getOutcomesForAdaptiveLearning as any).call({ userId: 'current-user' }, 'other-user', 'adaptive-root');
      expect.fail('Expected cross-user adaptive outcomes read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });
});

describe('course method authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('denies course creation by non-teachers', async function() {
    try {
      await (asyncMethods.addCourse as any).call({ userId: 'student-user' }, {
        courseName: 'Student Course',
        sections: ['A'],
      });
      expect.fail('Expected non-teacher course creation to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies cross-instructor course reads', async function() {
    await Roles.addUsersToRolesAsync('teacher-a', 'teacher');
    await Roles.addUsersToRolesAsync('teacher-b', 'teacher');

    try {
      await (asyncMethods.getAllCoursesForInstructor as any).call({ userId: 'teacher-b' }, 'teacher-a');
      expect.fail('Expected cross-instructor course read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies assignment edits by teachers who do not own the course', async function() {
    await Roles.addUsersToRolesAsync('teacher-a', 'teacher');
    await Roles.addUsersToRolesAsync('teacher-b', 'teacher');
    await CoursesAny.insertAsync({
      _id: 'course-owned-by-a',
      teacherUserId: 'teacher-a',
      courseName: 'Owned Course',
    });

    try {
      await (asyncMethods.editCourseAssignments as any).call({ userId: 'teacher-b' }, {
        courseId: 'course-owned-by-a',
        tdfs: [],
      });
      expect.fail('Expected cross-course assignment edit to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('requires admin access for broad course listing', async function() {
    try {
      await (asyncMethods.getAllCourses as any).call({ userId: 'student-user' });
      expect.fail('Expected broad course listing to require admin access');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies cross-user due date exception reads', async function() {
    try {
      await (asyncMethods.checkForUserException as any).call({ userId: 'student-user' }, 'other-user', 'tdf-id');
      expect.fail('Expected cross-user due date exception read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });
});

describe('content helper authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('requires login for owner display lookup', async function() {
    try {
      await (methods.getTdfOwnersMap as any).call({}, ['owner-user']);
      expect.fail('Expected anonymous owner lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(401);
    }
  });

  it('denies cross-owner TDF listing', async function() {
    try {
      await (methods.getTdfsByOwnerId as any).call({ userId: 'student-user' }, 'owner-user');
      expect.fail('Expected cross-owner TDF listing to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies manual content upload helper calls by non-teachers', async function() {
    try {
      await (asyncMethods.saveContentFile as any).call(
        { userId: 'student-user' },
        'tdf',
        'lesson.json',
        { tutor: { setspec: { lessonname: 'Lesson', stimulusfile: 'stim.json' }, unit: [] } },
        'student-user'
      );
      expect.fail('Expected non-teacher content save to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('requires authentication before confirming TDF updates', async function() {
    try {
      await (asyncMethods.tdfUpdateConfirmed as any).call({}, { _id: 'tdf-update', ownerId: 'owner-user' });
      expect.fail('Expected anonymous TDF update confirmation to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(401);
    }
  });

  it('preserves srfilterclose when confirming an uploaded TDF overwrite', async function() {
    await TdfsAny.insertAsync({
      _id: 'tdf-update',
      ownerId: 'owner-user',
      content: {
        fileName: 'lesson.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Old Lesson',
              stimulusfile: 'old-stim.json',
            },
            unit: [],
          },
        },
      },
    });

    await (asyncMethods.tdfUpdateConfirmed as any).call({ userId: 'owner-user' }, {
      _id: 'tdf-update',
      ownerId: 'owner-user',
      content: {
        fileName: 'lesson.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Updated Lesson',
              stimulusfile: 'stim.json',
              srfilterclose: 'false',
            },
            unit: [],
          },
        },
      },
    });

    const updated = await TdfsAny.findOneAsync({ _id: 'tdf-update' });
    expect(updated.content.tdfs.tutor.setspec.srfilterclose).to.equal('false');
  });
});

describe('MTurk workflow authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('requires teacher or admin role for MTurk experiment listing and AWS profile updates', async function() {
    try {
      await (asyncMethods.getTurkWorkflowExperiments as any).call({ userId: 'student-user' });
      expect.fail('Expected MTurk experiment listing to require teacher/admin');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }

    try {
      await (asyncMethods.saveUserAWSData as any).call({ userId: 'student-user' }, {});
      expect.fail('Expected MTurk AWS profile update to require teacher/admin');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies MTurk worker listing for experiments owned by another teacher', async function() {
    await Roles.addUsersToRolesAsync('teacher-a', 'teacher');
    await Roles.addUsersToRolesAsync('teacher-b', 'teacher');
    await TdfsAny.insertAsync({
      _id: 'turk-experiment-a',
      ownerId: 'teacher-a',
      content: {
        fileName: 'turk-experiment-a.json',
        tdfs: { tutor: { setspec: { lessonname: 'Turk A', experimentTarget: 'turk-a' } } },
      },
    });

    try {
      await (asyncMethods.getUsersByExperimentId as any).call({ userId: 'teacher-b' }, 'turk-experiment-a');
      expect.fail('Expected cross-owner MTurk worker listing to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });
});
