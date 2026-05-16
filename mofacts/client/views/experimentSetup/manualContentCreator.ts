import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Random } from 'meteor/random';
import './manualContentCreator.html';
import './draftEditorWorkspace';
import { buildImportPackageFromDraftLessons } from '../../lib/importPackageBuilder';
import { getUploadIntegrity } from '../../lib/uploadIntegrity';
import {
  buildManualDraftLesson,
  createDefaultManualCreatorState,
  createStarterRow,
  type ManualCreatorState,
  type PromptType,
  type ResponseType,
  type StarterRow,
  type TopBarMode
} from '../../lib/manualDraftBuilder';
import {
  getMediaLabel,
  getSeedColumnLabels,
  isMediaPromptEnabled,
  isPromptTextEnabled,
  parseSeedTableText,
  structureIncludesInstructions,
} from '../../lib/manualContentCreatorUtils';
import {
  parsePositiveInteger,
  resolveSeedRowsForValidation,
  validateManualCreatorStep,
} from '../../lib/manualContentCreatorValidation';
import { clientConsole } from '../..';
import { getErrorMessage } from '../../lib/errorUtils';

const FlowRouter = (globalThis as any).FlowRouter;
declare const DynamicAssets: any;

type StepItem = {
  number: number;
  label: string;
  isActive: boolean;
  isComplete: boolean;
};

type DraftMessageLevel = 'info' | 'success' | 'warning' | 'error';

type ManualContentDraftRecord = {
  _id: string;
  lessonName?: string;
  currentStep?: number;
  state?: Partial<ManualCreatorState>;
  draftLessons?: any[];
  updatedAt?: Date | string | null;
};

const STEP_LABELS = [
  'Lesson Basics',
  'Card Format',
  'Audio And Display',
  'Starter Content',
  'Edit Draft'
];

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneState(state: ManualCreatorState): ManualCreatorState {
  return {
    ...state,
    rows: state.rows.map((row) => ({ ...row }))
  };
}

function updateState(instance: any, updater: (state: ManualCreatorState) => ManualCreatorState) {
  const current = cloneState(instance.state.get());
  const next = updater(current);
  instance.state.set(next);
}

function clearGeneratedArtifacts(instance: any, options: { keepDraft?: boolean } = {}) {
  if (!options.keepDraft) {
    instance.draftLessons.set([]);
  }
  instance.generationResult.set(null);
  instance.packageError.set(null);
  instance.uploadStatus.set(null);
  instance.uploadError.set(null);
  instance.uploadComplete.set(false);
}

function getDraftIdFromRoute() {
  const draftId = FlowRouter.current()?.queryParams?.draftId;
  return typeof draftId === 'string' && draftId.trim() ? draftId.trim() : '';
}

function setDraftMessage(instance: any, text: string | null, level: DraftMessageLevel = 'info') {
  instance.draftPersistenceMessage.set(text);
  instance.draftPersistenceLevel.set(level);
}

function clearSuccessDraftMessage(instance: any) {
  if (instance.draftPersistenceLevel.get() !== 'error') {
    instance.draftPersistenceMessage.set(null);
    instance.draftPersistenceLevel.set('info');
  }
}

function getDraftMessageClass(level: DraftMessageLevel) {
  if (level === 'success') return 'alert-success';
  if (level === 'warning') return 'alert-warning';
  if (level === 'error') return 'alert-danger';
  return 'alert-info';
}

function normalizeLoadedState(rawState: Partial<ManualCreatorState> | undefined): ManualCreatorState {
  const defaultState = createDefaultManualCreatorState();
  const sourceState = rawState && typeof rawState === 'object' ? rawState : {};
  const rawRows = Array.isArray(sourceState.rows) ? sourceState.rows : [];

  return {
    ...defaultState,
    ...sourceState,
    cardCount: parsePositiveInteger(sourceState.cardCount) || defaultState.cardCount,
    rows: rawRows.map((row: Partial<StarterRow>) => {
      const draftRowId = typeof row?.id === 'string' && row.id.trim() ? row.id.trim() : Random.id();
      return {
        ...createStarterRow(draftRowId),
        ...(row || {}),
        id: draftRowId
      };
    })
  };
}

