import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import './tdfAssignmentEdit.html';
import './tdfAssignmentEdit.css';
import '../shared/adminUi/adminUi';
import { meteorCallAsync } from '../..';
import type {
  CourseAssignmentEditorSnapshot,
  SaveCourseAssignmentsInput,
} from '../../../common/courseAssignments.contracts';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { translatePlatformString } from '../../lib/interfaceI18n';
import {
  rejectLoad,
  resolveLoad,
  startLoad,
  type LoadableState,
} from '../../lib/adminUi/loadableState';
import { createTemplateLifetime, type TemplateLifetime } from '../../lib/adminUi/templateLifetime';
import {
  createAsyncCommandController,
  type AsyncCommandController,
  type AsyncCommandState,
} from '../../lib/adminUi/asyncCommandState';
import {
  assignmentToEditorRow,
  filterAssignableTdfs,
  orderedRows,
  rowsFromAssignmentSnapshot,
  validateAssignmentRows,
  type AssignableTdf,
  type AssignmentEditorRow,
} from './tdfAssignmentEditState';

type InstructorCourseOption = {
  _id: string;
  courseName?: string;
};

type AssignmentEditorSnapshotView = Readonly<{
  courseId: string;
  assignableTdfs: AssignableTdf[];
  rows: AssignmentEditorRow[];
  timezone: string;
}>;

type AssignmentEditorInstance = Blaze.TemplateInstance & {
  coursesPresentation: ReactiveVar<LoadableState<InstructorCourseOption[]>>;
  snapshotPresentation: ReactiveVar<LoadableState<AssignmentEditorSnapshotView>>;
  saveCommandState: ReactiveVar<AsyncCommandState<void>>;
  saveCommand: AsyncCommandController<void>;
  coursesLifetime: TemplateLifetime;
  snapshotLifetime: TemplateLifetime;
  nextCoursesRequestId: number;
  nextSnapshotRequestId: number;
  selectedCourseId: ReactiveVar<string>;
  assignmentRows: ReactiveVar<AssignmentEditorRow[]>;
  assignableTdfs: ReactiveVar<AssignableTdf[]>;
  assignmentSearch: ReactiveVar<string>;
  dirty: ReactiveVar<boolean>;
  editorError: ReactiveVar<string | null>;
  timezone: ReactiveVar<string>;
};

function assignmentText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readyLoadValue<T>(state: LoadableState<T>): T | null {
  return state.status === 'ready' || state.status === 'empty' || state.status === 'refreshing' || state.status === 'refresh-error'
    ? state.value
    : null;
}

function loadErrorMessage<T>(state: LoadableState<T>): string {
  return state.status === 'error' || state.status === 'refresh-error' ? state.message : '';
}

function loadPending<T>(state: LoadableState<T>): boolean {
  return state.status === 'idle' || state.status === 'loading' || state.status === 'refreshing';
}

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

function readRows(instance: AssignmentEditorInstance): AssignmentEditorRow[] {
  return instance.assignmentRows.get();
}

function writeRows(instance: AssignmentEditorInstance, rows: AssignmentEditorRow[], dirty = true): void {
  instance.assignmentRows.set(orderedRows(rows));
  instance.dirty.set(dirty);
}

function applySnapshot(instance: AssignmentEditorInstance, courseId: string, snapshot: CourseAssignmentEditorSnapshot): void {
  const rows = rowsFromAssignmentSnapshot(snapshot);
  instance.assignableTdfs.set(snapshot.assignableTdfs);
  instance.selectedCourseId.set(courseId);
  instance.timezone.set(snapshot.course.timezone);
  writeRows(instance, rows, false);
}

