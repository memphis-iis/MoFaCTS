import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Tracker } from 'meteor/tracker';
import './classEdit.html';
import './classEdit.css';
import '../shared/adminUi/adminUi';
import { meteorCallAsync } from '../..';
import { curSemester } from '../../../common/Definitions';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { getErrorMessage } from '../../lib/errorUtils';
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
  createInlineConfirmationController,
  type InlineConfirmationController,
  type InlineConfirmationView,
} from '../../lib/adminUi/inlineConfirmationController';
import {
  buildCourseManagementData,
  coursePayloadFromDraft,
  defaultCourseDraft,
  normalizeSectionNames,
  sectionNamesText,
  toDatetimeLocalValue,
  type CourseManagementData,
  type CourseSection,
  type CourseVisibility,
  type EditableCourse,
} from './classEditState';

type ClassEditMessage = Readonly<{
  level: 'info' | 'success' | 'warning' | 'error';
  text: string;
}>;

type ClassEditConfirmation = Readonly<{
  courseId: string;
  title: string;
  message: string;
}>;

type TimezoneOption = Readonly<{
  value: string;
  label?: string;
  labelKey?: Parameters<typeof translatePlatformString>[1];
}>;

type ClassEditInstance = Blaze.TemplateInstance & {
  coursesPresentation: ReactiveVar<LoadableState<CourseManagementData>>;
  saveCommandState: ReactiveVar<AsyncCommandState<string>>;
  deleteCommandState: ReactiveVar<AsyncCommandState<void>>;
  saveCommand: AsyncCommandController<string>;
  deleteCommand: AsyncCommandController<void>;
  lifetime: TemplateLifetime;
  nextRequestId: number;
  selectedCourseId: ReactiveVar<string>;
  draftCourse: ReactiveVar<EditableCourse>;
  message: ReactiveVar<ClassEditMessage | null>;
  confirmation: ReactiveVar<InlineConfirmationView>;
  confirmationController: InlineConfirmationController<ClassEditConfirmation>;
};

const COURSE_TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'America/New_York', labelKey: 'courseManagement.easternTime' },
  { value: 'America/Chicago', labelKey: 'courseManagement.centralTime' },
  { value: 'America/Denver', labelKey: 'courseManagement.mountainTime' },
  { value: 'America/Phoenix', labelKey: 'courseManagement.arizonaTime' },
  { value: 'America/Los_Angeles', labelKey: 'courseManagement.pacificTime' },
  { value: 'America/Anchorage', labelKey: 'courseManagement.alaskaTime' },
  { value: 'Pacific/Honolulu', labelKey: 'courseManagement.hawaiiTime' },
  { value: 'UTC', label: 'UTC' },
];

function courseText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function defaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
}

function timezoneLabel(timezone: string): string {
  const knownOption = COURSE_TIMEZONE_OPTIONS.find((option) => option.value === timezone);
  if (knownOption) {
    return knownOption.label || courseText(knownOption.labelKey!);
  }
  return timezone.replace(/_/g, ' ');
}

function readyLoadValue<T>(state: LoadableState<T>): T | null {
  return state.status === 'ready' || state.status === 'empty' || state.status === 'refreshing' || state.status === 'refresh-error'
    ? state.value
    : null;
}

function loadPending<T>(state: LoadableState<T>): boolean {
  return state.status === 'idle' || state.status === 'loading' || state.status === 'refreshing';
}

function loadErrorMessage<T>(state: LoadableState<T>): string {
  return state.status === 'error' || state.status === 'refresh-error' ? state.message : '';
}

function emptyCourseManagementData(): CourseManagementData {
  return {
    courses: [],
    sectionLinks: [],
  };
}

function getCourseManagementData(instance: ClassEditInstance): CourseManagementData {
  return readyLoadValue(instance.coursesPresentation.get()) || emptyCourseManagementData();
}

function newCourseDraft(): EditableCourse {
  return defaultCourseDraft(Meteor.userId(), defaultTimezone());
}

function setClassEditMessage(
  instance: ClassEditInstance,
  level: ClassEditMessage['level'],
  text: string,
): void {
  instance.message.set({ level, text });
}

function clearClassEditFeedback(instance: ClassEditInstance): void {
  instance.message.set(null);
  instance.confirmationController.cancel();
}

function selectNoCourse(instance: ClassEditInstance, options: { preserveFeedback?: boolean } = {}): void {
  if (!options.preserveFeedback) {
    clearClassEditFeedback(instance);
  }
  instance.selectedCourseId.set('');
  instance.draftCourse.set(newCourseDraft());
}