function normalizeLoadedStep(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= STEP_LABELS.length) {
    return parsed;
  }
  return 1;
}

function applyLoadedDraft(instance: any, draft: ManualContentDraftRecord) {
  const normalizedState = normalizeLoadedState(draft.state);
  let nextStep = normalizeLoadedStep(draft.currentStep);
  let nextDraftLessons = Array.isArray(draft.draftLessons) ? cloneJson(draft.draftLessons) : [];

  if (nextStep >= 5 && nextDraftLessons.length === 0) {
    try {
      nextDraftLessons = [buildManualDraftLesson(normalizedState)];
    } catch (error: unknown) {
      clientConsole(1, '[MANUAL CREATOR] Saved draft fallback build failed:', error);
      nextStep = 4;
    }
  }

  instance.state.set(normalizedState);
  instance.stepErrors.set([]);
  clearGeneratedArtifacts(instance, { keepDraft: true });
  instance.draftLessons.set(nextDraftLessons);
  instance.wizardStep.set(nextStep);
  instance.currentDraftId.set(String(draft._id || ''));
  setDraftMessage(
    instance,
    `Loaded saved draft "${draft.lessonName || normalizedState.lessonName || 'Untitled draft'}".`,
    'info'
  );
}

function buildDraftSavePayload(instance: any) {
  return {
    draftId: instance.currentDraftId.get() || null,
    currentStep: instance.wizardStep.get(),
    state: cloneState(instance.state.get()),
    draftLessons: cloneJson(instance.draftLessons.get())
  };
}

async function saveCurrentDraft(instance: any) {
  instance.draftPersistenceBusy.set(true);
  setDraftMessage(instance, 'Saving draft...', 'info');

  try {
    const result = await (Meteor as any).callAsync('saveManualContentDraft', buildDraftSavePayload(instance));
    const nextDraftId = String(result?.draftId || '');
    instance.currentDraftId.set(nextDraftId);
    if (nextDraftId && typeof window !== 'undefined' && window.history?.replaceState) {
      const nextUrl = `/contentCreate?draftId=${encodeURIComponent(nextDraftId)}`;
      if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
        window.history.replaceState({}, '', nextUrl);
      }
    }
    setDraftMessage(
      instance,
      `Saved draft "${result?.lessonName || instance.state.get().lessonName || 'Untitled draft'}".`,
      'success'
    );
  } catch (error: unknown) {
    clientConsole(1, '[MANUAL CREATOR] Save draft failed:', error);
    setDraftMessage(instance, getErrorMessage(error), 'error');
  } finally {
    instance.draftPersistenceBusy.set(false);
  }
}

async function deleteCurrentDraft(instance: any, options: { redirectToContent?: boolean; silent?: boolean } = {}) {
  const draftId = String(instance.currentDraftId.get() || '');
  if (!draftId) {
    return;
  }

  try {
    await (Meteor as any).callAsync('deleteManualContentDraft', draftId);
    instance.currentDraftId.set('');
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState({}, '', '/contentCreate');
    }
    if (!options.silent) {
      setDraftMessage(instance, 'Saved draft deleted.', 'success');
    }
    if (options.redirectToContent) {
      FlowRouter.go('/contentUpload');
    }
  } catch (error: unknown) {
    clientConsole(1, '[MANUAL CREATOR] Delete draft failed:', error);
    if (!options.silent) {
      setDraftMessage(instance, getErrorMessage(error), 'error');
    }
  }
}

function getPromptSummary(promptType: PromptType) {
  switch (promptType) {
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    case 'audio':
      return 'Audio';
    case 'video':
      return 'Video';
    case 'text-image':
      return 'Text + Image';
    default:
      return 'Text';
  }
}

function getResponseSummary(responseType: ResponseType) {
  return responseType === 'multiple-choice' ? 'Multiple choice' : 'Typed response';
}

