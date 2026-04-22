import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './classEdit.html';
import { meteorCallAsync } from '../..';
import { curSemester } from '../../../common/Definitions';
import { search } from '../../lib/currentTestingHelpers';
import $ from 'jquery';

// Initialize to null to detect loading state ([] means loaded but empty)
Session.set('classes', null);

let isNewClass = true;

interface EditableClass {
  courseId: string | undefined;
  courseName: string;
  teacherUserId: string | null;
  semester: string;
  beginDate: Date;
  sections: string[];
}

type CourseSection = {
  _id?: string;
  courseId: string;
  courseName: string;
  teacherUserId?: string;
  teacheruserid?: string;
  sectionId: string;
  sectionName: string;
  sections?: string[];
};

let curClass: EditableClass = {
  courseId: undefined,
  courseName: '',
  teacherUserId: Meteor.userId(),
  semester: curSemester,
  beginDate: new Date(),
  sections: [],
};

function classSelectedSetup(curClassName: string) {
  $('#class-select').children('[value="' + curClassName + '"]').prop('selected', true);
  $('#newClassName').val(curClassName);
  const classes = (Session.get('classes') || []) as EditableClass[];
  const foundClass = classes.find((c) => c.courseName === curClassName);
  if (!foundClass) {
    return;
  }
  $('#sectionNames').val(foundClass.sections.map((x: string) => x + '\n').join(''));
  isNewClass = false;
}

function noClassSelectedSetup() {
  $('#newClassName').val('');
  $('#sectionNames').val('');
  isNewClass = true;
}

async function updateSections(){
  const allCourseSections = (await meteorCallAsync('getAllCourseSections')) as CourseSection[];
  
  const sectionsByInstructorId: Array<{ sectionId: string; courseName: string; sectionName: string }> = [];
  //  //sectionid, courseandsectionname
  for (const courseSection of allCourseSections) {
    if (courseSection.teacherUserId != Meteor.userId()) continue;
    sectionsByInstructorId.push({
      sectionId: courseSection.sectionId,
      courseName: courseSection.courseName,
      sectionName: courseSection.sectionName
    });
  }
  
  Session.set('sectionsByInstructorId', sectionsByInstructorId);
}

Template.classEdit.onCreated(function() {
  // Reset to loading state when entering the page
  Session.set('classes', null);
  Session.set('sectionsByInstructorId', null);
});

Template.classEdit.onRendered(async function () {
  // Single API call - reuse result for both classes and sections
  const allCourseSections = (await meteorCallAsync('getAllCourseSections')) as CourseSection[];
  

  // Build classes object
  const classes: Record<string, CourseSection> = {};
  const sectionsByInstructorId: Array<{ sectionId: string; courseName: string; sectionName: string }> = [];

  for (const courseSection of allCourseSections) {
    if (courseSection.teacherUserId != Meteor.userId()) continue;
    classes[courseSection.courseId] = courseSection;
    sectionsByInstructorId.push({
      sectionId: courseSection.sectionId,
      courseName: courseSection.courseName,
      sectionName: courseSection.sectionName
    });
  }

  
  

  Session.set('classes', Object.values(classes));
  Session.set('sectionsByInstructorId', sectionsByInstructorId);
});

Template.classEdit.helpers({
  isLoading: () => Session.get('classes') === null,

  classes: () => Session.get('classes'),

  'sections': function() {
    const sections = Session.get('sectionsByInstructorId');
    
    return sections;
  },

  'curTeacherClasses': () => Session.get('curTeacherClasses'),

  'curTeacher': () => Meteor.user()?.username || '',

  'baseLink': function(){
    return "https://" + window.location.host + "/";
  }

});
Template.classEdit.events({
  'change #class-select': function(event: Event) {
    
    const curClassName = String((event.currentTarget as HTMLSelectElement | null)?.value || '');
    if (curClassName) {
      classSelectedSetup(curClassName);
    } else {
      // Creating a new class with name from $textBox
      noClassSelectedSetup();
    }
  },

  'click #saveClass': function(_event: Event) {
    const classes = (Session.get('classes') || []) as EditableClass[];
    if (isNewClass) {
      const curClassName = String($('#newClassName').val() || '');
      if(curClassName == ""){
        alert("Class cannot be blank.");
        return false;
      }
      curClass = {
        courseId: undefined,
        courseName: curClassName,
        teacherUserId: Meteor.userId(),
        semester: curSemester,
        beginDate: new Date(),
        sections: [],
      };
      classes.push(curClass);
    } else {
      const curClassName = String($('#class-select').val() || '');
      const foundClass = search(curClassName, 'courseName', classes as EditableClass[]);
      if (!foundClass) {
        alert('Selected class was not found.');
        return false;
      }
      curClass = foundClass;
      const newClassName = String($('#newClassName').val() || '');
      curClass.courseName = newClassName;
    }

    const newSections = String($('#sectionNames').val() || '').trim().split('\n');
    for(let i = 0; i < newSections.length; i++){
      const newSection = newSections[i];
      if(newSection == "" || newSection == " "){
        alert("Cannot have blank section names");
        return false;
      }
    }
    curClass.sections = newSections;

    function handleSuccess(res: unknown) {
      alert('Saved class successfully!');
      curClass.courseId = res as string;
      
      Session.set('classes', classes);
      // Need a delay here so the reactive session var can update the template
      setTimeout(function() {
        classSelectedSetup(curClass.courseName);
      }, 200);
    }

    function handleError(err: unknown) {
      alert('Error saving class: ' + err);
    }

    if (isNewClass) {
      curClass.beginDate = new Date();
      meteorCallAsync('addCourse', curClass)
        .then(handleSuccess)
        .catch(handleError);
    } else {
      meteorCallAsync('editCourse', curClass)
        .then(handleSuccess)
        .catch(handleError);
    }
    updateSections();
  },
});