function selectCourse(instance: ClassEditInstance, courseId: string, options: { preserveFeedback?: boolean } = {}): void {
  if (!options.preserveFeedback) {
    clearClassEditFeedback(instance);
  }
  const foundCourse = getCourseManagementData(instance).courses.find((course) => course.courseId === courseId);
  if (!foundCourse) {
    selectNoCourse(instance, options);
    return;
  }
  instance.selectedCourseId.set(courseId);
  instance.draftCourse.set({ ...foundCourse, sections: [...foundCourse.sections] });
}

function updateDraft(instance: ClassEditInstance, patch: Partial<EditableCourse>): void {
  instance.draftCourse.set({
    ...instance.draftCourse.get(),
    ...patch,
  });
}

function currentCoursePayload(instance: ClassEditInstance): EditableCourse {
  const draft = coursePayloadFromDraft(instance.draftCourse.get());
  return {
    ...draft,
    courseId: instance.selectedCourseId.get() || draft.courseId,
    teacherUserId: draft.teacherUserId || Meteor.userId(),
    semester: draft.semester || curSemester,
  };
}

function loadCourseManagementData(
  instance: ClassEditInstance,
  selectedCourseId?: string,
  options: { preserveFeedback?: boolean } = {},
): void {
  const requestId = ++instance.nextRequestId;
  const generation = instance.lifetime.begin();
  instance.coursesPresentation.set(startLoad(instance.coursesPresentation.get(), requestId));

  meteorCallAsync('getAllCourseSections')
    .then((allCourseSections) => {
      if (!instance.lifetime.isCurrent(generation)) return;
      const value = buildCourseManagementData(
        Array.isArray(allCourseSections) ? allCourseSections as CourseSection[] : [],
        Meteor.userId(),
        defaultTimezone(),
      );
      instance.coursesPresentation.set(resolveLoad(
        instance.coursesPresentation.get(),
        requestId,
        value,
        (data) => data.courses.length === 0 && data.sectionLinks.length === 0,
      ));
      const nextCourseId = selectedCourseId || instance.selectedCourseId.get();
      if (nextCourseId && value.courses.some((course) => course.courseId === nextCourseId)) {
        selectCourse(instance, nextCourseId, options);
      } else {
        selectNoCourse(instance, options);
      }
    })
    .catch((error) => {
      if (!instance.lifetime.isCurrent(generation)) return;
      const message = getErrorMessage(error);
      instance.coursesPresentation.set(rejectLoad(
        instance.coursesPresentation.get(),
        requestId,
        { message, retryable: true },
      ));
      setClassEditMessage(instance, 'error', message);
    });
}

function runSaveCourse(instance: ClassEditInstance): void {
  clearClassEditFeedback(instance);
  const payload = currentCoursePayload(instance);
  if (!payload.courseName) {
    setClassEditMessage(instance, 'warning', courseText('courseManagement.courseCannotBeBlank'));
    return;
  }
  if (!payload.timezone) {
    setClassEditMessage(instance, 'warning', courseText('courseManagement.chooseTimezone'));
    return;
  }

  const isNewCourse = !instance.selectedCourseId.get();
  void instance.saveCommand.run(async () => {
    const result = await meteorCallAsync(isNewCourse ? 'addCourse' : 'editCourse', payload);
    return String(result || payload.courseId || '');
  }, {
    getErrorMessage,
    onSuccess: (courseId) => {
      setClassEditMessage(instance, 'success', courseText('courseManagement.courseSaved'));
      loadCourseManagementData(instance, courseId, { preserveFeedback: true });
    },
    onFailure: (error) => {
      setClassEditMessage(instance, 'error', courseText('courseManagement.errorSavingCourse', { error: getErrorMessage(error) }));
    },
  });
}

function runDeleteCourse(instance: ClassEditInstance, courseId: string): void {
  instance.confirmationController.setPending(true);
  void instance.deleteCommand.run(async () => {
    await meteorCallAsync('deleteCourse', courseId);
  }, {
    getErrorMessage,
    onSuccess: () => {
      instance.confirmationController.complete();
      setClassEditMessage(instance, 'success', courseText('courseManagement.courseDeleted'));
      instance.selectedCourseId.set('');
      instance.draftCourse.set(newCourseDraft());
      loadCourseManagementData(instance, undefined, { preserveFeedback: true });
    },
    onFailure: (error) => {
      instance.confirmationController.setPending(false);
      setClassEditMessage(instance, 'error', courseText('courseManagement.errorDeletingCourse', { error: getErrorMessage(error) }));
    },
  });
}

