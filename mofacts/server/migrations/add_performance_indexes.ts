/**
 * MoFaCTS Performance Optimization - Database Indexes
 *
 * Adds performance indexes for frequently queried collections.
 *
 * Date: 2025-01-06
 */

import { Meteor } from 'meteor/meteor';

const serverConsole = (...args: any[]) => {
  const disp = [(new Date()).toString()];
  for (let i = 0; i < args.length; ++i) {
    disp.push(args[i]);
  }
  console.log.apply(this, disp);
};

type IndexInfo = {
  name?: string;
  key?: Record<string, unknown>;
};

function isNamespaceMissing(error: unknown) {
  const maybeError = error as { code?: unknown; codeName?: unknown; message?: unknown };
  return maybeError?.code === 26
    || maybeError?.codeName === 'NamespaceNotFound'
    || String(maybeError?.message || '').includes('ns does not exist');
}

function sameIndexKey(left: unknown, right: Record<string, unknown>) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function ensureSectionsCourseIndex() {
  const collection = Sections.rawCollection();
  const indexKey = { courseId: 1 };
  let indexes: IndexInfo[];
  try {
    indexes = await collection.indexes() as IndexInfo[];
  } catch (error: unknown) {
    if (isNamespaceMissing(error)) {
      await collection.createIndex(
        indexKey,
        { name: 'section_courseId', background: true }
      );
      serverConsole('  Created: Sections.section_courseId');
      return;
    }
    throw error;
  }
  const canonicalIndex = indexes.find((index) => index.name === 'section_courseId');
  if (canonicalIndex) {
    if (!sameIndexKey(canonicalIndex.key, indexKey)) {
      throw new Error(`Existing section_courseId index has unexpected key: ${JSON.stringify(canonicalIndex.key)}`);
    }
    serverConsole('  Existing: Sections.section_courseId');
    return;
  }

  const legacyIndex = indexes.find((index) => index.name === 'perf_courseId');
  if (legacyIndex) {
    if (!sameIndexKey(legacyIndex.key, indexKey)) {
      throw new Error(`Existing perf_courseId index has unexpected key: ${JSON.stringify(legacyIndex.key)}`);
    }
    await collection.dropIndex('perf_courseId');
    serverConsole('  Dropped legacy: Sections.perf_courseId');
  }

  await collection.createIndex(
    indexKey,
    { name: 'section_courseId', background: true }
  );
  serverConsole('  Created: Sections.section_courseId');
}

/**
 * Create all performance indexes.
 */