function loadCourseSnapshot(instance: AssignmentEditorInstance, courseId: string): void {
  if (!courseId) {
    instance.snapshotPresentation.set({ status: 'idle' });
    instance.assignableTdfs.set([]);
    writeRows(instance, [], false);
    return;
  }
  const requestId = ++instance.nextSnapshotRequestId;
  const generation = instance.snapshotLifetime.begin();
  instance.snapshotPresentation.set(startLoad(instance.snapshotPresentation.get(), requestId));
  instance.editorError.set(null);

  meteorCallAsync('getCourseAssignmentEditorSnapshot', courseId)
    .then((snapshot) => {
      if (!instance.snapshotLifetime.isCurrent(generation)) return;
      const typedSnapshot = snapshot as CourseAssignmentEditorSnapshot;
      const view = {
        courseId,
        assignableTdfs: typedSnapshot.assignableTdfs,
        rows: rowsFromAssignmentSnapshot(typedSnapshot),
        timezone: typedSnapshot.course.timezone,
      };
      instance.snapshotPresentation.set(resolveLoad(
        instance.snapshotPresentation.get(),
        requestId,
        view,
        () => false,
      ));
      applySnapshot(instance, courseId, typedSnapshot);
    })
    .catch((error) => {
      if (!instance.snapshotLifetime.isCurrent(generation)) return;
      instance.snapshotPresentation.set(rejectLoad(
        instance.snapshotPresentation.get(),
        requestId,
        { message: errorMessage(error), retryable: true },
      ));
      instance.editorError.set(errorMessage(error));
    });
}

function loadCourses(instance: AssignmentEditorInstance): void {
  const requestId = ++instance.nextCoursesRequestId;
  const generation = instance.coursesLifetime.begin();
  instance.coursesPresentation.set(startLoad(instance.coursesPresentation.get(), requestId));
  instance.editorError.set(null);
  instance.assignmentSearch.set('');

  meteorCallAsync('getAllCoursesForInstructor', Meteor.userId())
    .then((courses) => {
      if (!instance.coursesLifetime.isCurrent(generation)) return;
      const courseRows = Array.isArray(courses) ? courses as InstructorCourseOption[] : [];
      instance.coursesPresentation.set(resolveLoad(
        instance.coursesPresentation.get(),
        requestId,
        courseRows,
        (value) => value.length === 0,
      ));
      const previousCourseId = instance.selectedCourseId.get();
      const hasPrevious = Boolean(previousCourseId)
        && courseRows.some((course) => String(course._id) === previousCourseId);
      const nextCourseId = hasPrevious
        ? previousCourseId
        : String(courseRows[0]?._id || '');
      instance.selectedCourseId.set(nextCourseId);
      if (nextCourseId) {
        loadCourseSnapshot(instance, nextCourseId);
      } else {
        instance.snapshotPresentation.set({ status: 'empty', value: {
          courseId: '',
          assignableTdfs: [],
          rows: [],
          timezone: '',
        } });
        instance.assignableTdfs.set([]);
        writeRows(instance, [], false);
      }
    })
    .catch((error) => {
      if (!instance.coursesLifetime.isCurrent(generation)) return;
      instance.coursesPresentation.set(rejectLoad(
        instance.coursesPresentation.get(),
        requestId,
        { message: errorMessage(error), retryable: true },
      ));
      instance.editorError.set(errorMessage(error));
    });
}

function rowIndexFromEvent(event: Event): number {
  const row = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-assignment-index]');
  return Number(row?.dataset.assignmentIndex);
}

function setRowDate(instance: AssignmentEditorInstance, index: number, field: 'releaseAt' | 'dueAt', value: string | null): void {
  const rows = readRows(instance);
  const row = rows[index];
  if (!row) return;
  rows[index] = { ...row, [field]: value || null };
  writeRows(instance, rows);
}

