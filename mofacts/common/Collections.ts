import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Roles } from 'meteor/alanning:roles';
import { FilesCollection } from 'meteor/ostrio:files';

/* Collections - our data collections stored in MongoDB
 */

const Tdfs = new Mongo.Collection('tdfs');
const Assignments = new Mongo.Collection('assessments');
const Courses = new Mongo.Collection('course');
const GlobalExperimentStates = new Mongo.Collection('global_experiment_state');
const Histories = new Mongo.Collection('history');
const Items = new Mongo.Collection('stimuli');
const Stims = new Mongo.Collection('stim_files');
const itemSourceSentences = new Mongo.Collection('item_source_sentences');
const Sections = new Mongo.Collection('section');
const SectionUserMap = new Mongo.Collection('section_user_map');
const UserTimesLog = new Mongo.Collection('userTimesLog');
const UserMetrics = new Mongo.Collection('userMetrics');
const DynamicSettings = new Mongo.Collection('dynaminc_settings');
const ScheduledTurkMessages = new Mongo.Collection('scheduledTurkMessages');
const ClozeEditHistory = new Mongo.Collection('clozeEditHistory');
const ErrorReports = new Mongo.Collection('errorReports');
const DynamicConfig = new Mongo.Collection('dynamicConfig');
const PasswordResetTokens = new Mongo.Collection('passwordResetTokens');
const AuditLog = new Mongo.Collection('auditLog');
const AuthThrottleState = new Mongo.Collection('auth_throttle_state');
const UserDashboardCache = new Mongo.Collection('user_dashboard_cache');
const UserUploadQuota = new Mongo.Collection('user_upload_quota');
const ManualContentDrafts = new Mongo.Collection('manual_content_drafts');
const H5PContents = new Mongo.Collection('h5p_contents');

// Init DynamicAssets Collection
const DynamicAssets = new FilesCollection({
  collectionName: 'Assets',
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

// Backward-compat: many modules still reference these as globals.
Object.assign(globalThis, {
  Tdfs,
  Assignments,
  Courses,
  GlobalExperimentStates,
  Histories,
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

export { Tdfs, GlobalExperimentStates, UserDashboardCache, H5PContents };

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
