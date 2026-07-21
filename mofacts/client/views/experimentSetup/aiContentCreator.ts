import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { ReactiveVar } from 'meteor/reactive-var';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import './aiContentCreator.html';
import './aiContentCreator.css';
import { clientConsole } from '../..';
import { getErrorMessage } from '../../lib/errorUtils';
import { getUploadIntegrity } from '../../lib/uploadIntegrity';
import { getOpenRouterCapability, type OpenRouterCapability } from '../../lib/openRouterClientProfile';
import {
  AI_CONTENT_CONTRACT_VERSION,
  getAiContentSaveBlockingIssues,
  getAiContentSaveWarnings,
  imageStimulusForResponse,
  validateGeneratedPairs,
  type AiContentPair,
  type AiContentSaveContract,
  type AiContentWorkingRecord,
  type AiCreationMode,
  type GeneratedPair,
} from '../../../common/aiContentContract';
import { imageModalityIssues, notesExplicitlyRequestImages } from '../../lib/aiContentPrompts';
import { callOpenRouterForPairRepair, callOpenRouterForPairs, type AiPairPromptImage } from '../../lib/aiContentOpenRouterClient';
import {
  discoverAuthoritativeWikimediaPairs,
  discoverWikimediaImages,
  type WikimediaDiscoveredAsset,
} from '../../lib/aiContentImageSets';
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
  processingImages: ReactiveVar<boolean>;
  notes: ReactiveVar<string>;
  mode: ReactiveVar<AiCreationMode>;
  localAssets: ReactiveVar<LocalAiContentAsset[]>;
  activeRecord: ReactiveVar<AiContentWorkingRecord | null>;
  statusMessage: ReactiveVar<string>;
  statusKind: ReactiveVar<StatusKind>;
  saveBlockingIssues: ReactiveVar<string[]>;
  openRouterCapability: ReactiveVar<OpenRouterCapability | null>;
  workingUserId: string;
  workingSaveQueue: AiContentWorkingSaveQueue;
  operationSequence: number;
};

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
  if (kind === 'error') return 'danger';
  return kind;
}

function inputAssets(instance: AiCreatorInstance): LocalAiContentAsset[] {
  return instance.localAssets.get().filter((asset) => asset.purpose === 'input');
}

function revokeAssets(assets: LocalAiContentAsset[]): void {
  assets.forEach((asset) => URL.revokeObjectURL(asset.previewUrl));
}