function getStructureSummary(structure: ManualCreatorState['structure']) {
  switch (structure) {
    case 'learning-only':
      return 'Learning only';
    case 'instructions-learning':
      return 'Instructions + Learning';
    case 'assessment-only':
      return 'Assessment only';
    case 'instructions-assessment':
      return 'Instructions + Assessment';
    default:
      return 'Instructions + Learning';
  }
}

function getTopBarSummary(topBarMode: TopBarMode) {
  switch (topBarMode) {
    case 'time':
      return 'Time';
    case 'score':
      return 'Score';
    case 'time-score':
      return 'Time + Score';
    default:
      return 'Neither';
  }
}

function initializeRowsIfNeeded(instance: any) {
  updateState(instance, (state) => {
    if (state.rows.length > 0) {
      return state;
    }

    if (state.seedMode === 'paste-table') {
      return state;
    }

    const rowCount = state.seedMode === 'example-duplicate'
      ? 1
      : (parsePositiveInteger(state.cardCount) || 1);
    return {
      ...state,
      rows: Array.from({ length: rowCount }, () => createStarterRow(Random.id()))
    };
  });
}

Template.manualContentCreator.onCreated(function(this: any) {
  this.wizardStep = new ReactiveVar(1);
  this.state = new ReactiveVar(createDefaultManualCreatorState());
  this.stepErrors = new ReactiveVar([]);
  this.draftLessons = new ReactiveVar([]);
  this.generationResult = new ReactiveVar(null);
  this.packageError = new ReactiveVar(null);
  this.uploadStatus = new ReactiveVar(null);
  this.uploadError = new ReactiveVar(null);
  this.uploadComplete = new ReactiveVar(false);
  this.currentDraftId = new ReactiveVar(getDraftIdFromRoute());
  this.draftPersistenceMessage = new ReactiveVar(null);
  this.draftPersistenceLevel = new ReactiveVar('info');
  this.draftPersistenceBusy = new ReactiveVar(false);

  const routeDraftId = this.currentDraftId.get();
  if (routeDraftId) {
    this.draftPersistenceBusy.set(true);
    setDraftMessage(this, 'Loading saved draft...', 'info');
    void (Meteor as any).callAsync('getManualContentDraft', routeDraftId)
      .then((draft: ManualContentDraftRecord) => {
        applyLoadedDraft(this, draft);
      })
      .catch((error: unknown) => {
        clientConsole(1, '[MANUAL CREATOR] Load draft failed:', error);
        this.currentDraftId.set('');
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState({}, '', '/contentCreate');
        }
        setDraftMessage(this, getErrorMessage(error), 'error');
      })
      .finally(() => {
        this.draftPersistenceBusy.set(false);
      });
  }
});