Template.classEdit.onCreated(function(this: ClassEditInstance) {
  this.coursesPresentation = new ReactiveVar<LoadableState<CourseManagementData>>({ status: 'idle' });
  this.saveCommandState = new ReactiveVar<AsyncCommandState<string>>({ status: 'idle' });
  this.deleteCommandState = new ReactiveVar<AsyncCommandState<void>>({ status: 'idle' });
  this.saveCommand = createAsyncCommandController((state) => this.saveCommandState.set(state));
  this.deleteCommand = createAsyncCommandController((state) => this.deleteCommandState.set(state));
  this.lifetime = createTemplateLifetime();
  this.nextRequestId = 0;
  this.selectedCourseId = new ReactiveVar('');
  this.draftCourse = new ReactiveVar<EditableCourse>(newCourseDraft());
  this.message = new ReactiveVar<ClassEditMessage | null>(null);
  this.confirmation = new ReactiveVar({} as InlineConfirmationView);
  this.confirmationController = createInlineConfirmationController<ClassEditConfirmation>(
    (view) => this.confirmation.set(view),
    () => document.getElementById('saveClass'),
  );
  this.confirmation.set(this.confirmationController.getView());
  loadCourseManagementData(this);
});

Template.classEdit.onDestroyed(function(this: ClassEditInstance) {
  this.lifetime.destroy();
  this.saveCommand.destroy();
  this.deleteCommand.destroy();
  this.confirmationController.destroy();
});

Template.classEdit.helpers({
  isLoading(): boolean {
    return loadPending((Template.instance() as ClassEditInstance).coursesPresentation.get());
  },
  isBusy(): boolean {
    const instance = Template.instance() as ClassEditInstance;
    return loadPending(instance.coursesPresentation.get())
      || instance.saveCommandState.get().status === 'pending'
      || instance.deleteCommandState.get().status === 'pending';
  },
  classEditMessage(): ClassEditMessage | null {
    return (Template.instance() as ClassEditInstance).message.get();
  },
  messageVariant(): string {
    return (Template.instance() as ClassEditInstance).message.get()?.level || 'info';
  },
  loadError(): string {
    return loadErrorMessage((Template.instance() as ClassEditInstance).coursesPresentation.get());
  },
  classEditConfirmation(): InlineConfirmationView | null {
    const view = (Template.instance() as ClassEditInstance).confirmation.get();
    return view.status === 'open' ? view : null;
  },
  classEditDeleteAttrs() {
    const instance = Template.instance() as ClassEditInstance;
    const view = instance.confirmation.get();
    return {
      ...(instance.deleteCommandState.get().status === 'pending' ? { disabled: true, 'aria-busy': 'true' } : {}),
      ...(view.status === 'open' ? { 'aria-controls': view.confirmationId, 'aria-expanded': 'true' } : {}),
    };
  },
  isEditingCourse(): boolean {
    return Boolean((Template.instance() as ClassEditInstance).selectedCourseId.get());
  },
  classes(): EditableCourse[] {
    return getCourseManagementData(Template.instance() as ClassEditInstance).courses;
  },
  selectedCourseAttrs(courseId: string) {
    return (Template.instance() as ClassEditInstance).selectedCourseId.get() === String(courseId || '')
      ? { selected: true }
      : {};
  },
  sections() {
    return getCourseManagementData(Template.instance() as ClassEditInstance).sectionLinks;
  },
  curTeacher(): string {
    return Meteor.user()?.username || '';
  },
  baseLink() {
    return `https://${window.location.host}/`;
  },
  draftCourseName(): string {
    return (Template.instance() as ClassEditInstance).draftCourse.get().courseName;
  },
  draftSectionNames(): string {
    return sectionNamesText((Template.instance() as ClassEditInstance).draftCourse.get().sections);
  },
  draftBeginDate(): string {
    const draft = (Template.instance() as ClassEditInstance).draftCourse.get();
    return toDatetimeLocalValue(draft.beginDate, draft.timezone);
  },
  draftEndDate(): string {
    const draft = (Template.instance() as ClassEditInstance).draftCourse.get();
    return toDatetimeLocalValue(draft.endDate, draft.timezone);
  },
  selectedVisibilityAttrs(visibility: CourseVisibility) {
    return (Template.instance() as ClassEditInstance).draftCourse.get().visibility === visibility
      ? { selected: true }
      : {};
  },
  selectedTimezoneAttrs(timezone: string) {
    return (Template.instance() as ClassEditInstance).draftCourse.get().timezone === timezone
      ? { selected: true }
      : {};
  },
  courseTimezoneOptions() {
    const detectedTimezone = defaultTimezone();
    const localizedOptions = COURSE_TIMEZONE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label || courseText(option.labelKey!),
    }));
    if (!detectedTimezone || localizedOptions.some((option) => option.value === detectedTimezone)) {
      return localizedOptions;
    }
    return [
      ...localizedOptions,
      { value: detectedTimezone, label: timezoneLabel(detectedTimezone) },
    ];
  },
  saveBusy(): boolean {
    return (Template.instance() as ClassEditInstance).saveCommandState.get().status === 'pending';
  },
  deleteBusy(): boolean {
    return (Template.instance() as ClassEditInstance).deleteCommandState.get().status === 'pending';
  },
  courseText(key: Parameters<typeof translatePlatformString>[1], options?: { hash?: Parameters<typeof translatePlatformString>[2] }) {
    return courseText(key, options?.hash);
  },
});