export async function createPerformanceIndexes() {
  serverConsole('========================================');
  serverConsole('Starting Performance Index Creation');
  serverConsole('========================================');

  try {
    serverConsole('Creating indexes for Histories collection...');
    await Histories.rawCollection().createIndex(
      { userId: 1, TDFId: 1, levelUnitType: 1, recordedServerTime: -1 },
      { name: 'perf_userId_TDFId_type_time', background: true }
    );
    serverConsole('  Created: Histories.userId_TDFId_type_time');

    await Histories.rawCollection().createIndex(
      { userId: 1, levelUnitType: 1, TDFId: 1, recordedServerTime: 1 },
      { name: 'dash_user_type_tdf_recorded_time', background: true }
    );
    serverConsole('  Created: Histories.dashboard_user_type_tdf_recorded_time');

    await Histories.rawCollection().createIndex(
      { TDFId: 1, levelUnitType: 1, recordedServerTime: -1 },
      { name: 'perf_TDFId_type_time', background: true }
    );
    serverConsole('  Created: Histories.TDFId_type_time');

    await Histories.rawCollection().createIndex(
      { userId: 1, recordedServerTime: -1 },
      { name: 'perf_userId_time', background: true }
    );
    serverConsole('  Created: Histories.userId_time');

    await Histories.rawCollection().createIndex(
      { userId: 1, levelUnitType: 1, 'courseAssignment.courseId': 1, clusterKC: 1, time: 1 },
      { name: 'history_course_shared_model_cluster_time', background: true }
    );
    serverConsole('  Created: Histories.history_course_shared_model_cluster_time');

    await Histories.rawCollection().createIndex(
      { userId: 1, levelUnitType: 1, 'courseAssignment.courseId': 1, time: 1 },
      { name: 'history_course_model_time', background: true }
    );
    serverConsole('  Created: Histories.history_course_model_time');

    serverConsole('Creating indexes for Course/Assignment collections...');
    const duplicateAssignments = await Assignments.rawCollection().aggregate([
      {
        $match: {
          courseId: { $exists: true, $ne: null },
          TDFId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: { courseId: '$courseId', TDFId: '$TDFId' },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 },
    ]).toArray();
    if (duplicateAssignments.length > 0) {
      throw new Error(`Cannot create assignment_course_tdf_unique; duplicate course/TDF assignments found: ${JSON.stringify(duplicateAssignments)}`);
    }

    await Assignments.rawCollection().createIndex(
      { courseId: 1, TDFId: 1 },
      { name: 'perf_course_tdf', background: true }
    );
    serverConsole('  Created: Assignments.course_tdf');

    await Assignments.rawCollection().createIndex(
      { courseId: 1, order: 1 },
      { name: 'assignment_course_order', background: true }
    );
    serverConsole('  Created: Assignments.assignment_course_order');

    await Assignments.rawCollection().createIndex(
      { courseId: 1, TDFId: 1 },
      { name: 'assignment_course_tdf_unique', unique: true, background: true }
    );
    serverConsole('  Created: Assignments.assignment_course_tdf_unique');

    await Assignments.rawCollection().createIndex(
      { courseId: 1, releaseAt: 1 },
      { name: 'assignment_course_release', background: true }
    );
    serverConsole('  Created: Assignments.assignment_course_release');

    await Assignments.rawCollection().createIndex(
      { _id: 1, courseId: 1, TDFId: 1 },
      { name: 'assignment_identity_course_tdf', background: true }
    );
    serverConsole('  Created: Assignments.assignment_identity_course_tdf');

    await SectionUserMap.rawCollection().createIndex(
      { sectionId: 1, userId: 1 },
      { name: 'perf_section_user', background: true }
    );
    serverConsole('  Created: SectionUserMap.section_user');

    await SectionUserMap.rawCollection().createIndex(
      { userId: 1, sectionId: 1 },
      { name: 'section_user_lookup', background: true }
    );
    serverConsole('  Created: SectionUserMap.section_user_lookup');

    await ensureSectionsCourseIndex();

    await Courses.rawCollection().createIndex(
      { teacherUserId: 1, semester: 1 },
      { name: 'perf_teacher_semester', background: true }
    );
    serverConsole('  Created: Courses.teacher_semester');

    await Courses.rawCollection().createIndex(
      { visibility: 1, beginDate: 1, endDate: 1, teacherUserId: 1 },
      { name: 'course_visibility_dates_teacher', background: true }
    );
    serverConsole('  Created: Courses.course_visibility_dates_teacher');

    // GlobalExperimentStates {userId:1, TDFId:1} is now a unique index
    // created by clean_experiment_state_dupes.ts (unique_user_tdf).

    serverConsole('Creating indexes for TDFs collection...');
    await Tdfs.rawCollection().createIndex(
      { 'content.fileName': 1 },
      { name: 'perf_fileName', background: true }
    );
    serverConsole('  Created: Tdfs.fileName');

    await Tdfs.rawCollection().createIndex(
      { 'content.tdfs.tutor.setspec.experimentTarget': 1 },
      { name: 'perf_experimentTarget', background: true }
    );
    serverConsole('  Created: Tdfs.experimentTarget');

    await Tdfs.rawCollection().createIndex(
      { 'content.tdfs.tutor.setspec.userselect': 1 },
      { name: 'perf_userselect', background: true }
    );
    serverConsole('  Created: Tdfs.userselect');

    await Tdfs.rawCollection().createIndex(
      { stimuliSetId: 1 },
      { name: 'perf_stimuliSetId', background: true }
    );
    serverConsole('  Created: Tdfs.stimuliSetId');

    await Tdfs.rawCollection().createIndex(
      { ownerId: 1 },
      { name: 'perf_ownerId', background: true }
    );
    serverConsole('  Created: Tdfs.ownerId');

    await Tdfs.rawCollection().createIndex(
      { ownerId: 1, 'content.tdfs.tutor.setspec.lessonname': 1, _id: 1 },
      { name: 'perf_owner_lessonname_id', background: true }
    );
    serverConsole('  Created: Tdfs.owner_lessonname_id');

    await Tdfs.rawCollection().createIndex(
      { packageAssetId: 1 },
      { name: 'perf_packageAssetId', background: true }
    );
    serverConsole('  Created: Tdfs.packageAssetId');

    await Tdfs.rawCollection().createIndex(
      { packageFile: 1 },
      { name: 'perf_packageFile', background: true }
    );
    serverConsole('  Created: Tdfs.packageFile');

    await Tdfs.rawCollection().createIndex(
      { 'content.tdfs.tutor.setspec.lessonname': 1 },
      { name: 'perf_lessonname', background: true }
    );
    serverConsole('  Created: Tdfs.lessonname');

    await Tdfs.rawCollection().createIndex(
      { 'accessors.userId': 1 },
      { name: 'perf_accessors_userId', background: true }
    );
    serverConsole('  Created: Tdfs.accessors.userId');

    await Tdfs.rawCollection().createIndex(
      { 'accessors.userId': 1, 'content.tdfs.tutor.setspec.lessonname': 1, _id: 1 },
      { name: 'perf_accessors_user_lessonname_id', background: true }
    );
    serverConsole('  Created: Tdfs.accessors_user_lessonname_id');

    await Tdfs.rawCollection().createIndex(
      { 'content.tdfs.tutor.setspec.condition': 1 },
      { name: 'dash_condition_ref', background: true }
    );
    serverConsole('  Created: Tdfs.dashboard_condition_ref');

    await Tdfs.rawCollection().createIndex(
      { 'content.tdfs.tutor.setspec.conditionTdfIds': 1 },
      { name: 'dash_condition_tdf_ids', background: true }
    );
    serverConsole('  Created: Tdfs.dashboard_condition_tdf_ids');

    serverConsole('Creating indexes for Stims collection...');
    await Stims.rawCollection().createIndex(
      { 'meta.fileName': 1 },
      { name: 'perf_meta_fileName', background: true }
    );
    serverConsole('  Created: Stims.meta.fileName');

    serverConsole('Creating indexes for DynamicAssets collection...');
    await DynamicAssets.collection.rawCollection().createIndex(
      { userId: 1, name: 1 },
      { name: 'perf_userId_name', background: true }
    );
    serverConsole('  Created: DynamicAssets.userId_name');

    await DynamicAssets.collection.rawCollection().createIndex(
      { userId: 1, fileName: 1 },
      { name: 'perf_userId_fileName', background: true }
    );
    serverConsole('  Created: DynamicAssets.userId_fileName');

    await DynamicAssets.collection.rawCollection().createIndex(
      { 'meta.stimuliSetId': 1, name: 1 },
      { name: 'perf_stimuliSetId_name', background: true }
    );
    serverConsole('  Created: DynamicAssets.stimuliSetId_name');

    await DynamicAssets.collection.rawCollection().createIndex(
      { 'meta.stimuliSetId': 1, fileName: 1 },
      { name: 'perf_stimuliSetId_fileName', background: true }
    );
    serverConsole('  Created: DynamicAssets.stimuliSetId_fileName');

    await DynamicAssets.collection.rawCollection().createIndex(
      { 'meta.stimuliSetId': 1, _id: 1 },
      { name: 'perf_stimuliSetId_id', background: true }
    );
    serverConsole('  Created: DynamicAssets.stimuliSetId_id');

    await DynamicAssets.collection.rawCollection().createIndex(
      { 'meta.public': 1, uploadedAt: -1 },
      { name: 'perf_public_uploadedAt', background: true }
    );
    serverConsole('  Created: DynamicAssets.public_uploadedAt');

    serverConsole('Creating indexes for Users collection...');
    await Meteor.users.rawCollection().createIndex(
      { username: 1 },
      { name: 'perf_username', background: true }
    );
    serverConsole('  Created: Users.username');

    serverConsole('Creating indexes for UserDashboardCache collection...');
    await UserDashboardCache.rawCollection().createIndex(
      { userId: 1 },
      { name: 'perf_userId', background: true, unique: true }
    );
    serverConsole('  Created: UserDashboardCache.userId');

    await UserDashboardCache.rawCollection().createIndex(
      { lastUpdated: 1 },
      { name: 'perf_lastUpdated', background: true }
    );
    serverConsole('  Created: UserDashboardCache.lastUpdated');

    await UserDashboardCache.rawCollection().createIndex(
      { 'usageSummary.totalTrials': -1 },
      { name: 'perf_usageSummary_totalTrials', background: true }
    );
    serverConsole('  Created: UserDashboardCache.usageSummary.totalTrials');

    await UserDashboardCache.rawCollection().createIndex(
      { 'usageSummary.weightedAccuracy': -1 },
      { name: 'perf_usageSummary_weightedAccuracy', background: true }
    );
    serverConsole('  Created: UserDashboardCache.usageSummary.weightedAccuracy');

    await UserDashboardCache.rawCollection().createIndex(
      { 'usageSummary.totalTimeMinutes': -1 },
      { name: 'perf_usageSummary_totalTimeMinutes', background: true }
    );
    serverConsole('  Created: UserDashboardCache.usageSummary.totalTimeMinutes');

    await UserDashboardCache.rawCollection().createIndex(
      { 'usageSummary.lastActivityDate': -1 },
      { name: 'perf_usageSummary_lastActivityDate', background: true }
    );
    serverConsole('  Created: UserDashboardCache.usageSummary.lastActivityDate');

    serverConsole('Creating indexes for CourseLearnerSnapshotCache collection...');
    await CourseLearnerSnapshotCache.rawCollection().createIndex(
      { userId: 1, version: 1 },
      { name: 'course_snapshot_user_version', unique: true, background: true }
    );
    await CourseLearnerSnapshotCache.rawCollection().createIndex(
      { userId: 1, version: 1, invalidatedAt: 1 },
      { name: 'course_snapshot_user_version_invalidated', background: true }
    );
    await CourseLearnerSnapshotCache.rawCollection().createIndex(
      { assignedCourseIds: 1, version: 1 },
      { name: 'course_snapshot_assigned_course_version', background: true }
    );
    await CourseLearnerSnapshotCache.rawCollection().createIndex(
      { publicCourseIds: 1, version: 1 },
      { name: 'course_snapshot_public_course_version', background: true }
    );
    await CourseLearnerSnapshotCache.rawCollection().createIndex(
      { assignmentIds: 1, version: 1 },
      { name: 'course_snapshot_assignment_version', background: true }
    );
    serverConsole('  Created: CourseLearnerSnapshotCache course browse indexes');

    await Histories.rawCollection().createIndex(
      { userId: 1, 'courseAssignment.assignmentId': 1, recordedServerTime: -1 },
      { name: 'history_user_assignment_time', background: true }
    );
    serverConsole('  Created: Histories.history_user_assignment_time');

    serverConsole('========================================');
    serverConsole('Performance indexes are ready');
    serverConsole('========================================');

    return { success: true };
  } catch (error) {
    serverConsole('========================================');
    serverConsole('Error creating performance indexes:', error);
    serverConsole('========================================');
    throw error;
  }
}