Template.manualContentCreator.helpers({
  state() {
    return (Template.instance() as any).state.get();
  },

  stepItems() {
    const currentStep = (Template.instance() as any).wizardStep.get();
    return STEP_LABELS.map((label, index) => ({
      number: index + 1,
      label,
      isActive: currentStep === index + 1,
      isComplete: currentStep > index + 1
    })) as StepItem[];
  },

  isStep(stepNumber: number) {
    return (Template.instance() as any).wizardStep.get() === stepNumber;
  },

  selectedIf(value: unknown, expected: unknown) {
    return value === expected ? 'selected' : null;
  },

  checkedIf(value: unknown, expected: unknown) {
    return value === expected ? 'checked' : null;
  },

  boolChecked(value: unknown) {
    return value ? 'checked' : null;
  },

  hasSavedDraft() {
    return !!(Template.instance() as any).currentDraftId.get();
  },

  saveDraftLabel() {
    return (Template.instance() as any).currentDraftId.get() ? 'Update Draft' : 'Save Draft';
  },

  draftPersistenceMessage() {
    return (Template.instance() as any).draftPersistenceMessage.get();
  },

  draftPersistenceMessageClass() {
    const instance = Template.instance() as any;
    return getDraftMessageClass(instance.draftPersistenceLevel.get());
  },

  draftPersistenceBusy() {
    return !!(Template.instance() as any).draftPersistenceBusy.get();
  },

  draftPersistenceAttrs() {
    return (Template.instance() as any).draftPersistenceBusy.get() ? { disabled: true } : {};
  },

  stepErrors() {
    return (Template.instance() as any).stepErrors.get();
  },

  stepHasErrors() {
    const errors = (Template.instance() as any).stepErrors.get();
    return Array.isArray(errors) && errors.length > 0;
  },

  canGoBack() {
    return (Template.instance() as any).wizardStep.get() > 1;
  },

  nextButtonLabel() {
    const currentStep = (Template.instance() as any).wizardStep.get();
    if (currentStep === 4) return 'Open Draft';
    return 'Next';
  },

  promptSummary() {
    const state = (Template.instance() as any).state.get();
    return getPromptSummary(state.promptType);
  },

  responseSummary() {
    const state = (Template.instance() as any).state.get();
    return getResponseSummary(state.responseType);
  },

  structureSummary() {
    const state = (Template.instance() as any).state.get();
    return getStructureSummary(state.structure);
  },

  topBarSummary() {
    const state = (Template.instance() as any).state.get();
    return getTopBarSummary(state.topBarMode);
  },

  showPromptTextColumn() {
    const state = (Template.instance() as any).state.get();
    return isPromptTextEnabled(state.promptType);
  },

  showPromptMediaColumn() {
    const state = (Template.instance() as any).state.get();
    return isMediaPromptEnabled(state.promptType);
  },

  promptMediaLabel() {
    const state = (Template.instance() as any).state.get();
    return getMediaLabel(state.promptType);
  },

  promptTextLabel() {
    const state = (Template.instance() as any).state.get();
    return state.promptType === 'text-image' ? 'Prompt text' : 'Prompt';
  },

  structureIncludesInstructions() {
    const state = (Template.instance() as any).state.get();
    return structureIncludesInstructions(state.structure);
  },

  isMultipleChoice() {
    const state = (Template.instance() as any).state.get();
    return state.responseType === 'multiple-choice';
  },

  isSeedMode(expectedMode: ManualCreatorState['seedMode']) {
    const state = (Template.instance() as any).state.get();
    return state.seedMode === expectedMode;
  },

  seedColumnHint() {
    const state = (Template.instance() as any).state.get();
    return getSeedColumnLabels(state).join(' | ');
  },

  rows() {
    const state = (Template.instance() as any).state.get();
    return state.rows.map((row: StarterRow, index: number) => ({
      ...row,
      rowNumber: index + 1
    }));
  },

  rowsCount() {
    const state = (Template.instance() as any).state.get();
    return Array.isArray(state.rows) ? state.rows.length : 0;
  },

  experimentLinkPreview() {
    const state = (Template.instance() as any).state.get();
    const slug = String(state.experimentTarget || '').trim();
    if (!slug) return '';
    return `/experiment/${slug}`;
  },

  draftLessons() {
    return (Template.instance() as any).draftLessons.get();
  },

  updateDraftLessons() {
    const instance = Template.instance() as any;
    return (lessons: any) => {
      instance.draftLessons.set(lessons);
      clearSuccessDraftMessage(instance);
    };
  },

  backToStarterContent() {
    const instance = Template.instance() as any;
    return () => {
      instance.generationResult.set(null);
      instance.packageError.set(null);
      instance.uploadStatus.set(null);
      instance.uploadError.set(null);
      instance.uploadComplete.set(false);
      clearSuccessDraftMessage(instance);
      instance.wizardStep.set(4);
    };
  },

  saveDraftAndContinue() {
    const instance = Template.instance() as any;
    return async () => {
      const lessons = instance.draftLessons.get();
      if (!Array.isArray(lessons) || lessons.length === 0) {
        instance.packageError.set('Generate a draft before finalizing.');
        return;
      }

      instance.packageError.set(null);
      instance.uploadStatus.set(null);
      instance.uploadError.set(null);
      instance.uploadComplete.set(false);

      try {
        const result = await buildImportPackageFromDraftLessons(lessons);
        instance.generationResult.set(result);
      } catch (error: unknown) {
        clientConsole(1, '[MANUAL CREATOR] Package build failed:', error);
        instance.packageError.set(getErrorMessage(error));
      }
    };
  },

  generationResult() {
    return (Template.instance() as any).generationResult.get();
  },

  packageReady() {
    return !!(Template.instance() as any).generationResult.get();
  },

  packageError() {
    return (Template.instance() as any).packageError.get();
  },

  uploadStatus() {
    return (Template.instance() as any).uploadStatus.get();
  },

  uploadError() {
    return (Template.instance() as any).uploadError.get();
  },

  uploadComplete() {
    return (Template.instance() as any).uploadComplete.get();
  },

  statusSummary() {
    const instance = Template.instance() as any;
    if (instance.uploadComplete.get()) return 'Uploaded';
    const uploadStatus = instance.uploadStatus.get();
    if (uploadStatus?.message) return uploadStatus.message;
    if (instance.generationResult.get()) return 'Package ready';
    const draftLessons = instance.draftLessons.get();
    if (Array.isArray(draftLessons) && draftLessons.length > 0) return 'Draft ready';
    const currentStep = instance.wizardStep.get();
    if (currentStep < 4) return 'Setup';
    if (currentStep === 4) return 'Starter content';
    return 'Edit draft';
  }
});

