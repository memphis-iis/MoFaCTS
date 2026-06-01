import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Roles } from 'meteor/alanning:roles';
import { FilesCollection } from 'meteor/ostrio:files';
import { collectionMongoName } from './collectionOwnership';

/*
 * Collection declarations are the persistence boundary for MoFaCTS.
 *
 * Add new collections only when there is a clear owner and persistence contract
 * in common/collectionOwnership.ts. This file still also hosts the DynamicAssets
 * upload policy and legacy global bridge; keep those concerns labeled until they
 * are split into dedicated modules.
 */

const Tdfs = new Mongo.Collection(collectionMongoName('Tdfs'));
const Assignments = new Mongo.Collection(collectionMongoName('Assignments'));
const Courses = new Mongo.Collection(collectionMongoName('Courses'));
const GlobalExperimentStates = new Mongo.Collection(collectionMongoName('GlobalExperimentStates'));
const Histories = new Mongo.Collection(collectionMongoName('Histories'));
const StimulusCrowdStats = new Mongo.Collection(collectionMongoName('StimulusCrowdStats'));
const Items = new Mongo.Collection(collectionMongoName('Items'));
const Stims = new Mongo.Collection(collectionMongoName('Stims'));
const itemSourceSentences = new Mongo.Collection(collectionMongoName('itemSourceSentences'));
const Sections = new Mongo.Collection(collectionMongoName('Sections'));
const SectionUserMap = new Mongo.Collection(collectionMongoName('SectionUserMap'));
const UserTimesLog = new Mongo.Collection(collectionMongoName('UserTimesLog'));
const UserMetrics = new Mongo.Collection(collectionMongoName('UserMetrics'));
const DynamicSettings = new Mongo.Collection(collectionMongoName('DynamicSettings'));
const ScheduledTurkMessages = new Mongo.Collection(collectionMongoName('ScheduledTurkMessages'));
const ClozeEditHistory = new Mongo.Collection(collectionMongoName('ClozeEditHistory'));
const ErrorReports = new Mongo.Collection(collectionMongoName('ErrorReports'));
const DynamicConfig = new Mongo.Collection(collectionMongoName('DynamicConfig'));
const PasswordResetTokens = new Mongo.Collection(collectionMongoName('PasswordResetTokens'));
const AuditLog = new Mongo.Collection(collectionMongoName('AuditLog'));
const AuthThrottleState = new Mongo.Collection(collectionMongoName('AuthThrottleState'));
const UserDashboardCache = new Mongo.Collection(collectionMongoName('UserDashboardCache'));
const UserUploadQuota = new Mongo.Collection(collectionMongoName('UserUploadQuota'));
const ManualContentDrafts = new Mongo.Collection(collectionMongoName('ManualContentDrafts'));
const H5PContents = new Mongo.Collection(collectionMongoName('H5PContents'));

// DynamicAssets upload policy. Later split target: common/fileUploadPolicy.ts.
const DynamicAssets = new FilesCollection({
  collectionName: collectionMongoName('DynamicAssets'),
  storagePath: process.env.HOME + '/dynamic-assets',
  allowClientCode: false, // Security: Disallow file operations from client (use server methods)
  onBeforeUpload(this: { userId?: string }, file: { name?: string; extension?: string }) {
    // Security: Validate file uploads to prevent malicious content
    // Note: This callback is synchronous - async checks moved to onInitiateUpload

    // 1. Basic authentication check
    if (!this.userId) {
      return 'Must be logged in to upload files';
    }

    // 2. File size limit enforced in onInitiateUpload (role-based)
    // Admins have no limit, regular users have 10MB limit

    // 3. Filename validation - prevent path traversal
    const filename = file.name || '';
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return 'Invalid filename - path traversal not allowed';
    }

    // 4. Extension validation - only zip and apkg files
    if (!file.extension || !/^(zip|apkg)$/i.test(file.extension)) {
      return 'Only .zip and .apkg files are allowed';
    }

    return true;
  },
  async onInitiateUpload(this: { userId?: string }, fileData: { size: number }) {
    // Security: Authorization check using async Roles API (Meteor 3.x compatible)
    // This callback executes on server right after onBeforeUpload returns true

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to upload files');
    }

    // Check if user is teacher/admin - they get higher limits and no quota
    const isTeacherOrAdmin = await Roles.userIsInRoleAsync(this.userId, ['admin', 'teacher']);

    if (isTeacherOrAdmin) {
      // Admins/teachers: no file size limit, no daily quota
      return true;
    }

    // Regular users: 10MB limit
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (fileData.size > maxSizeBytes) {
      throw new Meteor.Error('file-too-large', 'File size must be 10MB or less');
    }

    // Regular users: check daily quota (3 uploads per day)
    const DAILY_LIMIT = 3;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const quota = await (UserUploadQuota as any).findOneAsync({
      userId: this.userId,
      date: today
    });

    const currentCount = quota?.uploadCount || 0;
    if (currentCount >= DAILY_LIMIT) {
      throw new Meteor.Error('quota-exceeded',
        `Daily upload limit reached (${DAILY_LIMIT}/day). Try again tomorrow.`);
    }

    return true;
  }
});

// Legacy global bridge. Later split target: common/collectionGlobals.ts.
// Do not add to this bridge without adding an ownership entry above.
Object.assign(globalThis, {
  Tdfs,
  Assignments,
  Courses,
  GlobalExperimentStates,
  Histories,
  StimulusCrowdStats,
  Items,
  Stims,
  itemSourceSentences,
  Sections,
  SectionUserMap,
  UserTimesLog,
  UserMetrics,
  DynamicSettings,
  ScheduledTurkMessages,
  ClozeEditHistory,
  ErrorReports,
  DynamicConfig,
  PasswordResetTokens,
  AuditLog,
  AuthThrottleState,
  UserDashboardCache,
  UserUploadQuota,
  ManualContentDrafts,
  H5PContents,
  DynamicAssets,
});

export { Tdfs, GlobalExperimentStates, DynamicSettings, UserDashboardCache, H5PContents, StimulusCrowdStats };

GlobalExperimentStates.allow({
  update: function(userId: string, doc: unknown, _fieldNames: string[], _modifier: any) {
    return userId === (doc as { userId?: string }).userId;
  },
  insert: function(userId: string, doc: unknown) {
    return userId === (doc as { userId?: string }).userId;
  }
});

DynamicSettings.allow({
  update: function(userId: string) {
    // allow/deny rules must be synchronous; use Meteor.roleAssignment which is
    // set unconditionally by alanning:roles v4 at package load time.
    const col = (Meteor as any).roleAssignment;
    if (!col) return false;
    const assignment = col.findOne({
      'user._id': userId,
      'role._id': 'admin'
    });
    return !!assignment;
  }
});
