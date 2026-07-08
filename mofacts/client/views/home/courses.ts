import './courses.html';
import './courses.css';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { meteorCallAsync, clientConsole } from '../..';
import { selectTdf } from '../../lib/lessonLaunchRunner';
import { setCourseAssignmentLaunchContext } from '../../lib/courseAssignmentLaunchContext';
import { resolveSpeechIgnoreOutOfGrammarResponses } from '../../lib/speechRecognitionConfig';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { translatePlatformString } from '../../lib/interfaceI18n';
import type {
  LearnerCourseSnapshotAssignment,
  LearnerCourseSnapshotCourse,
  LearnerCoursesSnapshot,
} from '../../../common/courseAssignments.contracts';
import {
  buildCourseTreeRows,
  normalizeCourseTreeSort,
  type CourseAssignmentDisplayRow,
  type CourseTreeCourseRow,
  type CourseTreeSection,
  type CourseTreeSort,
} from './courseTree';

const EXPANDED_COURSES_SESSION_KEY = 'coursesExpandedCourseIds';
const JOINING_COURSE_SESSION_KEY = 'coursesJoiningCourseId';
const JOIN_SECTION_SELECTIONS_SESSION_KEY = 'coursesJoinSectionSelections';

type CoursesTemplateInstance = Blaze.TemplateInstance & {
  snapshot: ReactiveVar<LearnerCoursesSnapshot | null>;
  loading: ReactiveVar<boolean>;
  error: ReactiveVar<string | null>;
  search: ReactiveVar<string>;
  sort: ReactiveVar<CourseTreeSort>;
};