function deriveTitle(notes: string): string {
  const firstLine = String(notes || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
  const cleaned = firstLine.replace(/\b(with|using)\s+(image|images|image prompts|pictures|photos|diagrams)\b/gi, '').replace(/\s+/g, ' ').trim();
  return cleaned;
}

async function refreshOpenRouterCapability(instance: AiCreatorInstance): Promise<OpenRouterCapability> {
  const capability = await getOpenRouterCapability();
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
  const userId = requireWorkingUser(instance);
  const snapshot = await loadAiContentWorkingSnapshot(userId);
  if (!snapshot) return;
  if (snapshot.record.contractVersion !== AI_CONTENT_CONTRACT_VERSION) {
    revokeAssets(snapshot.assets);
    await clearAiContentWorkingSnapshot(userId);
    return;
  }
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

async function addImageSources(instance: AiCreatorInstance, sources: AiImageSourceFile[]): Promise<void> {
  if (sources.length === 0) return;
  instance.processingImages.set(true);
  setStatus(instance, 'info', 'Preparing images...');
  try {
    const existing = instance.localAssets.get();
    const prepared = await prepareAiImageAssets(sources, existing);
    const additions: LocalAiContentAsset[] = prepared.map((asset) => ({
      ...asset,
      purpose: 'input',
      previewUrl: URL.createObjectURL(new Blob([new Uint8Array(asset.bytes).buffer], { type: 'image/webp' })),
    }));
    instance.localAssets.set([...existing, ...additions]);
    setStatus(instance, 'success', `Prepared ${additions.length} image${additions.length === 1 ? '' : 's'} as WebP.`);
  } finally {
    instance.processingImages.set(false);
  }
}

function assetDataUrl(asset: PreparedAiImageAsset): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${asset.originalName}.`));
    reader.readAsDataURL(new Blob([new Uint8Array(asset.bytes).buffer], { type: 'image/webp' }));
  });
}

function validatePairResponse(value: unknown, notes: string, uploadCount: number): GeneratedPair[] {
  const checked = validateGeneratedPairs(value);
  const modality = imageModalityIssues(checked, notes, uploadCount);
  if (modality.length > 0) throw new Error(modality.join(' '));
  return checked;
}

async function generatePairs(
  notes: string,
  model: string,
  images: AiPairPromptImage[],
): Promise<GeneratedPair[]> {
  const raw = await callOpenRouterForPairs(notes, model, images);
  try {
    return validatePairResponse(raw, notes, images.length);
  } catch (validationError) {
    const errors = [getErrorMessage(validationError)];
    const repaired = await callOpenRouterForPairRepair(notes, model, images, raw, errors);
    return validatePairResponse(repaired, notes, images.length);
  }
}

function workingPairs(generatedPairs: GeneratedPair[], uploads: LocalAiContentAsset[]): AiContentPair[] {
  let uploadIndex = 0;
  return generatedPairs.map((pair) => {
    const id = Random.id();
    if (pair.kind === 'text') return { id, ...pair };
    const upload = uploads[uploadIndex];
    uploadIndex += 1;
    return {
      id,
      ...pair,
      image: upload ? {
        status: 'resolved',
        source: 'uploaded',
        assetId: upload.id,
        fileName: upload.packageFileName,
        previewUrl: upload.previewUrl,
      } : {
        status: 'unresolved',
        failureReason: 'No image has been selected yet.',
      },
    };
  });
}

async function localizeWikimediaAsset(
  discovered: WikimediaDiscoveredAsset,
  existing: PreparedAiImageAsset[],
): Promise<LocalAiContentAsset> {
  const packageFileName = uniqueAiImagePackageFileName(
    discovered.sourceTitle,
    existing.map((asset) => asset.packageFileName),
  );
  const prepared: PreparedAiImageAsset = {
    id: packageFileName,
    originalName: discovered.sourceTitle,
    sourcePath: discovered.sourceUrl,
    packageFileName,
    bytes: discovered.webpBytes,
    width: discovered.webpWidth,
    height: discovered.webpHeight,
  };
  return {
    ...prepared,
    purpose: 'resolved',
    previewUrl: URL.createObjectURL(new Blob([new Uint8Array(prepared.bytes).buffer], { type: 'image/webp' })),
  };
}

async function resolveImages(
  instance: AiCreatorInstance,
  record: AiContentWorkingRecord,
  operation: number,
): Promise<AiContentWorkingRecord> {
  const unresolved = record.pairs.filter((pair) => pair.kind === 'image' && pair.image?.status !== 'resolved');
  if (unresolved.length === 0) return record;
  const discovering = updatedRecord(record, { phase: 'discovering-media' });
  await persistSnapshot(instance, discovering);
  const result = await discoverWikimediaImages({
    notes: record.notes,
    pairs: record.pairs,
    model: record.model,
  });
  if (instance.operationSequence !== operation) return discovering;
  let pairs = discovering.pairs;
  const localizedAssets: LocalAiContentAsset[] = [];
  const conversionFailures: string[] = [];
  for (const discovered of result.assets) {
    try {
      const local = await localizeWikimediaAsset(discovered, [...instance.localAssets.get(), ...localizedAssets]);
      localizedAssets.push(local);
      pairs = pairs.map((pair) => pair.id === discovered.pairId ? {
        ...pair,
        image: {
          status: 'resolved',
          source: 'wikimedia',
          assetId: local.id,
          fileName: local.packageFileName,
          previewUrl: local.previewUrl,
          sourceTitle: discovered.sourceTitle,
          sourceUrl: discovered.sourceUrl,
          familyKey: discovered.familyKey,
          attribution: discovered.attribution,
        },
      } : pair);
    } catch (error) {
      conversionFailures.push(`${discovered.sourceTitle}: ${getErrorMessage(error)}`);
    }
  }
  if (instance.operationSequence !== operation) {
    revokeAssets(localizedAssets);
    return discovering;
  }
  instance.localAssets.set([...instance.localAssets.get(), ...localizedAssets]);
  const unresolvedCount = pairs.filter((pair) => pair.kind === 'image' && pair.image?.status !== 'resolved').length;
  const warnings = [
    ...(unresolvedCount > 0 ? [`${unresolvedCount} image${unresolvedCount === 1 ? '' : 's'} still need to be selected before saving.`] : []),
    ...conversionFailures,
  ];
  return updatedRecord(discovering, { pairs, warnings });
}

async function createAuthoritativeWikipediaPairs(
  instance: AiCreatorInstance,
  record: AiContentWorkingRecord,
  operation: number,
): Promise<AiContentWorkingRecord> {
  const discovering = updatedRecord(record, { phase: 'discovering-media' });
  await persistSnapshot(instance, discovering);
  const result = await discoverAuthoritativeWikimediaPairs({
    notes: record.notes,
    model: record.model,
  });
  if (instance.operationSequence !== operation) return discovering;
  let pairs = result.pairs;
  const localizedAssets: LocalAiContentAsset[] = [];
  const conversionFailures: string[] = [];
  for (const discovered of result.assets) {
    try {
      const local = await localizeWikimediaAsset(discovered, [...instance.localAssets.get(), ...localizedAssets]);
      localizedAssets.push(local);
      pairs = pairs.map((pair) => pair.id === discovered.pairId ? {
        ...pair,
        image: {
          status: 'resolved',
          source: 'wikimedia',
          assetId: local.id,
          fileName: local.packageFileName,
          previewUrl: local.previewUrl,
          sourceTitle: discovered.sourceTitle,
          sourceUrl: discovered.sourceUrl,
          familyKey: discovered.familyKey,
          attribution: discovered.attribution,
        },
      } : pair);
    } catch (error) {
      conversionFailures.push(`${discovered.sourceTitle}: ${getErrorMessage(error)}`);
    }
  }
  if (instance.operationSequence !== operation) {
    revokeAssets(localizedAssets);
    return discovering;
  }
  instance.localAssets.set([...instance.localAssets.get(), ...localizedAssets]);
  const unresolvedCount = pairs.filter((pair) => pair.image?.status !== 'resolved').length;
  const warnings = [
    ...(unresolvedCount > 0 ? [`${unresolvedCount} Wikipedia image${unresolvedCount === 1 ? '' : 's'} still need to be selected before saving.`] : []),
    ...conversionFailures,
  ];
  return updatedRecord(discovering, { pairs, warnings });
}

async function runCreation(instance: AiCreatorInstance): Promise<void> {
  if (instance.creating.get()) return;
  const notes = instance.notes.get().trim();
  const uploads = inputAssets(instance);
  if (!notes && uploads.length === 0) {
    setStatus(instance, 'warning', 'Add notes or images before submitting.');
    return;
  }
  instance.creating.set(true);
  instance.saveBlockingIssues.set([]);
  const operation = ++instance.operationSequence;
  try {
    const capability = await refreshOpenRouterCapability(instance);
    if (!capability.configured || !capability.model) throw new Error('No OpenRouter model and key are configured for content creation.');
    const started: AiContentWorkingRecord = {
      contractVersion: AI_CONTENT_CONTRACT_VERSION,
      phase: 'generating',
      notes,
      mode: instance.mode.get(),
      title: deriveTitle(notes),
      model: capability.model,
      inputAssetIds: uploads.map((asset) => asset.id),
      pairs: [],
      warnings: [],
      failure: null,
      updatedAt: new Date().toISOString(),
    };
    instance.activeRecord.set(started);
    await new Promise<void>((resolve) => Tracker.afterFlush(resolve));
    const supersededResolvedAssets = instance.localAssets.get().filter((asset) => asset.purpose === 'resolved');
    revokeAssets(supersededResolvedAssets);
    instance.localAssets.set(uploads);
    await persistSnapshot(instance, started);
    const wikipediaOwnsImageSet = uploads.length === 0 && notesExplicitlyRequestImages(notes);
    setStatus(instance, 'info', wikipediaOwnsImageSet ? 'Finding the requested items and images on Wikipedia...' : 'Creating content...');
    let record: AiContentWorkingRecord;
    if (wikipediaOwnsImageSet) {
      record = await createAuthoritativeWikipediaPairs(instance, started, operation);
    } else {
      const promptImages = await Promise.all(uploads.map(async (asset) => ({
        id: asset.id,
        originalName: asset.originalName,
        dataUrl: await assetDataUrl(asset),
      })));
      const generatedPairs = await generatePairs(notes, capability.model, promptImages);
      if (instance.operationSequence !== operation) return;
      record = updatedRecord(started, { pairs: workingPairs(generatedPairs, uploads) });
      await persistSnapshot(instance, record);
      try {
        record = await resolveImages(instance, record, operation);
      } catch (error) {
        record = updatedRecord(record, {
          warnings: [`Automatic image discovery could not complete: ${getErrorMessage(error)}`],
        });
      }
    }
    if (instance.operationSequence !== operation) return;
    record = updatedRecord(record, { phase: 'review', failure: null });
    await persistSnapshot(instance, record);
    const missing = record.pairs.filter((pair) => pair.kind === 'image' && pair.image?.status !== 'resolved').length;
    setStatus(instance, missing > 0 ? 'warning' : 'success', missing > 0
      ? `Content is ready to review. ${missing} image${missing === 1 ? '' : 's'} still need to be selected.`
      : 'Content is ready to review.');
  } catch (error) {
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

async function replaceReviewImage(instance: AiCreatorInstance, pairId: string, source: AiImageSourceFile): Promise<void> {
  const record = instance.activeRecord.get();
  const supersededAssetId = record?.pairs.find((pair) => pair.id === pairId)?.image?.assetId;
  const prepared = (await prepareAiImageAssets([source], instance.localAssets.get()))[0];
  if (!prepared) throw new Error('The selected image could not be converted to WebP.');
  const local: LocalAiContentAsset = {
    ...prepared,
    purpose: 'resolved',
    previewUrl: URL.createObjectURL(new Blob([new Uint8Array(prepared.bytes).buffer], { type: 'image/webp' })),
  };
  const retainedAssets = instance.localAssets.get().filter((asset) => asset.id !== supersededAssetId);
  const supersededAsset = instance.localAssets.get().find((asset) => asset.id === supersededAssetId);
  instance.localAssets.set([...retainedAssets, local]);
  updatePair(instance, pairId, (pair) => ({
    ...pair,
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
    if (current) await persistSnapshot(instance, updatedRecord(current, { phase: 'review', failure: { stage: 'saving', code: 'save-failed', message } })).catch(() => undefined);
    setStatus(instance, 'error', message);
  } finally {
    instance.creating.set(false);
  }
}

Template.aiContentCreator.onCreated(function(this: AiCreatorInstance) {
  this.creating = new ReactiveVar(false);
  this.discarding = new ReactiveVar(false);
  this.processingImages = new ReactiveVar(false);
  this.notes = new ReactiveVar('');
  this.mode = new ReactiveVar('learning');
  this.localAssets = new ReactiveVar([]);
  this.activeRecord = new ReactiveVar(null);
  this.statusMessage = new ReactiveVar('');
  this.statusKind = new ReactiveVar('info');
  this.saveBlockingIssues = new ReactiveVar([]);
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
  processingImages() { return (Template.instance() as AiCreatorInstance).processingImages.get(); },
  submitDisabled() {
    const instance = Template.instance() as AiCreatorInstance;
    return instance.creating.get() || instance.processingImages.get() ? { disabled: true } : {};
  },
  localImages() {
    return inputAssets(Template.instance() as AiCreatorInstance).map((asset) => ({ ...asset }));
  },
  statusMessage() { return (Template.instance() as AiCreatorInstance).statusMessage.get(); },
  statusClass() { return statusClass((Template.instance() as AiCreatorInstance).statusKind.get()); },
  reviewTitle() { return (Template.instance() as AiCreatorInstance).activeRecord.get()?.title || ''; },
  reviewPairs() {
    return ((Template.instance() as AiCreatorInstance).activeRecord.get()?.pairs || []).map((pair, index) => ({
      ...pair,
      number: index + 1,
      isText: pair.kind === 'text',
      isImage: pair.kind === 'image',
      imageResolved: pair.kind === 'image' && pair.image?.status === 'resolved',
      imagePreviewUrl: pair.image?.previewUrl || '',
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
  'change #ai-image-files, change #ai-image-folder'(event: Event, instance: AiCreatorInstance) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files) {
      void addImageSources(instance, sourcesFromFileList(input.files)).catch((error) => setStatus(instance, 'error', getErrorMessage(error)));
    }
    input.value = '';
  },
  'dragenter .ai-image-picker, dragover .ai-image-picker'(event: BlazeDragEvent) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.add('is-drag-over');
  },
  'dragleave .ai-image-picker'(event: BlazeDragEvent) {
    const current = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (!related || !current.contains(related)) current.classList.remove('is-drag-over');
  },
  'drop .ai-image-picker'(event: BlazeDragEvent, instance: AiCreatorInstance) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('is-drag-over');
    const transfer = event.originalEvent?.dataTransfer || event.dataTransfer;
    if (transfer) void collectAiImageDropSources(transfer).then((sources) => addImageSources(instance, sources)).catch((error) => setStatus(instance, 'error', getErrorMessage(error)));
  },
  'click .ai-remove-image'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    const id = String((event.currentTarget as HTMLElement).dataset.imageId || '');
    const asset = instance.localAssets.get().find((candidate) => candidate.id === id);
    if (asset) URL.revokeObjectURL(asset.previewUrl);
    instance.localAssets.set(instance.localAssets.get().filter((candidate) => candidate.id !== id));
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
    const title = (event.currentTarget as HTMLInputElement).value;
    updateRecord(instance, (record) => ({ ...record, title }));
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
    const file = input.files?.[0];
    if (file) void replaceReviewImage(instance, String(input.dataset.pairId || ''), { file, sourcePath: file.name })
      .then(() => setStatus(instance, 'success', 'Replacement image prepared as WebP.'))
      .catch((error) => setStatus(instance, 'error', getErrorMessage(error)));
    input.value = '';
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
