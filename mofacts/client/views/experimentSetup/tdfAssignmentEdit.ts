import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './tdfAssignmentEdit.html';
import './tdfAssignmentEdit.css';
import { meteorCallAsync } from '../..';
import type {
  CourseAssignmentEditorSnapshot,
  CourseAssignmentSummary,
  SaveCourseAssignmentsInput,
} from '../../../common/courseAssignments.contracts';
declare const $: any;

type AssignableTdf = CourseAssignmentEditorSnapshot['assignableTdfs'][number];
type AssignmentEditorRow = CourseAssignmentSummary & {
  fileName: string;
  tags: string[];
};
type InstructorCourseOption = {
  _id: string;
};

Session.set('courses', []);
Session.set('courseAssignmentRows', []);
Session.set('courseAssignableTdfs', []);
Session.set('courseAssignmentSearch', '');
Session.set('courseAssignmentLoading', false);
Session.set('courseAssignmentDirty', false);
Session.set('courseAssignmentError', null);
Session.set('courseAssignmentSelectedCourseId', '');
Session.set('courseAssignmentTimezone', '');

let activeSnapshotRequestId = 0;

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

function readRows(): AssignmentEditorRow[] {
  return (Session.get('courseAssignmentRows') || []) as AssignmentEditorRow[];
}

function writeRows(rows: AssignmentEditorRow[], dirty = true) {
  Session.set('courseAssignmentRows', rows.map((row, order) => ({ ...row, order })));
  Session.set('courseAssignmentDirty', dirty);
}

function assignmentToRow(assignment: CourseAssignmentSummary, tdf: AssignableTdf | undefined): AssignmentEditorRow {
  return {
    ...assignment,
    fileName: tdf?.fileName || '',
    tags: tdf?.tags || [],
    releaseAt: assignment.releaseAt ? new Date(assignment.releaseAt) : null,
    dueAt: assignment.dueAt ? new Date(assignment.dueAt) : null,
  };
}

async function loadCourseSnapshot(courseId: string) {
  if (!courseId) return;
  const requestId = ++activeSnapshotRequestId;
  Session.set('courseAssignmentLoading', true);
  Session.set('courseAssignmentError', null);
  try {
    const snapshot = await meteorCallAsync('getCourseAssignmentEditorSnapshot', courseId) as CourseAssignmentEditorSnapshot;

    if (requestId !== activeSnapshotRequestId) {
      return;
    }

    const tdfById = new Map(snapshot.assignableTdfs.map((tdf) => [tdf.TDFId, tdf]));
    Session.set('courseAssignableTdfs', snapshot.assignableTdfs);
    Session.set('courseAssignmentSelectedCourseId', courseId);
    Session.set('courseAssignmentTimezone', snapshot.course.timezone);
    writeRows(snapshot.assignments.map((assignment) => assignmentToRow(assignment, tdfById.get(assignment.TDFId))), false);
  } catch (error: any) {
    Session.set('courseAssignmentError', error?.reason || error?.message || String(error));
  } finally {
    Session.set('courseAssignmentLoading', false);
  }
}

Template.tdfAssignmentEdit.onCreated(function(this: any) {
  const instance = this;
  instance.courseSelectionAutorun = instance.autorun(() => {
    const selectedCourseId = String(Session.get('courseAssignmentSelectedCourseId') || '');
    if (!selectedCourseId) return;
    void loadCourseSnapshot(selectedCourseId);
  });
});

function rowIndexFromEvent(event: Event) {
  return Number($(event.currentTarget).closest('[data-assignment-index]').data('assignment-index'));
}

function setRowDate(index: number, field: 'releaseAt' | 'dueAt', value: string | null) {
  const rows = readRows();
  const row = rows[index];
  if (!row) return;
  rows[index] = { ...row, [field]: value || null };
  writeRows(rows);
}

