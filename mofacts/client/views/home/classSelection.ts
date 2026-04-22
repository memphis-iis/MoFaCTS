import { clientConsole } from '../../lib/userSessionHelpers';
import { Tracker } from 'meteor/tracker';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');

import './classSelection.html';

declare const Template: any;
declare const Session: any;
declare const Meteor: any;

Session.setDefault('classSelectionReady', false);
Session.setDefault('classSelectionTeachers', []);
Session.setDefault('classSelectionSections', []);
Session.setDefault('classSelectionTeacherId', '');
Session.setDefault('classSelectionSectionId', '');

function classSelectionContext() {
  return Meteor.user()?.loginParams?.curClass || Session.get('curClass') || null;
}

function selectedClassDisplayLabel() {
  const curClass = classSelectionContext();
  if (!curClass) return 'None';
  const courseName = String(curClass.courseName || '').trim();
  const sectionName = String(curClass.sectionName || '').trim();
  if (courseName && sectionName) return `${courseName} - ${sectionName}`;
  return courseName || sectionName || 'Selected';
}

function syncSelectedContextToSession() {
  const currentClass = classSelectionContext();
  const sections = Session.get('classSelectionSections') || [];
  if (!currentClass?.sectionId) return;
  const matching = sections.find((row: any) => String(row?.sectionId || '') === String(currentClass.sectionId));
  if (!matching) return;
  Session.set('classSelectionTeacherId', String(matching.teacherUserId || ''));
  Session.set('classSelectionSectionId', String(matching.sectionId || ''));
}

function syncSessionToSelectors() {
  Tracker.afterFlush(() => {
    const teacherSelect = document.getElementById('classSelectionTeacherSelect') as HTMLSelectElement | null;
    const classSelect = document.getElementById('classSelectionClassSelect') as HTMLSelectElement | null;
    if (teacherSelect) {
      teacherSelect.value = String(Session.get('classSelectionTeacherId') || '');
    }
    if (classSelect) {
      classSelect.value = String(Session.get('classSelectionSectionId') || '');
    }
  });
}

Template.classSelection.helpers({
  classSelectionReady: function() {
    return !!Session.get('classSelectionReady');
  },
  classSelectionTeachers: function() {
    return Session.get('classSelectionTeachers') || [];
  },
  classSelectionClasses: function() {
    const selectedTeacherId = String(Session.get('classSelectionTeacherId') || '');
    if (!selectedTeacherId) return [];
    const sections = Session.get('classSelectionSections') || [];
    return sections.filter((section: any) => String(section?.teacherUserId || '') === selectedTeacherId);
  },
  hasSelectedClassContext: function() {
    return !!classSelectionContext();
  },
  selectedClassDisplay: function() {
    return selectedClassDisplayLabel();
  }
});

Template.classSelection.events({
  'change #classSelectionTeacherSelect': function(event: any) {
    event.preventDefault();
    Session.set('classSelectionTeacherId', String(event?.target?.value || ''));
    Session.set('classSelectionSectionId', '');
  },

  'change #classSelectionClassSelect': function(event: any) {
    event.preventDefault();
    Session.set('classSelectionSectionId', String(event?.target?.value || ''));
  },

  'click #saveClassSelectionButton': async function(event: any) {
    event.preventDefault();
    const teacherId = String(Session.get('classSelectionTeacherId') || '');
    const sectionId = String(Session.get('classSelectionSectionId') || '');
    if (!teacherId || !sectionId) {
      alert('Please select both teacher and class.');
      return;
    }

    const teachers = Session.get('classSelectionTeachers') || [];
    const sections = Session.get('classSelectionSections') || [];
    const teacher = teachers.find((row: any) => String(row?._id || '') === teacherId);
    const curClass = sections.find((row: any) => String(row?.sectionId || '') === sectionId);
    if (!teacher || !curClass) {
      alert('Invalid teacher/class selection. Please try again.');
      return;
    }

    try {
      await Meteor.callAsync('addUserToTeachersClass', teacherId, sectionId);
      const assignedTdfIds = await Meteor.callAsync('getTdfsAssignedToStudent', Meteor.userId(), sectionId);
      await Meteor.callAsync(
        'setUserLoginData',
        'main-menu-class-select',
        Session.get('loginMode') || 'password',
        teacher,
        curClass,
        assignedTdfIds
      );
      Session.set('curTeacher', teacher);
      Session.set('curClass', curClass);
      alert('Class selection saved.');
      FlowRouter.go('/learningDashboard');
    } catch (error: unknown) {
      clientConsole(1, '[CLASS_SELECTION] Failed saving class selection:', error);
      alert('Could not save class selection. Please try again.');
    }
  },

  'click #backToHomeButton': function(event: any) {
    event.preventDefault();
    FlowRouter.go('/home');
  }
});

Template.classSelection.onRendered(async function() {
  try {
    const [teachers, sections] = await Promise.all([
      Meteor.callAsync('getAllTeachers'),
      Meteor.callAsync('getAllCourseSections')
    ]);

    Session.set('classSelectionTeachers', Array.isArray(teachers) ? teachers : []);
    Session.set('classSelectionSections', Array.isArray(sections) ? sections : []);
    syncSelectedContextToSession();
    Session.set('classSelectionReady', true);
    syncSessionToSelectors();
  } catch (error: unknown) {
    clientConsole(1, '[CLASS_SELECTION] Failed loading class selection options:', error);
    Session.set('classSelectionTeachers', []);
    Session.set('classSelectionSections', []);
    Session.set('classSelectionReady', false);
  }
});
