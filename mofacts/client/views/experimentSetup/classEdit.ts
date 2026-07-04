import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './classEdit.html';
import { meteorCallAsync } from '../..';
import { curSemester } from '../../../common/Definitions';
import $ from 'jquery';

// Initialize to null to detect loading state ([] means loaded but empty)
Session.set('classes', null);

let isNewClass = true;

function setClassEditMessage(level: string, text: string) {
  Session.set('classEditMessage', {
    level,
    text,
    icon: level === 'success' ? 'fa-check-circle' : level === 'warning' ? 'fa-exclamation-triangle' : level === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'
  });
}

function clearClassEditMessage() {
  Session.set('classEditMessage', null);
}

function clearClassEditConfirmation() {
  Session.set('classEditConfirmation', null);
}

interface EditableClass {
  courseId: string | undefined;
  courseName: string;
  teacherUserId: string | null;
  semester: string;
  beginDate: Date | string | null;
  endDate: Date | string | null;
  timezone: string;
  visibility: 'private' | 'public';
  sections: string[];
}

type CourseSection = {
  _id?: string;
  courseId: string;
  courseName: string;
  teacherUserId?: string;
  teacheruserid?: string;
  semester?: string;
  beginDate?: Date | string | null;
  endDate?: Date | string | null;
  timezone?: string;
  visibility?: 'private' | 'public';
  sectionId?: string;
  sectionName?: string;
  sections?: string[];
};

const COURSE_TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Phoenix', label: 'Arizona Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'UTC', label: 'UTC' },
];

let curClass: EditableClass = {
  courseId: undefined,
  courseName: '',
  teacherUserId: Meteor.userId(),
  semester: curSemester,
  beginDate: null,
  endDate: null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  visibility: 'private',
  sections: [],
};

function toDatetimeLocalValue(value: unknown, timezone?: string): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value as string | number | Date);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  if (timezone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const partValue = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${partValue('year')}-${partValue('month')}-${partValue('day')}T${partValue('hour')}:${partValue('minute')}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readOptionalDateInput(selector: string): string | null {
  const value = String($(selector).val() || '').trim();
  return value || null;
}

function defaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
}

function timezoneLabel(timezone: string): string {
  const knownOption = COURSE_TIMEZONE_OPTIONS.find((option) => option.value === timezone);
  if (knownOption) return knownOption.label;
  return timezone.replace(/_/g, ' ');
}

function ensureTimezoneOption(timezone: string) {
  if (!timezone || $(`#courseTimezone option[value="${timezone}"]`).length > 0) {
    return;
  }
  $('#courseTimezone').append($('<option>', { value: timezone, text: timezoneLabel(timezone) }));
}

function setTimezoneSelection(timezone: string) {
  ensureTimezoneOption(timezone);
  $('#courseTimezone').val(timezone);
}

function classSelectedSetup(courseId: string) {
  $('#class-select').children('[value="' + courseId + '"]').prop('selected', true);
  const classes = (Session.get('classes') || []) as EditableClass[];
  const foundClass = classes.find((c) => c.courseId === courseId);
  if (!foundClass) {
    return;
  }
  $('#newClassName').val(foundClass.courseName);
  $('#sectionNames').val(foundClass.sections.map((x: string) => x + '\n').join(''));
  const courseTimezone = foundClass.timezone || defaultTimezone();
  $('#courseVisibility').val(foundClass.visibility || 'private');
  $('#courseBeginDate').val(toDatetimeLocalValue(foundClass.beginDate, courseTimezone));
  $('#courseEndDate').val(toDatetimeLocalValue(foundClass.endDate, courseTimezone));
  setTimezoneSelection(courseTimezone);
  clearClassEditMessage();
  clearClassEditConfirmation();
  Session.set('classEditMode', 'edit');
  isNewClass = false;
}

function noClassSelectedSetup() {
  $('#newClassName').val('');
  $('#sectionNames').val('');
  $('#courseVisibility').val('private');
  $('#courseBeginDate').val('');
  $('#courseEndDate').val('');
  setTimezoneSelection(defaultTimezone());
  clearClassEditMessage();
  clearClassEditConfirmation();
  Session.set('classEditMode', 'new');
  isNewClass = true;
}

function readSectionNames(): string[] {
  return String($('#sectionNames').val() || '')
    .split(/\r?\n/)
    .map((sectionName) => sectionName.trim())
    .filter(Boolean);
}

async function loadCourseManagementData() {
  const allCourseSections = (await meteorCallAsync('getAllCourseSections')) as CourseSection[];

  const classes: Record<string, CourseSection & { sections: string[] }> = {};
  const sectionsByInstructorId: Array<{ sectionId: string; courseName: string; sectionName: string; teacherUserId: string }> = [];

  for (const courseSection of allCourseSections) {
    if (courseSection.teacherUserId != Meteor.userId()) continue;
    if (!classes[courseSection.courseId]) {
      classes[courseSection.courseId] = {
        courseId: courseSection.courseId,
        courseName: courseSection.courseName,
        teacherUserId: courseSection.teacherUserId,
        semester: courseSection.semester || curSemester,
        beginDate: courseSection.beginDate || null,
        endDate: courseSection.endDate || null,
        timezone: courseSection.timezone || defaultTimezone(),
        visibility: courseSection.visibility === 'public' ? 'public' : 'private',
        sections: [],
      };
    }
    const sectionId = String(courseSection.sectionId || '');
    const sectionName = String(courseSection.sectionName || '');
    if (sectionId && sectionName) {
      classes[courseSection.courseId]!.sections.push(sectionName);
      sectionsByInstructorId.push({
        sectionId,
        courseName: courseSection.courseName,
        sectionName,
        teacherUserId: String(courseSection.teacherUserId || '')
      });
    }
  }

  Session.set('classes', Object.values(classes));
  Session.set('sectionsByInstructorId', sectionsByInstructorId);
}

