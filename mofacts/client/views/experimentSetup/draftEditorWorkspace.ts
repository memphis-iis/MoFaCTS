import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import './draftEditorWorkspace.html';
import { clientConsole } from '../../lib/clientLogger';
import { createTdfDraftEditor } from './tdfDraftEditor';
import { createContentDraftEditor } from './contentDraftEditor';

type LessonLike = {
  title: string;
  workingCopy: {
    tutor: Record<string, unknown>;
    stimuli: Record<string, unknown>;
  };
  generatedBaseline: {
    tutor: Record<string, unknown>;
    stimuli: Record<string, unknown>;
    mediaFiles?: Record<string, string | Uint8Array>;
  };
  stats?: {
    totalItems?: number;
    skippedItems?: number;
  };
};

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return clonePreservingBinary(value);
}

function clonePreservingBinary<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return new Uint8Array(value) as T;
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => clonePreservingBinary(entry)) as T;
  }

  if (typeof value === 'object') {
    const clonedObject: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      clonedObject[key] = clonePreservingBinary(entry);
    });
    return clonedObject as T;
  }

  return value;
}

Template.draftEditorWorkspace.onCreated(function(this: any) {
  this.activeTab = new ReactiveVar('tdf');
  this.currentLessonIndex = new ReactiveVar(0);
  this.workspaceError = new ReactiveVar(null);
  this.tdfEditorHandle = null;
  this.contentEditorHandle = null;
  this._lastTdfLessonSignature = null;
  this._lastContentLessonSignature = null;
  this.workspaceData = null;
});

Template.draftEditorWorkspace.onRendered(function(this: any) {
  const instance = this;

  instance.autorun(async () => {
    const data = Template.currentData() || {};
    instance.workspaceData = data;
    const lessons = Array.isArray(data.lessons) ? data.lessons : [];
    const lessonIndex = Math.min(instance.currentLessonIndex.get(), Math.max(lessons.length - 1, 0));
    const lesson = lessons[lessonIndex];
    const activeTab = instance.activeTab.get();
    const lessonSignature = JSON.stringify({
      lessonIndex,
      lessonTitle: lesson?.title
    });

    if (!lesson) {
      return;
    }

    instance.workspaceError.set(null);

    try {
      const tdfContainer = instance.find('#draft-tdf-editor-container');
      const contentContainer = instance.find('#draft-content-editor-container');
      if (!tdfContainer) {
        return;
      }

      if (activeTab === 'tdf') {
        await ensureTdfEditor(instance, tdfContainer, lesson, lessonSignature);
      }

      if (activeTab === 'content' && contentContainer) {
        await ensureContentEditor(instance, contentContainer, lesson, lessonSignature);
      }
    } catch (error: any) {
      clientConsole(1, '[Draft Workspace] Failed to initialize editors:', error);
      instance.workspaceError.set(error?.message || 'Failed to initialize draft editors.');
    }
  });
});

async function ensureTdfEditor(instance: any, container: HTMLElement, lesson: LessonLike, lessonSignature: string) {
  if (!instance.tdfEditorHandle) {
    instance.tdfEditorHandle = await createTdfDraftEditor(
      container,
      lesson.workingCopy.tutor,
      (value) => updateLessonPart(instance, 'tutor', value)
    );
  } else if (instance._lastTdfLessonSignature !== lessonSignature) {
    instance.tdfEditorHandle.setValue(lesson.workingCopy.tutor);
  }

  instance._lastTdfLessonSignature = lessonSignature;
}

async function ensureContentEditor(instance: any, container: HTMLElement, lesson: LessonLike, lessonSignature: string) {
  if (!instance.contentEditorHandle) {
    instance.contentEditorHandle = await createContentDraftEditor(
      container,
      lesson.workingCopy.stimuli,
      (value) => updateLessonPart(instance, 'stimuli', value)
    );
  } else if (instance._lastContentLessonSignature !== lessonSignature) {
    instance.contentEditorHandle.setValue(lesson.workingCopy.stimuli);
  }

  instance._lastContentLessonSignature = lessonSignature;
}

function destroyContentEditor(instance: any) {
  if (instance.contentEditorHandle) {
    instance.contentEditorHandle.destroy();
    instance.contentEditorHandle = null;
  }
  instance._lastContentLessonSignature = null;
}

function syncEditorValues(instance: any) {
  if (instance.tdfEditorHandle) {
    updateLessonPart(instance, 'tutor', instance.tdfEditorHandle.getValue());
  }
  if (instance.contentEditorHandle) {
    updateLessonPart(instance, 'stimuli', instance.contentEditorHandle.getValue());
  }
}

