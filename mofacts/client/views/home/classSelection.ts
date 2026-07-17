import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { clientConsole } from '../../lib/userSessionHelpers';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { getErrorMessage } from '../../lib/errorUtils';
import {
  createAsyncCommandController,
  type AsyncCommandController,
  type AsyncCommandState,
} from '../../lib/adminUi/asyncCommandState';
import {
  rejectLoad,
  resolveLoad,
  startLoad,
  type LoadableState,
} from '../../lib/adminUi/loadableState';
import {
  createTemplateLifetime,
  type TemplateLifetime,
} from '../../lib/adminUi/templateLifetime';
import {
  classSelectionSnapshotIsEmpty,
  normalizeClassSelectionSnapshot,
  sectionsForTeacher,
  selectionForCurrentSection,
  type ClassSelectionSnapshot,
  type SectionOption,
  type TeacherOption,
} from './classSelectionState';
import '../shared/adminUi/adminUi';
import './classSelection.html';

const { FlowRouter } = require('meteor/ostrio:flow-router-extra');

declare const Session: any;
declare const Meteor: any;

type SaveSelectionResult = Readonly<{
  teacher: TeacherOption;
  section: SectionOption;
}>;

type ClassSelectionMessage = Readonly<{
  variant: 'info' | 'success' | 'warning' | 'error';
  text: string;
}>;

type ClassSelectionInstance = Blaze.TemplateInstance & {
  loadState: ReactiveVar<LoadableState<ClassSelectionSnapshot>>;
  selectedTeacherId: ReactiveVar<string>;
  selectedSectionId: ReactiveVar<string>;
  message: ReactiveVar<ClassSelectionMessage | null>;
  commandState: ReactiveVar<AsyncCommandState<SaveSelectionResult>>;
  commandController: AsyncCommandController<SaveSelectionResult>;
  lifetime: TemplateLifetime;
};

function classSelectionContext(): any {
  return Meteor.user()?.loginParams?.curClass || Session.get('curClass') || null;
}

function classSelectionText(
  key: Parameters<typeof translatePlatformString>[1],
  values?: Parameters<typeof translatePlatformString>[2],
): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function selectedClassDisplayLabel(): string {
  const currentClass = classSelectionContext();
  if (!currentClass) return classSelectionText('classSelection.none');
  const courseName = String(currentClass.courseName || '').trim();
  const sectionName = String(currentClass.sectionName || '').trim();
  if (courseName && sectionName) return `${courseName} - ${sectionName}`;
  return courseName || sectionName || classSelectionText('classSelection.selected');
}

function isSectionSelectable(section: SectionOption): boolean {
  if (String(section.visibility || 'private') === 'public') return true;
  const currentClass = classSelectionContext();
  return Boolean(
    currentClass?.sectionId
    && String(currentClass.sectionId) === String(section.sectionId || ''),
  );
}

function snapshotFromState(
  state: LoadableState<ClassSelectionSnapshot>,
): ClassSelectionSnapshot | undefined {
  if (
    state.status === 'ready'
    || state.status === 'empty'
    || state.status === 'refreshing'
    || state.status === 'refresh-error'
  ) {
    return state.value;
  }
  return undefined;
}

function syncSelectionFromCurrentClass(
  instance: ClassSelectionInstance,
  snapshot: ClassSelectionSnapshot,
): void {
  const currentSectionId = String(classSelectionContext()?.sectionId || '');
  const selection = selectionForCurrentSection(snapshot, currentSectionId);
  instance.selectedTeacherId.set(selection.teacherId);
  instance.selectedSectionId.set(selection.sectionId);
}

async function loadClassSelectionOptions(instance: ClassSelectionInstance): Promise<void> {
  const requestId = instance.lifetime.begin();
  instance.loadState.set(startLoad(instance.loadState.get(), requestId));
  instance.message.set(null);
  try {
    const [teachersResult, sectionsResult] = await Promise.all([
      Meteor.callAsync('getAllTeachers'),
      Meteor.callAsync('getAllCourseSections'),
    ]);
    if (!instance.lifetime.isCurrent(requestId)) {
      return;
    }
    const snapshot = normalizeClassSelectionSnapshot(
      teachersResult,
      sectionsResult,
      isSectionSelectable,
    );
    instance.loadState.set(resolveLoad(
      instance.loadState.get(),
      requestId,
      snapshot,
      classSelectionSnapshotIsEmpty,
    ));
    syncSelectionFromCurrentClass(instance, snapshot);
  } catch (error: unknown) {
    if (!instance.lifetime.isCurrent(requestId)) {
      return;
    }
    clientConsole(1, '[CLASS_SELECTION] Failed loading class selection options:', error);
    instance.loadState.set(rejectLoad(instance.loadState.get(), requestId, {
      message: getErrorMessage(error),
      retryable: true,
    }));
  }
}

