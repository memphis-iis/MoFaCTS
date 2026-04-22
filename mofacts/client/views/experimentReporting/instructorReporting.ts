import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './instructorReporting.html';
import { ReactiveDict } from 'meteor/reactive-dict';
import { meteorCallAsync } from '../..';
import { INVALID } from '../../../common/Definitions';
import { Tracker } from 'meteor/tracker';
declare const $: any;
declare const Tdfs: any;

const _state = new ReactiveDict('instructorReportingState');

let curTdf = INVALID;

async function updateTables(_tdfId: string | number, date?: number | false){
  const dateInt = date || false;
  const [historiesMet, historiesNotMet] = (await meteorCallAsync('getClassPerformanceByTDF', Session.get('curClass')._id, curTdf, dateInt)) as [unknown, unknown];
  
  Session.set('curClassStudentPerformance', historiesMet)
  Session.set('curClassStudentPerformanceAfterFilter', historiesNotMet);
}

Template.instructorReporting.helpers({
  INVALID: INVALID,
  curClassStudentPerformance: () => Session.get('curClassStudentPerformance'),
  curClassStudentPerformanceAfterFilter: () => Session.get('curClassStudentPerformanceAfterFilter'),
  curInstructorReportingTdfs: () => Session.get('curInstructorReportingTdfs'),
  classes: () => Session.get('classes'),
  curClassPerformance: () => Session.get('curClassPerformance'),
  performanceLoading: () => Session.get('performanceLoading'),
  replaceSpacesWithUnderscores: (value: string) => value.replace(' ', '_'),
  selectedTdfDueDate: () => Session.get('selectedTdfDueDate'),
  dueDateFilter: () => Session.get('dueDateFilter'),
});

Template.instructorReporting.events({
  'change #class-select': function(event: Event) {
    Session.set('curClassStudentPerformance', []);
    Session.set('curClassPerformance', []);
    const curClassId = $(event.currentTarget).val();
    const curClass = Session.get('classes').find((x: any) => x._id == curClassId);
    Session.set('curClass', curClass);
    const curClassTdfs = Session.get('instructorReportingTdfs')[curClassId];
    
    Session.set('curInstructorReportingTdfs', curClassTdfs);

    curTdf = INVALID;
    $('#tdf-select').val(INVALID);
    $('#tdf-select').prop('disabled', false);
    $('#practice-deadline-date').prop('disabled', true);
    _state.set('userMetThresholdMap', undefined);
  },

  'change #tdf-select': async function(event: Event) {
    curTdf = $(event.currentTarget).val();
    _state.set('currentTdf', curTdf);
    
    updateTables(curTdf);
    if (Session.get('curClass')) {
      const tdfData = Session.get('allTdfs').find((x: any) => x._id == curTdf);
      const tdfDate = tdfData.content.tdfs.tutor.setspec.duedate;
      Session.set('selectedTdfDueDate', tdfDate);
      
    } else {
      Session.set('selectedTdfDueDate', undefined);
      alert('Please select a class');
    }
    _state.set('userMetThresholdMap', undefined);
    $('#practice-deadline-date').prop('disabled', false);
  },

  'change #practice-deadline-date': async (event: Event) => {
    const date = String((event.currentTarget as HTMLInputElement).value || '');
    const dateInt = new Date(date).getTime();
    
    if(dateInt && !isNaN(dateInt)){
        updateTables((_state.get('currentTdf') as string | number), dateInt);
    }
  },
  'change #due-date-filter': async function(event: Event) {
    if((event.target as HTMLInputElement).checked){
      $('#practice-deadline-date').prop('disabled', true);
      const curTdfDueDate = Session.get('selectedTdfDueDate');
      
      $('#practice-deadline-date').val(curTdfDueDate);
      Session.set('dueDateFilter', true);
      const date = String($('#practice-deadline-date').val() || '');
      const dateInt = new Date(date).getTime();
      
      if(dateInt && !isNaN(dateInt)){
        updateTables((_state.get('currentTdf') as string | number), dateInt);
      }
    } else {
      $('#practice-deadline-date').prop('disabled', false);
      $('#practice-deadline-date').val('');
      Session.set('dueDateFilter', false);
      updateTables(curTdf, false);
    }
  },
  'click #add-exception': async function(event: Event) {
    let date = String($('#exception-date').val() || '');
    let dateInt = new Date(date).getTime();
    const userId = $(event.currentTarget).attr('data-userid');
    updateTables(curTdf, dateInt);
    curTdf = (_state.get('currentTdf') as string);
    const classId = Session.get('curClass')._id;
    
    await meteorCallAsync('addUserDueDateException', userId, curTdf, classId, dateInt);
    alert('Exception added');
    date = String(Session.get('selectedTdfDueDate') || '');
    dateInt = new Date(date).getTime();
    updateTables(curTdf, dateInt);
  },

  'click #remove-exception': async function(event: Event) {
    const userId = $(event.currentTarget).attr('data-userid');
    curTdf = (_state.get('currentTdf') as string);
    const classId = Session.get('curClass')._id;
    
    await meteorCallAsync('removeUserDueDateException', userId, curTdf, classId);
    alert('Exception removed');
    const date = String(Session.get('selectedTdfDueDate') || '');
    const dateInt = new Date(date).getTime();
    updateTables(curTdf, dateInt);
  }

});

Template.instructorReporting.onCreated(function(this: any) {
  this.subscriptions = [];
  this.autoruns = [];
});

Template.instructorReporting.onRendered(async function(this: any) {
  
  Session.set('curClass', undefined);
  Session.set('curStudentID', undefined);
  Session.set('studentUsername', undefined);
  Session.set('curStudentPerformance', undefined);
  Session.set('instructorSelectedTdf', undefined);
  Session.set('instructorReportingTdfs', []);
  Session.set('classes', []);
  Session.set('curClassStudentPerformance', []);
  Session.set('curClassPerformance', undefined);
  Session.set('curInstructorReportingTdfs', []);
  Session.set('dueDateFilter', false);

  Session.set('performanceLoading', true);

  const tdfListingSub = Meteor.subscribe('allTdfsListing');
  this.subscriptions.push(tdfListingSub);
  await new Promise<void>((resolve) => {
    const handle = Tracker.autorun(() => {
      if (tdfListingSub.ready()) {
        handle.stop();
        resolve();
      }
    });
  });
  Session.set('allTdfs', Tdfs.find().fetch());

  // Parallelize all async calls for faster page load
  const [studentPerformance, instructorReportingTdfs, courses] = await Promise.all([
    meteorCallAsync('getStudentPerformanceForClassAndTdfId', Meteor.userId()),
    meteorCallAsync('getTdfAssignmentsByCourseIdMap', Meteor.userId()),
    meteorCallAsync('getAllCoursesForInstructor', Meteor.userId())
  ]);

  const [studentPerformanceForClass, studentPerformanceForClassAndTdfIdMap] = studentPerformance as [unknown, unknown];
  Session.set('studentPerformanceForClass', studentPerformanceForClass);
  Session.set('studentPerformanceForClassAndTdfIdMap', studentPerformanceForClassAndTdfIdMap);

  Session.set('instructorReportingTdfs', instructorReportingTdfs);
  Session.set('classes', courses);

  Session.set('performanceLoading', false);

  
});

Template.instructorReporting.onDestroyed(function(this: any) {
  // Clean up autoruns
  this.autoruns.forEach((ar: { stop(): void }) => ar.stop());

  // Clean up subscriptions
  this.subscriptions.forEach((sub: { stop(): void }) => sub.stop());
});





