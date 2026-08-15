import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import './aiContentCreator.html';
import '../aiContentReview.html';
import './aiContentCreator.css';
import { clientConsole } from '../..';
import { getErrorMessage } from '../../lib/errorUtils';
import { getUploadIntegrity } from '../../lib/uploadIntegrity';
import type { OpenRouterCapability } from '../../lib/openRouterClientProfile';
import { getAiContentOpenRouterCapability } from '../../lib/aiContentOpenRouterClient';
import {
  AI_CONTENT_CONTRACT_VERSION,
  getAiContentSaveBlockingIssues,
  getAiContentSaveWarnings,
  imageStimulusForResponse,
  type AiContentPair,
  type AiContentPhase,
  type AiContentSaveContract,
  type AiContentStageName,
  type AiContentWorkingRecord,
  type AiCreationMode,
} from '../../../common/aiContentContract';
import { runAiContentPipeline } from '../../lib/aiContentPipeline';
import { aiContentPipelineProgressMessage } from '../../lib/aiContentStagePresentation';
import { aiContentSystemTitle } from '../../lib/aiContentTitle';
import type { AcquiredWikimediaAsset } from '../../lib/aiContentWikimediaFiles';
import { buildAiContentDraft } from '../../lib/aiContentDraftBuilder';
import {
  buildUploadWithNameConflictRetry,
  suggestedReplacementName,
  type GeneratedNameConflict,
} from '../../lib/aiContentPackageSave';
import {
  collectAiImageDropSources,
  prepareAiImageAssets,
  sourcesFromFileList,
  uniqueAiImagePackageFileName,
  type AiImageSourceFile,
  type PreparedAiImageAsset,
} from '../../lib/aiContentImageAssets';
import {
  AiContentWorkingSaveQueue,
  clearAiContentWorkingSnapshot,
  loadAiContentWorkingSnapshot,
  type LocalAiContentAsset,
} from '../../lib/aiContentWorkingStore';
import { hasPublicCreatorDisplayName } from '../../lib/contentCreatorIdentity';

const MeteorAny = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };
const FlowRouter = (globalThis as any).FlowRouter;
declare const DynamicAssets: any;

type StatusKind = 'info' | 'success' | 'warning' | 'error';
type BlazeDragEvent = DragEvent & { originalEvent?: DragEvent };

type AiCreatorInstance = Blaze.TemplateInstance & {
  data?: { embedded?: boolean };
  creating: ReactiveVar<boolean>;
  discarding: ReactiveVar<boolean>;
  notes: ReactiveVar<string>;
  mode: ReactiveVar<AiCreationMode>;
  localAssets: ReactiveVar<LocalAiContentAsset[]>;
  activeRecord: ReactiveVar<AiContentWorkingRecord | null>;
  statusMessage: ReactiveVar<string>;
  statusKind: ReactiveVar<StatusKind>;
  saveBlockingIssues: ReactiveVar<string[]>;
  replacingReviewImage: ReactiveVar<boolean>;
  openRouterCapability: ReactiveVar<OpenRouterCapability | null>;
  workingUserId: string;
  workingSaveQueue: AiContentWorkingSaveQueue;
  operationSequence: number;
};

class SupersededAiContentRunError extends Error {
  constructor() {
    super('This AI Content run was superseded by a newer operation.');
    this.name = 'SupersededAiContentRunError';
  }
}

function setStatus(instance: AiCreatorInstance, kind: StatusKind, message: string): void {
  instance.statusKind.set(kind);
  instance.statusMessage.set(message);
}

function requireWorkingUser(instance: AiCreatorInstance): string {
  const currentUserId = Meteor.userId();
  if (!currentUserId || currentUserId !== instance.workingUserId) {
    throw new Error('Your signed-in account changed. Reload AI Content Creator before continuing.');
  }
  return currentUserId;
}

function statusClass(kind: StatusKind): string {
  return kind === 'error' ? 'danger' : kind;
}

function revokeAssets(assets: LocalAiContentAsset[]): void {
  assets.forEach((asset) => URL.revokeObjectURL(asset.previewUrl));
}

async function refreshOpenRouterCapability(instance: AiCreatorInstance): Promise<OpenRouterCapability> {
  const capability = await getAiContentOpenRouterCapability();
  instance.openRouterCapability.set(capability);
  return capability;
}

