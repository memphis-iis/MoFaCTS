import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import './aiContentPromptLab.html';
import './aiContentReview.html';
import './experimentSetup/aiContentCreator.css';
import { getErrorMessage } from '../lib/errorUtils';
import {
  aiContentAiStageOutputKey,
  runAiContentPipeline,
  type AiContentPipelineResult,
} from '../lib/aiContentPipeline';
import { callAdminLabAiContentStage } from '../lib/aiContentOpenRouterClient';
import {
  AI_CONTENT_PROMPT_LAB_MAX_CHECKPOINTS,
  createAiContentPromptLabDraft,
  parsePromptLabWorkspace,
  promptLabCheckpoint,
  promptLabStageLabel,
  updatePromptLabStage,
  type AiContentPromptLabCheckpoint,
  type AiContentPromptLabDraft,
  type AiContentPromptLabWorkspace,
} from '../lib/aiContentPromptLabState';
import {
  AI_CONTENT_AI_STAGE_IDS,
  aiContentStageSchemaPreview,
  type AiContentAiStageId,
} from '../lib/aiContentPrompts';
import { loadOpenRouterModelCatalog } from '../lib/openRouterModelCatalogClient';
import {
  getAllowedOpenRouterReasoningLevels,
  isOpenRouterReasoningLevel,
  type OpenRouterModelCatalogEntry,
  type OpenRouterReasoningLevel,
} from '../../common/lib/openRouterModelCatalog';
import {
  AI_CONTENT_CONTRACT_VERSION,
  type AiContentPipelineRun,
  type AiContentStageName,
} from '../../common/aiContentContract';

const AI_CONTENT_STAGE_DESCRIPTIONS: Record<AiContentStageName, string> = {
  'interpret-request': 'Interpret the author notes and construct one Wikipedia list-search intent.',
  'search-wikipedia': 'Search Wikipedia and retain at most three real list-page candidates.',
  'select-list-page': 'Select one supplied Wikipedia page candidate as the authoritative list.',
  'fetch-list-page': 'Retrieve the selected list page by its canonical page ID.',
  'select-list-region': 'Select the table, list, or gallery that supplies the authoritative items.',
  'extract-list-entries': 'Extract source-anchored responses, image references, and detail links.',
  'select-source-fields': 'Select two real source fields for deterministic prompt-response mapping.',
  'generate-definition': 'Generate and validate one learner-facing definition for one response.',
  'evaluate-direct-images': 'Evaluate retrieved images structurally associated with one list entry.',
  'hydrate-direct-images': 'Resolve direct file references to canonical Wikimedia metadata.',
  'hydrate-detail-links': 'Resolve list-entry article links to canonical Wikipedia pages.',
  'select-detail-link': 'Select the canonical entity page for one response.',
  'fetch-detail-page': 'Retrieve the selected entity page by page ID.',
  'extract-detail-images': 'Extract Wikimedia file references from the entity page.',
  'hydrate-detail-images': 'Resolve detail-page file references to canonical Wikimedia metadata.',
  'evaluate-detail-images': 'Evaluate which supplied detail-page image best matches the requested role.',
  'infer-image-filename-pattern': 'Compare canonical response-bearing filenames with an individually validated image and derive one response-based filename rule.',
  'resolve-pattern-file-titles': 'Ask Wikimedia to resolve all predicted File titles to canonical file records.',
  'match-image-filename-pattern': 'Record whether one predicted title resolved for this item.',
  'queue-pattern-fallback': 'Queue a pattern exception for the ordinary individual image resolver.',
  'acquire-image': 'Download, validate, and convert the selected Wikimedia rendition to WebP.',
};

const MeteorAny = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };

type PromptLabBaseline = {
  source: string;
  model: string;
  reasoningLevel: OpenRouterReasoningLevel;
};

type PromptLabReviewPair = {
  id: string;
  number: number;
  isText: boolean;
  isImage: boolean;
  editable: false;
  promptLabel: string;
  showImageRequirement: boolean;
  stimulus: string;
  response: string;
  imageRequirement: string;
  sourcePath: string;
  imageResolved: boolean;
  imagePreviewUrl: string;
  imageAlt: string;
  imageSourceUrl: string;
  hasImageSource: boolean;
  imageFailureReason: string;
};

