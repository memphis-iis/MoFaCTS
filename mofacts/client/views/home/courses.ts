import './courses.html';
import './courses.css';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { meteorCallAsync, clientConsole } from '../..';
import { selectTdf } from '../../lib/lessonLaunchRunner';
import { setCourseAssignmentLaunchContext } from '../../lib/courseAssignmentLaunchContext';
import { resolveSpeechIgnoreOutOfGrammarResponses } from '../../lib/speechRecognitionConfig';
import type {
  LearnerCourseSnapshotAssignment,
  LearnerCourseSnapshotCourse,
  LearnerCoursesSnapshot,
} from '../../../common/courseAssignments.contracts';

type CoursesTemplateInstance = Blaze.TemplateInstance & {
  snapshot: ReactiveVar<LearnerCoursesSnapshot | null>;
  loading: ReactiveVar<boolean>;
  error: ReactiveVar<string | null>;
  search: ReactiveVar<string>;
  sort: ReactiveVar<string>;
};

type CourseAssignmentDisplayRow = LearnerCourseSnapshotAssignment & {
  courseName: string;
  teacherDisplayName: string;
  visibility: LearnerCourseSnapshotCourse['visibility'];
  beginDate: LearnerCourseSnapshotCourse['beginDate'];
  endDate: LearnerCourseSnapshotCourse['endDate'];
  timezone: string;
  membership: LearnerCourseSnapshotCourse['membership'];
};

function formatDate(value: unknown, timezone?: string | null) {
  if (!value) return '';
  const date = new Date(value as string | number | Date);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

function flattenAssignmentRows(snapshot: LearnerCoursesSnapshot | null, section: 'assignedCourses' | 'publicCourses', instance: CoursesTemplateInstance) {
  const query = instance.search.get().toLowerCase();
  const sort = instance.sort.get();
  const rows = (snapshot?.[section] || []).flatMap((course) => (
    course.assignments.filter((assignment) => {
      const haystack = `${course.courseName} ${course.teacherDisplayName} ${assignment.title} ${assignment.fileName} ${(assignment.tags || []).join(' ')}`.toLowerCase();
      return !query || haystack.includes(query);
    }).map((assignment): CourseAssignmentDisplayRow => ({
      ...assignment,
      courseName: course.courseName,
      teacherDisplayName: course.teacherDisplayName,
      visibility: course.visibility,
      beginDate: course.beginDate,
      endDate: course.endDate,
      timezone: course.timezone,
      membership: course.membership,
    }))
  ));
  return rows.sort((a, b) => {
    if (sort === 'due') {
      return (new Date(a.dueAt || 8640000000000000).getTime()) - (new Date(b.dueAt || 8640000000000000).getTime());
    }
    if (sort === 'recent') {
      return Number(b.progress?.lastPracticedTimestamp || 0) - Number(a.progress?.lastPracticedTimestamp || 0);
    }
    return a.courseName.localeCompare(b.courseName) || a.order - b.order || a.title.localeCompare(b.title);
  });
}

function currentCourseFromAssignment(instance: CoursesTemplateInstance, assignment: LearnerCourseSnapshotAssignment): LearnerCourseSnapshotCourse | null {
  const snapshot = instance.snapshot.get();
  return [...(snapshot?.assignedCourses || []), ...(snapshot?.publicCourses || [])]
    .find((course) => course.courseId === assignment.courseId) || null;
}

Template.courses.onCreated(function(this: CoursesTemplateInstance) {
  this.snapshot = new ReactiveVar(null);
  this.loading = new ReactiveVar(true);
  this.error = new ReactiveVar(null);
  this.search = new ReactiveVar('');
  this.sort = new ReactiveVar('course');
});

Template.courses.onRendered(async function(this: CoursesTemplateInstance) {
  this.loading.set(true);
  this.error.set(null);
  try {
    const snapshot = await meteorCallAsync('getLearnerCoursesSnapshot') as LearnerCoursesSnapshot;
    this.snapshot.set(snapshot);
  } catch (error: any) {
    clientConsole(1, '[Courses] Failed to load learner course snapshot:', error);
    this.error.set(error?.reason || error?.message || String(error));
  } finally {
    this.loading.set(false);
  }
});

Template.courses.helpers({
  isLoading() {
    return (Template.instance() as CoursesTemplateInstance).loading.get();
  },
  errorMessage() {
    return (Template.instance() as CoursesTemplateInstance).error.get();
  },
  loadingRows() {
    return [1, 2, 3, 4];
  },
  assignedAssignments() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return flattenAssignmentRows(instance.snapshot.get(), 'assignedCourses', instance);
  },
  publicAssignments() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return flattenAssignmentRows(instance.snapshot.get(), 'publicCourses', instance);
  },
  hasAssignedAssignments() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return flattenAssignmentRows(instance.snapshot.get(), 'assignedCourses', instance).length > 0;
  },
  hasPublicAssignments() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return flattenAssignmentRows(instance.snapshot.get(), 'publicCourses', instance).length > 0;
  },
});

