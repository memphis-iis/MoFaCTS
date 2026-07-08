import type { PracticeDashboardProgressStats } from '../server/methods/dashboardCacheMethods.contracts';

export type CourseVisibility = 'private' | 'public';
export type CourseAssignmentAvailability = 'available' | 'scheduled' | 'unavailable';

export interface CourseAssignmentInput {
  assignmentId?: string;
  TDFId: string;
  order: number;
  releaseAt?: string | Date | null;
  dueAt?: string | Date | null;
  required: boolean;
}

export interface SaveCourseAssignmentsInput {
  courseId: string;
  assignments: CourseAssignmentInput[];
}

export interface CourseAssignmentSummary {
  assignmentId: string;
  courseId: string;
  TDFId: string;
  title: string;
  order: number;
  releaseAt: Date | null;
  dueAt: Date | null;
  required: boolean;
  availability: CourseAssignmentAvailability;
  createdAt: Date | null;
  updatedAt: Date | null;
  contentLanguage?: string;
  recommendedUiLocales?: string[];
  translationStatus?: string;
}

export interface LearnerCourseSnapshotAssignment extends CourseAssignmentSummary {
  fileName: string;
  tags: string[];
  currentStimuliSetId: string | number | null;
  progress: PracticeDashboardProgressStats;
  isUsed: boolean;
  hasBeenAttempted: boolean;
}

export interface LearnerCourseSnapshotCourse {
  courseId: string;
  courseName: string;
  visibility: CourseVisibility;
  beginDate: Date | null;
  endDate: Date | null;
  timezone: string;
  teacherUserId: string;
  teacherDisplayName: string;
  membership: 'assigned' | 'public' | 'teacher' | 'admin';
  joinableSections: Array<{
    sectionId: string;
    sectionName: string;
  }>;
  assignments: LearnerCourseSnapshotAssignment[];
}

export interface LearnerCoursesSnapshot {
  version: 2;
  userId: string;
  generatedAt: number;
  assignedCourses: LearnerCourseSnapshotCourse[];
  publicCourses: LearnerCourseSnapshotCourse[];
  invalidatedAt: Date | null;
  source: 'cache' | 'rebuilt';
}

export interface CourseAssignmentEditorSnapshot {
  course: {
    courseId: string;
    courseName: string;
    visibility: CourseVisibility;
    teacherUserId: string;
    timezone: string;
  };
  assignments: CourseAssignmentSummary[];
  assignableTdfs: Array<{
    TDFId: string;
    fileName: string;
    displayName: string;
    tags: string[];
    contentLanguage?: string;
    recommendedUiLocales?: string[];
    translationStatus?: string;
    ownerId: string;
  }>;
}

export interface CourseAssignmentHistoryContext {
  assignmentId: string;
  courseId: string;
  TDFId: string;
  launchSource: 'courses';
}