async function persistSnapshot(instance: AiCreatorInstance, record: AiContentWorkingRecord): Promise<void> {
  requireWorkingUser(instance);
  instance.activeRecord.set(record);
  await instance.workingSaveQueue.enqueue({ record, assets: instance.localAssets.get() });
}

function updatedRecord(record: AiContentWorkingRecord, patch: Partial<AiContentWorkingRecord>): AiContentWorkingRecord {
  return { ...record, ...patch, updatedAt: new Date().toISOString() };
}

async function loadWorkingRecord(instance: AiCreatorInstance): Promise<void> {
  const snapshot = await loadAiContentWorkingSnapshot(requireWorkingUser(instance));
  if (!snapshot) return;
  instance.localAssets.set(snapshot.assets);
  instance.activeRecord.set(snapshot.record);
  instance.notes.set(snapshot.record.notes);
  instance.mode.set(snapshot.record.mode);
}

async function clearWorkingRecord(instance: AiCreatorInstance): Promise<void> {
  const userId = requireWorkingUser(instance);
  instance.operationSequence += 1;
  await instance.workingSaveQueue.flush();
  revokeAssets(instance.localAssets.get());
  await clearAiContentWorkingSnapshot(userId);
  instance.localAssets.set([]);
  instance.activeRecord.set(null);
  instance.notes.set('');
  instance.mode.set('learning');
  instance.saveBlockingIssues.set([]);
}

async function localizeWikimediaAsset(
  acquired: AcquiredWikimediaAsset,
  existing: PreparedAiImageAsset[],
): Promise<LocalAiContentAsset> {
  if (acquired.webpBytes.byteLength === 0 || !acquired.webpWidth || !acquired.webpHeight) {
    throw new Error('The prepared WebP image is empty or has invalid dimensions.');
  }
  const sourceTitle = acquired.candidate.fileTitle.replace(/^File:/i, '').trim();
  const packageFileName = uniqueAiImagePackageFileName(sourceTitle, existing.map((asset) => asset.packageFileName));
  const prepared: PreparedAiImageAsset = {
    id: packageFileName,
    originalName: sourceTitle,
    sourcePath: acquired.candidate.commonsUrl,
    packageFileName,
    bytes: acquired.webpBytes,
    width: acquired.webpWidth,
    height: acquired.webpHeight,
  };
  return {
    ...prepared,
    purpose: 'resolved',
    previewUrl: URL.createObjectURL(new Blob([new Uint8Array(prepared.bytes).buffer], { type: 'image/webp' })),
  };
}

function phaseForStage(stage: AiContentStageName | undefined): AiContentPhase {
  if (!stage || stage === 'interpret-request') return 'interpreting';
  if (stage === 'search-wikipedia' || stage === 'select-list-page' || stage === 'fetch-list-page') return 'searching-source';
  if (stage === 'select-list-region' || stage === 'extract-list-entries') return 'extracting-items';
  if (stage === 'generate-definition') return 'generating-prompts';
  return 'resolving-images';
}

