import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Random } from 'meteor/random';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import './aiContentCreator.html';
import './aiContentCreator.css';
import { clientConsole } from '../..';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { getUploadIntegrity } from '../../lib/uploadIntegrity';
import { getErrorMessage } from '../../lib/errorUtils';
import { getOpenRouterCapability, userHasServerOpenRouterKey, type OpenRouterCapability } from '../../lib/openRouterClientProfile';
import { sanitizeImportName } from '../../lib/importCompositionBuilder';
import type { ImportDraftLesson } from '../../lib/normalizedImportTypes';
import type { AiLessonOutput, CreatedOutput, CreationModuleId } from '../../lib/aiContentTypes';
import { buildAutoTutorDraft, buildDrafts } from '../../lib/aiContentDraftBuilder';
import { findCueLeaks, type CueLeak } from '../../lib/aiContentCueValidation';
import { callOpenRouterForAutoTutor, callOpenRouterForIntent, callOpenRouterForItemCountRepair, callOpenRouterForItemCueRepair, callOpenRouterForItems } from '../../lib/aiContentOpenRouterClient';
import type { AiContentRequestImage } from '../../lib/aiContentOpenRouterClient';
import {
  generateAutoTutorExpectationRelationships,
} from '../../lib/autoTutorRelationshipEngine';
import { enrichAiContentMedia } from '../../lib/aiContentMediaEnrichment';
import { extractJsonObject, validateAiOutput, validateAutoTutorOutput } from '../../lib/aiContentValidation';
import { enforceAiImageAuthorization } from '../../lib/aiContentImagePolicy';
import {
  materializeAiDraftOutput,
  parseStrictAiJson,
  validateAiAuthoringIntent,
} from '../../lib/aiContentIntent';
import {
  isAiDraftReviewComplete,
  type AiAuthoringIntent,
  type AiContentDraft,
  type AiContentDraftPhase,
} from '../../../common/aiContentDrafts';
import {
  buildUploadWithNameConflictRetry,
  suggestedReplacementName,
  type GeneratedNameConflict,
} from '../../lib/aiContentPackageSave';
import {
  aiImageAssetDataUrl,
  collectAiImageDropSources,
  prepareAiImageAssets,
  sourcesFromFileList,
  type AiImageSourceFile,
  type PreparedAiImageAsset,
} from '../../lib/aiContentImageAssets';
import { hasPublicCreatorDisplayName } from '../../lib/contentCreatorIdentity';

const MeteorAny = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };
const FlowRouter = (globalThis as any).FlowRouter;
declare const DynamicAssets: any;

type PlatformStringKey = Parameters<typeof translatePlatformString>[1];

type StatusKind = 'info' | 'success' | 'warning' | 'error';
type BlazeDragEvent = DragEvent & { originalEvent?: DragEvent };

type DebugRecord = {
  id?: string;
  creationRecordId?: string;
  selectedModules: CreationModuleId[];
  model: string;
  status: 'succeeded' | 'failed';
  failureStage?: string;
  warnings: string[];
  rejectedItems?: Array<{ item: unknown; reason: string }>;
  outputs?: CreatedOutput[];
  error?: string;
};

type ItemGenerationResult = {
  repairs: Array<{ repairedItemIndexes: number[] }>;
  result: Awaited<ReturnType<typeof enrichAiContentMedia>> & {
    rejectedItems: ReturnType<typeof validateAiOutput>['rejectedItems'];
  };
};

type AutoTutorGenerationResult = {
  result: ReturnType<typeof validateAutoTutorOutput>;
};

type CreationRecord = {
  id: string;
  createdAt: string;
  createdBy: string;
  sourceTextHash: string;
  selectedModules: CreationModuleId[];
  modelProvider: 'openrouter';
  model: string;
  promptTemplateVersion: string;
  compactSchemaVersion: string;
  status: 'succeeded' | 'failed' | 'partial';
  failureStage?: string;
  warnings?: string[];
  outputArtifactIds?: string[];
  itemCounts?: {
    generated?: number;
    accepted?: number;
    rejected?: number;
  };
  debugRecordId?: string;
};

type AiCreatorInstance = Blaze.TemplateInstance & {
  data?: {
    embedded?: boolean;
  };
  creating: ReactiveVar<boolean>;
  sourceText: ReactiveVar<string>;
  uploadedImages: ReactiveVar<Array<PreparedAiImageAsset & { previewUrl: string }>>;
  processingImages: ReactiveVar<boolean>;
  selectedModules: ReactiveVar<CreationModuleId[]>;
  statusMessage: ReactiveVar<string>;
  statusKind: ReactiveVar<StatusKind>;
  debugRecord: ReactiveVar<DebugRecord | null>;
  openRouterCapability: ReactiveVar<OpenRouterCapability | null>;
  activeDraft: ReactiveVar<AiContentDraft<AiLessonOutput> | null>;
  reviewPreviewUrls: ReactiveVar<Record<string, string>>;
  discardArmed: ReactiveVar<boolean>;
  draftAutosaveTimer?: ReturnType<typeof Meteor.setTimeout>;
  draftAutosaveRunning?: Promise<void>;
  draftAutosaveQueued?: boolean;
  autoStartFromHandoff?: boolean;
};

const CREATION_MODULES: Array<{
  id: CreationModuleId;
  labelKey: PlatformStringKey;
  shortLabelKey: PlatformStringKey;
  descriptionKey: PlatformStringKey;
  icon: string;
  disabled?: boolean;
}> = [
  {
    id: 'learningSession',
    labelKey: 'aiCreator.learningLabel',
    shortLabelKey: 'aiCreator.learningShortLabel',
    descriptionKey: 'aiCreator.learningDescription',
    icon: 'fa-book',
  },
  {
    id: 'assessmentSession',
    labelKey: 'aiCreator.assessmentLabel',
    shortLabelKey: 'aiCreator.assessmentShortLabel',
    descriptionKey: 'aiCreator.assessmentDescription',
    icon: 'fa-check-square-o',
  },
];

