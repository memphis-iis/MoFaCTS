import { Meteor } from 'meteor/meteor';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import { SPARC_PROMPT_IMAGE_SETTINGS, SPARC_PROMPT_IMAGE_PURPOSE as PURPOSE, parseSparcPromptFigure, parseSparcPromptDisplayWidth } from '../../common/lib/sparcPromptImage';
import { generateSparcPromptImage, type GeneratedSparcPromptImage } from '../lib/sparcPromptImageGeneration';
import { resolvePreferredApiKey, type ApiKeyResolutionDeps } from '../lib/apiKeyResolution';
import { requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { sparcFigureSituationText, sparcFigureMinimumSimilarity, SPARC_FIGURE_LIBRARY_SETTINGS, type SparcFigureSituation } from '../../common/lib/sparcFigureLibrary';
import { callOpenRouterEmbeddings } from '../../common/lib/openRouterClient';
import { getOrGenerateSparcLibraryFigure, type SparcFigureLibraryStore } from '../lib/sparcFigureLibraryService';
import type { createStorageBoundary } from '../lib/storageBoundary';

type Asset = { _id: string; path?: string; type?: string; meta: Record<string, any> };
type Deps = {
  getApiKeyResolutionDeps: () => ApiKeyResolutionDeps;
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  DynamicAssets: {
    collection: { findOneAsync: (selector: Record<string, unknown>) => Promise<Asset | undefined>;
      updateAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>) => Promise<unknown> };
    writeAsync: (bytes: Buffer, options: Record<string, unknown>) => Promise<{ _id: string }>;
  };
  storageBoundary: ReturnType<typeof createStorageBoundary>;
  generateImage?: (apiKey: string, prompt: string) => Promise<GeneratedSparcPromptImage>;
  readFile?: (path: string) => Promise<Buffer>;
  figureLibrary?: SparcFigureLibraryStore;
  minimumFigureSimilarity?: number | undefined;
  embedSituation?: (apiKey: string, input: string) => Promise<{ vector: number[]; usage?: { costUsd?: number } }>;
};
type Context = { userId?: string | null; unblock?: () => void };
function bounded(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Meteor.Error(400, `${label} is required and must be bounded`);
  return value.trim();
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Admin experiment only. Teaching-library assets are shared; other session assets retain ownership. */
export function createSparcPromptImageMethods(deps: Deps) {
  const pending = new Map<string, Promise<unknown>>();
  const authorize = (context: Context) => requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId: context.userId, roles: ['admin'] });
  const findOwned = (assetId: string, userId: string) => deps.DynamicAssets.collection.findOneAsync({ _id: assetId, userId, 'meta.uploadPurpose': PURPOSE, 'meta.public': false });
  const findShared = (assetId: string) => deps.DynamicAssets.collection.findOneAsync({ _id: assetId,
    'meta.uploadPurpose': PURPOSE, 'meta.public': false, 'meta.figureLibraryVersion': SPARC_FIGURE_LIBRARY_SETTINGS.version });
  const minimumSimilarity = sparcFigureMinimumSimilarity(deps.minimumFigureSimilarity);
  const readBytes = async (asset: Asset) => {
    if (deps.storageBoundary.backend === 's3') {
      if (asset.meta.storageBackend !== 's3' || typeof asset.meta.storageKey !== 'string') throw new Meteor.Error(500, 'SPARC image has no completed S3 storage reference');
      return (await deps.storageBoundary.getObject(asset.meta.storageKey)).body;
    }
    if (!asset.path) throw new Meteor.Error(500, 'SPARC image has no local storage path');
    return (deps.readFile ?? fs.readFile)(asset.path);
  };
  const completeStorage = async (asset: Asset) => {
    if (asset.meta.ready === true) return;
    if (deps.storageBoundary.backend !== 's3' || !asset.path || typeof asset.type !== 'string') throw new Meteor.Error(500, 'SPARC image storage is incomplete');
    const bytes = await (deps.readFile ?? fs.readFile)(asset.path);
    const storageKey = `dynamic-assets/${asset._id}/${asset.meta.fileName}`;
    await deps.storageBoundary.putObject(storageKey, bytes, asset.type);
    await deps.DynamicAssets.collection.updateAsync({ _id: asset._id }, { $set: { 'meta.ready': true, 'meta.storageBackend': 's3', 'meta.storageKey': storageKey } });
  };
  const envelope = (asset: Asset, reused: boolean) => ({
    tutorMessage: bounded(asset.meta.tutorMessage, 'Saved tutor message', 2048),
    figure: parseSparcPromptFigure({ assetId: asset._id, description: asset.meta.description,
      ...(Object.prototype.hasOwnProperty.call(asset.meta, 'displayWidth') ? { displayWidth: asset.meta.displayWidth } : {}) }),
    ...(!reused ? { usage: asset.meta.usage } : {}),
  });
  return {
    async generateSparcPromptImage(this: Context, params: { tdfId: string; sessionId: string; generationId: string; tutorMessage: string; imagePrompt: string; figureDescription: string; displayWidth: number; situation?: SparcFigureSituation }) {
      const userId = await authorize(this);
      this.unblock?.();
      const tdfId = bounded(params?.tdfId, 'TDF identity', 200);
      const sessionId = bounded(params?.sessionId, 'Session identity', 200);
      const generationId = bounded(params?.generationId, 'Generation identity', 500);
      const tutorMessage = bounded(params?.tutorMessage, 'Tutor message', 2048);
      const description = bounded(params?.figureDescription, 'Figure description', 2048);
      const displayWidth = parseSparcPromptDisplayWidth(params?.displayWidth);
      parseSparcPromptFigure({ assetId: 'validation', description });
      const prompt = bounded(params?.imagePrompt, 'Image brief', SPARC_PROMPT_IMAGE_SETTINGS.maxPromptCharacters);
      const situation = params.situation === undefined ? undefined : sparcFigureSituationText(params.situation);
      const identity = digest(JSON.stringify([userId, tdfId, sessionId, generationId]));
      const assetId = identity.slice(0, 20);
      if (pending.has(identity)) return pending.get(identity);
      const work = (async () => {
        const historical = await findOwned(assetId, userId);
        if (historical && historical.meta.figureLibraryVersion === undefined) {
          if (historical.meta.generationIdentity !== identity) throw new Meteor.Error(409, 'SPARC image identity collision');
          await completeStorage(historical);
          return envelope(historical, true);
        }
        if (situation !== undefined) {
          if (!deps.figureLibrary) throw new Meteor.Error(500, 'SPARC figure library is not configured');
          let apiKey: string | undefined;
          const key = async () => {
            if (!apiKey) {
              const resolved = await resolvePreferredApiKey(deps.getApiKeyResolutionDeps(), { userId, tdfId, kind: 'openrouter' });
              if (!resolved.apiKey) throw new Meteor.Error(403, 'SPARC image generation requires a configured OpenRouter API key');
              apiKey = resolved.apiKey;
            }
            return apiKey;
          };
          const decision = await getOrGenerateSparcLibraryFigure({ store: deps.figureLibrary, identity, assetId,
            userId, tdfId, sessionId, situation, imagePrompt: prompt, tutorMessage, description, displayWidth, minimumSimilarity,
            embed: async input => {
              const resolvedKey = await key();
              if (deps.embedSituation) return await deps.embedSituation(resolvedKey, input);
              try {
                const result = await callOpenRouterEmbeddings({ apiKey: resolvedKey,
                  model: SPARC_FIGURE_LIBRARY_SETTINGS.embeddingModel, input: [input] });
                return { vector: result.embeddings[0]!, ...(result.costUsd === undefined ? {} : { usage: { costUsd: result.costUsd } }) };
              } catch { throw new Meteor.Error('sparc-figure-embedding-failed', 'SPARC figure situation embedding failed'); }
            },
            generate: async entry => {
              const saved = await findOwned(entry._id, userId);
              if (saved) {
                if (saved.meta.generationIdentity !== identity || saved.meta.figureLibraryVersion !== entry.version) throw new Meteor.Error(409, 'SPARC library asset identity collision');
                await completeStorage(saved);
                return { usage: saved.meta.usage };
              }
              if (entry.ready || !entry.generation) throw new Meteor.Error(500, 'SPARC library figure is missing its canonical asset');
              let image: GeneratedSparcPromptImage;
              try { image = await (deps.generateImage ?? generateSparcPromptImage)(await key(), entry.generation.imagePrompt); }
              catch (error) { throw new Meteor.Error('sparc-image-generation-failed', error instanceof Error && /^SPARC image /.test(error.message) ? error.message : 'SPARC image generation failed'); }
              const fileName = `teaching-figure.${image.extension}`;
              const file = await deps.DynamicAssets.writeAsync(image.bytes, { fileId: entry._id, fileName, userId, type: image.mediaType,
                meta: { public: false, uploadPurpose: PURPOSE, generationIdentity: identity, tdfId, sessionId,
                  tutorMessage: entry.generation.tutorMessage, description: entry.generation.description, displayWidth: entry.generation.displayWidth,
                  figureLibraryVersion: entry.version, fileName, model: SPARC_PROMPT_IMAGE_SETTINGS.model,
                  quality: SPARC_PROMPT_IMAGE_SETTINGS.quality, usage: image.usage, ready: deps.storageBoundary.backend === 'local' } });
              if (file._id !== entry._id) throw new Meteor.Error(500, 'SPARC image storage changed the generation identity');
              const asset = await findOwned(entry._id, userId);
              if (!asset) throw new Meteor.Error(500, 'SPARC image storage did not persist its canonical asset');
              await completeStorage(asset);
              return { usage: image.usage };
            } });
          const asset = await findShared(decision.assetId);
          if (!asset || asset.meta.ready !== true) throw new Meteor.Error(500, 'SPARC library figure is missing its completed asset');
          return { ...envelope(asset, true), ...(decision.usage ? { usage: decision.usage } : {}),
            ...(decision.embeddingUsage ? { embeddingUsage: decision.embeddingUsage } : {}),
            libraryMatch: { source: decision.source, similarity: decision.similarity } };
        }
        let asset = await findOwned(assetId, userId);
        if (asset) {
          if (asset.meta.generationIdentity !== identity) throw new Meteor.Error(409, 'SPARC image identity collision');
          await completeStorage(asset);
          return envelope(asset, true);
        }
        const resolved = await resolvePreferredApiKey(deps.getApiKeyResolutionDeps(), { userId, tdfId, kind: 'openrouter' });
        if (!resolved.apiKey) throw new Meteor.Error(403, 'SPARC image generation requires a configured OpenRouter API key');
        let image: GeneratedSparcPromptImage;
        try { image = await (deps.generateImage ?? generateSparcPromptImage)(resolved.apiKey, prompt); }
        catch (error) {
          // Preserve safe helper diagnostics only, never fetch errors containing secrets or provider bodies.
          const reason = error instanceof Error && /^SPARC image /.test(error.message) ? error.message : 'SPARC image generation failed';
          throw new Meteor.Error('sparc-image-generation-failed', reason);
        }
        const fileName = `supported-prompt.${image.extension}`;
        const file = await deps.DynamicAssets.writeAsync(image.bytes, { fileId: assetId, fileName, userId, type: image.mediaType,
          meta: { public: false, uploadPurpose: PURPOSE, generationIdentity: identity, tdfId, sessionId,
            tutorMessage, description, displayWidth, fileName, model: SPARC_PROMPT_IMAGE_SETTINGS.model,
            quality: SPARC_PROMPT_IMAGE_SETTINGS.quality, usage: image.usage, ready: deps.storageBoundary.backend === 'local' } });
        if (file._id !== assetId) throw new Meteor.Error(500, 'SPARC image storage changed the generation identity');
        asset = await findOwned(assetId, userId);
        if (!asset) throw new Meteor.Error(500, 'SPARC image storage did not persist its owned asset');
        await completeStorage(asset);
        return envelope(asset, false);
      })();
      pending.set(identity, work);
      try { return await work; } finally { pending.delete(identity); }
    },
    async getSparcPromptImage(this: Context, assetIdValue: string) {
      const userId = await authorize(this);
      const assetId = bounded(assetIdValue, 'Image asset identity', 20);
      if (!/^[a-zA-Z0-9]+$/.test(assetId)) throw new Meteor.Error(400, 'Invalid image asset identity');
      const asset = await findOwned(assetId, userId) ?? (deps.figureLibrary && await deps.figureLibrary.findEntry(assetId) ? await findShared(assetId) : undefined);
      if (!asset || asset.meta.ready !== true) throw new Meteor.Error(404, 'SPARC image not found');
      const bytes = await readBytes(asset);
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.type ?? '') || bytes.length > SPARC_PROMPT_IMAGE_SETTINGS.maxBytes) throw new Meteor.Error(500, 'Invalid saved SPARC image');
      return { dataUrl: `data:${asset.type};base64,${bytes.toString('base64')}` };
    },
  };
}
