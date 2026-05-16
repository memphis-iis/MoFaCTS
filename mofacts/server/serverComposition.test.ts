import "../common/Collections";
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/alanning:roles';
import { asyncMethods, methods } from './serverComposition';
import sinon from 'sinon';
import StubCollections from 'meteor/hwillson:stub-collections';
import { Random } from 'meteor/random';
import { expect } from 'chai';

const MeteorAny = Meteor as any;
const MeteorUsersAny = Meteor.users as any;
const AssignmentsAny = (globalThis as any).Assignments as any;
const CoursesAny = (globalThis as any).Courses as any;
const DynamicSettingsAny = (globalThis as any).DynamicSettings as any;
const GlobalExperimentStatesAny = (globalThis as any).GlobalExperimentStates as any;
const HistoriesAny = (globalThis as any).Histories as any;
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

StubCollections.stub(AuditLogAny);
StubCollections.stub(AssignmentsAny);
StubCollections.stub(AuthThrottleStateAny);
StubCollections.stub(CoursesAny);
StubCollections.stub(DynamicSettingsAny);
StubCollections.stub(GlobalExperimentStatesAny);
StubCollections.stub(HistoriesAny);
StubCollections.stub(PasswordResetTokensAny);
StubCollections.stub(SectionsAny);
StubCollections.stub(SectionUserMapAny);
StubCollections.stub(TdfsAny);
StubCollections.stub(UserDashboardCacheAny);
StubCollections.stub(UserMetricsAny);
StubCollections.stub(UserTimesLogAny);
StubCollections.stub(UserUploadQuotaAny);

