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
import type { CreatedOutput, CreationModuleId } from '../../lib/aiContentTypes';
import { buildAutoTutorDraft, buildDrafts } from '../../lib/aiContentDraftBuilder';
import { findCueLeaks, type CueLeak } from '../../lib/aiContentCueValidation';
import { callOpenRouterForAutoTutor, callOpenRouterForItemCueRepair, callOpenRouterForItems } from '../../lib/aiContentOpenRouterClient';
import type { AiContentRequestImage } from '../../lib/aiContentOpenRouterClient';
import {
  generateAutoTutorExpectationRelationships,
} from '../../lib/autoTutorRelationshipEngine';
import { enrichAiContentMedia } from '../../lib/aiContentMediaEnrichment';
import { extractJsonObject, validateAiOutput, validateAutoTutorOutput } from '../../lib/aiContentValidation';
import { enforceAiImageAuthorization } from '../../lib/aiContentImagePolicy';
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
  sourceTextPreview: string;
  selectedModules: CreationModuleId[];
  model: string;
  status: 'succeeded' | 'failed';
  failureStage?: string;
  warnings: string[];
  rawAiResponse?: string;
  parsedJson?: unknown;
  llmCalls?: {
    itemGeneration?: { rawAiResponse: string; parsedJson: unknown };
    itemCueRepairs?: Array<{ rawAiResponse: string; parsedJson: unknown; repairedItemIndexes: number[] }>;
    autoTutorGeneration?: { rawAiResponse: string; parsedJson: unknown };
    autoTutorRelationshipGeneration?: {
      model: string;
      attemptedModels: string[];
      sourceKeyType: 'tdf' | 'user' | 'admin';
      cacheKey: string;
      costUsd?: number;
    };
  };
  rejectedItems?: Array<{ item: unknown; reason: string }>;
  outputs?: CreatedOutput[];
  error?: string;
};

type ItemGenerationResult = {
  rawAiResponse: string;
  parsedJson: unknown;
  repairs: Array<{ rawAiResponse: string; parsedJson: unknown; repairedItemIndexes: number[] }>;
  result: Awaited<ReturnType<typeof enrichAiContentMedia>> & {
    rejectedItems: ReturnType<typeof validateAiOutput>['rejectedItems'];
  };
};

type AutoTutorGenerationResult = {
  rawAiResponse: string;
  parsedJson: unknown;
  result: ReturnType<typeof validateAutoTutorOutput>;
};

type CreationRecord = {
  id: string;
  createdAt: string;
  createdBy: string;
  sourceTextHash: string;
  sourceTextPreview?: string;
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
const DEBUG_RECORDS_STORAGE_KEY = 'mofacts.aiContentCreation.debugRecords';
const AI_CREATION_HANDOFF_STORAGE_KEY = 'mofacts.aiContentCreation.pendingRequest';
const PROMPT_TEMPLATE_VERSION = 'ai-content-creator-v2';
const COMPACT_SCHEMA_VERSION = 'ai-normalized-v1';
const MAX_STORED_RECORDS = 50;
const MAX_DEBUG_PAYLOAD_LENGTH = 20000;
const MAX_ITEM_CUE_REPAIR_PASSES = 2;

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

function truncateDebugValue(value: unknown): unknown {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof text !== 'string' || text.length <= MAX_DEBUG_PAYLOAD_LENGTH) {
    return value;
  }
  return `${text.slice(0, MAX_DEBUG_PAYLOAD_LENGTH)}\n...[truncated]`;
}