Template.classEdit.onCreated(function() {
  // Reset to loading state when entering the page
  Session.set('classes', null);
  Session.set('sectionsByInstructorId', null);
  Session.set('classEditMessage', null);
  Session.set('classEditConfirmation', null);
});

Template.classEdit.onRendered(async function () {
  await loadCourseManagementData();
  noClassSelectedSetup();
});

Template.classEdit.helpers({
  isLoading: () => Session.get('classes') === null,
  classEditMessage: () => Session.get('classEditMessage'),
  classEditConfirmation: () => Session.get('classEditConfirmation'),
  isEditingCourse: () => Session.get('classEditMode') === 'edit',

  classes: () => Session.get('classes'),

  'sections': function() {
    const sections = Session.get('sectionsByInstructorId');
    
    return sections;
  },

  'curTeacherClasses': () => Session.get('curTeacherClasses'),

  'curTeacher': () => Meteor.user()?.username || '',

  'baseLink': function(){
    return "https://" + window.location.host + "/";
  },

  courseTimezoneOptions: () => {
    const detectedTimezone = defaultTimezone();
    if (!detectedTimezone || COURSE_TIMEZONE_OPTIONS.some((option) => option.value === detectedTimezone)) {
      return COURSE_TIMEZONE_OPTIONS;
    }
    return [
      ...COURSE_TIMEZONE_OPTIONS,
      { value: detectedTimezone, label: timezoneLabel(detectedTimezone) },
    ];
  },

});
Template.classEdit.events({
  'change #class-select': function(event: Event) {
    
    const courseId = String((event.currentTarget as HTMLSelectElement | null)?.value || '');
    if (courseId) {
      classSelectedSetup(courseId);
    } else {
      // Creating a new class with name from $textBox
      noClassSelectedSetup();
    }
  },

  'click #saveClass': function(_event: Event) {
    clearClassEditMessage();
    clearClassEditConfirmation();
    const classes = (Session.get('classes') || []) as EditableClass[];
    if (isNewClass) {
      const curClassName = String($('#newClassName').val() || '');
      if(curClassName == ""){
        setClassEditMessage('warning', 'Course cannot be blank.');
        return false;
      }
      curClass = {
        courseId: undefined,
        courseName: curClassName,
        teacherUserId: Meteor.userId(),
        semester: curSemester,
        beginDate: null,
        endDate: null,
        timezone: defaultTimezone(),
        visibility: 'private',
        sections: [],
      };
      classes.push(curClass);
    } else {
      const courseId = String($('#class-select').val() || '');
      const foundClass = classes.find((course) => course.courseId === courseId);
      if (!foundClass) {
        setClassEditMessage('error', 'Selected course was not found.');
        return false;
      }
      curClass = foundClass;
      const newClassName = String($('#newClassName').val() || '');
      curClass.courseName = newClassName;
    }

    curClass.sections = readSectionNames();
    curClass.visibility = String($('#courseVisibility').val() || 'private') === 'public' ? 'public' : 'private';
    curClass.beginDate = readOptionalDateInput('#courseBeginDate');
    curClass.endDate = readOptionalDateInput('#courseEndDate');
    curClass.timezone = String($('#courseTimezone').val() || '').trim();
    if (!curClass.timezone) {
      setClassEditMessage('warning', 'Choose a course timezone.');
      return false;
    }

    function handleSuccess(res: unknown) {
      curClass.courseId = res as string;

      void loadCourseManagementData().then(function() {
        classSelectedSetup(String(curClass.courseId || ''));
        setClassEditMessage('success', 'Course saved.');
      });
    }

    function handleError(err: unknown) {
      const message = (err as any)?.reason || (err as any)?.message || String(err);
      setClassEditMessage('error', 'Error saving course: ' + message);
    }

    if (isNewClass) {
      meteorCallAsync('addCourse', curClass)
        .then(handleSuccess)
        .catch(handleError);
    } else {
      meteorCallAsync('editCourse', curClass)
        .then(handleSuccess)
        .catch(handleError);
    }
  },

  'click #deleteCourse': function(_event: Event) {
    clearClassEditMessage();
    const courseId = String($('#class-select').val() || '');
    const classes = (Session.get('classes') || []) as EditableClass[];
    const foundClass = classes.find((course) => course.courseId === courseId);
    if (!courseId || !foundClass) {
      setClassEditMessage('warning', 'Select a course to delete.');
      return false;
    }

    Session.set('classEditConfirmation', {
      courseId,
      title: `Delete "${foundClass.courseName}"?`,
      message: 'This removes the course, section links, enrollments, and assignment rows. Learner history is kept.'
    });
    return false;
  },

  'click #cancelCourseDelete': function(event: Event) {
    event.preventDefault();
    clearClassEditConfirmation();
    return false;
  },

  'click #confirmCourseDelete': function(event: Event) {
    event.preventDefault();
    const confirmation = Session.get('classEditConfirmation') as { courseId?: string } | null;
    const courseId = String(confirmation?.courseId || '');
    if (!courseId) {
      setClassEditMessage('warning', 'Select a course to delete.');
      clearClassEditConfirmation();
      return false;
    }

    meteorCallAsync('deleteCourse', courseId)
      .then(async function() {
        await loadCourseManagementData();
        noClassSelectedSetup();
        setClassEditMessage('success', 'Course deleted.');
      })
      .catch(function(err: unknown) {
        const message = (err as any)?.reason || (err as any)?.message || String(err);
        setClassEditMessage('error', 'Error deleting course: ' + message);
      });
    clearClassEditConfirmation();
    return false;
  },
});