Template.tdfAssignmentEdit.onCreated(function(this: AssignmentEditorInstance) {
  this.coursesPresentation = new ReactiveVar<LoadableState<InstructorCourseOption[]>>({ status: 'idle' });
  this.snapshotPresentation = new ReactiveVar<LoadableState<AssignmentEditorSnapshotView>>({ status: 'idle' });
  this.saveCommandState = new ReactiveVar<AsyncCommandState<void>>({ status: 'idle' });
  this.saveCommand = createAsyncCommandController((state) => this.saveCommandState.set(state));
  this.coursesLifetime = createTemplateLifetime();
  this.snapshotLifetime = createTemplateLifetime();
  this.nextCoursesRequestId = 0;
  this.nextSnapshotRequestId = 0;
  this.selectedCourseId = new ReactiveVar('');
  this.assignmentRows = new ReactiveVar<AssignmentEditorRow[]>([]);
  this.assignableTdfs = new ReactiveVar<AssignableTdf[]>([]);
  this.assignmentSearch = new ReactiveVar('');
  this.dirty = new ReactiveVar(false);
  this.editorError = new ReactiveVar<string | null>(null);
  this.timezone = new ReactiveVar('');
  loadCourses(this);
});

Template.tdfAssignmentEdit.onDestroyed(function(this: AssignmentEditorInstance) {
  this.coursesLifetime.destroy();
  this.snapshotLifetime.destroy();
  this.saveCommand.destroy();
});

Template.tdfAssignmentEdit.helpers({
  courses(): InstructorCourseOption[] {
    return readyLoadValue((Template.instance() as AssignmentEditorInstance).coursesPresentation.get()) || [];
  },
  selectedCourseAttrs(courseId: string) {
    return (Template.instance() as AssignmentEditorInstance).selectedCourseId.get() === String(courseId || '')
      ? { selected: true }
      : {};
  },
  assignmentRows(): AssignmentEditorRow[] {
    return readRows(Template.instance() as AssignmentEditorInstance);
  },
  hasAssignmentRows(): boolean {
    return readRows(Template.instance() as AssignmentEditorInstance).length > 0;
  },
  isLoading(): boolean {
    const instance = Template.instance() as AssignmentEditorInstance;
    return loadPending(instance.coursesPresentation.get()) || loadPending(instance.snapshotPresentation.get());
  },
  isDirty(): boolean {
    return (Template.instance() as AssignmentEditorInstance).dirty.get();
  },
  editorError(): string {
    const instance = Template.instance() as AssignmentEditorInstance;
    return instance.editorError.get()
      || loadErrorMessage(instance.coursesPresentation.get())
      || loadErrorMessage(instance.snapshotPresentation.get());
  },
  saveBusy(): boolean {
    return (Template.instance() as AssignmentEditorInstance).saveCommandState.get().status === 'pending';
  },
  editorBusy(): boolean {
    const instance = Template.instance() as AssignmentEditorInstance;
    return loadPending(instance.coursesPresentation.get())
      || loadPending(instance.snapshotPresentation.get())
      || instance.saveCommandState.get().status === 'pending';
  },
  assignmentText(key: Parameters<typeof translatePlatformString>[1]) {
    return assignmentText(key);
  },
  filteredAssignableTdfs(): AssignableTdf[] {
    const instance = Template.instance() as AssignmentEditorInstance;
    return filterAssignableTdfs(
      instance.assignableTdfs.get(),
      readRows(instance),
      instance.assignmentSearch.get(),
    );
  },
  releaseInputValue() {
    return toDatetimeLocalValue((this as AssignmentEditorRow).releaseAt, (Template.instance() as AssignmentEditorInstance).timezone.get());
  },
  dueInputValue() {
    return toDatetimeLocalValue((this as AssignmentEditorRow).dueAt, (Template.instance() as AssignmentEditorInstance).timezone.get());
  },
  isRequiredChecked() {
    return (this as AssignmentEditorRow).required ? 'checked' : '';
  },
  rowControlId(prefix: string) {
    const row = this as AssignmentEditorRow;
    const safeTdfId = String(row.TDFId || 'assignment').replace(/[^A-Za-z0-9_-]/g, '-');
    return `${prefix}-${safeTdfId}-${row.order}`;
  },
});