const CREATION_RECORDS_STORAGE_KEY = 'mofacts.aiContentCreation.records';
const AI_CREATION_HANDOFF_STORAGE_KEY = 'mofacts.aiContentCreation.pendingRequest';
const PROMPT_TEMPLATE_VERSION = 'ai-content-creator-v2';
const COMPACT_SCHEMA_VERSION = 'ai-normalized-v1';
const MAX_STORED_RECORDS = 50;
const MAX_ITEM_CUE_REPAIR_PASSES = 2;
const MAX_ITEM_COUNT_REPAIR_PASSES = 2;

function aiText(key: PlatformStringKey, values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function currentModel(): string {
  return String((Meteor.user() as any)?.profile?.openRouterDefaultModel || '').trim();
}

async function refreshOpenRouterCapability(instance: AiCreatorInstance): Promise<void> {
  try {
    instance.openRouterCapability.set(await getOpenRouterCapability());
  } catch {
    instance.openRouterCapability.set(null);
  }
}

function hasOpenRouterCapability(instance: AiCreatorInstance): boolean {
  const capability = instance.openRouterCapability.get();
  return Boolean(capability?.configured || (userHasServerOpenRouterKey(Meteor.user()) && currentModel()));
}

function effectiveOpenRouterModel(instance: AiCreatorInstance): string {
  return currentModel() || String(instance.openRouterCapability.get()?.model || '').trim();
}

function readPendingCreationHandoff(): { sourceText: string; selectedModules: CreationModuleId[]; autoStart: boolean } | null {
  try {
    const raw = window.sessionStorage.getItem(AI_CREATION_HANDOFF_STORAGE_KEY);
    window.sessionStorage.removeItem(AI_CREATION_HANDOFF_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const sourceText = String(parsed?.sourceText || '').trim();
    const selectedModules = Array.isArray(parsed?.selectedModules)
      ? parsed.selectedModules.filter((moduleId: unknown) => CREATION_MODULES.some((module) => module.id === moduleId))
      : [];
    if (!sourceText || selectedModules.length === 0) {
      return null;
    }
    return {
      sourceText,
      selectedModules,
      autoStart: parsed?.autoStart === true,
    };
  } catch {
    window.sessionStorage.removeItem(AI_CREATION_HANDOFF_STORAGE_KEY);
    return null;
  }
}

function setStatus(instance: AiCreatorInstance, kind: StatusKind, message: string): void {
  instance.statusKind.set(kind);
  instance.statusMessage.set(message);
}

async function hashSourceText(sourceText: string): Promise<string> {
  const data = new TextEncoder().encode(sourceText);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readStoredArray<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCreationRecord(record: CreationRecord, debugRecord?: DebugRecord): void {
  const records = readStoredArray<CreationRecord>(CREATION_RECORDS_STORAGE_KEY);
  window.localStorage.setItem(
    CREATION_RECORDS_STORAGE_KEY,
    JSON.stringify([record, ...records].slice(0, MAX_STORED_RECORDS)),
  );

  void debugRecord;
}

function statusClass(kind: StatusKind): string {
  if (kind === 'success') return 'alert-success';
  if (kind === 'warning') return 'alert-warning';
  if (kind === 'error') return 'alert-danger';
  return 'alert-info';
}

function isEmbedded(instance: AiCreatorInstance): boolean {
  return instance.data?.embedded === true;
}

function orderedModules(moduleIds: CreationModuleId[]): CreationModuleId[] {
  const selected = new Set(moduleIds);
  return CREATION_MODULES.map((module) => module.id).filter((moduleId) => selected.has(moduleId));
}

async function hashCreationSource(sourceText: string, images: PreparedAiImageAsset[]): Promise<string> {
  const imageHashes = await Promise.all(images.map(async (image) => {
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(image.bytes).buffer);
    return `${image.packageFileName}:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }));
  return hashSourceText(`${sourceText}\n${imageHashes.join('\n')}`);
}

async function generateAutoTutorFromAi(
  sourceText: string,
  apiKey: string,
  model: string,
  sourceKeyType: 'tdf' | 'user' | 'admin' = 'user',
): Promise<AutoTutorGenerationResult> {
  const rawAiResponse = await callOpenRouterForAutoTutor(sourceText, apiKey, model);
  const parsedJson = extractJsonObject(rawAiResponse);
  const result = validateAutoTutorOutput(parsedJson);
  if (result.output.expectations.length > 1) {
    const relationshipResult = await generateAutoTutorExpectationRelationships(result.output, {
      apiKey,
      sourceKeyType,
      callEmbeddings: async (embeddingModel, input) => {
        return await MeteorAny.callAsync('callResolvedOpenRouterEmbeddings', {
          model: embeddingModel,
          input,
          telemetry: {
            surface: 'ai-content-creator',
            operation: 'autotutor-relationship-embedding',
          },
        });
      },
    });
    result.output.expectationRelationships = relationshipResult.expectationRelationships;
    result.output.expectationRelationshipProvenance = relationshipResult.expectationRelationshipProvenance;
  }
  return {
    result,
  };
}

function summarizeCueLeaks(leaks: CueLeak[]): string {
  return leaks
    .map((leak) => `item ${leak.itemIndex + 1} (${leak.correctResponse}): ${leak.forbiddenTerms.join(', ')}`)
    .join('; ');
}

function applyCueRepairResponse(parsedRepair: unknown, validation: ReturnType<typeof validateAiOutput>): number[] {
  if (!parsedRepair || typeof parsedRepair !== 'object' || Array.isArray(parsedRepair)) {
    throw new Error('AI cue repair response was not a JSON object.');
  }
  const repairs = (parsedRepair as { repairs?: unknown }).repairs;
  if (!Array.isArray(repairs)) {
    throw new Error('AI cue repair response did not include a repairs array.');
  }
  const repairedItemIndexes: number[] = [];
  for (const repair of repairs) {
    if (!repair || typeof repair !== 'object' || Array.isArray(repair)) {
      continue;
    }
    const itemIndex = Number((repair as { itemIndex?: unknown }).itemIndex);
    const text = String((repair as { prompt?: { text?: unknown } }).prompt?.text || '').trim();
    const item = validation.output.items[itemIndex];
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= validation.output.items.length || !item || !text) {
      continue;
    }
    item.prompt = {
      ...(item.prompt || {}),
      text,
    };
    repairedItemIndexes.push(itemIndex);
  }
  if (repairedItemIndexes.length === 0) {
    throw new Error('AI cue repair response did not include any usable prompt.text repairs.');
  }
  return repairedItemIndexes;
}

async function generateItemsFromAi(
  sourceText: string,
  selectedModules: CreationModuleId[],
  apiKey: string,
  model: string,
  uploadedImages: AiContentRequestImage[],
  intent: AiAuthoringIntent,
  onItemsGenerated?: (output: ReturnType<typeof validateAiOutput>['output']) => Promise<void>,
): Promise<ItemGenerationResult> {
  const rawAiResponse = await callOpenRouterForItems(sourceText, selectedModules, apiKey, model, uploadedImages, intent);
  const parsedJson = parseStrictAiJson(rawAiResponse, 'AI item response');
  const repairs: ItemGenerationResult['repairs'] = [];
  const repairWarnings: string[] = [];
  let validation = validateAiOutput(parsedJson);
  const rejectedItems = validation.rejectedItems.slice();
  if (!intent.imagesExplicitlyRequested && uploadedImages.length === 0) {
    validation = enforceAiImageAuthorization(validation, sourceText, uploadedImages.length);
  }
  if (intent.requestedItemCount !== null && validation.output.items.length > intent.requestedItemCount) {
    repairWarnings.push(`AI returned ${validation.output.items.length} usable items; only the requested ${intent.requestedItemCount} were retained.`);
    validation.output.items = validation.output.items.slice(0, intent.requestedItemCount);
  }
  for (let pass = 0; intent.requestedItemCount !== null && validation.output.items.length < intent.requestedItemCount && pass < MAX_ITEM_COUNT_REPAIR_PASSES; pass += 1) {
    const missingCount = intent.requestedItemCount - validation.output.items.length;
    try {
      const rawRepairResponse = await callOpenRouterForItemCountRepair(
        sourceText,
        selectedModules,
        validation.output,
        missingCount,
        intent,
        apiKey,
        model,
        uploadedImages,
      );
      const parsedRepair = parseStrictAiJson(rawRepairResponse, 'AI item-count repair response') as { items?: unknown[] };
      const candidateItems = Array.isArray(parsedRepair.items) ? parsedRepair.items : [];
      if (candidateItems.length === 0) {
        throw new Error('The item-count repair did not include any items.');
      }
      const priorCount = validation.output.items.length;
      const repairedValidation = validateAiOutput({
        ...validation.output,
        items: validation.output.items.concat(candidateItems as never[]),
      });
      rejectedItems.push(...repairedValidation.rejectedItems);
      validation = repairedValidation;
      if (!intent.imagesExplicitlyRequested && uploadedImages.length === 0) {
        validation = enforceAiImageAuthorization(validation, sourceText, uploadedImages.length);
      }
      if (validation.output.items.length > intent.requestedItemCount) {
        validation.output.items = validation.output.items.slice(0, intent.requestedItemCount);
      }
      if (validation.output.items.length === priorCount) {
        throw new Error('The item-count repair did not add any unique usable items.');
      }
    } catch (error) {
      repairWarnings.push(`Item-count repair pass ${pass + 1} failed: ${getErrorMessage(error)}`);
    }
  }
  if (intent.requestedItemCount !== null && validation.output.items.length !== intent.requestedItemCount) {
    const partialOutput = materializeAiDraftOutput(validation.output, intent, false) as ReturnType<typeof validateAiOutput>['output'];
    await onItemsGenerated?.(partialOutput);
    throw new Error(`AI produced ${validation.output.items.length} usable unique items after bounded repair, but the request requires exactly ${intent.requestedItemCount}. The partial draft and diagnostics were preserved for retry.`);
  }
  for (let pass = 0; pass < MAX_ITEM_CUE_REPAIR_PASSES; pass += 1) {
    const leaks = findCueLeaks(validation.output);
    if (leaks.length === 0) {
      break;
    }
    try {
      const rawRepairResponse = await callOpenRouterForItemCueRepair(sourceText, selectedModules, rawAiResponse, leaks, apiKey, model, uploadedImages);
      const parsedRepairJson = parseStrictAiJson(rawRepairResponse, 'AI cue repair response');
      const repairedItemIndexes = applyCueRepairResponse(parsedRepairJson, validation);
      repairs.push({
        repairedItemIndexes,
      });
      const priorWarnings = validation.warnings;
      validation = validateAiOutput(validation.output);
      if (!intent.imagesExplicitlyRequested && uploadedImages.length === 0) {
        validation = enforceAiImageAuthorization(validation, sourceText, uploadedImages.length);
      }
      validation.warnings = priorWarnings.concat(validation.warnings);
    } catch (error) {
      repairWarnings.push(`Cue repair pass ${pass + 1} did not return usable replacements: ${getErrorMessage(error)}`);
      break;
    }
  }
  const remainingLeaks = findCueLeaks(validation.output);
  const cueLeakWarnings = remainingLeaks.length > 0
    ? [`Review generated cue text for possible answer hints: ${summarizeCueLeaks(remainingLeaks)}`]
    : [];
  validation.output = materializeAiDraftOutput(validation.output, intent) as ReturnType<typeof validateAiOutput>['output'];
  await onItemsGenerated?.(validation.output);
  const enriched = await enrichAiContentMedia(validation.output, sourceText);
  return {
    repairs,
    result: {
      ...enriched,
      warnings: validation.warnings
        .concat(repairs.length ? [`Repaired answer-revealing cue text in ${repairs.reduce((count, repair) => count + repair.repairedItemIndexes.length, 0)} generated item${repairs.reduce((count, repair) => count + repair.repairedItemIndexes.length, 0) === 1 ? '' : 's'}.`] : [])
        .concat(repairWarnings)
        .concat(cueLeakWarnings)
        .concat(enriched.warnings),
      rejectedItems,
    },
  };
}

async function prepareRequestImages(images: PreparedAiImageAsset[]): Promise<AiContentRequestImage[]> {
  return Promise.all(images.map(async (image) => ({
    packageFileName: image.packageFileName,
    originalName: image.originalName,
    dataUrl: await aiImageAssetDataUrl(image),
  })));
}

async function addImageSources(instance: AiCreatorInstance, sources: AiImageSourceFile[]): Promise<void> {
  if (sources.length === 0 || instance.processingImages.get()) {
    return;
  }
  instance.processingImages.set(true);
  setStatus(instance, 'info', aiText('aiCreator.processingImages'));
  try {
    const current = instance.uploadedImages.get();
    const prepared = await prepareAiImageAssets(sources, current);
    const withPreviews = prepared.map((asset) => ({
      ...asset,
      previewUrl: URL.createObjectURL(new Blob([new Uint8Array(asset.bytes).buffer], { type: 'image/webp' })),
    }));
    instance.uploadedImages.set(current.concat(withPreviews));
    setStatus(instance, 'success', aiText('aiCreator.imagesReady', {
      count: withPreviews.length,
      total: current.length + withPreviews.length,
    }));
  } catch (error) {
    setStatus(instance, 'error', getErrorMessage(error));
  } finally {
    instance.processingImages.set(false);
  }
}

function promptForReplacementName(conflict: GeneratedNameConflict): string | null {
  const suggested = suggestedReplacementName(conflict);
  const response = window.prompt(
    aiText('aiCreator.contentExistsPrompt', { title: conflict.title }),
    suggested,
  );
  const normalized = sanitizeImportName(response || '', '');
  return normalized || null;
}

async function persistAiDraft(
  instance: AiCreatorInstance,
  phase: AiContentDraftPhase,
  patch: Partial<Pick<AiContentDraft<AiLessonOutput>, 'intent' | 'output' | 'warnings' | 'failure'>> = {},
): Promise<AiContentDraft<AiLessonOutput>> {
  const current = instance.activeDraft.get();
  if (!current) {
    throw new Error('AI content draft is unavailable. Start the request again.');
  }
  const saved = await MeteorAny.callAsync('saveAiContentDraft', {
    draftId: current._id,
    expectedRevision: current.revision,
    phase,
    ...patch,
  }) as AiContentDraft<AiLessonOutput>;
  instance.activeDraft.set(saved);
  return saved;
}

async function loadActiveAiDraft(instance: AiCreatorInstance): Promise<void> {
  try {
    const draft = await MeteorAny.callAsync('getActiveAiContentDraft') as AiContentDraft<AiLessonOutput> | null;
    if (!draft) return;
    instance.activeDraft.set(draft);
    instance.sourceText.set(draft.sourceText);
    instance.selectedModules.set(draft.selectedModules);
    if (draft.phase === 'resolving-media' && draft.output) {
      setStatus(instance, 'info', 'Resuming image resolution for the saved draft.');
      const enriched = await enrichAiContentMedia(draft.output as ReturnType<typeof validateAiOutput>['output'], draft.sourceText);
      await persistAiDraft(instance, 'review', {
        output: enriched.output,
        warnings: (draft.warnings || []).concat(enriched.warnings),
      });
      setStatus(instance, enriched.output.items.some((item) => item.prompt?.mediaSlot?.status === 'unresolved') ? 'warning' : 'success', 'Draft ready for review.');
      return;
    }
    if (draft.phase === 'review' || draft.phase === 'saving') {
      setStatus(instance, 'info', 'Review the generated draft below. Your changes are saved automatically.');
    } else if (draft.phase === 'failed') {
      setStatus(instance, 'error', draft.failure?.message || 'The saved AI draft needs to be retried.');
    } else {
      setStatus(instance, 'info', `Resuming saved AI draft from ${draft.phase.replace('-', ' ')}.`);
    }
  } catch (error) {
    setStatus(instance, 'error', getErrorMessage(error));
  }
}

async function flushDraftAutosave(instance: AiCreatorInstance): Promise<void> {
  if (instance.draftAutosaveRunning) {
    instance.draftAutosaveQueued = true;
    return instance.draftAutosaveRunning;
  }
  const run = async () => {
    do {
      instance.draftAutosaveQueued = false;
      const snapshot = instance.activeDraft.get();
      if (!snapshot?.output) return;
      const saved = await MeteorAny.callAsync('saveAiContentDraft', {
        draftId: snapshot._id,
        expectedRevision: snapshot.revision,
        phase: 'review',
        output: snapshot.output,
      }) as AiContentDraft<AiLessonOutput>;
      const latest = instance.activeDraft.get();
      if (latest?._id === saved._id) {
        instance.activeDraft.set(latest.output ? { ...saved, output: latest.output } : saved);
      }
    } while (instance.draftAutosaveQueued);
  };
  instance.draftAutosaveRunning = run().finally(() => {
    delete instance.draftAutosaveRunning;
  });
  return instance.draftAutosaveRunning;
}

function updateDraftOutput(instance: AiCreatorInstance, mutator: (output: AiLessonOutput) => AiLessonOutput): void {
  const draft = instance.activeDraft.get();
  if (!draft?.output) return;
  instance.activeDraft.set({ ...draft, output: mutator(draft.output) });
  if (instance.draftAutosaveTimer) Meteor.clearTimeout(instance.draftAutosaveTimer);
  instance.draftAutosaveTimer = Meteor.setTimeout(() => {
    delete instance.draftAutosaveTimer;
    void flushDraftAutosave(instance).catch((error) => {
      setStatus(instance, 'error', getErrorMessage(error));
    });
  }, 500);
}

function updateDraftItem(instance: AiCreatorInstance, itemId: string, updater: (item: NonNullable<AiLessonOutput['items']>[number]) => NonNullable<AiLessonOutput['items']>[number]): void {
  updateDraftOutput(instance, (output) => ({
    ...output,
    items: (output.items || []).map((item) => String(item.id || '') === itemId ? updater(item) : item),
  }));
}

async function uploadReviewImage(instance: AiCreatorInstance, itemId: string, source: AiImageSourceFile): Promise<void> {
  const draft = instance.activeDraft.get();
  const item = draft?.output?.items?.find((candidate) => String(candidate.id || '') === itemId);
  const slot = item?.prompt?.mediaSlot;
  if (!draft || !item || !slot) throw new Error('The selected draft image slot no longer exists.');
  const [prepared] = await prepareAiImageAssets([source], []);
  if (!prepared) throw new Error('The selected image could not be prepared.');
  const file = new File([new Uint8Array(prepared.bytes)], prepared.packageFileName, { type: 'image/webp' });
  const fileObj = await new Promise<any>((resolve, reject) => {
    const upload = DynamicAssets.insert({
      file,
      chunkSize: 'dynamic',
      meta: {
        uploadPurpose: 'ai-draft-media',
        draftId: draft._id,
        itemId,
        mediaSlotId: slot.id,
        public: false,
      },
    }, false);
    upload.on('end', (error: unknown, result: any) => error ? reject(error) : resolve(result));
    upload.start();
  });
  if (slot.assetId) {
    await MeteorAny.callAsync('removeAssetById', slot.assetId);
  }
  const previousPreview = instance.reviewPreviewUrls.get()[itemId];
  if (previousPreview) URL.revokeObjectURL(previousPreview);
  instance.reviewPreviewUrls.set({
    ...instance.reviewPreviewUrls.get(),
    [itemId]: URL.createObjectURL(new Blob([new Uint8Array(prepared.bytes)], { type: 'image/webp' })),
  });
  const publicPath = `/dynamic-assets/${fileObj._id}/${encodeURIComponent(prepared.packageFileName)}`;
  updateDraftItem(instance, itemId, (current) => {
    const { failureReason: _failureReason, ...resolvedSlot } = slot;
    const { attribution: _attribution, ...promptWithoutAttribution } = current.prompt || {};
    return {
      ...current,
      prompt: {
        ...promptWithoutAttribution,
        imgSrc: publicPath,
        mediaSlot: {
          ...resolvedSlot,
          status: 'resolved',
          source: 'user-replacement',
          assetId: String(fileObj._id),
          fileName: prepared.packageFileName,
        },
      },
    };
  });
  if (instance.draftAutosaveTimer) {
    Meteor.clearTimeout(instance.draftAutosaveTimer);
    delete instance.draftAutosaveTimer;
  }
  instance.draftAutosaveQueued = true;
  await flushDraftAutosave(instance);
}

async function saveReviewedDraft(instance: AiCreatorInstance): Promise<void> {
  let draft = instance.activeDraft.get();
  if (!draft?.output || !isAiDraftReviewComplete({ output: draft.output })) {
    setStatus(instance, 'warning', 'Resolve every required prompt and response before saving.');
    return;
  }
  instance.creating.set(true);
  try {
    if (instance.draftAutosaveTimer) {
      Meteor.clearTimeout(instance.draftAutosaveTimer);
      delete instance.draftAutosaveTimer;
    }
    instance.draftAutosaveQueued = true;
    await flushDraftAutosave(instance);
    draft = instance.activeDraft.get();
    if (!draft?.output || !isAiDraftReviewComplete({ output: draft.output })) {
      throw new Error('Resolve every required prompt and response before saving.');
    }
    const savingDraft = await persistAiDraft(instance, 'saving', { output: draft.output });
    const itemModules = savingDraft.selectedModules.filter((moduleId) => moduleId === 'learningSession' || moduleId === 'assessmentSession');
    const validatedOutput = validateAiOutput(savingDraft.output).output;
    const drafts = buildDrafts(validatedOutput, itemModules, instance.uploadedImages.get());
    const { outputs } = await buildUploadWithNameConflictRetry(drafts, savingDraft.output?.creationSummary || '', {
      dynamicAssets: DynamicAssets,
      callAsync: MeteorAny.callAsync.bind(MeteorAny),
      getUploadIntegrity,
      promptForReplacementName,
      refreshAssets: () => Session.set('assetsRefreshTrigger', Date.now()),
      logCleanupError: (cleanupError) => clientConsole(1, '[AI CONTENT CREATOR] Package cleanup failed:', cleanupError),
    }, { draftId: savingDraft._id, draftRevision: savingDraft.revision });
    await MeteorAny.callAsync('completeAiContentDraft', {
      draftId: savingDraft._id,
      expectedRevision: savingDraft.revision,
      outputTdfIds: outputs.map((output) => output.tdfId).filter(Boolean),
    });
    instance.activeDraft.set(null);
    instance.sourceText.set('');
    setStatus(instance, 'success', `Saved ${outputs.length} content system${outputs.length === 1 ? '' : 's'}.`);
    Session.set('assetsRefreshTrigger', Date.now());
  } catch (error) {
    setStatus(instance, 'error', getErrorMessage(error));
    const current = instance.activeDraft.get();
    if (current) {
      try {
        await persistAiDraft(instance, 'review', {
          failure: { stage: 'saving', code: 'save-failed', message: getErrorMessage(error) },
        });
      } catch (draftError) {
        clientConsole(1, '[AI CONTENT CREATOR] Failed to restore review phase:', draftError);
      }
    }
  } finally {
    instance.creating.set(false);
  }
}

async function runCreation(instance: AiCreatorInstance): Promise<void> {
  const sourceText = instance.sourceText.get().trim();
  const uploadedImages = instance.uploadedImages.get();
  const selectedModules = instance.selectedModules.get();
  await refreshOpenRouterCapability(instance);
  const model = effectiveOpenRouterModel(instance);
  const creationRecordId = Random.id();
  const debugRecordId = Random.id();
  const debugBase: DebugRecord = {
    id: debugRecordId,
    creationRecordId,
    selectedModules,
    model,
    status: 'failed',
    warnings: [],
  };

  if (!sourceText && uploadedImages.length === 0) {
    setStatus(instance, 'warning', aiText('aiCreator.addSourceContent'));
    return;
  }
  if (selectedModules.length === 0) {
    setStatus(instance, 'warning', aiText('aiCreator.chooseTarget'));
    return;
  }
  if (!hasOpenRouterCapability(instance) || !model) {
    setStatus(instance, 'warning', aiText('aiCreator.requiresKeyAndModel'));
    return;
  }

  instance.creating.set(true);
  instance.debugRecord.set(debugBase);
  setStatus(
    instance,
    'info',
    selectedModules.includes('autoTutor')
      ? aiText('aiCreator.creatingWithAutoTutor')
      : aiText('aiCreator.creatingContent'),
  );
  try {
    let draft = instance.activeDraft.get();
    if (draft) {
      setStatus(instance, 'warning', 'Resume or discard the saved AI draft before starting another request.');
      return;
    }
    draft = await MeteorAny.callAsync('startAiContentDraft', {
      sourceText,
      selectedModules,
      model,
    }) as AiContentDraft<AiLessonOutput>;
    instance.activeDraft.set(draft);
    const sourceTextHash = await hashCreationSource(sourceText, uploadedImages);
    const apiKey = '__server_resolved_openrouter__';
    const requestImages = await prepareRequestImages(uploadedImages);
    const rawIntentResponse = await callOpenRouterForIntent(sourceText, apiKey, model);
    const intent = validateAiAuthoringIntent(parseStrictAiJson(rawIntentResponse, 'AI authoring intent'), sourceText);
    await persistAiDraft(instance, 'generating', { intent });
    const itemModules = selectedModules.filter((moduleId) => moduleId === 'learningSession' || moduleId === 'assessmentSession');
    const itemGenerationPromise = itemModules.length > 0
      ? generateItemsFromAi(sourceText, itemModules, apiKey, model, requestImages, intent, async (output) => {
          await persistAiDraft(instance, 'resolving-media', { output });
        })
      : null;
    const autoTutorGenerationPromise = selectedModules.includes('autoTutor')
      ? generateAutoTutorFromAi(sourceText, apiKey, model, instance.openRouterCapability.get()?.source || 'user')
      : null;
    const [itemGeneration, autoTutorGeneration] = await Promise.all([
      itemGenerationPromise || Promise.resolve(null),
      autoTutorGenerationPromise || Promise.resolve(null),
    ]);
    const drafts: ImportDraftLesson[] = [];
    let creationSummary = '';
    let warnings: string[] = [];
    let rejectedItems: Array<{ item: unknown; reason: string }> = [];

    if (itemGeneration) {
      drafts.push(...buildDrafts(itemGeneration.result.output, itemModules, uploadedImages));
      warnings = warnings.concat(itemGeneration.result.warnings);
      rejectedItems = rejectedItems.concat(itemGeneration.result.rejectedItems);
      creationSummary = itemGeneration.result.output.creationSummary;
      const reviewDraft = await persistAiDraft(instance, 'review', {
        output: itemGeneration.result.output,
        warnings,
      });
      instance.activeDraft.set(reviewDraft);
      setStatus(
        instance,
        itemGeneration.result.output.items.some((item) => item.prompt?.mediaSlot?.status === 'unresolved') ? 'warning' : 'success',
        'Draft ready for review. Resolve any blank image prompts, edit items if needed, then save the content.',
      );
      return;
    }

    if (autoTutorGeneration) {
      drafts.push(buildAutoTutorDraft(autoTutorGeneration.result.output, '', model));
      warnings = warnings.concat(autoTutorGeneration.result.warnings);
      creationSummary = [
        creationSummary,
        autoTutorGeneration.result.output.creationSummary,
      ].filter(Boolean).join(' ');
    }

    const { builtPackage, outputs } = await buildUploadWithNameConflictRetry(drafts, creationSummary, {
      dynamicAssets: DynamicAssets,
      callAsync: MeteorAny.callAsync.bind(MeteorAny),
      getUploadIntegrity,
      promptForReplacementName,
      refreshAssets: () => Session.set('assetsRefreshTrigger', Date.now()),
      logCleanupError: (cleanupError) => {
        clientConsole(1, '[AI CONTENT CREATOR] Failed to clean up unsaved package asset:', cleanupError);
      },
    });
    const debugRecord: DebugRecord = {
      ...debugBase,
      status: 'succeeded',
      warnings,
      rejectedItems,
      outputs,
    };
    instance.debugRecord.set(debugRecord);
    saveCreationRecord({
      id: creationRecordId,
      createdAt: new Date().toISOString(),
      createdBy: Meteor.userId() || '',
      sourceTextHash,
      selectedModules,
      modelProvider: 'openrouter',
      model,
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      compactSchemaVersion: COMPACT_SCHEMA_VERSION,
      status: 'succeeded',
      ...(warnings.length ? { warnings } : {}),
      outputArtifactIds: outputs.map((output) => output.tdfId || output.title).filter(Boolean),
      itemCounts: {
        generated: builtPackage.totalCards,
        accepted: builtPackage.totalCards,
        rejected: rejectedItems.length,
      },
      ...(warnings.length || rejectedItems.length ? { debugRecordId } : {}),
    }, warnings.length || rejectedItems.length ? debugRecord : undefined);
    Session.set('assetsRefreshTrigger', Date.now());
    if (isEmbedded(instance)) {
      instance.sourceText.set('');
      instance.uploadedImages.get().forEach((image) => URL.revokeObjectURL(image.previewUrl));
      instance.uploadedImages.set([]);
      instance.statusMessage.set('');
      const textarea = instance.find('#ai-source-text') as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.value = '';
      }
      return;
    }
    FlowRouter.go('/contentUpload');
  } catch (error: unknown) {
    clientConsole(1, '[AI CONTENT CREATOR] Creation failed:', error);
    const sourceTextHash = await hashCreationSource(sourceText, uploadedImages);
    const debugRecord: DebugRecord = {
      ...debugBase,
      status: 'failed',
      failureStage: 'create',
      error: getErrorMessage(error),
    };
    instance.debugRecord.set(debugRecord);
    if (instance.activeDraft.get()) {
      try {
        await persistAiDraft(instance, 'failed', {
          failure: { stage: instance.activeDraft.get()?.phase || 'failed', code: 'generation-failed', message: getErrorMessage(error) },
        });
      } catch (draftError) {
        clientConsole(1, '[AI CONTENT CREATOR] Failed to persist draft failure state:', draftError);
      }
    }
    saveCreationRecord({
      id: creationRecordId,
      createdAt: new Date().toISOString(),
      createdBy: Meteor.userId() || '',
      sourceTextHash,
      selectedModules,
      modelProvider: 'openrouter',
      model,
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      compactSchemaVersion: COMPACT_SCHEMA_VERSION,
      status: 'failed',
      failureStage: 'create',
      warnings: [],
      debugRecordId,
    }, debugRecord);
    setStatus(instance, 'error', getErrorMessage(error));
  } finally {
    instance.creating.set(false);
  }
}

Template.aiContentCreator.onCreated(function(this: AiCreatorInstance) {
  const pendingHandoff = readPendingCreationHandoff();
  this.creating = new ReactiveVar(false);
  this.sourceText = new ReactiveVar(pendingHandoff?.sourceText || '');
  this.uploadedImages = new ReactiveVar([]);
  this.processingImages = new ReactiveVar(false);
  this.selectedModules = new ReactiveVar(pendingHandoff?.selectedModules || ['learningSession']);
  this.statusMessage = new ReactiveVar('');
  this.statusKind = new ReactiveVar('info');
  this.debugRecord = new ReactiveVar(null);
  this.openRouterCapability = new ReactiveVar(null);
  this.activeDraft = new ReactiveVar(null);
  this.reviewPreviewUrls = new ReactiveVar({});
  this.discardArmed = new ReactiveVar(false);
  this.autoStartFromHandoff = pendingHandoff?.autoStart === true;
});

Template.aiContentCreator.onDestroyed(function(this: AiCreatorInstance) {
  this.uploadedImages.get().forEach((image) => URL.revokeObjectURL(image.previewUrl));
  Object.values(this.reviewPreviewUrls.get()).forEach((url) => URL.revokeObjectURL(url));
  if (this.draftAutosaveTimer) Meteor.clearTimeout(this.draftAutosaveTimer);
});

Template.aiContentCreator.onRendered(function(this: AiCreatorInstance) {
  void refreshOpenRouterCapability(this);
  void loadActiveAiDraft(this);

  if (!this.autoStartFromHandoff) {
    return;
  }
  this.autoStartFromHandoff = false;
  Meteor.setTimeout(() => {
    void runCreation(this);
  }, 0);
});

Template.aiContentCreator.helpers({
  aiText(key: PlatformStringKey, options?: { hash?: Parameters<typeof translatePlatformString>[2] }) {
    return aiText(key, options?.hash);
  },
  embeddedClass() {
    return isEmbedded(Template.instance() as AiCreatorInstance) ? 'is-embedded' : '';
  },
  hasOpenRouterConfig() {
    return hasOpenRouterCapability(Template.instance() as AiCreatorInstance);
  },
  sourceText() {
    return (Template.instance() as AiCreatorInstance).sourceText.get();
  },
  sourceLength() {
    const length = (Template.instance() as AiCreatorInstance).sourceText.get().length;
    return aiText('aiCreator.characterCount', { count: length, plural: length === 1 ? '' : 's' });
  },
  uploadedImages() {
    return (Template.instance() as AiCreatorInstance).uploadedImages.get();
  },
  hasUploadedImages() {
    return (Template.instance() as AiCreatorInstance).uploadedImages.get().length > 0;
  },
  uploadedImageSummary() {
    const count = (Template.instance() as AiCreatorInstance).uploadedImages.get().length;
    return aiText('aiCreator.uploadedImageSummary', { count });
  },
  processingImages() {
    return (Template.instance() as AiCreatorInstance).processingImages.get();
  },
  modules() {
    const selected = new Set((Template.instance() as AiCreatorInstance).selectedModules.get());
    return CREATION_MODULES.map((module) => ({
      ...module,
      label: aiText(module.labelKey),
      shortLabel: aiText(module.shortLabelKey),
      description: aiText(module.descriptionKey),
      selectedClass: selected.has(module.id) ? 'is-selected' : '',
      pressed: selected.has(module.id) ? 'true' : 'false',
      disabled: module.disabled ? true : null,
    }));
  },
  creating() {
    return (Template.instance() as AiCreatorInstance).creating.get();
  },
  showReview() {
    const draft = (Template.instance() as AiCreatorInstance).activeDraft.get();
    return Boolean(draft);
  },
  reviewItems() {
    const instance = Template.instance() as AiCreatorInstance;
    const items = instance.activeDraft.get()?.output?.items || [];
    const previews = instance.reviewPreviewUrls.get();
    return items.map((item, index) => {
      const itemId = String(item.id || '');
      const slot = item.prompt?.mediaSlot;
      const durablePreview = slot?.source === 'wikimedia'
        ? String(slot.previewUrl || item.prompt?.imgSrc || '')
        : '';
      return {
        ...item,
        id: itemId,
        number: index + 1,
        promptText: String(item.prompt?.text || ''),
        responseText: String(item.response?.correctResponse || ''),
        alternativeResponses: Array.isArray(item.response?.incorrectResponses) ? item.response.incorrectResponses : [],
        imageRequired: slot?.required === true,
        imagePreview: previews[itemId] || durablePreview,
        imageFailure: String(slot?.failureReason || (slot?.status === 'resolved' ? `Uploaded: ${slot.fileName || 'image'}` : 'No image was resolved.')),
      };
    });
  },
  reviewItemCount() {
    return (Template.instance() as AiCreatorInstance).activeDraft.get()?.output?.items?.length || 0;
  },
  draftWarnings() {
    return (Template.instance() as AiCreatorInstance).activeDraft.get()?.warnings || [];
  },
  saveDraftAttrs() {
    const instance = Template.instance() as AiCreatorInstance;
    const draft = instance.activeDraft.get();
    return instance.creating.get() || !draft?.output || !isAiDraftReviewComplete({ output: draft.output }) ? { disabled: true } : {};
  },
  discardArmed() {
    return (Template.instance() as AiCreatorInstance).discardArmed.get();
  },
  canRetryDraft() {
    const draft = (Template.instance() as AiCreatorInstance).activeDraft.get();
    return Boolean(draft && (draft.phase === 'failed' || !draft.output));
  },
  createAttrs() {
    const instance = Template.instance() as AiCreatorInstance;
    const disabled = instance.creating.get() ||
      instance.processingImages.get() ||
      (!instance.sourceText.get().trim() && instance.uploadedImages.get().length === 0) ||
      instance.selectedModules.get().length === 0 ||
      !hasOpenRouterCapability(instance) ||
      !effectiveOpenRouterModel(instance);
    return disabled ? { disabled: true } : {};
  },
  statusMessage() {
    return (Template.instance() as AiCreatorInstance).statusMessage.get();
  },
  statusClass() {
    return statusClass((Template.instance() as AiCreatorInstance).statusKind.get());
  },
});

Template.aiContentCreator.events({
  'input #ai-source-text'(event: Event, instance: AiCreatorInstance) {
    instance.sourceText.set((event.currentTarget as HTMLTextAreaElement).value);
  },
  'dragenter .ai-image-drop-zone, dragover .ai-image-drop-zone'(event: BlazeDragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const dataTransfer = event.originalEvent?.dataTransfer || event.dataTransfer;
    if (dataTransfer) {
      dataTransfer.dropEffect = 'copy';
    }
    (event.currentTarget as HTMLElement).classList.add('is-drag-over');
  },
  'dragleave .ai-image-drop-zone'(event: BlazeDragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    if (!event.relatedTarget || !target.contains(event.relatedTarget as Node)) {
      target.classList.remove('is-drag-over');
    }
  },
  'drop .ai-image-drop-zone'(event: BlazeDragEvent, instance: AiCreatorInstance) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).classList.remove('is-drag-over');
    const dataTransfer = event.originalEvent?.dataTransfer || event.dataTransfer;
    if (dataTransfer) {
      void (async () => {
        try {
          await addImageSources(instance, await collectAiImageDropSources(dataTransfer));
        } catch (error) {
          setStatus(instance, 'error', getErrorMessage(error));
        }
      })();
    }
  },
  'change #ai-image-files, change #ai-image-folder'(event: Event, instance: AiCreatorInstance) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files?.length) {
      void addImageSources(instance, sourcesFromFileList(input.files));
    }
    input.value = '';
  },
  'click .ai-remove-image'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    event.stopPropagation();
    const id = (event.currentTarget as HTMLButtonElement).dataset.imageId;
    const current = instance.uploadedImages.get();
    const removed = current.find((image) => image.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl);
      instance.uploadedImages.set(current.filter((image) => image.id !== id));
    }
  },
  'click .ai-mode-card'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    const button = event.currentTarget as HTMLButtonElement;
    const moduleId = button.dataset.moduleId as CreationModuleId;
    if (!CREATION_MODULES.some((module) => module.id === moduleId)) {
      return;
    }
    const selected = new Set(instance.selectedModules.get());
    if (selected.has(moduleId)) {
      selected.delete(moduleId);
    } else {
      selected.add(moduleId);
    }
    if (selected.size === 0) {
      selected.add(moduleId);
    }
    instance.selectedModules.set(orderedModules(Array.from(selected)));
  },
  'click #ai-create-submit'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    if (!hasPublicCreatorDisplayName(Meteor.user())) {
      FlowRouter.go('/profile?contentCreator=required');
      return;
    }
    void runCreation(instance);
  },
  'input .ai-review-prompt'(event: Event, instance: AiCreatorInstance) {
    const input = event.currentTarget as HTMLTextAreaElement;
    const itemId = String(input.dataset.itemId || '');
    updateDraftItem(instance, itemId, (item) => ({
      ...item,
      prompt: { ...(item.prompt || {}), text: input.value },
    }));
  },
  'input .ai-review-response'(event: Event, instance: AiCreatorInstance) {
    const input = event.currentTarget as HTMLInputElement;
    const itemId = String(input.dataset.itemId || '');
    updateDraftItem(instance, itemId, (item) => ({
      ...item,
      response: { ...(item.response || {}), correctResponse: input.value },
    }));
  },
  'input .ai-review-alternative'(event: Event, instance: AiCreatorInstance) {
    const input = event.currentTarget as HTMLInputElement;
    const itemId = String(input.dataset.itemId || '');
    const alternativeIndex = Number(input.dataset.alternativeIndex);
    if (!Number.isInteger(alternativeIndex) || alternativeIndex < 0) return;
    updateDraftItem(instance, itemId, (item) => {
      const incorrectResponses = Array.isArray(item.response?.incorrectResponses)
        ? item.response.incorrectResponses.slice()
        : [];
      incorrectResponses[alternativeIndex] = input.value;
      return {
        ...item,
        response: { ...(item.response || {}), incorrectResponses },
      };
    });
  },
  'click .ai-review-remove'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    const itemId = String((event.currentTarget as HTMLButtonElement).dataset.itemId || '');
    const assetId = instance.activeDraft.get()?.output?.items
      ?.find((item) => String(item.id || '') === itemId)?.prompt?.mediaSlot?.assetId;
    updateDraftOutput(instance, (output) => ({
      ...output,
      items: (output.items || []).filter((item) => String(item.id || '') !== itemId),
    }));
    if (assetId) {
      void MeteorAny.callAsync('removeAssetById', assetId).catch((error: unknown) => {
        setStatus(instance, 'error', `The item was removed, but its staged image cleanup failed: ${getErrorMessage(error)}`);
      });
    }
  },
  'change .ai-review-image-input'(event: Event, instance: AiCreatorInstance) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const itemId = String(input.dataset.itemId || '');
    input.value = '';
    if (!file) return;
    setStatus(instance, 'info', `Preparing ${file.name}...`);
    void uploadReviewImage(instance, itemId, { file, sourcePath: file.name }).then(() => {
      setStatus(instance, 'success', 'Replacement image saved to this draft.');
    }).catch((error) => setStatus(instance, 'error', getErrorMessage(error)));
  },
  'click #ai-discard-draft'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    instance.discardArmed.set(true);
  },
  'click #ai-cancel-discard'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    instance.discardArmed.set(false);
  },
  'click #ai-confirm-discard'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    const draft = instance.activeDraft.get();
    if (!draft) return;
    void MeteorAny.callAsync('discardAiContentDraft', draft._id).then(() => {
      instance.activeDraft.set(null);
      instance.discardArmed.set(false);
      instance.sourceText.set('');
      instance.statusMessage.set('');
      const textarea = instance.find('#ai-source-text') as HTMLTextAreaElement | null;
      if (textarea) textarea.value = '';
    }).catch((error: unknown) => setStatus(instance, 'error', getErrorMessage(error)));
  },
  'click #ai-save-reviewed-draft'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    void saveReviewedDraft(instance);
  },
  'click #ai-retry-draft'(event: Event, instance: AiCreatorInstance) {
    event.preventDefault();
    const draft = instance.activeDraft.get();
    if (!draft) return;
    void MeteorAny.callAsync('discardAiContentDraft', draft._id).then(() => {
      instance.activeDraft.set(null);
      void runCreation(instance);
    }).catch((error: unknown) => setStatus(instance, 'error', getErrorMessage(error)));
  },
  'click #ai-open-manual-creator'(event: Event) {
    event.preventDefault();
    FlowRouter.go('/contentCreate');
  },
});