async function runCreation(instance: AiCreatorInstance): Promise<void> {
  if (instance.creating.get()) return;
  const notes = instance.notes.get().trim();
  if (!notes) {
    setStatus(instance, 'warning', 'Add author notes before submitting.');
    return;
  }
  instance.creating.set(true);
  instance.saveBlockingIssues.set([]);
  setStatus(instance, 'info', 'Starting content creation and checking the configured AI service.');
  const operation = ++instance.operationSequence;
  try {
    const capability = await refreshOpenRouterCapability(instance);
    if (!capability.configured || !capability.model) throw new Error('No OpenRouter model and key are configured for content creation.');
    const started: AiContentWorkingRecord = {
      contractVersion: AI_CONTENT_CONTRACT_VERSION,
      phase: 'interpreting',
      notes,
      mode: instance.mode.get(),
      title: 'AI Created Content',
      model: capability.model,
      reasoningLevel: capability.reasoningLevel,
      responseType: 'text',
      pairs: [],
      warnings: [],
      failure: null,
      updatedAt: new Date().toISOString(),
    };
    const priorAssets = instance.localAssets.get();
    revokeAssets(priorAssets);
    instance.localAssets.set([]);
    await persistSnapshot(instance, started);
    setStatus(instance, 'info', 'Finding the authoritative Wikipedia list and creating content. Do not navigate away.');

    const result = await runAiContentPipeline({
      notes,
      mode: started.mode,
      model: capability.model,
      reasoningLevel: capability.reasoningLevel,
      revision: operation,
      assertCurrent() {
        if (instance.operationSequence !== operation) throw new SupersededAiContentRunError();
      },
      onRunUpdated(run) {
        if (instance.operationSequence !== operation) return;
        const current = instance.activeRecord.get() || started;
        const latestStage = run.traces.at(-1)?.stage;
        const next = updatedRecord(current, {
          phase: phaseForStage(latestStage),
          pipelineRun: run,
          ...(run.intent ? {
            promptType: run.intent.promptType,
            title: aiContentSystemTitle(run.intent, run.entries.length, started.mode),
          } : {}),
        });
        instance.activeRecord.set(next);
        if (instance.statusKind.get() !== 'error') {
          setStatus(instance, 'info', aiContentPipelineProgressMessage(run));
        }
        void instance.workingSaveQueue.enqueue({ record: next, assets: instance.localAssets.get() })
          .catch((error) => setStatus(instance, 'error', getErrorMessage(error)));
      },
    });
    if (instance.operationSequence !== operation) return;

    setStatus(instance, 'info', `Preparing ${result.assets.length} resolved image${result.assets.length === 1 ? '' : 's'} for review.`);
    let pairs = result.pairs;
    const localizedAssets: LocalAiContentAsset[] = [];
    const stagingWarnings: string[] = [];
    for (const acquired of result.assets) {
      try {
        const local = await localizeWikimediaAsset(acquired, localizedAssets);
        localizedAssets.push(local);
        pairs = pairs.map((pair) => pair.id === acquired.candidate.itemId ? {
          ...pair,
          image: {
            ...pair.image,
            status: 'resolved',
            source: 'wikimedia',
            assetId: local.id,
            fileName: local.packageFileName,
            previewUrl: local.previewUrl,
            sourceTitle: acquired.candidate.fileTitle.replace(/^File:/i, ''),
            sourceUrl: acquired.candidate.commonsUrl,
            attribution: acquired.candidate.attribution,
          },
        } : pair);
      } catch (error) {
        const reason = `The selected Wikimedia image could not be staged for review: ${getErrorMessage(error)}`;
        stagingWarnings.push(`${acquired.candidate.itemId}: ${reason}`);
        pairs = pairs.map((pair) => pair.id === acquired.candidate.itemId ? {
          ...pair,
          image: { status: 'unresolved', failureReason: reason },
        } : pair);
      }
    }
    if (instance.operationSequence !== operation) {
      revokeAssets(localizedAssets);
      return;
    }
    instance.localAssets.set(localizedAssets);
    const record = updatedRecord(instance.activeRecord.get() || started, {
      phase: 'review',
      pipelineRun: result.run,
      ...(result.run.intent ? { promptType: result.run.intent.promptType } : {}),
      pairs,
      warnings: Array.from(new Set([...result.warnings, ...stagingWarnings])),
      failure: null,
    });
    await persistSnapshot(instance, record);
    const unresolved = record.pairs.filter((pair) => !pair.stimulus.trim() || (pair.kind === 'image' && pair.image?.status !== 'resolved')).length;
    setStatus(instance, unresolved > 0 ? 'warning' : 'success', unresolved > 0
      ? `Content is ready to review. ${unresolved} item${unresolved === 1 ? '' : 's'} require manual completion.`
      : 'Content is ready to review.');
  } catch (error) {
    if (error instanceof SupersededAiContentRunError) return;
    const message = getErrorMessage(error);
    const current = instance.activeRecord.get();
    if (current && instance.operationSequence === operation) {
      await persistSnapshot(instance, updatedRecord(current, {
        phase: 'input',
        failure: { stage: current.phase, code: 'creation-failed', message },
      })).catch(() => undefined);
    }
    setStatus(instance, 'error', message);
  } finally {
    if (instance.operationSequence === operation) instance.creating.set(false);
  }
}