Template.tdfAssignmentEdit.events({
  'change #class-select'(event: Event, instance: AssignmentEditorInstance) {
    const courseId = String((event.currentTarget as HTMLSelectElement).value || '');
    instance.assignmentSearch.set('');
    instance.selectedCourseId.set(courseId);
    loadCourseSnapshot(instance, courseId);
  },

  'input #assignmentSearch'(event: Event, instance: AssignmentEditorInstance) {
    instance.assignmentSearch.set(String((event.currentTarget as HTMLInputElement).value || ''));
  },

  'click .add-assignment'(event: Event, instance: AssignmentEditorInstance) {
    const TDFId = String((event.currentTarget as HTMLElement).dataset.tdfid || '');
    const tdf = instance.assignableTdfs.get().find((item) => item.TDFId === TDFId);
    if (!tdf) return;
    const rows = readRows(instance);
    rows.push({
      assignmentId: '',
      courseId: instance.selectedCourseId.get(),
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
    writeRows(instance, rows);
  },

  'click .remove-assignment'(event: Event, instance: AssignmentEditorInstance) {
    const index = rowIndexFromEvent(event);
    writeRows(instance, readRows(instance).filter((_row, rowIndex) => rowIndex !== index));
  },

  'click .move-assignment-up'(event: Event, instance: AssignmentEditorInstance) {
    const index = rowIndexFromEvent(event);
    if (index <= 0) return;
    const rows = readRows(instance);
    if (!rows[index - 1] || !rows[index]) return;
    const current = rows[index]!;
    rows[index] = rows[index - 1]!;
    rows[index - 1] = current;
    writeRows(instance, rows);
  },

  'click .move-assignment-down'(event: Event, instance: AssignmentEditorInstance) {
    const index = rowIndexFromEvent(event);
    const rows = readRows(instance);
    if (index < 0 || index >= rows.length - 1) return;
    if (!rows[index] || !rows[index + 1]) return;
    const current = rows[index]!;
    rows[index] = rows[index + 1]!;
    rows[index + 1] = current;
    writeRows(instance, rows);
  },

  'change .assignment-required'(event: Event, instance: AssignmentEditorInstance) {
    const index = rowIndexFromEvent(event);
    const rows = readRows(instance);
    if (!rows[index]) return;
    rows[index] = { ...rows[index], required: Boolean((event.currentTarget as HTMLInputElement).checked) };
    writeRows(instance, rows);
  },

  'change .assignment-release'(event: Event, instance: AssignmentEditorInstance) {
    setRowDate(instance, rowIndexFromEvent(event), 'releaseAt', String((event.currentTarget as HTMLInputElement).value || '') || null);
  },

  'change .assignment-due'(event: Event, instance: AssignmentEditorInstance) {
    setRowDate(instance, rowIndexFromEvent(event), 'dueAt', String((event.currentTarget as HTMLInputElement).value || '') || null);
  },

  'click .clear-release'(event: Event, instance: AssignmentEditorInstance) {
    setRowDate(instance, rowIndexFromEvent(event), 'releaseAt', null);
  },

  'click .clear-due'(event: Event, instance: AssignmentEditorInstance) {
    setRowDate(instance, rowIndexFromEvent(event), 'dueAt', null);
  },

  'click #reloadAssignments'(_event: Event, instance: AssignmentEditorInstance) {
    loadCourseSnapshot(instance, instance.selectedCourseId.get());
  },

  'click #saveAssignment'(event: Event, instance: AssignmentEditorInstance) {
    event.preventDefault();
    const courseId = instance.selectedCourseId.get();
    if (!courseId) {
      instance.editorError.set(assignmentText('courseAssignments.pleaseSelectCourse'));
      return;
    }
    const rows = readRows(instance);
    const validationError = validateAssignmentRows(rows, (key, values) => assignmentText(key as Parameters<typeof translatePlatformString>[1], values as Parameters<typeof translatePlatformString>[2]));
    if (validationError) {
      instance.editorError.set(validationError);
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
    instance.editorError.set(null);
    void instance.saveCommand.run(async () => {
      const snapshot = await meteorCallAsync('saveCourseAssignments', payload) as CourseAssignmentEditorSnapshot;
      applySnapshot(instance, courseId, snapshot);
    }, {
      getErrorMessage: errorMessage,
      onFailure: (error) => {
        instance.editorError.set(errorMessage(error));
      },
    });
  },
});
