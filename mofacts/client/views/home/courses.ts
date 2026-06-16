import './courses.html';
import './courses.css';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { meteorCallAsync, clientConsole } from '../..';
import { selectTdf } from '../../lib/lessonLaunchRunner';
import { setCourseAssignmentLaunchContext } from '../../lib/courseAssignmentLaunchContext';
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

function parentCourseContext(): LearnerCourseSnapshotCourse | null {
  return (Template.parentData(1) as LearnerCourseSnapshotCourse | undefined) || null;
}

function formatDateForCourse(value: unknown) {
  return formatDate(value, parentCourseContext()?.timezone);
}

function flattenCourses(snapshot: LearnerCoursesSnapshot | null, section: 'assignedCourses' | 'publicCourses', instance: CoursesTemplateInstance) {
  const query = instance.search.get().toLowerCase();
  const sort = instance.sort.get();
  const courses = (snapshot?.[section] || []).map((course) => ({
    ...course,
    assignments: course.assignments.filter((assignment) => {
      const haystack = `${course.courseName} ${course.teacherDisplayName} ${assignment.title} ${assignment.fileName} ${(assignment.tags || []).join(' ')}`.toLowerCase();
      return !query || haystack.includes(query);
    }),
  })).filter((course) => course.assignments.length > 0);
  for (const course of courses) {
    course.assignments.sort((a, b) => {
      if (sort === 'due') {
        return (new Date(a.dueAt || 8640000000000000).getTime()) - (new Date(b.dueAt || 8640000000000000).getTime());
      }
      if (sort === 'recent') {
        return Number(b.progress?.lastPracticedTimestamp || 0) - Number(a.progress?.lastPracticedTimestamp || 0);
      }
      return a.order - b.order || a.title.localeCompare(b.title);
    });
  }
  return courses;
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
  assignedCourses() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return flattenCourses(instance.snapshot.get(), 'assignedCourses', instance);
  },
  publicCourses() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return flattenCourses(instance.snapshot.get(), 'publicCourses', instance);
  },
  hasAssignedCourses() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return flattenCourses(instance.snapshot.get(), 'assignedCourses', instance).length > 0;
  },
  hasPublicCourses() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return flattenCourses(instance.snapshot.get(), 'publicCourses', instance).length > 0;
  },
});

Template.courseSnapshotCourse.helpers({
  assignmentCount() {
    return ((this as LearnerCourseSnapshotCourse).assignments || []).length;
  },
  membershipLabel() {
    const membership = (this as LearnerCourseSnapshotCourse).membership;
    return membership === 'assigned' ? 'Assigned' : membership === 'public' ? 'Public' : membership === 'teacher' ? 'Teacher' : 'Admin';
  },
  courseScheduleLabel() {
    const course = this as LearnerCourseSnapshotCourse;
    const begin = formatDate(course.beginDate, course.timezone);
    const end = formatDate(course.endDate, course.timezone);
    if (begin && end) return `${begin} to ${end}`;
    if (begin) return `Starts ${begin}`;
    if (end) return `Ends ${end}`;
    return 'Always available';
  },
  timezoneLabel() {
    return (this as LearnerCourseSnapshotCourse).timezone;
  },
  courseLastPracticeLabel() {
    const course = this as LearnerCourseSnapshotCourse;
    const latest = (course.assignments || [])
      .map((assignment) => Number(assignment.progress?.lastPracticedTimestamp || 0))
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
      .sort((a, b) => b - a)[0];
    return latest ? `Last practiced ${formatDate(latest, course.timezone)}` : 'No practice yet';
  },
  isLocked() {
    return (this as LearnerCourseSnapshotAssignment).availability === 'scheduled';
  },
  requiredLabel() {
    return (this as LearnerCourseSnapshotAssignment).required ? 'Required' : 'Optional';
  },
  releaseLabel() {
    const assignment = this as LearnerCourseSnapshotAssignment;
    return assignment.releaseAt ? `Visible ${formatDateForCourse(assignment.releaseAt)}` : 'Visible now';
  },
  dueLabel() {
    const dueAt = (this as LearnerCourseSnapshotAssignment).dueAt;
    if (!dueAt) return 'No due date';
    const dueTime = new Date(dueAt).getTime();
    const now = Date.now();
    if (dueTime < now) return `Overdue ${formatDateForCourse(dueAt)}`;
    return `Due ${formatDateForCourse(dueAt)}`;
  },
  attemptsLabel() {
    return `${(this as LearnerCourseSnapshotAssignment).progress?.attempts || 0} trials`;
  },
  accuracyLabel() {
    const progress = (this as LearnerCourseSnapshotAssignment).progress;
    return progress?.accuracyApplies && progress.accuracy !== null ? `${progress.accuracy}% accuracy` : 'Accuracy n/a';
  },
  itemsLabel() {
    const progress = (this as LearnerCourseSnapshotAssignment).progress;
    return progress?.itemsPracticedApplies && progress.itemsPracticed !== null ? `${progress.itemsPracticed} items` : 'Items n/a';
  },
  sessionDaysLabel() {
    return `${(this as LearnerCourseSnapshotAssignment).progress?.sessionDays || 0} days`;
  },
  timeLabel() {
    return `${(this as LearnerCourseSnapshotAssignment).progress?.totalTimeMinutes || 0} min`;
  },
  lastPracticeLabel() {
    const lastPracticed = (this as LearnerCourseSnapshotAssignment).progress?.lastPracticed;
    return lastPracticed ? `Last ${formatDateForCourse(lastPracticed)}` : 'Not practiced';
  },
  actionLabel() {
    return (this as LearnerCourseSnapshotAssignment).isUsed ? 'Continue' : 'Start';
  },
  actionButtonClass() {
    return (this as LearnerCourseSnapshotAssignment).isUsed ? 'btn-primary' : 'btn-success';
  },
});

Template.courses.events({
  'input #coursesSearch': function(event: Event, instance: CoursesTemplateInstance) {
    instance.search.set(String((event.currentTarget as HTMLInputElement).value || ''));
  },
  'change #coursesSort': function(event: Event, instance: CoursesTemplateInstance) {
    instance.sort.set(String((event.currentTarget as HTMLSelectElement).value || 'course'));
  },
  'click .launch-course-assignment': async function(event: Event, instance: CoursesTemplateInstance) {
    const assignment = this as LearnerCourseSnapshotAssignment;
    if (assignment.availability === 'scheduled') return;
    const course = currentCourseFromAssignment(instance, assignment);
    if (!course) {
      instance.error.set('Course context was not found for this assignment.');
      return;
    }
    try {
      const tdf: any = await meteorCallAsync('getTdfById', assignment.TDFId);
      const setspec = tdf?.content?.tdfs?.tutor?.setspec || {};
      setCourseAssignmentLaunchContext({
        assignmentId: assignment.assignmentId,
        courseId: assignment.courseId,
        TDFId: assignment.TDFId,
        launchSource: 'courses',
      });
      await selectTdf(
        assignment.TDFId,
        assignment.title,
        assignment.currentStimuliSetId,
        setspec.speechIgnoreOutOfGrammarResponses ? String(setspec.speechIgnoreOutOfGrammarResponses).toLowerCase() === 'true' : false,
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