describe('server auth and session methods', function() {
  beforeEach(function() {
    AuditLogAny.remove({});
    AssignmentsAny.remove({});
    AuthThrottleStateAny.remove({});
    CoursesAny.remove({});
    DynamicSettingsAny.remove({});
    GlobalExperimentStatesAny.remove({});
    HistoriesAny.remove({});
    MeteorUsersAny.remove({});
    PasswordResetTokensAny.remove({});
    SectionsAny.remove({});
    SectionUserMapAny.remove({});
    TdfsAny.remove({});
    UserDashboardCacheAny.remove({});
    UserMetricsAny.remove({});
    UserTimesLogAny.remove({});
    UserUploadQuotaAny.remove({});
    (Meteor as any).roleAssignment?.remove({});
  });

  it('writes auth.signupCompleted for native signup', async function() {
    const email = `signup-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    const result = await methods.signUpUser.call({}, email, password);
    const auditEntry = AuditLogAny.findOne({
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
    const auditEntry = AuditLogAny.findOne({
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
    const auditEntry = AuditLogAny.findOne({
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
  beforeEach(function() {
    AuditLogAny.remove({});
    AuthThrottleStateAny.remove({});
    CoursesAny.remove({});
    DynamicSettingsAny.remove({});
    GlobalExperimentStatesAny.remove({});
    HistoriesAny.remove({});
    MeteorUsersAny.remove({});
    PasswordResetTokensAny.remove({});
    SectionUserMapAny.remove({});
    TdfsAny.remove({});
    UserDashboardCacheAny.remove({});
    UserMetricsAny.remove({});
    UserTimesLogAny.remove({});
    UserUploadQuotaAny.remove({});
    (Meteor as any).roleAssignment?.remove({});
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

  it('allows an enrolled student to load condition children of an assigned root before experiment state exists', async function() {
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

    const byId = await (asyncMethods.getTdfById as any).call({ userId: 'assigned-student' }, 'assigned-condition');
    const byFileName = await (asyncMethods.getTdfByFileName as any).call({ userId: 'assigned-student' }, 'AssignedCondition.json');

    expect(byId._id).to.equal('assigned-condition');
    expect(byFileName._id).to.equal('assigned-condition');
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
  beforeEach(function() {
    AuditLogAny.remove({});
    AuthThrottleStateAny.remove({});
    CoursesAny.remove({});
    DynamicSettingsAny.remove({});
    GlobalExperimentStatesAny.remove({});
    HistoriesAny.remove({});
    MeteorUsersAny.remove({});
    PasswordResetTokensAny.remove({});
    SectionUserMapAny.remove({});
    TdfsAny.remove({});
    UserDashboardCacheAny.remove({});
    UserMetricsAny.remove({});
    UserTimesLogAny.remove({});
    UserUploadQuotaAny.remove({});
    (Meteor as any).roleAssignment?.remove({});
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
  beforeEach(function() {
    AuditLogAny.remove({});
    AuthThrottleStateAny.remove({});
    CoursesAny.remove({});
    DynamicSettingsAny.remove({});
    GlobalExperimentStatesAny.remove({});
    HistoriesAny.remove({});
    MeteorUsersAny.remove({});
    PasswordResetTokensAny.remove({});
    SectionUserMapAny.remove({});
    TdfsAny.remove({});
    UserDashboardCacheAny.remove({});
    UserMetricsAny.remove({});
    UserTimesLogAny.remove({});
    UserUploadQuotaAny.remove({});
    (Meteor as any).roleAssignment?.remove({});
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
  beforeEach(function() {
    AuditLogAny.remove({});
    AuthThrottleStateAny.remove({});
    CoursesAny.remove({});
    DynamicSettingsAny.remove({});
    GlobalExperimentStatesAny.remove({});
    HistoriesAny.remove({});
    MeteorUsersAny.remove({});
    PasswordResetTokensAny.remove({});
    SectionUserMapAny.remove({});
    TdfsAny.remove({});
    UserDashboardCacheAny.remove({});
    UserMetricsAny.remove({});
    UserTimesLogAny.remove({});
    UserUploadQuotaAny.remove({});
    (Meteor as any).roleAssignment?.remove({});
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

  it('allows regular TDF history insertion when experiment state currentTdfId is the root', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-regular',
      ownerId: 'owner-user',
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

    await (asyncMethods.insertHistory as any).call({ userId: 'current-user' }, {
      userId: 'current-user',
      TDFId: 'history-regular',
    });

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-regular',
    }) as any;
    expect(insertedHistory).to.exist;
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

    await (asyncMethods.insertHistory as any).call({ userId: 'current-user' }, {
      userId: 'current-user',
      TDFId: 'history-condition',
    });

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

    await (asyncMethods.insertHistory as any).call({ userId: 'current-user' }, {
      userId: 'current-user',
      TDFId: 'history-condition',
    });

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
  beforeEach(function() {
    AuditLogAny.remove({});
    AuthThrottleStateAny.remove({});
    CoursesAny.remove({});
    DynamicSettingsAny.remove({});
    GlobalExperimentStatesAny.remove({});
    HistoriesAny.remove({});
    MeteorUsersAny.remove({});
    PasswordResetTokensAny.remove({});
    SectionUserMapAny.remove({});
    TdfsAny.remove({});
    UserDashboardCacheAny.remove({});
    UserMetricsAny.remove({});
    UserTimesLogAny.remove({});
    UserUploadQuotaAny.remove({});
    (Meteor as any).roleAssignment?.remove({});
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
  beforeEach(function() {
    AuditLogAny.remove({});
    AuthThrottleStateAny.remove({});
    CoursesAny.remove({});
    DynamicSettingsAny.remove({});
    GlobalExperimentStatesAny.remove({});
    HistoriesAny.remove({});
    MeteorUsersAny.remove({});
    PasswordResetTokensAny.remove({});
    SectionUserMapAny.remove({});
    TdfsAny.remove({});
    UserDashboardCacheAny.remove({});
    UserMetricsAny.remove({});
    UserTimesLogAny.remove({});
    UserUploadQuotaAny.remove({});
    (Meteor as any).roleAssignment?.remove({});
  });

  it('requires login for owner display lookup', async function() {
    try {
      await (asyncMethods.getTdfOwnersMap as any).call({}, ['owner-user']);
      expect.fail('Expected anonymous owner lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(401);
    }
  });

  it('denies cross-owner TDF listing', async function() {
    try {
      await (asyncMethods.getTdfsByOwnerId as any).call({ userId: 'student-user' }, 'owner-user');
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
});

describe('MTurk workflow authorization', function() {
  beforeEach(function() {
    AuditLogAny.remove({});
    AuthThrottleStateAny.remove({});
    CoursesAny.remove({});
    DynamicSettingsAny.remove({});
    GlobalExperimentStatesAny.remove({});
    HistoriesAny.remove({});
    MeteorUsersAny.remove({});
    PasswordResetTokensAny.remove({});
    SectionUserMapAny.remove({});
    TdfsAny.remove({});
    UserDashboardCacheAny.remove({});
    UserMetricsAny.remove({});
    UserTimesLogAny.remove({});
    UserUploadQuotaAny.remove({});
    (Meteor as any).roleAssignment?.remove({});
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