function validateRows(rows: AssignmentEditorRow[]) {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.TDFId)) {
      return `Duplicate lesson selected: ${row.title}`;
    }
    seen.add(row.TDFId);
    const releaseTime = row.releaseAt ? new Date(row.releaseAt).getTime() : null;
    const dueTime = row.dueAt ? new Date(row.dueAt).getTime() : null;
    if (releaseTime !== null && !Number.isFinite(releaseTime)) return `Invalid visible date for ${row.title}`;
    if (dueTime !== null && !Number.isFinite(dueTime)) return `Invalid due date for ${row.title}`;
    if (releaseTime !== null && dueTime !== null && dueTime < releaseTime) {
      return `Due date must be after visible date for ${row.title}`;
    }
  }
  return null;
}

Template.tdfAssignmentEdit.onRendered(async function() {
  Session.set('courseAssignmentError', null);
  Session.set('courseAssignmentRows', []);
  Session.set('courseAssignableTdfs', []);
  Session.set('courseAssignmentSearch', '');
  Session.set('courseAssignmentLoading', true);
  try {
    const courses = await meteorCallAsync('getAllCoursesForInstructor', Meteor.userId()) as InstructorCourseOption[];
    Session.set('courses', courses);

    const previousCourseId = String(Session.get('courseAssignmentSelectedCourseId') || '');
    const hasPrevious = !!previousCourseId && (courses || []).some((course: any) => String(course._id) === previousCourseId);
    const nextCourseId = hasPrevious
      ? previousCourseId
      : String((courses && courses[0] && courses[0]._id) || '');

    if (nextCourseId !== previousCourseId) {
      Session.set('courseAssignmentSelectedCourseId', nextCourseId);
    }

    if (!nextCourseId) {
      writeRows([], false);
      Session.set('courseAssignmentLoading', false);
    }
  } catch (error: any) {
    Session.set('courseAssignmentError', error?.reason || error?.message || String(error));
  } finally {
    Session.set('courseAssignmentLoading', false);
  }
});

Template.tdfAssignmentEdit.onDestroyed(function(this: any) {
  const instance = this;
  instance.courseSelectionAutorun?.stop();
});

Template.tdfAssignmentEdit.helpers({
  courses: () => Session.get('courses'),
  selectedCourseAttrs: (courseId: string) =>
    String(Session.get('courseAssignmentSelectedCourseId') || '') === String(courseId || '') ? { selected: true } : {},
  assignmentRows: () => readRows(),
  hasAssignmentRows: () => readRows().length > 0,
  isLoading: () => Session.get('courseAssignmentLoading'),
  isDirty: () => Session.get('courseAssignmentDirty'),
  editorError: () => Session.get('courseAssignmentError'),
  filteredAssignableTdfs: () => {
    const query = String(Session.get('courseAssignmentSearch') || '').toLowerCase();
    const selected = new Set(readRows().map((row) => row.TDFId));
    return ((Session.get('courseAssignableTdfs') || []) as AssignableTdf[])
      .filter((tdf) => !selected.has(tdf.TDFId))
      .filter((tdf) => {
        const haystack = `${tdf.displayName} ${tdf.fileName} ${(tdf.tags || []).join(' ')}`.toLowerCase();
        return !query || haystack.includes(query);
      });
  },
  releaseInputValue() {
    return toDatetimeLocalValue((this as AssignmentEditorRow).releaseAt, String(Session.get('courseAssignmentTimezone') || ''));
  },
  dueInputValue() {
    return toDatetimeLocalValue((this as AssignmentEditorRow).dueAt, String(Session.get('courseAssignmentTimezone') || ''));
  },
  isRequiredChecked() {
    return (this as AssignmentEditorRow).required ? 'checked' : '';
  },
});

