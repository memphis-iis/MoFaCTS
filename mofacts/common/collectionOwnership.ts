type CollectionOwnership = {
  readonly mongoName: string;
  readonly globalName: string;
  readonly owner: string;
  readonly purpose: string;
  readonly notes?: string;
};

export const COLLECTION_OWNERSHIP = {
  Tdfs: {
    mongoName: 'tdfs',
    globalName: 'Tdfs',
    owner: 'content',
    purpose: 'Canonical TDF/package metadata and imported training content.',
  },
  Assignments: {
    mongoName: 'assessments',
    globalName: 'Assignments',
    owner: 'course-assignment',
    purpose: 'Assignment records that connect learners, courses, and TDFs.',
  },
  Courses: {
    mongoName: 'course',
    globalName: 'Courses',
    owner: 'course',
    purpose: 'Course metadata and membership-facing course records.',
  },
  GlobalExperimentStates: {
    mongoName: 'global_experiment_state',
    globalName: 'GlobalExperimentStates',
    owner: 'experiment-runtime',
    purpose: 'Durable per-learner experiment/session state, including assessment schedules.',
  },
  Histories: {
    mongoName: 'history',
    globalName: 'Histories',
    owner: 'experiment-runtime',
    purpose: 'Trial history and learner response records.',
  },
  StimulusCrowdStats: {
    mongoName: 'stimulus_crowd_stats',
    globalName: 'StimulusCrowdStats',
    owner: 'analytics',
    purpose: 'Derived stimulus-level correct/incorrect counts across accepted model-practice history.',
  },
  Items: {
    mongoName: 'stimuli',
    globalName: 'Items',
    owner: 'content',
    purpose: 'Legacy stimulus item records.',
  },
  Stims: {
    mongoName: 'stim_files',
    globalName: 'Stims',
    owner: 'content',
    purpose: 'Stimulus-set file records and parsed stimulus data.',
  },
  itemSourceSentences: {
    mongoName: 'item_source_sentences',
    globalName: 'itemSourceSentences',
    owner: 'content',
    purpose: 'Source-sentence metadata for generated/derived items.',
  },
  Sections: {
    mongoName: 'section',
    globalName: 'Sections',
    owner: 'course',
    purpose: 'Course section metadata.',
  },
  SectionUserMap: {
    mongoName: 'section_user_map',
    globalName: 'SectionUserMap',
    owner: 'course',
    purpose: 'Membership links between users and course sections.',
  },
  UserTimesLog: {
    mongoName: 'userTimesLog',
    globalName: 'UserTimesLog',
    owner: 'analytics',
    purpose: 'Learner time-on-task event records.',
  },
  UserMetrics: {
    mongoName: 'userMetrics',
    globalName: 'UserMetrics',
    owner: 'analytics',
    purpose: 'Aggregated or derived learner metric records.',
  },
  DynamicSettings: {
    mongoName: 'dynaminc_settings',
    globalName: 'DynamicSettings',
    owner: 'admin-settings',
    purpose: 'Admin-controlled runtime settings such as theme and client verbosity.',
    notes: 'The Mongo collection name is misspelled historically. Do not rename without a migration.',
  },
  ScheduledTurkMessages: {
    mongoName: 'scheduledTurkMessages',
    globalName: 'ScheduledTurkMessages',
    owner: 'mturk',
    purpose: 'Scheduled MTurk communication records.',
  },
  ClozeEditHistory: {
    mongoName: 'clozeEditHistory',
    globalName: 'ClozeEditHistory',
    owner: 'content',
    purpose: 'Audit trail for cloze-content edits.',
  },
  ErrorReports: {
    mongoName: 'errorReports',
    globalName: 'ErrorReports',
    owner: 'diagnostics',
    purpose: 'Runtime/client/server error reports.',
  },
  DynamicConfig: {
    mongoName: 'dynamicConfig',
    globalName: 'DynamicConfig',
    owner: 'admin-settings',
    purpose: 'Legacy dynamic configuration documents.',
  },
  PasswordResetTokens: {
    mongoName: 'passwordResetTokens',
    globalName: 'PasswordResetTokens',
    owner: 'auth',
    purpose: 'Password reset token records.',
  },
  AuditLog: {
    mongoName: 'auditLog',
    globalName: 'AuditLog',
    owner: 'audit',
    purpose: 'Security and administrative audit events.',
  },
  AuthThrottleState: {
    mongoName: 'auth_throttle_state',
    globalName: 'AuthThrottleState',
    owner: 'auth',
    purpose: 'Authentication rate-limit/throttle state.',
  },
  UserDashboardCache: {
    mongoName: 'user_dashboard_cache',
    globalName: 'UserDashboardCache',
    owner: 'analytics',
    purpose: 'Cached dashboard aggregates keyed by learner/content.',
  },
  CourseLearnerSnapshotCache: {
    mongoName: 'course_learner_snapshot_cache',
    globalName: 'CourseLearnerSnapshotCache',
    owner: 'course-assignment',
    purpose: 'Persisted learner-facing course browse snapshots keyed by user and cache version.',
  },
  UserUploadQuota: {
    mongoName: 'user_upload_quota',
    globalName: 'UserUploadQuota',
    owner: 'content-upload',
    purpose: 'Daily package-upload quota counters for non-admin users.',
  },
  ManualContentDrafts: {
    mongoName: 'manual_content_drafts',
    globalName: 'ManualContentDrafts',
    owner: 'content',
    purpose: 'Draft manual content-creator documents.',
  },
  H5PContents: {
    mongoName: 'h5p_contents',
    globalName: 'H5PContents',
    owner: 'h5p-content',
    purpose: 'Imported H5P content metadata and package references.',
  },
  BackupJobs: {
    mongoName: 'backup_jobs',
    globalName: 'BackupJobs',
    owner: 'open-core-backups',
    purpose: 'Admin-only backup, verification, restore, and deletion job registry.',
  },
  DynamicAssets: {
    mongoName: 'Assets',
    globalName: 'DynamicAssets',
    owner: 'content-upload',
    purpose: 'ostrio:files collection for uploaded packages and media assets.',
    notes: 'This is a FilesCollection, not a Mongo.Collection declaration.',
  },
} as const satisfies Record<string, CollectionOwnership>;

export type CollectionGlobalName = keyof typeof COLLECTION_OWNERSHIP;

export function collectionMongoName(name: CollectionGlobalName): string {
  return COLLECTION_OWNERSHIP[name].mongoName;
}