type PromptLabInstance = Blaze.TemplateInstance & {
  draft: ReactiveVar<AiContentPromptLabDraft>;
  checkpointLabel: ReactiveVar<string>;
  checkpoints: ReactiveVar<readonly AiContentPromptLabCheckpoint[]>;
  baseline: ReactiveVar<PromptLabBaseline | null>;
  catalog: ReactiveVar<readonly OpenRouterModelCatalogEntry[]>;
  catalogError: ReactiveVar<string>;
  pending: ReactiveVar<boolean>;
  error: ReactiveVar<string>;
  run: ReactiveVar<AiContentPipelineRun | null>;
  runObjectSnapshot: ReactiveVar<string>;
  result: ReactiveVar<AiContentPipelineResult | null>;
  traceJsonCache: Map<string, { signature: string; json: string }>;
  visibleTraceJsonIds: ReactiveVar<ReadonlySet<string>>;
  previewUrls: string[];
  previewByItemId: Map<string, string>;
  operationSequence: number;
};

function displayJson(value: unknown): string {
  return JSON.stringify(value, (key, nestedValue: unknown) => {
    if (key === 'html' && typeof nestedValue === 'string') {
      return `[Retrieved Wikipedia HTML omitted from live display: ${nestedValue.length.toLocaleString()} characters]`;
    }
    return nestedValue;
  }, 2);
}

function traceJson(instance: PromptLabInstance, trace: AiContentPipelineRun['traces'][number]): string {
  const signature = `${trace.status}|${trace.completedAt || ''}`;
  const cached = instance.traceJsonCache.get(trace.traceId);
  if (cached?.signature === signature) return cached.json;
  const json = displayJson(trace);
  instance.traceJsonCache.set(trace.traceId, { signature, json });
  return json;
}

function storageKey(): string | null {
  const userId = Meteor.userId();
  return userId ? `mofacts.aiContentPromptLab.v${String(AI_CONTENT_CONTRACT_VERSION)}:${userId}` : null;
}

