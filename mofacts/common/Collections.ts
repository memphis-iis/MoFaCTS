import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Roles } from 'meteor/alanning:roles';
import { FilesCollection } from 'meteor/ostrio:files';
import { collectionMongoName } from './collectionOwnership';
import { validateDynamicAssetUpload, type DynamicAssetUploadMeta } from './fileUploadPolicy';

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
const CourseLearnerSnapshotCache = new Mongo.Collection(collectionMongoName('CourseLearnerSnapshotCache'));
const UserUploadQuota = new Mongo.Collection(collectionMongoName('UserUploadQuota'));
const ManualContentDrafts = new Mongo.Collection(collectionMongoName('ManualContentDrafts'));
const H5PContents = new Mongo.Collection(collectionMongoName('H5PContents'));
const BackupJobs = new Mongo.Collection(collectionMongoName('BackupJobs'));

const DynamicAssets = new FilesCollection({
  collectionName: collectionMongoName('DynamicAssets'),
  storagePath: process.env.HOME + '/dynamic-assets',
  allowClientCode: false, // Security: Disallow file operations from client (use server methods)
  onBeforeUpload(this: { userId?: string }, file: { name?: string; extension?: string; type?: string; meta?: DynamicAssetUploadMeta }) {
    if (!this.userId) {
      return 'Must be logged in to upload files';
    }
    return validateDynamicAssetUpload(file);
  },
  async onInitiateUpload(this: { userId?: string }, fileData: { size: number; meta?: DynamicAssetUploadMeta }) {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to upload files');
    }
    const userId = this.userId;
    const meta = fileData.meta || {};
    const isAdmin = await Roles.userIsInRoleAsync(userId, ['admin']);
    const isTeacherOrAdmin = isAdmin || await Roles.userIsInRoleAsync(userId, ['teacher']);

    if (meta.uploadPurpose === 'content-media') {
      const tdf = await Tdfs.findOneAsync(
        { _id: String(meta.tdfId || '') },
        { fields: { ownerId: 1, accessors: 1, stimuliSetId: 1 } }
      );
      const accessors = Array.isArray((tdf as any)?.accessors) ? (tdf as any).accessors : [];
      const hasSharedAccess = accessors.some((accessor: unknown) =>
        accessor === userId || (accessor && typeof accessor === 'object' && (accessor as { userId?: unknown }).userId === userId)
      );
      if (!tdf || (!isAdmin && (tdf as any).ownerId !== userId && !hasSharedAccess)) {
        throw new Meteor.Error('not-authorized', 'You cannot upload media for this content');
      }
      if (String((tdf as any).stimuliSetId) !== String(meta.stimuliSetId)) {
        throw new Meteor.Error('invalid-upload-target', 'The media stimuli set does not match the selected content');
      }
    }

    if (meta.uploadPurpose === 'ai-draft-media') {
      const draft = await ManualContentDrafts.findOneAsync({
        _id: String(meta.draftId || ''),
        ownerId: userId,
        draftType: 'ai-content-creator',
      });
      const items = Array.isArray((draft as any)?.output?.items) ? (draft as any).output.items : [];
      const item = items.find((candidate: any) => String(candidate?.id || '') === String(meta.itemId || ''));
      if (!draft || !item || String(item?.prompt?.mediaSlot?.id || '') !== String(meta.mediaSlotId || '')) {
        throw new Meteor.Error('not-authorized', 'The AI draft media slot is not owned by this user');
      }
    }

    if (isTeacherOrAdmin) {
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
  CourseLearnerSnapshotCache,
  UserUploadQuota,
  ManualContentDrafts,
  H5PContents,
  BackupJobs,
  DynamicAssets,
});

export { Tdfs, GlobalExperimentStates, Histories, DynamicSettings, UserDashboardCache, CourseLearnerSnapshotCache, H5PContents, StimulusCrowdStats, BackupJobs };

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