Template.classEdit.events({
  'change #class-select'(event: Event, instance: ClassEditInstance) {
    const courseId = String((event.currentTarget as HTMLSelectElement | null)?.value || '');
    if (courseId) {
      selectCourse(instance, courseId);
    } else {
      selectNoCourse(instance);
    }
  },

  'input #newClassName'(event: Event, instance: ClassEditInstance) {
    updateDraft(instance, { courseName: String((event.currentTarget as HTMLInputElement).value || '') });
  },

  'change #courseVisibility'(event: Event, instance: ClassEditInstance) {
    updateDraft(instance, {
      visibility: String((event.currentTarget as HTMLSelectElement).value || '') === 'public' ? 'public' : 'private',
    });
  },

  'change #courseBeginDate'(event: Event, instance: ClassEditInstance) {
    updateDraft(instance, { beginDate: String((event.currentTarget as HTMLInputElement).value || '') || null });
  },

  'change #courseEndDate'(event: Event, instance: ClassEditInstance) {
    updateDraft(instance, { endDate: String((event.currentTarget as HTMLInputElement).value || '') || null });
  },

  'change #courseTimezone'(event: Event, instance: ClassEditInstance) {
    updateDraft(instance, { timezone: String((event.currentTarget as HTMLSelectElement).value || '').trim() });
  },

  'input #sectionNames'(event: Event, instance: ClassEditInstance) {
    updateDraft(instance, { sections: normalizeSectionNames(String((event.currentTarget as HTMLTextAreaElement).value || '')) });
  },

  'click #saveClass'(event: Event, instance: ClassEditInstance) {
    event.preventDefault();
    runSaveCourse(instance);
  },

  'click #deleteCourse'(event: Event, instance: ClassEditInstance) {
    event.preventDefault();
    const courseId = instance.selectedCourseId.get();
    const foundClass = getCourseManagementData(instance).courses.find((course) => course.courseId === courseId);
    if (!courseId || !foundClass) {
      setClassEditMessage(instance, 'warning', courseText('courseManagement.selectCourseToDelete'));
      return;
    }
    instance.message.set(null);
    instance.confirmationController.open({
      confirmationId: `class-delete-confirmation-${courseId}`,
      title: courseText('courseManagement.deleteCourseTitle', { courseName: foundClass.courseName }),
      message: courseText('courseManagement.deleteCourseMessage'),
      confirmLabel: courseText('courseManagement.delete'),
      cancelLabel: courseText('courseManagement.cancel'),
      severity: 'danger',
      context: {
        courseId,
        title: courseText('courseManagement.deleteCourseTitle', { courseName: foundClass.courseName }),
        message: courseText('courseManagement.deleteCourseMessage'),
      },
    }, event.currentTarget as HTMLElement);
    Tracker.afterFlush(() => instance.confirmationController.focusInitial());
  },

  'click .admin-confirmation-cancel'(event: Event, instance: ClassEditInstance) {
    event.preventDefault();
    instance.confirmationController.cancel();
  },

  'keydown .admin-inline-confirmation'(event: KeyboardEvent, instance: ClassEditInstance) {
    instance.confirmationController.handleKeydown(event);
  },

  'click .admin-confirmation-confirm'(event: Event, instance: ClassEditInstance) {
    event.preventDefault();
    const courseId = instance.confirmationController.getContext()?.courseId || '';
    if (!courseId) {
      setClassEditMessage(instance, 'warning', courseText('courseManagement.selectCourseToDelete'));
      instance.confirmationController.cancel();
      return;
    }
    runDeleteCourse(instance, courseId);
  },
});
