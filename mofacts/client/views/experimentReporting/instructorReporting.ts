import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import './instructorReporting.html';
import './instructorReporting.css';
import '../shared/adminUi/adminUi';
import { meteorCallAsync } from '../..';
import { INVALID } from '../../../common/Definitions';
import { parseCourseReportingDateTime, reportingTimestamp } from '../../../common/lib/courseReportingTime';
import { formatInterfaceDateTime } from '../../../common/lib/interfaceFormatting';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { translatePlatformString } from '../../lib/interfaceI18n';
import {
  rejectLoad,
  resolveLoad,
  startLoad,
  type LoadableState,
} from '../../lib/adminUi/loadableState';
import { createTemplateLifetime, type TemplateLifetime } from '../../lib/adminUi/templateLifetime';
import type { AsyncCommandState } from '../../lib/adminUi/asyncCommandState';
import {
  createScopedAsyncCommandRegistry,
  type ScopedAsyncCommandRegistry,
} from '../../lib/adminUi/scopedAsyncCommandRegistry';
import {
  findAssignmentForTdf,
  getCourseAssignments,
  getReportingTotals,
  mergeReportingRows,
  normalizePerformanceReport,
  rowsHaveData,
  type ReportingAssignment,
  type ReportingAssignmentsByCourseId,
  type ReportingCourse,
  type ReportingPerformanceReport,
  type ReportingPerformanceRow,
} from './instructorReportingState';

type ReportingCommandResult = Readonly<{ message: string }>;
type ReportingCommandStates = Record<string, AsyncCommandState<ReportingCommandResult>>;

type InstructorReportingInitialData = Readonly<{
  courses: ReportingCourse[];
  assignmentsByCourseId: ReportingAssignmentsByCourseId;
}>;

type InstructorReportingInstance = Blaze.TemplateInstance & {
  initialPresentation: ReactiveVar<LoadableState<InstructorReportingInitialData>>;
  performancePresentation: ReactiveVar<LoadableState<ReportingPerformanceReport>>;
  commandStates: ReactiveVar<ReportingCommandStates>;
  commandRegistry: ScopedAsyncCommandRegistry<ReportingCommandResult>;
  initialLifetime: TemplateLifetime;
  performanceLifetime: TemplateLifetime;
  nextInitialRequestId: number;
  nextPerformanceRequestId: number;
  selectedCourseId: ReactiveVar<string>;
  selectedTdfId: ReactiveVar<string>;
  selectedAssignmentId: ReactiveVar<string | null>;
  deadlineDate: ReactiveVar<string>;
  customCutoff: ReactiveVar<number | null>;
  deadlineDateError: ReactiveVar<string>;
  exceptionDate: ReactiveVar<string>;
  dueDateFilter: ReactiveVar<boolean>;
  exceptionDateError: ReactiveVar<string>;
  exceptionDateValidationUserId: ReactiveVar<string>;
};

