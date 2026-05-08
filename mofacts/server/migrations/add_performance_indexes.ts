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
      { TDFId: 1, levelUnitType: 1, recordedServerTime: -1 },
      { name: 'perf_TDFId_type_time', background: true }
    );
    serverConsole('  Created: Histories.TDFId_type_time');

    await Histories.rawCollection().createIndex(
      { userId: 1, recordedServerTime: -1 },
      { name: 'perf_userId_time', background: true }
    );
    serverConsole('  Created: Histories.userId_time');

    serverConsole('Creating indexes for Course/Assignment collections...');
    await Assignments.rawCollection().createIndex(
      { courseId: 1, TDFId: 1 },
      { name: 'perf_course_tdf', background: true }
    );
    serverConsole('  Created: Assignments.course_tdf');

    await SectionUserMap.rawCollection().createIndex(
      { sectionId: 1, userId: 1 },
      { name: 'perf_section_user', background: true }
    );
    serverConsole('  Created: SectionUserMap.section_user');

    await Sections.rawCollection().createIndex(
      { courseId: 1 },
      { name: 'perf_courseId', background: true }
    );
    serverConsole('  Created: Sections.courseId');

    await Courses.rawCollection().createIndex(
      { teacherUserId: 1, semester: 1 },
      { name: 'perf_teacher_semester', background: true }
    );
    serverConsole('  Created: Courses.teacher_semester');

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
      { packageAssetId: 1 },
      { name: 'perf_packageAssetId', background: true }
    );
    serverConsole('  Created: Tdfs.packageAssetId');

    await Tdfs.rawCollection().createIndex(
      { 'content.tdfs.tutor.setspec.lessonname': 1 },
      { name: 'perf_lessonname', background: true }
    );
    serverConsole('  Created: Tdfs.lessonname');

    await Tdfs.rawCollection().createIndex(
      { accessors: 1 },
      { name: 'perf_accessors', background: true }
    );
    serverConsole('  Created: Tdfs.accessors');

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

    serverConsole('========================================');
    serverConsole('All 19 performance indexes created successfully');
    serverConsole('========================================');

    return { success: true, indexesCreated: 19 };
  } catch (error) {
    serverConsole('========================================');
    serverConsole('Error creating performance indexes:', error);
    serverConsole('========================================');
    throw error;
  }
}