function formatDate(value: unknown, timezone?: string | null) {
  if (!value) return '';
  const date = new Date(value as string | number | Date);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(getActiveUiLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

function formatDateOnly(value: unknown, timezone?: string | null) {
  if (!value) return '';
  const date = new Date(value as string | number | Date);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString(getActiveUiLocale(), {
    dateStyle: 'medium',
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

function courseText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function courseTranslationStatusText(status: string): string {
  if (status === 'author-provided') return courseText('manualCreator.translationStatusAuthorProvided');
  if (status === 'not-translated') return courseText('manualCreator.translationStatusNotTranslated');
  if (status === 'draft') return courseText('manualCreator.translationStatusDraft');
  if (status === 'reviewed') return courseText('manualCreator.translationStatusReviewed');
  return status;
}

function buildCourseLanguageMetadataRows(assignment: Pick<CourseAssignmentDisplayRow, 'contentLanguage' | 'recommendedUiLocales' | 'translationStatus'>) {
  const rows: Array<{ label: string; value: string }> = [];
  const contentLanguage = String(assignment?.contentLanguage || '').trim();
  const recommendedUiLocales = Array.isArray(assignment?.recommendedUiLocales)
    ? assignment.recommendedUiLocales.map((locale: unknown) => String(locale || '').trim()).filter(Boolean)
    : [];
  const translationStatus = String(assignment?.translationStatus || '').trim();
  if (contentLanguage) rows.push({ label: courseText('manualCreator.contentLanguage'), value: contentLanguage });
  if (recommendedUiLocales.length > 0) {
    rows.push({ label: courseText('manualCreator.recommendedUiLocales'), value: recommendedUiLocales.join(', ') });
  }
  if (translationStatus) {
    rows.push({ label: courseText('manualCreator.translationStatus'), value: courseTranslationStatusText(translationStatus) });
  }
  return rows;
}

function getExpandedCourseIds() {
  const stored = Session.get(EXPANDED_COURSES_SESSION_KEY);
  return new Set<string>(Array.isArray(stored) ? stored.map(String) : []);
}

function setExpandedCourseIds(expandedIds: Set<string>) {
  Session.set(EXPANDED_COURSES_SESSION_KEY, Array.from(expandedIds));
}

function getJoinSectionSelections(): Record<string, string> {
  const stored = Session.get(JOIN_SECTION_SELECTIONS_SESSION_KEY);
  return stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored as Record<string, string>
    : {};
}

function setJoinSectionSelection(courseId: string, sectionId: string) {
  Session.set(JOIN_SECTION_SELECTIONS_SESSION_KEY, {
    ...getJoinSectionSelections(),
    [courseId]: sectionId,
  });
}

function getCourseRows(snapshot: LearnerCoursesSnapshot | null, section: CourseTreeSection, instance: CoursesTemplateInstance) {
  return buildCourseTreeRows(snapshot, section, {
    query: instance.search.get(),
    sort: instance.sort.get(),
    expandedCourseIds: getExpandedCourseIds(),
  });
}

function currentCourseFromAssignment(instance: CoursesTemplateInstance, assignment: LearnerCourseSnapshotAssignment): LearnerCourseSnapshotCourse | null {
  const snapshot = instance.snapshot.get();
  return [...(snapshot?.assignedCourses || []), ...(snapshot?.publicCourses || [])]
    .find((course) => course.courseId === assignment.courseId) || null;
}

async function reloadCoursesSnapshot(instance: CoursesTemplateInstance) {
  const snapshot = await meteorCallAsync('getLearnerCoursesSnapshot') as LearnerCoursesSnapshot;
  instance.snapshot.set(snapshot);
  return snapshot;
}

Template.courses.onCreated(function(this: CoursesTemplateInstance) {
  this.snapshot = new ReactiveVar(null);
  this.loading = new ReactiveVar(true);
  this.error = new ReactiveVar(null);
  this.search = new ReactiveVar('');
  this.sort = new ReactiveVar('course');
  if (!Array.isArray(Session.get(EXPANDED_COURSES_SESSION_KEY))) {
    Session.set(EXPANDED_COURSES_SESSION_KEY, []);
  }
  if (!Session.get(JOIN_SECTION_SELECTIONS_SESSION_KEY)) {
    Session.set(JOIN_SECTION_SELECTIONS_SESSION_KEY, {});
  }
  Session.set(JOINING_COURSE_SESSION_KEY, null);
});

Template.courses.onRendered(async function(this: CoursesTemplateInstance) {
  this.loading.set(true);
  this.error.set(null);
  try {
    await reloadCoursesSnapshot(this);
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
    return getCourseRows(instance.snapshot.get(), 'assignedCourses', instance);
  },
  publicCourses() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return getCourseRows(instance.snapshot.get(), 'publicCourses', instance);
  },
  hasAssignedAssignments() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return getCourseRows(instance.snapshot.get(), 'assignedCourses', instance).length > 0;
  },
  hasPublicAssignments() {
    const instance = Template.instance() as CoursesTemplateInstance;
    return getCourseRows(instance.snapshot.get(), 'publicCourses', instance).length > 0;
  },
});

const courseAssignmentDisplayHelpers = {
  timezoneLabel(this: CourseAssignmentDisplayRow | CourseTreeCourseRow) {
    return this.timezone;
  },
  isLocked(this: CourseAssignmentDisplayRow) {
    return this.availability !== 'available';
  },
  statusLabel(this: CourseAssignmentDisplayRow) {
    const row = this;
    if (row.availability === 'scheduled') return courseText('courses.locked');
    if (row.availability === 'unavailable') return courseText('courses.notEnrolled');
    return row.required ? courseText('courses.required') : courseText('courses.optional');
  },
  statusClass(this: CourseAssignmentDisplayRow) {
    const row = this;
    if (row.availability === 'scheduled') return 'course-assignment-status--locked';
    if (row.availability === 'unavailable') return 'course-assignment-status--locked';
    return row.required ? 'course-assignment-status--required' : '';
  },
  releaseLabel(this: CourseAssignmentDisplayRow) {
    const row = this;
    const formatted = formatDate(row.releaseAt, row.timezone);
    return formatted ? courseText('courses.opens', { date: formatted }) : '';
  },
  hasReleaseLabel(this: CourseAssignmentDisplayRow) {
    return Boolean(this.releaseAt);
  },
  dueLabel(this: CourseAssignmentDisplayRow) {
    const row = this;
    const dueAt = row.dueAt;
    if (!dueAt) return '-';
    const dueTime = new Date(dueAt).getTime();
    const now = Date.now();
    const formatted = formatDate(dueAt, row.timezone);
    if (dueTime < now) return formatted ? courseText('courses.overdue', { date: formatted }) : '-';
    return formatted || '-';
  },
  dueWithDateLabel(this: CourseAssignmentDisplayRow) {
    const dueLabel = courseAssignmentDisplayHelpers.dueLabel.call(this);
    return dueLabel === '-' ? `${courseText('courses.due')} -` : courseText('courses.dueWithDate', { date: dueLabel });
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
    return courseText('courses.minutes', { minutes: this.progress?.totalTimeMinutes || 0 });
  },
  lastPracticeValue(this: CourseAssignmentDisplayRow) {
    const row = this;
    const lastPracticed = row.progress?.lastPracticed;
    return lastPracticed ? formatDateOnly(lastPracticed, row.timezone) : '-';
  },
  languageMetadataRows(this: CourseAssignmentDisplayRow) {
    return buildCourseLanguageMetadataRows(this);
  },
  actionLabel(this: CourseAssignmentDisplayRow) {
    const row = this;
    if (row.availability === 'scheduled') return courseText('courses.locked');
    if (row.availability === 'unavailable') return courseText('courses.unavailable');
    return row.isUsed ? courseText('courses.continue') : courseText('courses.start');
  },
  actionButtonClass(this: CourseAssignmentDisplayRow) {
    return this.isUsed ? 'btn-primary' : 'btn-success';
  },
};

const courseTreeCourseRowHelpers = {
  ...courseAssignmentDisplayHelpers,
  isJoinableCourse(this: CourseTreeCourseRow) {
    return this.membership === 'public';
  },
  joinableSectionCount(this: CourseTreeCourseRow) {
    return Array.isArray(this.joinableSections) ? this.joinableSections.length : 0;
  },
  hasMultipleJoinableSections(this: CourseTreeCourseRow) {
    return Array.isArray(this.joinableSections) && this.joinableSections.length > 1;
  },
  singleJoinableSectionId(this: CourseTreeCourseRow) {
    if (!Array.isArray(this.joinableSections) || this.joinableSections.length !== 1) return '';
    const [section] = this.joinableSections;
    return section?.sectionId || '';
  },
  selectedJoinSectionId(this: CourseTreeCourseRow) {
    return getJoinSectionSelections()[this.courseId] || '';
  },
  isJoiningCourse(this: CourseTreeCourseRow) {
    return Session.get(JOINING_COURSE_SESSION_KEY) === this.courseId;
  },
  joinLabel(this: CourseTreeCourseRow) {
    return Session.get(JOINING_COURSE_SESSION_KEY) === this.courseId ? courseText('courses.joining') : courseText('courses.join');
  },
  joinDisabled(this: CourseTreeCourseRow) {
    const isJoining = Session.get(JOINING_COURSE_SESSION_KEY) === this.courseId;
    if (isJoining) return true;
    const sections = Array.isArray(this.joinableSections) ? this.joinableSections : [];
    if (sections.length === 0) return true;
    if (sections.length > 1 && !getJoinSectionSelections()[this.courseId]) return true;
    return false;
  },
};

Template.courseTreeCourseRow.helpers({
  ...courseTreeCourseRowHelpers,
});
Template.courseAssignmentTableRow.helpers(courseAssignmentDisplayHelpers);
Template.courseAssignmentCard.helpers(courseAssignmentDisplayHelpers);
Template.courseAssignmentCourseCard.helpers(courseAssignmentDisplayHelpers);

Template.courses.events({
  'input #coursesSearch': function(event: Event, instance: CoursesTemplateInstance) {
    instance.search.set(String((event.currentTarget as HTMLInputElement).value || ''));
  },
  'change #coursesSort': function(event: Event, instance: CoursesTemplateInstance) {
    instance.sort.set(normalizeCourseTreeSort(String((event.currentTarget as HTMLSelectElement).value || 'course')));
  },
  'change .join-course-section': function(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const courseId = select.dataset.courseid;
    if (!courseId) return;
    setJoinSectionSelection(courseId, String(select.value || ''));
  },
  'click .toggle-course-tree': function(event: Event) {
    const target = event.currentTarget as HTMLElement;
    const courseId = target.dataset.courseid;
    if (!courseId) return;
    const expandedIds = getExpandedCourseIds();
    if (expandedIds.has(courseId)) {
      expandedIds.delete(courseId);
    } else {
      expandedIds.add(courseId);
    }
    setExpandedCourseIds(expandedIds);
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
      await selectTdf(
        assignment.TDFId,
        assignment.title,
        assignment.currentStimuliSetId,
        resolveSpeechIgnoreOutOfGrammarResponses(setspec),
        setspec.speechOutOfGrammarFeedback || translatePlatformString(getActiveUiLocale(), 'speech.outOfGrammarFeedback'),
        'Course assignment launch',
        Boolean(tdf?.content?.isMultiTdf),
        setspec,
        false,
        false,
        { courseAssignment: launchContext },
      );
    } catch (error: any) {
      setCourseAssignmentLaunchContext(null);
      instance.error.set(error?.reason || error?.message || String(error));
    }
  },
  'click .join-public-course': async function(event: Event, instance: CoursesTemplateInstance) {
    const course = this as CourseTreeCourseRow;
    if (course.membership !== 'public') return;
    const button = event.currentTarget as HTMLElement;
    const sectionId = String(button.dataset.sectionid || getJoinSectionSelections()[course.courseId] || '');
    if (!sectionId) {
      instance.error.set(courseText('courses.selectSectionToJoin'));
      return;
    }
    const section = (course.joinableSections || []).find((row) => row.sectionId === sectionId);
    if (!section) {
      instance.error.set(courseText('courses.selectSectionToJoin'));
      return;
    }
    Session.set(JOINING_COURSE_SESSION_KEY, course.courseId);
    instance.error.set(null);
    try {
      await meteorCallAsync('addUserToTeachersClass', course.teacherUserId, sectionId);
      const assignedTdfIds = await meteorCallAsync('getTdfsAssignedToStudent', Meteor.userId(), sectionId);
      const teacher = {
        _id: course.teacherUserId,
        displayIdentifier: course.teacherDisplayName,
      };
      const curClass = {
        sectionId,
        sectionName: section.sectionName,
        courseId: course.courseId,
        courseName: course.courseName,
        teacherUserId: course.teacherUserId,
        visibility: course.visibility,
        timezone: course.timezone,
      };
      await meteorCallAsync(
        'setUserLoginData',
        'learn-course-join',
        Session.get('loginMode') || 'password',
        teacher,
        curClass,
        assignedTdfIds,
      );
      Session.set('curTeacher', teacher);
      Session.set('curClass', curClass);
      const expandedIds = getExpandedCourseIds();
      expandedIds.add(course.courseId);
      setExpandedCourseIds(expandedIds);
      await reloadCoursesSnapshot(instance);
    } catch (error: any) {
      instance.error.set(error?.reason || error?.message || String(error));
    } finally {
      Session.set(JOINING_COURSE_SESSION_KEY, null);
    }
  },
});
