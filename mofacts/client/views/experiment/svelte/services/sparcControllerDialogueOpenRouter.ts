import { Meteor } from 'meteor/meteor';
import { normalizeEmbeddingVector } from '../../../../../../learning-components/runtime/vectorSimilarity';
import {
  createSparcDialogueOpenRouterAdapter,
  type SparcDialogueAdapterOptions,
  type CallResolvedOpenRouterJson,
} from '../../../../../../learning-components/units/sparcsession/sparcDialogueOpenRouterAdapter';
import { SPARC_EMBEDDING_MODEL } from '../../../../../common/lib/sparcEmbeddingModel';
import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../../../../common/lib/sparcPromptImage';
import type { RecoverableWarning } from '../../../../../common/recoverableWarnings';
import { reportRecoverableWarning } from '../../../../lib/recoverableWarnings';
import { clientConsole } from '../../../../lib/clientLogger';
import { callWithSparcOutputDiagnostics } from './sparcOutputDiagnostics';
import { summarizeSparcCitation } from './sparcCitationDiagnostics';
import { embedSparcTexts } from './sparcLocalEmbeddings';
import { realizeSparcPrimitive } from './sparcPrimitiveRealization';
import { callSparcPromptImage, callSparcVisualSupport, type CallSparcPromptImage, type CallSparcVisualSupport } from './sparcPromptImage';

export { buildSparcScoringSystemPrompt } from '../../../../../../learning-components/units/sparcsession/sparcDialogueOpenRouterAdapter';
export type {
  CallResolvedOpenRouterJson,
  SparcDialogueOpenRouterUsageEvent,
  SparcDialogueLearnerResponseEvaluation,
  SparcDialogueLearnerResponseScoringTraceEvent,
} from '../../../../../../learning-components/units/sparcsession/sparcDialogueOpenRouterAdapter';

export type SparcDialogueOpenRouterProviderOptions = SparcDialogueAdapterOptions & {
  readonly reportWarning?: (warning: RecoverableWarning) => void | Promise<void>;
  readonly callResolvedOpenRouterJson?: CallResolvedOpenRouterJson;
  readonly embedAssessmentTargets?: (texts: string[]) => Promise<number[][]>;
  readonly callSparcPromptImage?: CallSparcPromptImage;
  readonly callSparcVisualSupport?: CallSparcVisualSupport;
};

const assessmentTargetVectors = new Map<string, number[][]>();

function defaultCallResolvedOpenRouterJson(params: Parameters<CallResolvedOpenRouterJson>[0]) {
  const meteor = (globalThis as typeof globalThis & {
    Meteor?: { callAsync?: (name: string, ...args: unknown[]) => Promise<unknown> };
  }).Meteor;
  if (typeof meteor?.callAsync !== 'function') {
    throw new Error('SPARC dialogue OpenRouter provider requires Meteor.callAsync or an injected callResolvedOpenRouterJson');
  }
  return meteor.callAsync('callResolvedOpenRouterJson', params);
}

/** App runtime factory: browser cache, transport, persistence, and diagnostics only. */
export function createSparcDialogueOpenRouterProvider(options: SparcDialogueOpenRouterProviderOptions) {
  const callResolvedOpenRouterJson = options.callResolvedOpenRouterJson ?? defaultCallResolvedOpenRouterJson;
  // Providers are constructed per turn. Share at most four authored target sets,
  // scoped to account, lesson, embedding model, and exact authored text.
  const vectorCache = options.embedAssessmentTargets ? new Map<string, number[][]>() : assessmentTargetVectors;
  const embedAssessmentTargets = options.embedAssessmentTargets ?? ((input: string[]) => embedSparcTexts(options.tdfId, input));
  return createSparcDialogueOpenRouterAdapter(options, {
    callResolvedJson: callResolvedOpenRouterJson,
    callGeneratedJson: (request, operation, onResult) => callWithSparcOutputDiagnostics({ request, operation,
      call: callResolvedOpenRouterJson, reportWarning: options.reportWarning ?? reportRecoverableWarning, onResult }),
    async loadNormalizedAssessmentVectors(texts) {
      const key = JSON.stringify([options.embedAssessmentTargets ? 'injected' : Meteor.userId(), options.tdfId, SPARC_EMBEDDING_MODEL, texts]);
      if (!vectorCache.has(key)) {
        const loaded = await embedAssessmentTargets(texts);
        if (loaded.length !== texts.length) throw new Error('Assessment embedding count does not match authored targets');
        if (vectorCache.size >= 4) vectorCache.delete(vectorCache.keys().next().value!);
        vectorCache.set(key, loaded.map(vector => normalizeEmbeddingVector(vector)));
      }
      return vectorCache.get(key)!;
    },
    generateImage: options.callSparcPromptImage ?? callSparcPromptImage,
    resolveVisual: options.callSparcVisualSupport ?? callSparcVisualSupport,
    realizePrimitive: realizeSparcPrimitive,
    summarizeCitation: summarizeSparcCitation,
    log: clientConsole,
    reportCitationMismatch: warning => (options.reportWarning ?? reportRecoverableWarning)(warning),
    imageDisplayWidth: SPARC_PROMPT_IMAGE_SETTINGS,
  });
}