Template.manualContentCreator.events({
  'click #manual-save-draft'(event: any, instance: any) {
    event.preventDefault();
    void saveCurrentDraft(instance);
  },

  'click #manual-delete-draft'(event: any, instance: any) {
    event.preventDefault();
    const lessonName = String(instance.state.get()?.lessonName || 'this draft').trim() || 'this draft';
    if (!confirm(`Delete saved draft "${lessonName}" and leave the creator?`)) {
      return;
    }
    void deleteCurrentDraft(instance, { redirectToContent: true });
  },

  'click #manual-content-back'(event: any, instance: any) {
    event.preventDefault();
    const currentStep = instance.wizardStep.get();
    if (currentStep <= 1) return;
    instance.stepErrors.set([]);
    clearSuccessDraftMessage(instance);
    instance.wizardStep.set(currentStep - 1);
  },

  'click #manual-content-cancel'(event: any, _instance: any) {
    event.preventDefault();
    FlowRouter.go('/contentUpload');
  },

  'click #manual-content-next'(event: any, instance: any) {
    event.preventDefault();
    const currentStep = instance.wizardStep.get();
    const state = instance.state.get();
    const errors = validateManualCreatorStep(currentStep, state, () => Random.id());
    instance.stepErrors.set(errors);

    if (errors.length > 0) {
      return;
    }

    if (currentStep === 3) {
      initializeRowsIfNeeded(instance);
      clearSuccessDraftMessage(instance);
      instance.wizardStep.set(4);
      return;
    }

    if (currentStep === 4) {
      try {
        const normalizedState = state.seedMode === 'paste-table'
          ? {
              ...state,
              rows: resolveSeedRowsForValidation(state, () => Random.id())
            }
          : state;
        const lesson = buildManualDraftLesson(normalizedState);
        instance.draftLessons.set([lesson]);
        instance.generationResult.set(null);
        instance.packageError.set(null);
        instance.uploadStatus.set(null);
        instance.uploadError.set(null);
        instance.uploadComplete.set(false);
        clearSuccessDraftMessage(instance);
        instance.wizardStep.set(5);
      } catch (error: unknown) {
        clientConsole(1, '[MANUAL CREATOR] Draft build failed:', error);
        instance.stepErrors.set([getErrorMessage(error)]);
      }
      return;
    }

    if (currentStep < 4) {
      clearSuccessDraftMessage(instance);
      instance.wizardStep.set(currentStep + 1);
    }
  },

  'input [data-field], change [data-field]'(event: any, instance: any) {
    const field = String(event.currentTarget.dataset.field || '');
    if (!field) return;

    let value: any;
    if (event.currentTarget.type === 'checkbox') {
      value = !!event.currentTarget.checked;
    } else if (field === 'cardCount') {
      value = Number.parseInt(String(event.currentTarget.value || ''), 10) || 0;
    } else {
      value = event.currentTarget.value;
    }

    updateState(instance, (state) => ({
      ...state,
      [field]: value
    }));

    if (field === 'seedMode') {
      updateState(instance, (state) => {
        if (state.seedMode === 'example-duplicate' && state.rows.length === 0) {
          return {
            ...state,
            rows: [createStarterRow(Random.id())]
          };
        }
        return state;
      });
    }

    instance.stepErrors.set([]);
    clearGeneratedArtifacts(instance);
    clearSuccessDraftMessage(instance);
  },

  'click #add-starter-row'(event: any, instance: any) {
    event.preventDefault();
    updateState(instance, (state) => ({
      ...state,
      rows: [...state.rows, createStarterRow(Random.id())]
    }));
    instance.stepErrors.set([]);
    clearGeneratedArtifacts(instance);
    clearSuccessDraftMessage(instance);
  },

  'click .duplicate-starter-row'(event: any, instance: any) {
    event.preventDefault();
    const rowId = String(event.currentTarget.dataset.rowId || '');
    if (!rowId) return;

    updateState(instance, (state) => {
      const nextRows: StarterRow[] = [];
      state.rows.forEach((row) => {
        nextRows.push({ ...row });
        if (row.id === rowId) {
          nextRows.push({
            ...row,
            id: Random.id()
          });
        }
      });
      return {
        ...state,
        rows: nextRows
      };
    });
    instance.stepErrors.set([]);
    clearGeneratedArtifacts(instance);
    clearSuccessDraftMessage(instance);
  },

  'click .delete-starter-row'(event: any, instance: any) {
    event.preventDefault();
    const rowId = String(event.currentTarget.dataset.rowId || '');
    if (!rowId) return;

    updateState(instance, (state) => ({
      ...state,
      rows: state.rows.filter((row) => row.id !== rowId)
    }));
    instance.stepErrors.set([]);
    clearGeneratedArtifacts(instance);
    clearSuccessDraftMessage(instance);
  },

  'input .starter-row-input, change .starter-row-input'(event: any, instance: any) {
    const rowId = String(event.currentTarget.dataset.rowId || '');
    const field = String(event.currentTarget.dataset.field || '');
    if (!rowId || !field) return;

    updateState(instance, (state) => ({
      ...state,
      rows: state.rows.map((row) => (
        row.id === rowId
          ? { ...row, [field]: event.currentTarget.value }
          : row
      ))
    }));
    instance.stepErrors.set([]);
    clearGeneratedArtifacts(instance);
    clearSuccessDraftMessage(instance);
  },

  'input #manual-seed-table-text, change #manual-seed-table-text'(event: any, instance: any) {
    const seedTableText = String(event.currentTarget.value || '');
    updateState(instance, (state) => ({
      ...state,
      seedTableText,
      rows: parseSeedTableText({
        ...state,
        seedTableText
      }, () => Random.id())
    }));
    instance.stepErrors.set([]);
    clearGeneratedArtifacts(instance);
    clearSuccessDraftMessage(instance);
  },

  'click #manual-edit-draft'(event: any, instance: any) {
    event.preventDefault();
    instance.generationResult.set(null);
    instance.packageError.set(null);
    instance.uploadStatus.set(null);
    instance.uploadError.set(null);
    instance.uploadComplete.set(false);
  },

  'click #manual-download-package'(event: any, instance: any) {
    event.preventDefault();
    const result = instance.generationResult.get();
    if (!result?.zipBlob) {
      return;
    }

    const firstManifest = Array.isArray(result.manifest) && result.manifest.length > 0
      ? result.manifest[0]
      : null;
    const fileName = firstManifest ? `${firstManifest.tdfName}.zip` : 'MoFaCTS_Manual_Content.zip';

    const url = URL.createObjectURL(result.zipBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },

  'click #manual-upload-package'(event: any, instance: any) {
    event.preventDefault();
    const result = instance.generationResult.get();
    if (!result?.zipBlob || instance.uploadStatus.get()) {
      return;
    }

    instance.uploadError.set(null);

    const firstManifest = Array.isArray(result.manifest) && result.manifest.length > 0
      ? result.manifest[0]
      : null;
    const fileName = firstManifest ? `${firstManifest.tdfName}.zip` : 'MoFaCTS_Manual_Content.zip';

    const startUpload = async () => {
      try {
        const existingFile = await (Meteor as any).callAsync('getUserAssetByName', fileName);
        if (existingFile) {
          if (!confirm('Uploading this file will overwrite existing data. Continue?')) {
            return;
          }
          await (Meteor as any).callAsync('removeAssetById', existingFile._id);
        }

        const file = new File([result.zipBlob], fileName, { type: 'application/zip' });
        const upload = DynamicAssets.insert({
          file,
          chunkSize: 'dynamic'
        }, false);

        upload.on('start', function() {
          instance.uploadStatus.set({
            message: 'Uploading package...',
            progress: 5
          });
        });

        upload.on('progress', function(progress: number) {
          instance.uploadStatus.set({
            message: 'Uploading package...',
            progress: Math.round(progress * 0.5)
          });
        });

        upload.on('end', async function(error: any, fileObj: any) {
          if (error) {
            instance.uploadStatus.set(null);
            instance.uploadError.set(`Upload failed: ${error}`);
            return;
          }

          try {
            instance.uploadStatus.set({
              message: 'Processing package...',
              progress: 65
            });

            const link = DynamicAssets.link({ ...fileObj });
            const uploadIntegrity = await getUploadIntegrity(file);
            const processResult = await (Meteor as any).callAsync(
              'processPackageUpload',
              fileObj._id,
              Meteor.userId(),
              link,
              false,
              uploadIntegrity
            );

            for (const res of processResult.results || []) {
              if (res?.data?.res === 'awaitClientTDF') {
                const reasons = Array.isArray(res.data.reason) ? res.data.reason : [];
                const prompts = [];
                if (reasons.includes('prevTDFExists')) {
                  prompts.push(`Previous ${res.data.TDF.content.fileName} already exists and will be overwritten. Continue?`);
                }
                if (reasons.includes('prevStimExists')) {
                  prompts.push(`Previous ${res.data.TDF.content.tdfs.tutor.setspec.stimulusfile} already exists and will be overwritten. Continue?`);
                }

                if (prompts.length === 0 || confirm(prompts.join('\n'))) {
                  instance.uploadStatus.set({
                    message: 'Confirming TDF update...',
                    progress: 92
                  });
                  await (Meteor as any).callAsync('tdfUpdateConfirmed', res.data.TDF, false, reasons);
                } else {
                  instance.uploadStatus.set(null);
                  instance.uploadError.set('Upload canceled during overwrite confirmation.');
                  return;
                }
              } else if (!res?.result) {
                instance.uploadStatus.set(null);
                instance.uploadError.set(`Package upload failed: ${res?.errmsg || 'unknown error'}`);
                return;
              }
            }

            instance.uploadStatus.set(null);
            instance.uploadComplete.set(true);
            Session.set('assetsRefreshTrigger', Date.now());
            if (instance.currentDraftId.get()) {
              await deleteCurrentDraft(instance, { silent: true });
            }
          } catch (processError: unknown) {
            clientConsole(1, '[MANUAL CREATOR] Package processing failed:', processError);
            instance.uploadStatus.set(null);
            instance.uploadError.set(getErrorMessage(processError));
          }
        });

        upload.start();
      } catch (error: unknown) {
        clientConsole(1, '[MANUAL CREATOR] Upload setup failed:', error);
        instance.uploadStatus.set(null);
        instance.uploadError.set(getErrorMessage(error));
      }
    };

    void startUpload();
  },

  'click #manual-return-to-content'(event: any, _instance: any) {
    event.preventDefault();
    FlowRouter.go('/contentUpload');
  }
});