function currentSaveContract(record: AiContentWorkingRecord): AiContentSaveContract {
  return {
    contractVersion: AI_CONTENT_CONTRACT_VERSION,
    mode: record.mode,
    title: record.title.trim(),
    pairs: record.pairs.map((pair) => ({
      id: pair.id,
      kind: pair.kind,
      stimulus: pair.stimulus,
      response: pair.response,
      ...(pair.kind === 'image' && pair.image?.status === 'resolved' && pair.image.source && pair.image.fileName
        ? {
            image: {
              source: pair.image.source,
              fileName: pair.image.fileName,
              ...(pair.image.attribution ? { attribution: pair.image.attribution } : {}),
            },
          }
        : {}),
    })),
  };
}

function updateRecord(instance: AiCreatorInstance, transform: (record: AiContentWorkingRecord) => AiContentWorkingRecord): void {
  const record = instance.activeRecord.get();
  if (!record) return;
  const next = updatedRecord(transform(record), {});
  instance.activeRecord.set(next);
  requireWorkingUser(instance);
  void instance.workingSaveQueue.enqueue({ record: next, assets: instance.localAssets.get() })
    .catch((error) => setStatus(instance, 'error', getErrorMessage(error)));
}

function updatePair(instance: AiCreatorInstance, pairId: string, transform: (pair: AiContentPair) => AiContentPair): void {
  updateRecord(instance, (record) => ({
    ...record,
    pairs: record.pairs.map((pair) => pair.id === pairId ? transform(pair) : pair),
  }));
}

async function replaceReviewImage(instance: AiCreatorInstance, pairId: string, sources: AiImageSourceFile[]): Promise<void> {
  if (instance.replacingReviewImage.get()) throw new Error('Wait for the current image replacement to finish.');
  if (sources.length !== 1) throw new Error('Choose or drop exactly one image for each review slot.');
  const record = instance.activeRecord.get();
  const supersededAssetId = record?.pairs.find((pair) => pair.id === pairId)?.image?.assetId;
  const retainedAssets = instance.localAssets.get().filter((asset) => asset.id !== supersededAssetId);
  instance.replacingReviewImage.set(true);
  try {
    const prepared = await prepareAiImageAssets(sources, retainedAssets);
    if (prepared.length !== 1) throw new Error('Choose or drop exactly one image for each review slot.');
    const local: LocalAiContentAsset = {
      ...prepared[0]!,
      purpose: 'resolved',
      previewUrl: URL.createObjectURL(new Blob([new Uint8Array(prepared[0]!.bytes).buffer], { type: 'image/webp' })),
    };
    const supersededAsset = instance.localAssets.get().find((asset) => asset.id === supersededAssetId);
    instance.localAssets.set([...retainedAssets, local]);
    updatePair(instance, pairId, (pair) => ({
      ...pair,
      provenance: { ...pair.provenance, sourcePath: 'unresolved' },
      image: {
        status: 'resolved',
        source: 'user-replacement',
        assetId: local.id,
        fileName: local.packageFileName,
        previewUrl: local.previewUrl,
      },
    }));
    await new Promise<void>((resolve) => Tracker.afterFlush(resolve));
    if (supersededAsset?.purpose === 'resolved') URL.revokeObjectURL(supersededAsset.previewUrl);
    await instance.workingSaveQueue.flush();
  } finally {
    instance.replacingReviewImage.set(false);
  }
}