const courseAssignmentDisplayHelpers = {
  membershipLabel(this: CourseAssignmentDisplayRow) {
    const membership = this.membership;
    return membership === 'assigned' ? 'Assigned' : membership === 'public' ? 'Public' : membership === 'teacher' ? 'Teacher' : 'Admin';
  },
  courseScheduleLabel(this: CourseAssignmentDisplayRow) {
    const row = this;
    const begin = formatDate(row.beginDate, row.timezone);
    const end = formatDate(row.endDate, row.timezone);
    if (begin && end) return `${begin} to ${end}`;
    if (begin) return `Starts ${begin}`;
    if (end) return `Ends ${end}`;
    return 'Always available';
  },
  timezoneLabel(this: CourseAssignmentDisplayRow) {
    return this.timezone;
  },
  isLocked(this: CourseAssignmentDisplayRow) {
    return this.availability !== 'available';
  },
  statusLabel(this: CourseAssignmentDisplayRow) {
    const row = this;
    if (row.availability === 'scheduled') return 'Locked';
    if (row.availability === 'unavailable') return 'Not enrolled';
    return row.required ? 'Required' : 'Optional';
  },
  statusClass(this: CourseAssignmentDisplayRow) {
    const row = this;
    if (row.availability === 'scheduled') return 'course-assignment-status--locked';
    if (row.availability === 'unavailable') return 'course-assignment-status--locked';
    return row.required ? 'course-assignment-status--required' : '';
  },
  releaseLabel(this: CourseAssignmentDisplayRow) {
    const row = this;
    return row.releaseAt ? `Visible ${formatDate(row.releaseAt, row.timezone)}` : 'Visible now';
  },
  dueLabel(this: CourseAssignmentDisplayRow) {
    const row = this;
    const dueAt = row.dueAt;
    if (!dueAt) return '-';
    const dueTime = new Date(dueAt).getTime();
    const now = Date.now();
    const formatted = formatDate(dueAt, row.timezone);
    if (dueTime < now) return `Overdue ${formatted}`;
    return formatted || '-';
  },
  trialsValue(this: CourseAssignmentDisplayRow) {
    return this.progress?.attempts || 0;
  },
  accuracyValue(this: CourseAssignmentDisplayRow) {
    const progress = this.progress;
    return progress?.accuracyApplies && progress.accuracy !== null ? `${progress.accuracy}%` : '-';
  },
  showAccuracyBar(this: CourseAssignmentDisplayRow) {
    const progress = this.progress;
    return Boolean(progress?.accuracyApplies && progress.accuracy !== null);
  },
  accuracyBarWidth(this: CourseAssignmentDisplayRow) {
    const progress = this.progress;
    if (!progress?.accuracyApplies || progress.accuracy === null) return '0%';
    return `${Math.max(0, Math.min(100, progress.accuracy))}%`;
  },
  itemsValue(this: CourseAssignmentDisplayRow) {
    const progress = this.progress;
    return progress?.itemsPracticedApplies && progress.itemsPracticed !== null ? progress.itemsPracticed : '-';
  },
  sessionDaysValue(this: CourseAssignmentDisplayRow) {
    return this.progress?.sessionDays || 0;
  },
  timeValue(this: CourseAssignmentDisplayRow) {
    return `${this.progress?.totalTimeMinutes || 0} min`;
  },
  lastPracticeValue(this: CourseAssignmentDisplayRow) {
    const row = this;
    const lastPracticed = row.progress?.lastPracticed;
    return lastPracticed ? formatDate(lastPracticed, row.timezone) : '-';
  },
  actionLabel(this: CourseAssignmentDisplayRow) {
    const row = this;
    if (row.availability === 'scheduled') return 'Locked';
    if (row.availability === 'unavailable') return 'Unavailable';
    return row.isUsed ? 'Continue' : 'Start';
  },
  actionButtonClass(this: CourseAssignmentDisplayRow) {
    return this.isUsed ? 'btn-primary' : 'btn-success';
  },
};

Template.courseAssignmentTableRow.helpers(courseAssignmentDisplayHelpers);
Template.courseAssignmentCard.helpers(courseAssignmentDisplayHelpers);

Template.courses.events({
  'input #coursesSearch': function(event: Event, instance: CoursesTemplateInstance) {
    instance.search.set(String((event.currentTarget as HTMLInputElement).value || ''));
  },
  'change #coursesSort': function(event: Event, instance: CoursesTemplateInstance) {
    instance.sort.set(String((event.currentTarget as HTMLSelectElement).value || 'course'));
  },
  'click .launch-course-assignment': async function(event: Event, instance: CoursesTemplateInstance) {
    const assignment = this as LearnerCourseSnapshotAssignment;
    if (assignment.availability !== 'available') return;
    const course = currentCourseFromAssignment(instance, assignment);
    if (!course) {
      instance.error.set('Course context was not found for this assignment.');
      return;
    }
    try {
      const launchContext = {
        assignmentId: assignment.assignmentId,
        courseId: assignment.courseId,
        TDFId: assignment.TDFId,
        launchSource: 'courses' as const,
      };
      const tdf: any = await meteorCallAsync('getTdfById', assignment.TDFId, {
        courseAssignment: launchContext,
      });
      const setspec = tdf?.content?.tdfs?.tutor?.setspec || {};
      setCourseAssignmentLaunchContext(launchContext);
      await selectTdf(
        assignment.TDFId,
        assignment.title,
        assignment.currentStimuliSetId,
        resolveSpeechIgnoreOutOfGrammarResponses(setspec),
        setspec.speechOutOfGrammarFeedback || 'Response not in answer set',
        'Course assignment launch',
        Boolean(tdf?.content?.isMultiTdf),
        setspec,
        false,
        false,
      );
    } catch (error: any) {
      setCourseAssignmentLaunchContext(null);
      instance.error.set(error?.reason || error?.message || String(error));
    }
  },
});