Template.draftEditorWorkspace.onDestroyed(function(this: any) {
  if (this.tdfEditorHandle) {
    this.tdfEditorHandle.destroy();
    this.tdfEditorHandle = null;
  }
  if (this.contentEditorHandle) {
    this.contentEditorHandle.destroy();
    this.contentEditorHandle = null;
  }
});

function updateLessonPart(instance: any, part: 'tutor' | 'stimuli', value: Record<string, unknown>) {
  const data = instance.workspaceData || Template.currentData() || {};
  const sourceLessons = Array.isArray(data.lessons) ? data.lessons : [];
  const lessonIndex = instance.currentLessonIndex.get();
  const sourceLesson = sourceLessons[lessonIndex];
  if (!sourceLesson) {
    return;
  }

  const lessons = sourceLessons.slice();
  lessons[lessonIndex] = {
    ...sourceLesson,
    workingCopy: {
      ...sourceLesson.workingCopy,
      [part]: clone(value)
    }
  };

  if (typeof data.onLessonsUpdate === 'function') {
    data.onLessonsUpdate(lessons);
  }
}

Template.draftEditorWorkspace.helpers({
  workspaceHeading() {
    const data = Template.currentData() || {};
    return data.heading || 'Step 3: Edit Generated Draft';
  },
  saveContinueLabel() {
    const data = Template.currentData() || {};
    return data.saveContinueLabel || 'Save and Continue';
  },
  currentLesson() {
    const instance = Template.instance() as any;
    const data = Template.currentData() || {};
    const lessons = Array.isArray(data.lessons) ? data.lessons : [];
    return lessons[instance.currentLessonIndex.get()] || null;
  },
  hasMultipleLessons() {
    const data = Template.currentData() || {};
    return Array.isArray(data.lessons) && data.lessons.length > 1;
  },
  lessonOptions() {
    const instance = Template.instance() as any;
    const data = Template.currentData() || {};
    const lessons = Array.isArray(data.lessons) ? data.lessons : [];
    const currentIndex = instance.currentLessonIndex.get();
    return lessons.map((lesson: LessonLike, index: number) => ({
      index,
      label: lesson.title || `Lesson ${index + 1}`,
      isSelected: currentIndex === index
    }));
  },
  isActiveTab(tab: string) {
    return (Template.instance() as any).activeTab.get() === tab;
  },
  workspaceError() {
    return (Template.instance() as any).workspaceError.get();
  }
});

Template.draftEditorWorkspace.events({
  'click .draft-tab'(event: any, instance: any) {
    event.preventDefault();
    const nextTab = event.currentTarget.dataset.tab;
    instance.activeTab.set(nextTab);
  },
  'change #draft-lesson-select'(event: any, instance: any) {
    const nextIndex = parseInt(event.currentTarget.value, 10);
    if (!Number.isNaN(nextIndex)) {
      syncEditorValues(instance);
      instance.currentLessonIndex.set(nextIndex);
      destroyContentEditor(instance);
      instance._lastTdfLessonSignature = null;
      instance._lastContentLessonSignature = null;
    }
  },
  'click #draft-reset-defaults'(event: any, instance: any) {
    event.preventDefault();
    const data = Template.currentData() || {};
    const sourceLessons = Array.isArray(data.lessons) ? data.lessons : [];
    const lessonIndex = instance.currentLessonIndex.get();
    const sourceLesson = sourceLessons[lessonIndex];
    if (!sourceLesson) {
      return;
    }

    const lessons = sourceLessons.slice();
    lessons[lessonIndex] = {
      ...sourceLesson,
      workingCopy: {
        tutor: clone(sourceLesson.generatedBaseline.tutor),
        stimuli: clone(sourceLesson.generatedBaseline.stimuli)
      }
    };

    if (typeof data.onLessonsUpdate === 'function') {
      data.onLessonsUpdate(lessons);
    }
    instance._lastTdfLessonSignature = null;
    instance._lastContentLessonSignature = null;
  },
  'click #draft-save-continue'(event: any, instance: any) {
    event.preventDefault();
    const tdfErrors = instance.tdfEditorHandle ? instance.tdfEditorHandle.validate() : [];
    const contentErrors = instance.contentEditorHandle ? instance.contentEditorHandle.validate() : [];
    if ((tdfErrors && tdfErrors.length) || (contentErrors && contentErrors.length)) {
      instance.workspaceError.set('Fix validation errors in the current draft before continuing.');
      return;
    }

    instance.workspaceError.set(null);
    syncEditorValues(instance);
    const data = Template.currentData() || {};
    if (typeof data.onSaveContinue === 'function') {
      data.onSaveContinue(instance.currentLessonIndex.get());
    }
  },
  'click #draft-workspace-back'(event: any, instance: any) {
    event.preventDefault();
    syncEditorValues(instance);
    const data = Template.currentData() || {};
    if (typeof data.onBack === 'function') {
      data.onBack();
    }
  }
});