function saveCreationRecord(record: CreationRecord, debugRecord?: DebugRecord): void {
  const records = readStoredArray<CreationRecord>(CREATION_RECORDS_STORAGE_KEY);
  window.localStorage.setItem(
    CREATION_RECORDS_STORAGE_KEY,
    JSON.stringify([record, ...records].slice(0, MAX_STORED_RECORDS)),
  );

  if (debugRecord) {
    const debugRecords = readStoredArray<DebugRecord>(DEBUG_RECORDS_STORAGE_KEY);
    const storedDebug = {
      ...debugRecord,
      rawAiResponse: debugRecord.rawAiResponse ? String(truncateDebugValue(debugRecord.rawAiResponse)) : undefined,
      parsedJson: debugRecord.parsedJson ? truncateDebugValue(debugRecord.parsedJson) : undefined,
      llmCalls: debugRecord.llmCalls ? truncateDebugValue(debugRecord.llmCalls) : undefined,
    };
    window.localStorage.setItem(
      DEBUG_RECORDS_STORAGE_KEY,
      JSON.stringify([storedDebug, ...debugRecords].slice(0, MAX_STORED_RECORDS)),
    );
  }
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
    rawAiResponse,
    parsedJson,
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
): Promise<ItemGenerationResult> {
  const rawAiResponse = await callOpenRouterForItems(sourceText, selectedModules, apiKey, model, uploadedImages);
  const parsedJson = extractJsonObject(rawAiResponse);
  const repairs: ItemGenerationResult['repairs'] = [];
  const repairWarnings: string[] = [];
  let validation = enforceAiImageAuthorization(validateAiOutput(parsedJson), sourceText, uploadedImages.length);
  for (let pass = 0; pass < MAX_ITEM_CUE_REPAIR_PASSES; pass += 1) {
    const leaks = findCueLeaks(validation.output);
    if (leaks.length === 0) {
      break;
    }
    try {
      const rawRepairResponse = await callOpenRouterForItemCueRepair(sourceText, selectedModules, rawAiResponse, leaks, apiKey, model, uploadedImages);
      const parsedRepairJson = extractJsonObject(rawRepairResponse);
      const repairedItemIndexes = applyCueRepairResponse(parsedRepairJson, validation);
      repairs.push({
        rawAiResponse: rawRepairResponse,
        parsedJson: parsedRepairJson,
        repairedItemIndexes,
      });
      const priorWarnings = validation.warnings;
      validation = enforceAiImageAuthorization(validateAiOutput(validation.output), sourceText, uploadedImages.length);
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
  const enriched = await enrichAiContentMedia(validation.output, sourceText);
  return {
    rawAiResponse,
    parsedJson,
    repairs,
    result: {
      ...enriched,
      warnings: validation.warnings
        .concat(repairs.length ? [`Repaired answer-revealing cue text in ${repairs.reduce((count, repair) => count + repair.repairedItemIndexes.length, 0)} generated item${repairs.reduce((count, repair) => count + repair.repairedItemIndexes.length, 0) === 1 ? '' : 's'}.`] : [])
        .concat(repairWarnings)
        .concat(cueLeakWarnings)
        .concat(enriched.warnings),
      rejectedItems: validation.rejectedItems,
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
    sourceTextPreview: sourceText.slice(0, 500),
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
    const sourceTextHash = await hashCreationSource(sourceText, uploadedImages);
    const apiKey = '__server_resolved_openrouter__';
    const requestImages = await prepareRequestImages(uploadedImages);
    const itemModules = selectedModules.filter((moduleId) => moduleId === 'learningSession' || moduleId === 'assessmentSession');
    const itemGenerationPromise = itemModules.length > 0
      ? generateItemsFromAi(sourceText, itemModules, apiKey, model, requestImages)
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
    let rawAiResponse = '';
    let parsedJson: unknown = null;
    const llmCalls: DebugRecord['llmCalls'] = {};
    let warnings: string[] = [];
    let rejectedItems: Array<{ item: unknown; reason: string }> = [];

    if (itemGeneration) {
      rawAiResponse = itemGeneration.rawAiResponse;
      parsedJson = itemGeneration.parsedJson;
      llmCalls.itemGeneration = {
        rawAiResponse: itemGeneration.rawAiResponse,
        parsedJson: itemGeneration.parsedJson,
      };
      if (itemGeneration.repairs.length > 0) {
        llmCalls.itemCueRepairs = itemGeneration.repairs;
      }
      drafts.push(...buildDrafts(itemGeneration.result.output, itemModules, uploadedImages));
      warnings = warnings.concat(itemGeneration.result.warnings);
      rejectedItems = rejectedItems.concat(itemGeneration.result.rejectedItems);
      creationSummary = itemGeneration.result.output.creationSummary;
    }

    if (autoTutorGeneration) {
      llmCalls.autoTutorGeneration = {
        rawAiResponse: autoTutorGeneration.rawAiResponse,
        parsedJson: autoTutorGeneration.parsedJson,
      };
      if (autoTutorGeneration.result.output.expectationRelationshipProvenance) {
        const provenance = autoTutorGeneration.result.output.expectationRelationshipProvenance;
        llmCalls.autoTutorRelationshipGeneration = {
          model: provenance.model,
          attemptedModels: provenance.attemptedModels,
          sourceKeyType: provenance.sourceKeyType,
          cacheKey: provenance.cacheKey,
        };
      }
      drafts.push(buildAutoTutorDraft(autoTutorGeneration.result.output, '', model));
      warnings = warnings.concat(autoTutorGeneration.result.warnings);
      creationSummary = [
        creationSummary,
        autoTutorGeneration.result.output.creationSummary,
      ].filter(Boolean).join(' ');
      if (!rawAiResponse) {
        rawAiResponse = autoTutorGeneration.rawAiResponse;
        parsedJson = autoTutorGeneration.parsedJson;
      }
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
    if (warnings.length || rejectedItems.length) {
      debugRecord.rawAiResponse = rawAiResponse;
      debugRecord.parsedJson = parsedJson;
      debugRecord.llmCalls = llmCalls;
    }
    instance.debugRecord.set(debugRecord);
    saveCreationRecord({
      id: creationRecordId,
      createdAt: new Date().toISOString(),
      createdBy: Meteor.userId() || '',
      sourceTextHash,
      sourceTextPreview: sourceText.slice(0, 500),
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
    saveCreationRecord({
      id: creationRecordId,
      createdAt: new Date().toISOString(),
      createdBy: Meteor.userId() || '',
      sourceTextHash,
      sourceTextPreview: sourceText.slice(0, 500),
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
  this.autoStartFromHandoff = pendingHandoff?.autoStart === true;
});

Template.aiContentCreator.onDestroyed(function(this: AiCreatorInstance) {
  this.uploadedImages.get().forEach((image) => URL.revokeObjectURL(image.previewUrl));
});

Template.aiContentCreator.onRendered(function(this: AiCreatorInstance) {
  void refreshOpenRouterCapability(this);

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
  'click #ai-open-manual-creator'(event: Event) {
    event.preventDefault();
    FlowRouter.go('/contentCreate');
  },
});
