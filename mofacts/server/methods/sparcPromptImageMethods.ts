import { Meteor } from 'meteor/meteor';
import { createHash, randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { SPARC_PROMPT_IMAGE_SETTINGS, SPARC_PROMPT_IMAGE_PURPOSE as PURPOSE, parseSparcPromptFigure, parseSparcPromptDisplayWidth } from '../../common/lib/sparcPromptImage';
import { generateSparcPromptImage, type GeneratedSparcPromptImage } from '../lib/sparcPromptImageGeneration';
import { resolvePreferredApiKey, type ApiKeyResolutionDeps } from '../lib/apiKeyResolution';
import { requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { sparcFigureMinimumSimilarity, SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { sparcInstructionalNeedText, type SparcInstructionalNeed } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { callOpenRouterEmbeddings } from '../../common/lib/openRouterClient';
import { getOrGenerateSparcLibraryVisual, type SparcFigureInspection, type SparcFigureLibraryStore } from '../lib/sparcFigureLibraryService';
import type { createStorageBoundary } from '../lib/storageBoundary';
import type { SparcLibraryImagePage } from '../../common/lib/sparcFigureLibrary';
import { parseSparcRaster } from '../lib/sparcRaster';
import { SPARC_ADMINISTRATIVE_REMOVAL_TEXT } from '../../../learning-components/runtime/sparcAdministrativeRemoval';
import type { SparcVideoMatch } from '../lib/sparcVideoLibraryService';

type Asset = { _id: string; path?: string; type?: string; meta: Record<string, any> };
type Deps = {
  getApiKeyResolutionDeps: () => ApiKeyResolutionDeps;
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  DynamicAssets: {
    collection: { findOneAsync: (selector: Record<string, unknown>) => Promise<Asset | undefined>;
      updateAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>) => Promise<unknown>;
      find: (selector: Record<string, unknown>, options: Record<string, unknown>) => { fetchAsync: () => Promise<Asset[]> } };
    writeAsync: (bytes: Buffer, options: Record<string, unknown>) => Promise<{ _id: string }>;
  };
  storageBoundary: ReturnType<typeof createStorageBoundary>;
  generateImage?: (apiKey: string, prompt: string) => Promise<GeneratedSparcPromptImage>;
  readFile?: (path: string) => Promise<Buffer>;
  writeFile?: (path: string, bytes: Buffer) => Promise<void>;
  removeFile?: (path: string) => Promise<void>;
  isRemoved: (id: string) => Promise<boolean>;
  figureLibrary?: SparcFigureLibraryStore;
  minimumFigureSimilarity?: number | undefined;
  embedSituation?: (apiKey: string, input: string) => Promise<{ vector: number[]; usage?: { costUsd?: number } }>;
  findVideo?: (vector: number[], tdfId: string, minimumSimilarity: number) => Promise<SparcVideoMatch | undefined>;
};
type Context = { userId?: string | null; unblock?: () => void };
type ImageRequest = { tdfId: string; sessionId: string; generationId: string; tutorMessage: string;
  imagePrompt: string; figureDescription: string; displayWidth: number; situation?: SparcInstructionalNeed };
function bounded(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Meteor.Error(400, `${label} is required and must be bounded`);
  return value.trim();
}
function instructionalText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Meteor.Error(400, `${label} is required`);
  return value.trim();
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Admin experiment only. Teaching-library assets are shared; other session assets retain ownership. */
export function createSparcPromptImageMethods(deps: Deps) {
  const pending = new Map<string, Promise<unknown>>();
  const authorize = (context: Context) => requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId: context.userId, roles: ['admin'] });
  const findOwned = (assetId: string, userId: string) => deps.DynamicAssets.collection.findOneAsync({ _id: assetId, userId, 'meta.uploadPurpose': PURPOSE, 'meta.public': false });
  const findShared = (assetId: string, version: string = SPARC_FIGURE_LIBRARY_SETTINGS.version) => deps.DynamicAssets.collection.findOneAsync({ _id: assetId,
    'meta.uploadPurpose': PURPOSE, 'meta.public': false, 'meta.figureLibraryVersion': version });
  const minimumSimilarity = sparcFigureMinimumSimilarity(deps.minimumFigureSimilarity);
  const imageMetadata = (entry: SparcFigureInspection, asset: Asset) => {
    if (asset.meta.figureLibraryVersion !== entry.version) throw new Meteor.Error(500, 'A library figure is missing its completed canonical asset');
    return { assetId: asset._id, description: instructionalText(asset.meta.description, 'Saved figure description'),
      model: asset.meta.humanReplacement === true ? 'Human replacement' : entry.imageModel,
      createdAt: (asset.meta.humanReplacement === true ? new Date(asset.meta.replacedAt) : entry.createdAt).toISOString(),
    };
  };
  const inspectImages = async (entries: SparcFigureInspection[]) => {
    const assets = entries.length ? await deps.DynamicAssets.collection.find({ _id: { $in: entries.map(entry => entry._id) },
      'meta.uploadPurpose': PURPOSE, 'meta.public': false, 'meta.ready': true },
      { fields: { _id: 1, 'meta.description': 1, 'meta.figureLibraryVersion': 1, 'meta.humanReplacement': 1, 'meta.replacedAt': 1 } }).fetchAsync() : [];
    const byId = new Map(assets.map(asset => [asset._id, asset]));
    return entries.map(entry => {
      const asset = byId.get(entry._id);
      if (!asset) throw new Meteor.Error(500, 'A library figure is missing its completed canonical asset');
      return imageMetadata(entry, asset);
    });
  };
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
    tutorMessage: instructionalText(asset.meta.tutorMessage, 'Saved tutor message'),
    figure: parseSparcPromptFigure({ assetId: asset._id, description: asset.meta.description,
      ...(Object.prototype.hasOwnProperty.call(asset.meta, 'displayWidth') ? { displayWidth: asset.meta.displayWidth } : {}) }),
    ...(!reused ? { usage: asset.meta.usage } : {}),
  });
  const generate = async (context: Context, params: ImageRequest, visual: boolean) => {
      const userId = await authorize(context);
      context.unblock?.();
      if (visual && params?.situation === undefined) throw new Meteor.Error(400, 'Visual support requires the instructional need and visual brief');
      if (visual && !params.situation?.illustrationBrief) throw new Meteor.Error(400, 'Visual support requires a visual brief in its embedding input');
      if (!visual && params?.situation !== undefined) throw new Meteor.Error(400, 'Complete teaching visuals must use resolveSparcVisualSupport');
      const tdfId = bounded(params?.tdfId, 'TDF identity', 200);
      const sessionId = bounded(params?.sessionId, 'Session identity', 200);
      const generationId = bounded(params?.generationId, 'Generation identity', 500);
      const tutorMessage = instructionalText(params?.tutorMessage, 'Tutor message');
      const description = instructionalText(params?.figureDescription, 'Figure description');
      const displayWidth = parseSparcPromptDisplayWidth(params?.displayWidth);
      parseSparcPromptFigure({ assetId: 'validation', description });
      const prompt = instructionalText(params?.imagePrompt, 'Image brief');
      const situation = params.situation === undefined ? undefined : sparcInstructionalNeedText(params.situation);
      if (params.situation?.feedback !== undefined) throw new Meteor.Error(400, 'Feedback answers belong in private primitive requests, not shared image sources');
      const identity = digest(JSON.stringify([userId, tdfId, sessionId, generationId]));
      const assetId = identity.slice(0, 20);
      if (pending.has(identity)) return pending.get(identity);
      const work = (async () => {
        const historical = await findOwned(assetId, userId);
        if (historical && historical.meta.figureLibraryVersion === undefined) {
          if (visual) throw new Meteor.Error(409, 'A private incomplete prompt image cannot satisfy a complete visual-support request');
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
          const decision = await getOrGenerateSparcLibraryVisual({ store: deps.figureLibrary, identity, assetId,
            userId, tdfId, sessionId, situation, imagePrompt: prompt, tutorMessage, description, displayWidth, minimumSimilarity,
            findVideo: async vector => {
              if (!deps.findVideo) throw new Meteor.Error(500, 'SPARC video retrieval is not configured');
              return deps.findVideo(vector, tdfId, minimumSimilarity);
            },
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
          if (decision.video) {
            if (await deps.isRemoved(decision.video.segmentId)) throw new Meteor.Error('sparc-visual-removed', 'The selected video was administratively removed');
            return { video: decision.video, ...(decision.embeddingUsage ? { embeddingUsage: decision.embeddingUsage } : {}),
              libraryMatch: { source: decision.source, similarity: decision.similarity } };
          }
          const asset = await findShared(decision.assetId);
          if (await deps.isRemoved(decision.assetId)) return { tutorMessage: SPARC_ADMINISTRATIVE_REMOVAL_TEXT,
            figure: { assetId: decision.assetId, description: SPARC_ADMINISTRATIVE_REMOVAL_TEXT } };
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
  };
  return {
    async generateSparcPromptImage(this: Context, params: Omit<ImageRequest, 'situation'>) {
      return generate(this, params, false);
    },
    async resolveSparcVisualSupport(this: Context, params: ImageRequest & { situation: SparcInstructionalNeed }) {
      return generate(this, params, true);
    },
    async getSparcPromptImage(this: Context, assetIdValue: string) {
      const userId = await authorize(this);
      const assetId = bounded(assetIdValue, 'Image asset identity', 20);
      if (!/^[a-zA-Z0-9]+$/.test(assetId)) throw new Meteor.Error(400, 'Invalid image asset identity');
      if (await deps.isRemoved(assetId)) return { administrativeRemoval: true as const };
      const entry = await deps.figureLibrary?.findEntry(assetId);
      const asset = await findOwned(assetId, userId) ?? (entry?.ready ? await findShared(assetId, entry.version) : undefined);
      if (!asset || asset.meta.ready !== true) {
        if (await deps.isRemoved(assetId)) return { administrativeRemoval: true as const };
        throw new Meteor.Error(404, 'SPARC image not found');
      }
      let bytes;
      try { bytes = await readBytes(asset); }
      catch (error) {
        if (await deps.isRemoved(assetId)) return { administrativeRemoval: true as const };
        throw error;
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.type ?? '') || bytes.length > SPARC_PROMPT_IMAGE_SETTINGS.maxBytes) throw new Meteor.Error(500, 'Invalid saved SPARC image');
      return { dataUrl: `data:${asset.type};base64,${bytes.toString('base64')}` };
    },
    async listSparcLibraryImages(this: Context, params: { afterId?: string; snapshotId?: string; clusterId?: string; cursor?: string } = {}): Promise<SparcLibraryImagePage> {
      await authorize(this);
      if (!params || typeof params !== 'object' || Array.isArray(params)
        || Object.keys(params).some(key => !['afterId'].includes(key))) throw new Meteor.Error(400, 'Invalid image library request');
      if (!deps.figureLibrary) throw new Meteor.Error(500, 'SPARC figure library is not configured');
      const afterId = params?.afterId === undefined ? '' : bounded(params.afterId, 'Image cursor', 20);
      if (afterId && !/^[a-zA-Z0-9]+$/.test(afterId)) throw new Meteor.Error(400, 'Invalid image cursor');
      const entries = await deps.figureLibrary.inspectPage(afterId);
      const page = entries.slice(0, SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize);
      const images = await inspectImages(page);
      return { images, nextCursor: entries.length > SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize ? page[page.length - 1]!._id : null };
    },
    async replaceSparcLibraryImage(this: Context, params: { assetId: string; description: string; mediaType: string; base64: string }) {
      await authorize(this); this.unblock?.();
      const assetId = bounded(params?.assetId, 'Image identity', 20);
      if (!/^[a-zA-Z0-9]+$/.test(assetId)) throw new Meteor.Error(400, 'Invalid image identity');
      if (!deps.figureLibrary) throw new Meteor.Error(500, 'Image revision is not configured');
      const description = bounded(params?.description, 'Figure description', 2048);
      if (/[<>]/.test(description)) throw new Meteor.Error(400, 'Figure description must be plain text without markup');
      let raster;
      try { raster = parseSparcRaster(params?.mediaType, params?.base64); }
      catch (error) { throw new Meteor.Error(400, (error as Error).message); }
      return deps.figureLibrary.withLock(async () => {
        const entry = await deps.figureLibrary!.findEntry(assetId);
        const asset = entry?.ready ? await findShared(assetId, entry.version) : undefined;
        if (!entry || !asset || asset.meta.ready !== true) throw new Meteor.Error(404, 'Completed library image not found');
        let imagePath = asset.path;
        if (deps.storageBoundary.backend === 's3') {
          if (asset.meta.storageBackend !== 's3' || typeof asset.meta.storageKey !== 'string') throw new Meteor.Error(500, 'SPARC image storage owner mismatch');
          await deps.storageBoundary.putObject(asset.meta.storageKey, raster.bytes, raster.mediaType);
        } else {
          if (!asset.path) throw new Meteor.Error(500, 'SPARC image has no local storage path');
          imagePath = path.join(path.dirname(asset.path), `${assetId}.${raster.extension}`);
          if (deps.writeFile) await deps.writeFile(imagePath, raster.bytes);
          else {
            const temporary = `${imagePath}.${randomBytes(8).toString('hex')}.tmp`;
            try { await fs.writeFile(temporary, raster.bytes, { flag: 'wx' }); await fs.rename(temporary, imagePath); }
            finally { await fs.rm(temporary, { force: true }); }
          }
        }
        await deps.DynamicAssets.collection.updateAsync({ _id: assetId }, { $set: {
          type: raster.mediaType, size: raster.bytes.length, extension: raster.extension, ext: raster.extension,
          extensionWithDot: `.${raster.extension}`, name: `teaching-figure.${raster.extension}`,
          'versions.original.type': raster.mediaType, 'versions.original.size': raster.bytes.length,
          'versions.original.extension': raster.extension, 'meta.description': description,
          'meta.humanReplacement': true, 'meta.replacedAt': new Date(),
          'meta.fileName': `teaching-figure.${raster.extension}`,
          ...(deps.storageBoundary.backend === 'local' ? { path: imagePath, 'versions.original.path': imagePath } : {}),
        } });
        if (deps.storageBoundary.backend === 'local' && asset.path && imagePath !== asset.path) {
          if (deps.removeFile) await deps.removeFile(asset.path);
          else await fs.rm(asset.path, { force: true });
        }
        await deps.figureLibrary!.saveEntry(entry);
        const updated = await findShared(assetId, entry.version);
        if (!updated) throw new Meteor.Error(404, 'This image was deleted');
        return imageMetadata(entry, updated);
      });
    },
  };
}