function reportingText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function errorMessage(error: unknown): string {
  const meteorError = error as { reason?: string; message?: string } | null;
  return meteorError?.reason || meteorError?.message || String(error);
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

function loadBusy<T>(state: LoadableState<T>): boolean {
  return state.status === 'loading' || state.status === 'refreshing';
}

function performanceLoadError(instance: InstructorReportingInstance): string {
  return loadErrorMessage(instance.performancePresentation.get());
}

function reportingActionLabel(key: Parameters<typeof translatePlatformString>[1], row: ReportingPerformanceRow): string {
  const action = reportingText(key);
  const target = String(row?.username || '').trim();
  return target ? `${action}: ${target}` : action;
}

function getInitialData(instance: InstructorReportingInstance): InstructorReportingInitialData {
  return readyLoadValue(instance.initialPresentation.get()) || {
    courses: [],
    assignmentsByCourseId: {},
  };
}

function getPerformanceReport(instance: InstructorReportingInstance): ReportingPerformanceReport | null {
  return readyLoadValue(instance.performancePresentation.get());
}

function formatReportDate(timestamp: number | null, timezone: string): string {
  if (timestamp === null) return '';
  return formatInterfaceDateTime(getActiveUiLocale(), timestamp, {
    timeZone: timezone, timeZoneName: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', ...(timestamp % 60000 !== 0 ? { second: '2-digit' } : {}),
    ...(timestamp % 1000 !== 0 ? { fractionalSecondDigits: 3 } : {}),
  });
}

function exceptionScope(userId: string): string {
  return `reporting:exception:${userId}`;
}

function navigationScope(userId: string): string {
  return `reporting:navigate:${userId}`;
}

function commandPresentation(
  state: AsyncCommandState<ReportingCommandResult> | undefined,
  id: string,
): { id: string; text: string; variant: 'info' | 'success' | 'error'; urgent: boolean } | null {
  if (!state || state.status === 'idle') return null;
  if (state.status === 'pending') {
    return { id, text: reportingText('common.loading'), variant: 'info', urgent: false };
  }
  if (state.status === 'success') {
    return { id, text: state.result.message, variant: 'success', urgent: false };
  }
  return { id, text: state.message, variant: 'error', urgent: true };
}

async function loadInitialReportingData(instance: InstructorReportingInstance): Promise<void> {
  const requestId = ++instance.nextInitialRequestId;
  const generation = instance.initialLifetime.begin();
  instance.initialPresentation.set(startLoad(instance.initialPresentation.get(), requestId));
  instance.performancePresentation.set({ status: 'idle' });

  try {
    const [assignmentsByCourseId, courses] = await Promise.all([
      meteorCallAsync('getTdfAssignmentsByCourseIdMap', Meteor.userId()),
      meteorCallAsync('getAllCoursesForInstructor', Meteor.userId()),
    ]);
    if (!instance.initialLifetime.isCurrent(generation)) return;

    const value = {
      courses: Array.isArray(courses) ? courses as ReportingCourse[] : [],
      assignmentsByCourseId: (assignmentsByCourseId || {}) as ReportingAssignmentsByCourseId,
    };
    instance.initialPresentation.set(resolveLoad(
      instance.initialPresentation.get(),
      requestId,
      value,
      (data) => data.courses.length === 0,
    ));
  } catch (error: unknown) {
    if (!instance.initialLifetime.isCurrent(generation)) return;
    const message = errorMessage(error);
    instance.initialPresentation.set(rejectLoad(
      instance.initialPresentation.get(),
      requestId,
      { message, retryable: true },
    ));
  }
}

function resetReportFilters(instance: InstructorReportingInstance): void {
  instance.deadlineDate.set('');
  instance.customCutoff.set(null);
  instance.deadlineDateError.set('');
  instance.exceptionDate.set('');
  instance.exceptionDateError.set('');
  instance.exceptionDateValidationUserId.set('');
  instance.dueDateFilter.set(false);
  instance.performancePresentation.set({ status: 'idle' });
}

function selectClass(instance: InstructorReportingInstance, courseId: string): void {
  instance.selectedCourseId.set(courseId);
  instance.selectedTdfId.set(String(INVALID));
  instance.selectedAssignmentId.set(null);
  resetReportFilters(instance);
}

function selectTdf(instance: InstructorReportingInstance, tdfId: string): void {
  const data = getInitialData(instance);
  const courseId = instance.selectedCourseId.get();
  const assignment = findAssignmentForTdf(data.assignmentsByCourseId, courseId, tdfId);
  instance.selectedTdfId.set(tdfId);
  instance.selectedAssignmentId.set(assignment?.assignmentId || null);
  resetReportFilters(instance);
}

function reloadPerformance(instance: InstructorReportingInstance): void {
  const courseId = instance.selectedCourseId.get();
  const tdfId = instance.selectedTdfId.get();
  if (!courseId || !tdfId || tdfId === String(INVALID)) {
    instance.performancePresentation.set({ status: 'idle' });
    return;
  }

  const requestId = ++instance.nextPerformanceRequestId;
  const generation = instance.performanceLifetime.begin();
  instance.performancePresentation.set(startLoad(instance.performancePresentation.get(), requestId));

  const date = instance.dueDateFilter.get() ? instance.customCutoff.get() : null;
  meteorCallAsync('getClassPerformanceByTDF', courseId, tdfId, date ?? false)
    .then((result) => {
      if (!instance.performanceLifetime.isCurrent(generation)) return;
      const report = normalizePerformanceReport(result);
      const state = resolveLoad(
        instance.performancePresentation.get(),
        requestId,
        report,
        (value) => value.met.length === 0 && value.notMet.length === 0,
      );
      instance.performancePresentation.set(state);
      if (report.timing.cutoffAt === null) instance.dueDateFilter.set(false);
    })
    .catch((error) => {
      if (!instance.performanceLifetime.isCurrent(generation)) return;
      const message = errorMessage(error);
      instance.performancePresentation.set(rejectLoad(
        instance.performancePresentation.get(),
        requestId,
        { message, retryable: true },
      ));
    });
}

function runExceptionCommand(
  instance: InstructorReportingInstance,
  userId: string,
  work: () => Promise<void>,
  successMessage: string,
): void {
  void instance.commandRegistry.run(exceptionScope(userId), async () => {
    await work();
    return { message: successMessage };
  }, {
    getErrorMessage: (error) => errorMessage(error),
    onSuccess: () => {
      reloadPerformance(instance);
    },
  });
}

Template.instructorReporting.onCreated(function(this: InstructorReportingInstance) {
  this.initialPresentation = new ReactiveVar<LoadableState<InstructorReportingInitialData>>({ status: 'idle' });
  this.performancePresentation = new ReactiveVar<LoadableState<ReportingPerformanceReport>>({ status: 'idle' });
  this.commandStates = new ReactiveVar<ReportingCommandStates>({});
  this.commandRegistry = createScopedAsyncCommandRegistry<ReportingCommandResult>((scope, state) => {
    this.commandStates.set({ ...this.commandStates.get(), [scope]: state });
  });
  this.initialLifetime = createTemplateLifetime();
  this.performanceLifetime = createTemplateLifetime();
  this.nextInitialRequestId = 0;
  this.nextPerformanceRequestId = 0;
  this.selectedCourseId = new ReactiveVar('');
  this.selectedTdfId = new ReactiveVar(String(INVALID));
  this.selectedAssignmentId = new ReactiveVar<string | null>(null);
  this.deadlineDate = new ReactiveVar('');
  this.customCutoff = new ReactiveVar<number | null>(null);
  this.deadlineDateError = new ReactiveVar('');
  this.exceptionDate = new ReactiveVar('');
  this.dueDateFilter = new ReactiveVar(false);
  this.exceptionDateError = new ReactiveVar('');
  this.exceptionDateValidationUserId = new ReactiveVar('');
  void loadInitialReportingData(this);
});

Template.instructorReporting.onDestroyed(function(this: InstructorReportingInstance) {
  this.initialLifetime.destroy();
  this.performanceLifetime.destroy();
  this.commandRegistry.destroy();
});

Template.instructorReporting.helpers({
  INVALID: INVALID,
  classes(): ReportingCourse[] {
    return getInitialData(Template.instance() as InstructorReportingInstance).courses;
  },
  selectedClassAttrs(courseId: string) {
    return (Template.instance() as InstructorReportingInstance).selectedCourseId.get() === String(courseId || '')
      ? { selected: true }
      : {};
  },
  curInstructorReportingTdfs(): ReportingAssignment[] {
    const instance = Template.instance() as InstructorReportingInstance;
    return getCourseAssignments(getInitialData(instance).assignmentsByCourseId, instance.selectedCourseId.get());
  },
  selectedTdfAttrs(tdfId: string) {
    return (Template.instance() as InstructorReportingInstance).selectedTdfId.get() === String(tdfId || '')
      ? { selected: true }
      : {};
  },
  initialLoading(): boolean {
    return loadPending((Template.instance() as InstructorReportingInstance).initialPresentation.get());
  },
  initialLoadError(): string {
    return loadErrorMessage((Template.instance() as InstructorReportingInstance).initialPresentation.get());
  },
  performanceLoading(): boolean {
    return loadBusy((Template.instance() as InstructorReportingInstance).performancePresentation.get());
  },
  loadError(): string {
    const instance = Template.instance() as InstructorReportingInstance;
    return loadErrorMessage(instance.initialPresentation.get())
      || loadErrorMessage(instance.performancePresentation.get());
  },
  reportingText(key: Parameters<typeof translatePlatformString>[1], options?: { hash?: Parameters<typeof translatePlatformString>[2] }) {
    return reportingText(key, options?.hash);
  },
  classReportingTableLabel(): string {
    return reportingText('reporting.classData');
  },
  classReportingTableData() {
    const instance = Template.instance() as InstructorReportingInstance;
    const report = getPerformanceReport(instance);
    const dueDateFilter = instance.dueDateFilter.get();
    const allRows = report ? [...report.met, ...report.notMet] : [];
    const metRows = dueDateFilter ? report?.met ?? [] : mergeReportingRows(allRows);
    const notMetRows = dueDateFilter ? report?.notMet ?? [] : [];
    return {
      metRows,
      notMetRows,
      hasMetRows: rowsHaveData(metRows),
      hasNotMetRows: rowsHaveData(notMetRows),
      totals: getReportingTotals(allRows),
      dueDateFilter,
      reportTimezone: report?.timing.timezone,
      performanceLoading: loadBusy(instance.performancePresentation.get()),
      loadError: performanceLoadError(instance),
      commandStates: instance.commandStates.get(),
      exceptionDateError: instance.exceptionDateError.get(),
      exceptionDateValidationUserId: instance.exceptionDateValidationUserId.get(),
    };
  },
  reportingTiming() {
    return getPerformanceReport(Template.instance() as InstructorReportingInstance)?.timing;
  },
  formattedCutoff(): string {
    const instance = Template.instance() as InstructorReportingInstance;
    const timing = getPerformanceReport(instance)?.timing;
    if (!timing) return '';
    return formatReportDate(instance.dueDateFilter.get() ? timing.cutoffAt : timing.assignmentDueAt, timing.timezone);
  },
  deadlineDateValue(): string {
    return (Template.instance() as InstructorReportingInstance).deadlineDate.get();
  },
  exceptionDateValue(): string {
    return (Template.instance() as InstructorReportingInstance).exceptionDate.get();
  },
  dueDateFilter(): boolean {
    return (Template.instance() as InstructorReportingInstance).dueDateFilter.get();
  },
  dueDateFilterChecked(): string | null {
    return (Template.instance() as InstructorReportingInstance).dueDateFilter.get() ? 'checked' : null;
  },
  tdfSelectDisabled(): boolean {
    const instance = Template.instance() as InstructorReportingInstance;
    return loadPending(instance.initialPresentation.get()) || !instance.selectedCourseId.get();
  },
  deadlineDisabled(): boolean {
    return loadBusy((Template.instance() as InstructorReportingInstance).performancePresentation.get());
  },
  deadlineFilterDisabled(): boolean {
    const instance = Template.instance() as InstructorReportingInstance;
    const report = getPerformanceReport(instance);
    return loadBusy(instance.performancePresentation.get())
      || (report?.timing.assignmentDueAt == null && instance.customCutoff.get() === null);
  },
  deadlineDateError(): string {
    return (Template.instance() as InstructorReportingInstance).deadlineDateError.get();
  },
  deadlineDateAttrs() {
    return (Template.instance() as InstructorReportingInstance).deadlineDateError.get()
      ? { 'aria-invalid': 'true', 'aria-describedby': 'reporting-deadline-date-error' }
      : { 'aria-invalid': 'false' };
  },
  exceptionDateError(): string {
    return (Template.instance() as InstructorReportingInstance).exceptionDateError.get();
  },
  exceptionDateAttrs() {
    return (Template.instance() as InstructorReportingInstance).exceptionDateError.get()
      ? { 'aria-invalid': 'true', 'aria-describedby': 'reporting-exception-date-error' }
      : { 'aria-invalid': 'false' };
  },
  exceptionBusy(): boolean {
    return Object.values((Template.instance() as InstructorReportingInstance).commandStates.get())
      .some((state) => state.status === 'pending');
  },
});

Template.instructorReportingClassTable.helpers({
  reportingText(key: Parameters<typeof translatePlatformString>[1], options?: { hash?: Parameters<typeof translatePlatformString>[2] }) {
    return reportingText(key, options?.hash);
  },
});

Template.instructorReportingStudentRow.helpers({
  reportingText(key: Parameters<typeof translatePlatformString>[1], options?: { hash?: Parameters<typeof translatePlatformString>[2] }) {
    return reportingText(key, options?.hash);
  },
  exceptionActionLabel(key: Parameters<typeof translatePlatformString>[1], row: ReportingPerformanceRow): string {
    return reportingActionLabel(key, row);
  },
  formattedException(value: string, timezone: string): string {
    return formatReportDate(reportingTimestamp(value), timezone);
  },
  rowCommandFeedback(userId: string) {
    const states = Template.instance().data?.commandStates as ReportingCommandStates | undefined;
    return commandPresentation(
      states?.[exceptionScope(userId)] ?? states?.[navigationScope(userId)],
      `reporting-row-feedback-${userId}`,
    );
  },
  hasRowCommandFeedback(userId: string): boolean {
    const states = Template.instance().data?.commandStates as ReportingCommandStates | undefined;
    return Boolean(commandPresentation(
      states?.[exceptionScope(userId)] ?? states?.[navigationScope(userId)],
      `reporting-row-feedback-${userId}`,
    ));
  },
  rowActionAttrs(userId: string) {
    const states = Template.instance().data?.commandStates as ReportingCommandStates | undefined;
    const state = states?.[exceptionScope(userId)] ?? states?.[navigationScope(userId)];
    const describesDateError = Template.instance().data?.exceptionDateError
      && Template.instance().data?.exceptionDateValidationUserId === userId;
    return {
      ...(state?.status === 'pending' ? { disabled: true } : {}),
      'aria-busy': state?.status === 'pending' ? 'true' : 'false',
      ...(state && state.status !== 'idle' ? { 'aria-describedby': `reporting-row-feedback-${userId}` } : {}),
      ...(!state || state.status === 'idle'
        ? (describesDateError ? { 'aria-describedby': 'reporting-exception-date-error' } : {})
        : {}),
    };
  },
});

Template.instructorReporting.events({
  'change #class-select'(event: Event, instance: InstructorReportingInstance) {
    const courseId = String((event.currentTarget as HTMLSelectElement).value || '');
    selectClass(instance, courseId);
  },

  'change #tdf-select'(event: Event, instance: InstructorReportingInstance) {
    const tdfId = String((event.currentTarget as HTMLSelectElement).value || '');
    selectTdf(instance, tdfId);
    reloadPerformance(instance);
  },

  'change #practice-deadline-date'(event: Event, instance: InstructorReportingInstance) {
    const timing = getPerformanceReport(instance)?.timing;
    if (!timing) return;
    const input = event.currentTarget as HTMLInputElement;
    const date = input.value;
    instance.deadlineDate.set(date);
    const cutoff = date ? parseCourseReportingDateTime(date, timing.timezone) : null;
    if (input.validity.badInput || (date && cutoff === null)) {
      instance.deadlineDateError.set(reportingText('reporting.invalidCutoff'));
      return;
    }
    instance.deadlineDateError.set('');
    instance.customCutoff.set(cutoff);
    instance.dueDateFilter.set(cutoff !== null || (instance.dueDateFilter.get() && timing.assignmentDueAt !== null));
    reloadPerformance(instance);
  },

  'change #exception-date'(event: Event, instance: InstructorReportingInstance) {
    instance.exceptionDate.set(String((event.currentTarget as HTMLInputElement).value || ''));
    instance.exceptionDateError.set('');
    instance.exceptionDateValidationUserId.set('');
  },

  'change #due-date-filter'(event: Event, instance: InstructorReportingInstance) {
    const checked = Boolean((event.currentTarget as HTMLInputElement).checked);
    instance.dueDateFilter.set(checked);
    reloadPerformance(instance);
  },

  'click #retry-instructor-performance'(_event: Event, instance: InstructorReportingInstance) {
    reloadPerformance(instance);
  },

  'click .instructor-reporting-student-link'(event: Event, instance: InstructorReportingInstance) {
    event.preventDefault();
    const username = String((event.currentTarget as HTMLElement).dataset.username || '');
    const navigateToStudentReporting = (globalThis as any).navigateToStudentReporting;
    const userId = String((event.currentTarget as HTMLElement).dataset.userid || username);
    void instance.commandRegistry.run(navigationScope(userId), async () => {
      navigateToStudentReporting(username);
      return { message: '' };
    }, { getErrorMessage: (error) => errorMessage(error) });
  },

  'click .add-exception'(event: Event, instance: InstructorReportingInstance) {
    event.preventDefault();
    const userId = String((event.currentTarget as HTMLElement).dataset.userid || '');
    const timing = getPerformanceReport(instance)?.timing;
    const dateInt = timing ? parseCourseReportingDateTime(instance.exceptionDate.get(), timing.timezone) : null;
    if (dateInt === null) {
      instance.exceptionDateError.set(reportingText('reporting.invalidCutoff'));
      instance.exceptionDateValidationUserId.set(userId);
      document.getElementById('exception-date')?.focus();
      return;
    }
    instance.exceptionDateError.set('');
    instance.exceptionDateValidationUserId.set('');
    const courseId = instance.selectedCourseId.get();
    const tdfId = instance.selectedTdfId.get();
    const assignmentId = instance.selectedAssignmentId.get() || undefined;
    runExceptionCommand(
      instance,
      userId,
      async () => {
        await meteorCallAsync('addUserDueDateException', userId, tdfId, courseId, dateInt, assignmentId);
      },
      reportingText('reporting.exceptionAdded'),
    );
  },

  'click .remove-exception'(event: Event, instance: InstructorReportingInstance) {
    event.preventDefault();
    const userId = String((event.currentTarget as HTMLElement).dataset.userid || '');
    const courseId = instance.selectedCourseId.get();
    const tdfId = instance.selectedTdfId.get();
    const assignmentId = instance.selectedAssignmentId.get() || undefined;
    runExceptionCommand(
      instance,
      userId,
      async () => {
        await meteorCallAsync('removeUserDueDateException', userId, tdfId, courseId, assignmentId);
      },
      reportingText('reporting.exceptionRemoved'),
    );
  },
});