function loadWorkspace(): AiContentPromptLabWorkspace | null {
  const key = storageKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? parsePromptLabWorkspace(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveWorkspace(instance: PromptLabInstance): void {
  const key = storageKey();
  if (!key) return;
  const workspace: AiContentPromptLabWorkspace = {
    contractVersion: instance.draft.get().contractVersion,
    draft: instance.draft.get(),
    checkpoints: instance.checkpoints.get(),
  };
  localStorage.setItem(key, JSON.stringify(workspace));
}

function revokePreviews(instance: PromptLabInstance): void {
  instance.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  instance.previewUrls = [];
  instance.previewByItemId.clear();
}

function invalidateRun(instance: PromptLabInstance): void {
  instance.operationSequence += 1;
  instance.pending.set(false);
  revokePreviews(instance);
  instance.run.set(null);
  instance.runObjectSnapshot.set('');
  instance.traceJsonCache.clear();
  instance.visibleTraceJsonIds.set(new Set());
  instance.result.set(null);
  instance.error.set('');
}

function setDraft(instance: PromptLabInstance, draft: AiContentPromptLabDraft, invalidate = true): void {
  instance.draft.set(draft);
  saveWorkspace(instance);
  if (invalidate) invalidateRun(instance);
}

function saveCheckpoint(instance: PromptLabInstance, automatic = false, labelOverride = ''): void {
  const checkpoint = promptLabCheckpoint(
    instance.draft.get(),
    new Date().toISOString(),
    labelOverride || (automatic ? `Run ${new Date().toLocaleString()}` : instance.checkpointLabel.get()),
  );
  instance.checkpoints.set([checkpoint, ...instance.checkpoints.get()].slice(0, AI_CONTENT_PROMPT_LAB_MAX_CHECKPOINTS));
  instance.checkpointLabel.set('');
  saveWorkspace(instance);
}

function selectedModel(instance: PromptLabInstance): OpenRouterModelCatalogEntry | undefined {
  const model = instance.draft.get().model;
  return instance.catalog.get().find((entry) => entry.id === model);
}

function allowedReasoning(instance: PromptLabInstance): OpenRouterReasoningLevel[] {
  const model = selectedModel(instance);
  return model ? getAllowedOpenRouterReasoningLevels(model) : [];
}

function draftConfigurationIssue(instance: PromptLabInstance): string {
  const draft = instance.draft.get();
  const model = selectedModel(instance);
  if (!draft.authorNotes.trim()) return 'Author notes are required.';
  if (!draft.model.trim()) return 'The Admin Control Panel model is not available.';
  if (!model) return 'The configured Admin model is not available in the current OpenRouter catalog.';
  const allowed = getAllowedOpenRouterReasoningLevels(model);
  const invalidStage = AI_CONTENT_AI_STAGE_IDS.find((stage) => !allowed.includes(draft.stages[stage].reasoningLevel));
  return invalidStage
    ? `${promptLabStageLabel(invalidStage)} uses a reasoning level unsupported by the configured Admin model.`
    : '';
}

function stageId(value: unknown): AiContentAiStageId {
  const stage = String(value || '') as AiContentAiStageId;
  if (!AI_CONTENT_AI_STAGE_IDS.includes(stage)) throw new Error(`Unknown AI Content Prompt Lab stage ${JSON.stringify(stage)}.`);
  return stage;
}

function createReview(instance: PromptLabInstance, result: AiContentPipelineResult): void {
  revokePreviews(instance);
  result.assets.forEach((asset) => {
    const previewUrl = URL.createObjectURL(new Blob([new Uint8Array(asset.webpBytes).buffer], { type: 'image/webp' }));
    instance.previewUrls.push(previewUrl);
    instance.previewByItemId.set(asset.candidate.itemId, previewUrl);
  });
}

function retryOptions(run: AiContentPipelineRun, traceId: string): {
  reusedAiOutputs: Record<string, unknown>;
  retryTarget: { key: string; input: unknown };
} {
  const targetIndex = run.traces.findIndex((trace) => trace.traceId === traceId);
  const target = run.traces[targetIndex];
  if (targetIndex < 0 || !target || !AI_CONTENT_AI_STAGE_IDS.includes(target.stage as AiContentAiStageId)) {
    throw new Error('Only recorded AI prompt stages can be retried.');
  }
  const reusedAiOutputs: Record<string, unknown> = {};
  run.traces.slice(0, targetIndex).forEach((trace) => {
    if (!AI_CONTENT_AI_STAGE_IDS.includes(trace.stage as AiContentAiStageId)
      || trace.status !== 'succeeded'
      || trace.output === undefined) return;
    reusedAiOutputs[aiContentAiStageOutputKey(trace.stage as AiContentAiStageId, trace.itemId)] = trace.output;
  });
  return {
    reusedAiOutputs,
    retryTarget: {
      key: aiContentAiStageOutputKey(target.stage as AiContentAiStageId, target.itemId),
      input: target.input,
    },
  };
}

async function runLab(instance: PromptLabInstance, retryTraceId?: string): Promise<void> {
  if (instance.pending.get()) return;
  const draft = instance.draft.get();
  const configurationIssue = draftConfigurationIssue(instance);
  if (configurationIssue) throw new Error(configurationIssue);
  const retry = retryTraceId && instance.run.get() ? retryOptions(instance.run.get()!, retryTraceId) : undefined;
  saveCheckpoint(instance, true);
  invalidateRun(instance);
  const operation = instance.operationSequence;
  instance.pending.set(true);
  instance.error.set('');
  try {
    const result = await runAiContentPipeline({
      notes: draft.authorNotes,
      mode: 'learning',
      model: draft.model,
      reasoningLevel: instance.baseline.get()?.reasoningLevel || 'none',
      settings: draft.stages,
      stageCaller: callAdminLabAiContentStage,
      revision: operation,
      assertCurrent() {
        if (instance.operationSequence !== operation) throw new Error('The Prompt Lab run was superseded by an edited draft.');
      },
      onRunUpdated(run) {
        if (instance.operationSequence === operation) instance.run.set(run);
      },
      ...(retry ? retry : {}),
    });
    if (instance.operationSequence !== operation) return;
    createReview(instance, result);
    instance.run.set(result.run);
    instance.result.set(result);
  } catch (error) {
    if (instance.operationSequence === operation) instance.error.set(getErrorMessage(error));
  } finally {
    if (instance.operationSequence === operation) instance.pending.set(false);
  }
}

Template.aiContentPromptLab.onCreated(function(this: PromptLabInstance) {
  const workspace = loadWorkspace();
  this.draft = new ReactiveVar(workspace?.draft || createAiContentPromptLabDraft());
  this.checkpointLabel = new ReactiveVar('');
  this.checkpoints = new ReactiveVar(workspace?.checkpoints || []);
  this.baseline = new ReactiveVar(null);
  this.catalog = new ReactiveVar([]);
  this.catalogError = new ReactiveVar('');
  this.pending = new ReactiveVar(false);
  this.error = new ReactiveVar('');
  this.run = new ReactiveVar(null);
  this.runObjectSnapshot = new ReactiveVar('');
  this.result = new ReactiveVar(null);
  this.traceJsonCache = new Map();
  this.visibleTraceJsonIds = new ReactiveVar(new Set());
  this.previewUrls = [];
  this.previewByItemId = new Map();
  this.operationSequence = 0;

  void MeteorAny.callAsync('getAdminTestOpenRouterCapability')
    .then((capability) => {
      const model = String(capability?.model || '').trim();
      const reasoningLevel = isOpenRouterReasoningLevel(capability?.reasoningLevel) ? capability.reasoningLevel : 'none';
      this.baseline.set({ source: String(capability?.source || 'admin'), model, reasoningLevel });
      const current = this.draft.get();
      setDraft(this, workspace
        ? { ...current, model }
        : createAiContentPromptLabDraft({ model, reasoningLevel }), false);
    })
    .catch((error) => this.error.set(getErrorMessage(error)));
  void loadOpenRouterModelCatalog()
    .then((catalog) => this.catalog.set(catalog))
    .catch((error) => this.catalogError.set(getErrorMessage(error)));
});

Template.aiContentPromptLab.onDestroyed(function(this: PromptLabInstance) {
  this.operationSequence += 1;
  revokePreviews(this);
});

Template.aiContentPromptLab.helpers({
  pending() { return (Template.instance() as PromptLabInstance).pending.get(); },
  runDisabled() {
    const instance = Template.instance() as PromptLabInstance;
    return !draftConfigurationIssue(instance)
      ? {}
      : { disabled: true };
  },
  baselineDescription() {
    const instance = Template.instance() as PromptLabInstance;
    const baseline = instance.baseline.get();
    if (!baseline) return instance.catalogError.get() || 'Loading the configured Admin model and reasoning capabilities...';
    const issue = draftConfigurationIssue(instance);
    return `Admin Control Panel model: ${baseline.model}. Baseline reasoning: ${baseline.reasoningLevel}. Every stage below shows and explicitly supplies its simulation reasoning level.${issue ? ` Configuration issue: ${issue}` : ''}`;
  },
  authorNotes() { return (Template.instance() as PromptLabInstance).draft.get().authorNotes; },
  configuredModel() { return (Template.instance() as PromptLabInstance).draft.get().model; },
  stageRows() {
    const draft = (Template.instance() as PromptLabInstance).draft.get();
    return AI_CONTENT_AI_STAGE_IDS.map((stage, index) => ({
      stage,
      number: index + 1,
      label: promptLabStageLabel(stage),
      schemaJson: JSON.stringify(aiContentStageSchemaPreview(stage), null, 2),
      ...draft.stages[stage],
    }));
  },
  reasoningOptions() {
    const instance = Template.instance() as PromptLabInstance;
    const current = this as { stage: AiContentAiStageId; reasoningLevel: OpenRouterReasoningLevel };
    return allowedReasoning(instance).map((value) => ({
      value,
      label: value === 'default' ? 'Provider default reasoning' : value,
      selectedAttrs: value === current.reasoningLevel ? { selected: true } : {},
    }));
  },
  reasoningDisabled() {
    return selectedModel(Template.instance() as PromptLabInstance) ? {} : { disabled: true };
  },
  resetCodeDefaultsDisabled() {
    const instance = Template.instance() as PromptLabInstance;
    return instance.pending.get() || !instance.baseline.get() ? { disabled: true } : {};
  },
  checkpointLabel() { return (Template.instance() as PromptLabInstance).checkpointLabel.get(); },
  checkpointCount() { return (Template.instance() as PromptLabInstance).checkpoints.get().length; },
  hasCheckpoints() { return (Template.instance() as PromptLabInstance).checkpoints.get().length > 0; },
  checkpointRows() {
    return (Template.instance() as PromptLabInstance).checkpoints.get().map((checkpoint) => ({
      ...checkpoint,
      savedAtDisplay: new Date(checkpoint.savedAt).toLocaleString(),
      settingsJson: JSON.stringify(checkpoint.draft, null, 2),
    }));
  },
  error() { return (Template.instance() as PromptLabInstance).error.get(); },
  hasRun() { return Boolean((Template.instance() as PromptLabInstance).run.get()); },
  traceRows() {
    const instance = Template.instance() as PromptLabInstance;
    const run = instance.run.get();
    const responseByItem = new Map((run?.entries || []).map((entry) => [entry.itemId, entry.displayedResponse]));
    return (run?.traces || []).map((trace, index) => ({
      ...trace,
      _id: trace.traceId,
      number: index + 1,
      stageLabel: trace.stage.replaceAll('-', ' '),
      description: AI_CONTENT_STAGE_DESCRIPTIONS[trace.stage],
      itemLabel: trace.itemId ? responseByItem.get(trace.itemId) || trace.itemId : '',
      retryable: AI_CONTENT_AI_STAGE_IDS.includes(trace.stage as AiContentAiStageId),
    }));
  },
  traceJsonVisible(traceId: string) {
    return (Template.instance() as PromptLabInstance).visibleTraceJsonIds.get().has(traceId);
  },
  traceJson() {
    return traceJson(Template.instance() as PromptLabInstance, this as AiContentPipelineRun['traces'][number]);
  },
  hasRunObjectSnapshot() { return Boolean((Template.instance() as PromptLabInstance).runObjectSnapshot.get()); },
  runObjectSnapshot() { return (Template.instance() as PromptLabInstance).runObjectSnapshot.get(); },
  hasWarnings() { return ((Template.instance() as PromptLabInstance).result.get()?.warnings.length || 0) > 0; },
  warnings() { return (Template.instance() as PromptLabInstance).result.get()?.warnings || []; },
  reviewPairs(): PromptLabReviewPair[] {
    const instance = Template.instance() as PromptLabInstance;
    const result = instance.result.get();
    const imageRequirement = result?.run.intent?.imageRequirement || '';
    return (result?.pairs || []).map((pair, index) => ({
      id: pair.id,
      number: index + 1,
      isText: pair.kind === 'text',
      isImage: pair.kind === 'image',
      editable: false,
      promptLabel: 'Learner-visible prompt',
      showImageRequirement: pair.kind === 'image',
      stimulus: pair.stimulus,
      response: pair.response,
      imageRequirement,
      sourcePath: pair.provenance.sourcePath,
      imageResolved: pair.kind === 'image' && pair.image?.status === 'resolved' && instance.previewByItemId.has(pair.id),
      imagePreviewUrl: instance.previewByItemId.get(pair.id) || '',
      imageAlt: `Located image for ${pair.response}`,
      imageSourceUrl: pair.image?.sourceUrl || '',
      hasImageSource: Boolean(pair.image?.sourceUrl),
      imageFailureReason: pair.image?.failureReason || 'No image was resolved.',
    }));
  },
});

Template.aiContentPromptLab.events({
  'click .show-ai-content-lab-trace-json'(event: Event, instance: PromptLabInstance) {
    event.preventDefault();
    const traceId = String((event.currentTarget as HTMLElement).dataset.traceId || '');
    instance.visibleTraceJsonIds.set(new Set([...instance.visibleTraceJsonIds.get(), traceId]));
  },
  'click .hide-ai-content-lab-trace-json'(event: Event, instance: PromptLabInstance) {
    event.preventDefault();
    const traceId = String((event.currentTarget as HTMLElement).dataset.traceId || '');
    const visible = new Set(instance.visibleTraceJsonIds.get());
    visible.delete(traceId);
    instance.visibleTraceJsonIds.set(visible);
  },
  'click .snapshot-ai-content-prompt-lab-run'(event: Event, instance: PromptLabInstance) {
    event.preventDefault();
    instance.runObjectSnapshot.set(displayJson(instance.run.get()));
  },
  'input #ai-content-prompt-lab-author-notes'(event: Event, instance: PromptLabInstance) {
    setDraft(instance, { ...instance.draft.get(), authorNotes: (event.currentTarget as HTMLTextAreaElement).value });
  },
  'input .ai-content-lab-stage-system'(event: Event, instance: PromptLabInstance) {
    const input = event.currentTarget as HTMLTextAreaElement;
    setDraft(instance, updatePromptLabStage(instance.draft.get(), stageId(input.dataset.stage), { systemPrompt: input.value }));
  },
  'input .ai-content-lab-stage-instructions'(event: Event, instance: PromptLabInstance) {
    const input = event.currentTarget as HTMLTextAreaElement;
    setDraft(instance, updatePromptLabStage(instance.draft.get(), stageId(input.dataset.stage), { instructions: input.value }));
  },
  'change .ai-content-lab-stage-reasoning'(event: Event, instance: PromptLabInstance) {
    const select = event.currentTarget as HTMLSelectElement;
    const reasoningLevel = select.value;
    if (!isOpenRouterReasoningLevel(reasoningLevel) || !allowedReasoning(instance).includes(reasoningLevel)) {
      instance.error.set('The selected reasoning level is not supported by the configured model.');
      return;
    }
    setDraft(instance, updatePromptLabStage(instance.draft.get(), stageId(select.dataset.stage), { reasoningLevel }));
  },
  'input .ai-content-lab-stage-tokens'(event: Event, instance: PromptLabInstance) {
    const input = event.currentTarget as HTMLInputElement;
    const visibleOutputTokens = Number(input.value);
    if (!Number.isFinite(visibleOutputTokens) || visibleOutputTokens <= 0) return;
    setDraft(instance, updatePromptLabStage(instance.draft.get(), stageId(input.dataset.stage), { visibleOutputTokens }));
  },
  'input #ai-content-prompt-lab-checkpoint-label'(event: Event, instance: PromptLabInstance) {
    instance.checkpointLabel.set((event.currentTarget as HTMLInputElement).value);
  },
  'click .save-ai-content-prompt-lab-checkpoint'(event: Event, instance: PromptLabInstance) {
    event.preventDefault();
    saveCheckpoint(instance);
  },
  'click .reset-ai-content-prompt-lab-code-defaults'(event: Event, instance: PromptLabInstance) {
    event.preventDefault();
    if (instance.pending.get()) return;
    const baseline = instance.baseline.get();
    if (!baseline) {
      instance.error.set('The Admin Control Panel configuration is still loading.');
      return;
    }
    const current = instance.draft.get();
    saveCheckpoint(instance, false, `Before reset to code defaults ${new Date().toLocaleString()}`);
    const defaults = createAiContentPromptLabDraft({
      model: current.model,
      reasoningLevel: baseline.reasoningLevel,
    });
    setDraft(instance, { ...current, stages: defaults.stages });
  },
  'click .load-ai-content-prompt-lab-checkpoint'(event: Event, instance: PromptLabInstance) {
    event.preventDefault();
    const checkpointId = String((event.currentTarget as HTMLElement).dataset.checkpointId || '');
    const checkpoint = instance.checkpoints.get().find(({ id }) => id === checkpointId);
    if (!checkpoint) {
      instance.error.set('The selected prompt checkpoint is no longer available in this browser.');
      return;
    }
    setDraft(instance, { ...checkpoint.draft, model: instance.draft.get().model });
  },
  'click .run-ai-content-prompt-lab'(event: Event, instance: PromptLabInstance) {
    event.preventDefault();
    void runLab(instance).catch((error) => instance.error.set(getErrorMessage(error)));
  },
  'click .retry-ai-content-prompt-stage'(event: Event, instance: PromptLabInstance) {
    event.preventDefault();
    const traceId = String((event.currentTarget as HTMLElement).dataset.traceId || '');
    void runLab(instance, traceId).catch((error) => instance.error.set(getErrorMessage(error)));
  },
});