async function saveReviewedContent(instance: AiCreatorInstance): Promise<void> {
  if (instance.creating.get()) return;
  const record = instance.activeRecord.get();
  if (!record) return;
  const contract = currentSaveContract(record);
  const issues = getAiContentSaveBlockingIssues(contract);
  if (issues.length > 0) {
    instance.saveBlockingIssues.set(issues);
    setStatus(instance, 'warning', 'Complete the highlighted review items before saving.');
    Tracker.afterFlush(() => document.getElementById('ai-save-content')?.focus());
    return;
  }
  const warnings = getAiContentSaveWarnings(contract);
  if (warnings.length > 0 && !window.confirm(`${warnings.join('\n\n')}\n\nSave the content now?`)) return;
  instance.creating.set(true);
  try {
    await instance.workingSaveQueue.flush();
    await persistSnapshot(instance, updatedRecord(record, { phase: 'saving' }));
    const referencedIds = new Set(record.pairs.map((pair) => pair.image?.assetId).filter(Boolean));
    const referencedAssets = instance.localAssets.get().filter((asset) => referencedIds.has(asset.id));
    const draft = buildAiContentDraft(contract, referencedAssets);
    setStatus(instance, 'info', 'Saving content...');
    const { outputs } = await buildUploadWithNameConflictRetry([draft], `Created ${contract.pairs.length} stimulus-response pairs.`, {
      dynamicAssets: DynamicAssets,
      callAsync: MeteorAny.callAsync.bind(MeteorAny),
      getUploadIntegrity,
      promptForReplacementName: (conflict: GeneratedNameConflict) => {
        const entered = window.prompt(`Content named "${conflict.tdfFile}" already exists. Enter a different title:`, suggestedReplacementName(conflict));
        return entered?.trim() || null;
      },
      refreshAssets: () => Session.set('assetsRefreshTrigger', Date.now()),
      logCleanupError: (error) => clientConsole(1, '[AI CONTENT CREATOR] Package cleanup failed:', error),
    }, contract);
    await clearWorkingRecord(instance);
    setStatus(instance, 'success', `Saved ${outputs.length} content system${outputs.length === 1 ? '' : 's'}.`);
    Session.set('assetsRefreshTrigger', Date.now());
  } catch (error) {
    const message = getErrorMessage(error);
    const current = instance.activeRecord.get();
    if (current) {
      await persistSnapshot(instance, updatedRecord(current, {
        phase: 'review',
        failure: { stage: 'saving', code: 'save-failed', message },
      })).catch(() => undefined);
    }
    setStatus(instance, 'error', message);
  } finally {
    instance.creating.set(false);
  }
}

Template.aiContentCreator.onCreated(function(this: AiCreatorInstance) {
  this.creating = new ReactiveVar(false);
  this.discarding = new ReactiveVar(false);
  this.notes = new ReactiveVar('');
  this.mode = new ReactiveVar('learning');
  this.localAssets = new ReactiveVar([]);
  this.activeRecord = new ReactiveVar(null);
  this.statusMessage = new ReactiveVar('');
  this.statusKind = new ReactiveVar('info');
  this.saveBlockingIssues = new ReactiveVar([]);
  this.replacingReviewImage = new ReactiveVar(false);
  this.openRouterCapability = new ReactiveVar(null);
  const workingUserId = Meteor.userId();
  if (!workingUserId) throw new Error('AI Content Creator requires an authenticated user.');
  this.workingUserId = workingUserId;
  this.workingSaveQueue = new AiContentWorkingSaveQueue(workingUserId);
  this.operationSequence = 0;
  void Promise.all([loadWorkingRecord(this), refreshOpenRouterCapability(this)])
    .catch((error) => setStatus(this, 'error', getErrorMessage(error)));
});

Template.aiContentCreator.onDestroyed(function(this: AiCreatorInstance) {
  revokeAssets(this.localAssets.get());
});

Template.aiContentCreator.helpers({
  embedded() { return Boolean((Template.instance() as AiCreatorInstance).data?.embedded); },
  showInput() { return (Template.instance() as AiCreatorInstance).activeRecord.get()?.phase !== 'review'; },
  showReview() { return (Template.instance() as AiCreatorInstance).activeRecord.get()?.phase === 'review'; },
  notes() { return (Template.instance() as AiCreatorInstance).notes.get(); },
  learningSelected() { return (Template.instance() as AiCreatorInstance).mode.get() === 'learning'; },
  testSelected() { return (Template.instance() as AiCreatorInstance).mode.get() === 'test'; },
  creating() { return (Template.instance() as AiCreatorInstance).creating.get(); },
  submitDisabled() { return (Template.instance() as AiCreatorInstance).creating.get() ? { disabled: true } : {}; },
  statusMessage() { return (Template.instance() as AiCreatorInstance).statusMessage.get(); },
  statusClass() { return statusClass((Template.instance() as AiCreatorInstance).statusKind.get()); },
  reviewTitle() { return (Template.instance() as AiCreatorInstance).activeRecord.get()?.title || ''; },
  reviewPairs() {
    const instance = Template.instance() as AiCreatorInstance;
    const replacingReviewImage = instance.replacingReviewImage.get();
    return (instance.activeRecord.get()?.pairs || []).map((pair, index) => ({
      ...pair,
      number: index + 1,
      isText: pair.kind === 'text',
      isImage: pair.kind === 'image',
      editable: true,
      promptLabel: 'Stimulus',
      showImageRequirement: false,
      imageResolved: pair.kind === 'image' && pair.image?.status === 'resolved',
      imagePreviewUrl: pair.image?.previewUrl || '',
      imageAlt: `Review image for pair ${index + 1}`,
      imageFailureReason: pair.image?.failureReason || 'Drop or choose an image.',
      imageReplacementInProgress: replacingReviewImage,
      imageSourceUrl: pair.image?.sourceUrl || '',
      hasImageSource: Boolean(pair.image?.sourceUrl),
    }));
  },
  reviewWarnings() { return (Template.instance() as AiCreatorInstance).activeRecord.get()?.warnings || []; },
  saveBlockingIssues() { return (Template.instance() as AiCreatorInstance).saveBlockingIssues.get(); },
});

