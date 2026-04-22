import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { Tracker } from 'meteor/tracker';
import './tdfAssignmentEdit.html';
import { meteorCallAsync } from '../..';
declare const $: any;

Session.set('courses', []);
Session.set('assignments', []);
Session.set('allTdfFilenamesAndDisplayNames', []);
Session.set('tdfsSelected', []);
Session.set('tdfsNotSelected', []);

type CourseAssignmentState = { courseName: string; courseId: string | undefined; tdfs: string[] };
type TdfDisplay = { fileName: string; displayName: string };
let curCourseAssignment: CourseAssignmentState = {courseName: '', courseId: undefined, tdfs: []};

Template.tdfAssignmentEdit.onCreated(function (this: any) {
  this.autoruns = [];
});

Template.tdfAssignmentEdit.onRendered(async function (this: any) {
  

  // Parallelize all async calls for faster page load
  const [courses, courseAssignments, accessableTDFS] = await Promise.all([
    meteorCallAsync('getAllCoursesForInstructor', Meteor.userId()),
    meteorCallAsync('getAllCourseAssignmentsForInstructor', Meteor.userId()),
    meteorCallAsync('getAssignableTDFSForUser', Meteor.userId())
  ]);

  
  Session.set('courses', courses);

  // Process course assignments
  const assignments: Record<string, Set<string> | string[]> = {};
  for (const courseAssignment of courseAssignments as any[]) {
    if (!assignments[courseAssignment.courseName]) assignments[courseAssignment.courseName] = new Set<string>();
    (assignments[courseAssignment.courseName] as Set<string>).add(courseAssignment.fileName);
  }
  for (const assignmentKey of Object.keys(assignments)) {
    assignments[assignmentKey] = Array.from(assignments[assignmentKey] as Set<string>);
  }
  Session.set('assignments', assignments);
  
  curCourseAssignment = {courseName: '', courseId: undefined, tdfs: []};

  // Process accessible TDFs
  const allTdfObjects = (accessableTDFS as any[]).map((tdf) => tdf.content);
  if (!Session.get('allTdfs')) Session.set('allTdfs', allTdfObjects);
  const allTdfDisplays: TdfDisplay[] = [];
  for (const i in allTdfObjects) {
    const tdf = allTdfObjects[i];
    allTdfDisplays.push({fileName: tdf.fileName, displayName: tdf.tdfs.tutor.setspec.lessonname});
  }
  
  Session.set('allTdfFilenamesAndDisplayNames', allTdfDisplays);

  const autorun = Tracker.autorun(updateTdfsSelectedAndNotSelected);
  this.autoruns.push(autorun);
});

Template.tdfAssignmentEdit.onDestroyed(function (this: any) {
  // Clean up autoruns
  this.autoruns.forEach((ar: { stop(): void }) => ar.stop());
});

Template.tdfAssignmentEdit.helpers({
  courses: () => Session.get('courses'),
  tdfsSelected: () => Session.get('tdfsSelected'),
  tdfsNotSelected: () => Session.get('tdfsNotSelected'),
});

Template.tdfAssignmentEdit.events({
  'change #class-select': function(event: Event) {
    
    const curCourseId = String($(event.currentTarget).val() || '');
    const curCourseName = $('#class-select option:selected').text();
    const assignments = (Session.get('assignments') || {}) as Record<string, string[]>;
    const tempTdfs = assignments[curCourseName] || [];
    curCourseAssignment = {courseName: curCourseName, courseId: curCourseId, tdfs: tempTdfs};
    
    updateTdfsSelectedAndNotSelected();
  },

  'click #selectTdf': function() {
    
    const tdfsToBeSelected = getselectedItems('notSelectedTdfs').map((x) => x.fileName);
    curCourseAssignment.tdfs = curCourseAssignment.tdfs.concat(tdfsToBeSelected);
    
    updateTdfsSelectedAndNotSelected();
  },

  'click #unselectTdf': function() {
    
    const tdfsToBeUnselected = getselectedItems('selectedTdfs').map((x) => x.fileName);
    curCourseAssignment.tdfs = curCourseAssignment.tdfs.filter((x) => tdfsToBeUnselected.indexOf(x) == -1);
    
    updateTdfsSelectedAndNotSelected();
  },

  'click #saveAssignment': function() {
    
    if (!curCourseAssignment.courseName) {
      alert('Please select a class to assign Chapters to.');
    } else {
      // dbCurCourseAssignment.tdfs = dbCurCourseAssignment.tdfs.map(x => x.fileName);
      (async () => {
        try {
          const res = await meteorCallAsync('editCourseAssignments', curCourseAssignment);
          if (res == null) {
            alert('Error saving class (check server logs)');
          } else {
            alert('Saved class successfully!');
            
            const assignments = Session.get('assignments');
            // assignments is an object keyed by courseName, not an array
            assignments[curCourseAssignment.courseName] = curCourseAssignment.tdfs;
            Session.set('assignments', assignments);
          }
        } catch (err) {
          alert('Error saving class: ' + err);
        }
      })();
    }
  },
});

function getselectedItems(itemSelector: string): TdfDisplay[] {
  const selectedItems: TdfDisplay[] = [];
  const selectedOptions = $('select#' + itemSelector + ' option:selected');
  selectedOptions.each(function(index: number, option: HTMLOptionElement) {
    const selectedValue = option.value;
    const selectedDisplay = option.text;
    const selectedItem = {fileName: selectedValue, displayName: selectedDisplay};
    
    selectedItems.push(selectedItem);
  });

  return selectedItems;
}

function updateTdfsSelectedAndNotSelected(): void {
  const allTdfDisplays = (Session.get('allTdfFilenamesAndDisplayNames') || []) as TdfDisplay[];
  const tdfsNotSelected = allTdfDisplays.filter((x) => curCourseAssignment.tdfs.indexOf(x.fileName) == -1);
  
  const tdfsSelected = curCourseAssignment.tdfs.map((x) =>
    allTdfDisplays.find((tdfDisplay) =>
      tdfDisplay.fileName == x));
  
  Session.set('tdfsSelected', tdfsSelected);
  Session.set('tdfsNotSelected', tdfsNotSelected);
}