Template.classSelection.onCreated(function(this: ClassSelectionInstance) {
  this.loadState = new ReactiveVar<LoadableState<ClassSelectionSnapshot>>({ status: 'idle' });
  this.selectedTeacherId = new ReactiveVar('');
  this.selectedSectionId = new ReactiveVar('');
  const routeMessage = Session.get('classSelectionRouteMessage') as ClassSelectionMessage | null;
  Session.set('classSelectionRouteMessage', null);
  this.message = new ReactiveVar<ClassSelectionMessage | null>(routeMessage);
  this.lifetime = createTemplateLifetime();
  this.commandController = createAsyncCommandController<SaveSelectionResult>(
    (state) => this.commandState.set(state),
  );
  this.commandState = new ReactiveVar(this.commandController.getState());
  void loadClassSelectionOptions(this);
});

Template.classSelection.onDestroyed(function(this: ClassSelectionInstance) {
  this.lifetime.destroy();
  this.commandController.destroy();
});

Template.classSelection.helpers({
  classSelectionTeachers(): TeacherOption[] {
    const instance = Template.instance() as ClassSelectionInstance;
    return snapshotFromState(instance.loadState.get())?.teachers ?? [];
  },
  classSelectionClasses(): SectionOption[] {
    const instance = Template.instance() as ClassSelectionInstance;
    const selectedTeacherId = instance.selectedTeacherId.get();
    const snapshot = snapshotFromState(instance.loadState.get());
    return snapshot ? sectionsForTeacher(snapshot, selectedTeacherId) : [];
  },
  teacherSelectedAttrs(teacherId: string): Record<string, boolean> {
    return (Template.instance() as ClassSelectionInstance).selectedTeacherId.get() === teacherId
      ? { selected: true }
      : {};
  },
  sectionSelectedAttrs(sectionId: string): Record<string, boolean> {
    return (Template.instance() as ClassSelectionInstance).selectedSectionId.get() === sectionId
      ? { selected: true }
      : {};
  },
  classSelectionBusy(): boolean {
    const instance = Template.instance() as ClassSelectionInstance;
    const loadStatus = instance.loadState.get().status;
    return loadStatus === 'idle'
      || loadStatus === 'loading'
      || instance.commandState.get().status === 'pending';
  },
  classSelectionError(): string {
    const state = (Template.instance() as ClassSelectionInstance).loadState.get();
    return state.status === 'error' ? state.message : '';
  },
  classSelectionEmpty(): boolean {
    return (Template.instance() as ClassSelectionInstance).loadState.get().status === 'empty';
  },
  classSelectionMessage(): ClassSelectionMessage | null {
    return (Template.instance() as ClassSelectionInstance).message.get();
  },
  hasSelectedClassContext(): boolean {
    return Boolean(classSelectionContext());
  },
  currentCourseText(): string {
    return classSelectionText('classSelection.currentCourse', {
      course: selectedClassDisplayLabel(),
    });
  },
});

Template.classSelection.events({
  'change #classSelectionTeacherSelect'(event: Event, instance: ClassSelectionInstance) {
    instance.selectedTeacherId.set((event.currentTarget as HTMLSelectElement).value);
    instance.selectedSectionId.set('');
    instance.message.set(null);
  },

  'change #classSelectionClassSelect'(event: Event, instance: ClassSelectionInstance) {
    instance.selectedSectionId.set((event.currentTarget as HTMLSelectElement).value);
    instance.message.set(null);
  },

  'click .class-selection-retry'(event: Event, instance: ClassSelectionInstance) {
    event.preventDefault();
    void loadClassSelectionOptions(instance);
  },

  async 'click #saveClassSelectionButton'(event: Event, instance: ClassSelectionInstance) {
    event.preventDefault();
    const teacherId = instance.selectedTeacherId.get();
    const sectionId = instance.selectedSectionId.get();
    if (!teacherId || !sectionId) {
      instance.message.set({
        variant: 'warning',
        text: classSelectionText('classSelection.selectBoth'),
      });
      return;
    }

    const snapshot = snapshotFromState(instance.loadState.get());
    const teacher = snapshot?.teachers.find((row) => String(row._id || '') === teacherId);
    const section = snapshot?.sections.find((row) => String(row.sectionId || '') === sectionId);
    if (!teacher || !section) {
      instance.message.set({
        variant: 'error',
        text: classSelectionText('classSelection.invalidSelection'),
      });
      return;
    }

    instance.message.set(null);
    await instance.commandController.run(async () => {
      await Meteor.callAsync('addUserToTeachersClass', teacherId, sectionId);
      const assignedTdfIds = await Meteor.callAsync(
        'getTdfsAssignedToStudent',
        Meteor.userId(),
        sectionId,
      );
      await Meteor.callAsync(
        'setUserLoginData',
        'main-menu-class-select',
        Session.get('loginMode') || 'password',
        teacher,
        section,
        assignedTdfIds,
      );
      return { teacher, section };
    }, {
      getErrorMessage: () => classSelectionText('classSelection.saveFailed'),
      onSuccess: (result) => {
        Session.set('curTeacher', result.teacher);
        Session.set('curClass', result.section);
        FlowRouter.go('/home');
      },
      onFailure: (error) => {
        clientConsole(1, '[CLASS_SELECTION] Failed saving class selection:', error);
        instance.message.set({
          variant: 'error',
          text: classSelectionText('classSelection.saveFailed'),
        });
      },
    });
  },

  'click #backToHomeButton'(event: Event) {
    event.preventDefault();
    FlowRouter.go('/home');
  },
});