Template.aiContentCreator.events({
  'input #ai-notes'(event: Event, instance: AiCreatorInstance) {
    instance.notes.set((event.currentTarget as HTMLTextAreaElement).value);
  },
  'click .ai-mode-option'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    const mode = String((event.currentTarget as HTMLElement).dataset.mode || '');
    if (mode === 'learning' || mode === 'test') instance.mode.set(mode);
  },
  'click #ai-submit'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    if (!hasPublicCreatorDisplayName(Meteor.user())) {
      FlowRouter.go('/profile?contentCreator=required');
      return;
    }
    void runCreation(instance);
  },
  'input #ai-review-title'(event: Event, instance: AiCreatorInstance) {
    updateRecord(instance, (record) => ({ ...record, title: (event.currentTarget as HTMLInputElement).value }));
  },
  'input .ai-review-stimulus'(event: Event, instance: AiCreatorInstance) {
    const input = event.currentTarget as HTMLTextAreaElement;
    updatePair(instance, String(input.dataset.pairId || ''), (pair) => ({ ...pair, stimulus: input.value }));
  },
  'input .ai-review-response'(event: Event, instance: AiCreatorInstance) {
    const input = event.currentTarget as HTMLInputElement;
    updatePair(instance, String(input.dataset.pairId || ''), (pair) => ({
      ...pair,
      response: input.value,
      ...(pair.kind === 'image' ? { stimulus: imageStimulusForResponse(input.value) } : {}),
    }));
  },
  'change .ai-review-image-input'(event: Event, instance: AiCreatorInstance) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files?.length) {
      setStatus(instance, 'info', 'Preparing replacement image...');
      void replaceReviewImage(instance, String(input.dataset.pairId || ''), sourcesFromFileList(input.files))
        .then(() => setStatus(instance, 'success', 'Replacement image prepared as WebP.'))
        .catch((error) => setStatus(instance, 'error', getErrorMessage(error)));
    }
    input.value = '';
  },
  'dragenter .ai-review-image-drop-target, dragover .ai-review-image-drop-target'(event: BlazeDragEvent) {
    event.preventDefault();
    const transfer = event.originalEvent?.dataTransfer || event.dataTransfer;
    if (transfer) transfer.dropEffect = 'copy';
    (event.currentTarget as HTMLElement).classList.add('is-drag-over');
  },
  'dragleave .ai-review-image-drop-target'(event: BlazeDragEvent) {
    const current = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (!related || !current.contains(related)) current.classList.remove('is-drag-over');
  },
  'drop .ai-review-image-drop-target'(event: BlazeDragEvent, instance: AiCreatorInstance) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('is-drag-over');
    const transfer = event.originalEvent?.dataTransfer || event.dataTransfer;
    const pairId = String((event.currentTarget as HTMLElement).dataset.pairId || '');
    if (transfer) {
      setStatus(instance, 'info', 'Preparing replacement image...');
      void collectAiImageDropSources(transfer)
        .then((sources) => replaceReviewImage(instance, pairId, sources))
        .then(() => setStatus(instance, 'success', 'Replacement image prepared as WebP.'))
        .catch((error) => setStatus(instance, 'error', getErrorMessage(error)));
    }
  },
  'click #ai-back'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    updateRecord(instance, (record) => ({ ...record, phase: 'input' }));
  },
  'click #ai-save-content'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    void saveReviewedContent(instance);
  },
  'click #ai-discard'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    if (instance.discarding.get()) return;
    instance.discarding.set(true);
    void clearWorkingRecord(instance)
      .then(() => setStatus(instance, 'info', 'Working content discarded.'))
      .catch((error) => setStatus(instance, 'error', getErrorMessage(error)))
      .finally(() => instance.discarding.set(false));
  },
});