Template.tdfAssignmentEdit.events({
  'change #class-select': function(event: Event) {
    const courseId = String($(event.currentTarget).val() || '');
    Session.set('courseAssignmentSearch', '');
    Session.set('courseAssignmentSelectedCourseId', courseId);
  },

  'input #assignmentSearch': function(event: Event) {
    Session.set('courseAssignmentSearch', String((event.currentTarget as HTMLInputElement).value || ''));
  },

  'click .add-assignment': function(event: Event) {
    const TDFId = String($(event.currentTarget).data('tdfid') || '');
    const tdf = ((Session.get('courseAssignableTdfs') || []) as AssignableTdf[]).find((item) => item.TDFId === TDFId);
    if (!tdf) return;
    const rows = readRows();
    rows.push({
      assignmentId: '',
      courseId: String(Session.get('courseAssignmentSelectedCourseId') || ''),
      TDFId,
      title: tdf.displayName,
      fileName: tdf.fileName,
      tags: tdf.tags || [],
      order: rows.length,
      releaseAt: null,
      dueAt: null,
      required: true,
      availability: 'available',
      createdAt: null,
      updatedAt: null,
    });
    writeRows(rows);
  },

  'click .remove-assignment': function(event: Event) {
    const index = rowIndexFromEvent(event);
    writeRows(readRows().filter((_row, rowIndex) => rowIndex !== index));
  },

  'click .move-assignment-up': function(event: Event) {
    const index = rowIndexFromEvent(event);
    if (index <= 0) return;
    const rows = readRows();
    if (!rows[index - 1] || !rows[index]) return;
    const current = rows[index]!;
    rows[index] = rows[index - 1]!;
    rows[index - 1] = current;
    writeRows(rows);
  },

  'click .move-assignment-down': function(event: Event) {
    const index = rowIndexFromEvent(event);
    const rows = readRows();
    if (index < 0 || index >= rows.length - 1) return;
    if (!rows[index] || !rows[index + 1]) return;
    const current = rows[index]!;
    rows[index] = rows[index + 1]!;
    rows[index + 1] = current;
    writeRows(rows);
  },

  'change .assignment-required': function(event: Event) {
    const index = rowIndexFromEvent(event);
    const rows = readRows();
    if (!rows[index]) return;
    rows[index] = { ...rows[index], required: Boolean((event.currentTarget as HTMLInputElement).checked) };
    writeRows(rows);
  },

  'change .assignment-release': function(event: Event) {
    setRowDate(rowIndexFromEvent(event), 'releaseAt', String((event.currentTarget as HTMLInputElement).value || '') || null);
  },

  'change .assignment-due': function(event: Event) {
    setRowDate(rowIndexFromEvent(event), 'dueAt', String((event.currentTarget as HTMLInputElement).value || '') || null);
  },

  'click .clear-release': function(event: Event) {
    setRowDate(rowIndexFromEvent(event), 'releaseAt', null);
  },

  'click .clear-due': function(event: Event) {
    setRowDate(rowIndexFromEvent(event), 'dueAt', null);
  },

  'click #reloadAssignments': function() {
    void loadCourseSnapshot(String(Session.get('courseAssignmentSelectedCourseId') || ''));
  },

  'click #saveAssignment': async function() {
    const courseId = String(Session.get('courseAssignmentSelectedCourseId') || '');
    if (!courseId) {
      Session.set('courseAssignmentError', 'Please select a course.');
      return;
    }
    const rows = readRows();
    const validationError = validateRows(rows);
    if (validationError) {
      Session.set('courseAssignmentError', validationError);
      return;
    }
    const payload: SaveCourseAssignmentsInput = {
      courseId,
      assignments: rows.map((row, order) => ({
        ...(row.assignmentId ? { assignmentId: row.assignmentId } : {}),
        TDFId: row.TDFId,
        order,
        releaseAt: row.releaseAt ? String(row.releaseAt) : null,
        dueAt: row.dueAt ? String(row.dueAt) : null,
        required: row.required,
      })),
    };
    Session.set('courseAssignmentLoading', true);
    Session.set('courseAssignmentError', null);
    try {
      const snapshot = await meteorCallAsync('saveCourseAssignments', payload) as CourseAssignmentEditorSnapshot;
      const tdfById = new Map(snapshot.assignableTdfs.map((tdf) => [tdf.TDFId, tdf]));
      Session.set('courseAssignableTdfs', snapshot.assignableTdfs);
      Session.set('courseAssignmentTimezone', snapshot.course.timezone);
      writeRows(snapshot.assignments.map((assignment) => assignmentToRow(assignment, tdfById.get(assignment.TDFId))), false);
    } catch (error: any) {
      Session.set('courseAssignmentError', error?.reason || error?.message || String(error));
    } finally {
      Session.set('courseAssignmentLoading', false);
    }
  },
});
