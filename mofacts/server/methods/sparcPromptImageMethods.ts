import { Meteor } from 'meteor/meteor';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import { SPARC_PROMPT_IMAGE_SETTINGS, SPARC_PROMPT_IMAGE_PURPOSE as PURPOSE, parseSparcPromptFigure, parseSparcPromptDisplayWidth } from '../../common/lib/sparcPromptImage';
import { generateSparcPromptImage, type GeneratedSparcPromptImage } from '../lib/sparcPromptImageGeneration';
import { resolvePreferredApiKey, type ApiKeyResolutionDeps } from '../lib/apiKeyResolution';
import { requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { sparcFigureSituationText, sparcFigureMinimumSimilarity, SPARC_FIGURE_LIBRARY_SETTINGS, type SparcFigureSituation } from '../../common/lib/sparcFigureLibrary';
import { callOpenRouterEmbeddings } from '../../common/lib/openRouterClient';
import { getOrGenerateSparcLibraryFigure, currentSparcFigureAssetId, type SparcFigureInspection, type SparcFigureLibraryStore } from '../lib/sparcFigureLibraryService';
import type { createStorageBoundary } from '../lib/storageBoundary';
import type { SparcLibraryImagePage, SparcLibraryImageHistory } from '../../common/lib/sparcFigureLibrary';
import type { SparcFigureVersionStore } from '../lib/sparcFigureVersions';
import { parseSparcRaster } from '../lib/sparcRaster';
import { getSparcFigureBrowseOverview, type SparcFigureBrowseDeps } from '../lib/sparcFigureBrowseService';

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
  figureLibrary?: SparcFigureLibraryStore;
  figureVersions?: SparcFigureVersionStore;
  figureBrowse?: Omit<SparcFigureBrowseDeps, 'descriptions'>;
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
  const findShared = (assetId: string, version: string = SPARC_FIGURE_LIBRARY_SETTINGS.version) => deps.DynamicAssets.collection.findOneAsync({ _id: assetId,
    'meta.uploadPurpose': PURPOSE, 'meta.public': false, 'meta.figureLibraryVersion': version });
  const minimumSimilarity = sparcFigureMinimumSimilarity(deps.minimumFigureSimilarity);
  const resolveEntry = async (assetId: string) => {
    const original = await deps.figureLibrary?.findEntry(assetId);
    if (original) return original;
    const version = await deps.figureVersions?.find(assetId);
    return version ? await deps.figureLibrary?.findEntry(version.libraryId) : undefined;
  };
  const imageMetadata = (entry: SparcFigureInspection, asset: Asset) => {
    if (asset.meta.figureLibraryVersion !== entry.version) throw new Meteor.Error(500, 'A library figure is missing its completed canonical asset');
    return { libraryId: entry._id, assetId: asset._id, description: bounded(asset.meta.description, 'Saved figure description', 2048),
      model: asset.meta.humanReplacement === true ? 'Human replacement' : entry.imageModel,
      createdAt: (asset.meta.humanReplacement === true ? new Date(asset.meta.replacedAt) : entry.createdAt).toISOString(),
      reusable: entry.reusable, revision: entry.revision ?? 0 };
  };
  const inspectImages = async (entries: SparcFigureInspection[]) => {
    const assets = entries.length ? await deps.DynamicAssets.collection.find({ _id: { $in: entries.map(currentSparcFigureAssetId) },
      'meta.uploadPurpose': PURPOSE, 'meta.public': false, 'meta.ready': true },
      { fields: { _id: 1, 'meta.description': 1, 'meta.figureLibraryVersion': 1, 'meta.humanReplacement': 1, 'meta.replacedAt': 1 } }).fetchAsync() : [];
    const byId = new Map(assets.map(asset => [asset._id, asset]));
    return entries.map(entry => {
      const asset = byId.get(currentSparcFigureAssetId(entry));
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
      const entry = await resolveEntry(assetId);
      const asset = await findOwned(assetId, userId) ?? (entry?.ready ? await findShared(assetId, entry.version) : undefined);
      if (!asset || asset.meta.ready !== true) throw new Meteor.Error(404, 'SPARC image not found');
      const bytes = await readBytes(asset);
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.type ?? '') || bytes.length > SPARC_PROMPT_IMAGE_SETTINGS.maxBytes) throw new Meteor.Error(500, 'Invalid saved SPARC image');
      return { dataUrl: `data:${asset.type};base64,${bytes.toString('base64')}` };
    },
    async getSparcLibraryClusters(this: Context) {
      await authorize(this); this.unblock?.();
      if (!deps.figureBrowse) throw new Meteor.Error(500, 'Image grouping is not configured');
      let snapshot;
      try { snapshot = await getSparcFigureBrowseOverview({ ...deps.figureBrowse, descriptions: async ids => {
        if (!deps.figureLibrary) throw new Error('Image library is not configured');
        const entries = await deps.figureLibrary.inspectEntries(ids);
        const images = await inspectImages(entries);
        return new Map(images.map(image => [image.libraryId, image.description]));
      } }); } catch (error) {
        if (error instanceof Meteor.Error) throw error;
        throw new Meteor.Error('sparc-library-grouping-failed', error instanceof Error && /^The figure library changed/.test(error.message)
          ? error.message : 'Could not build the image groups. Retry grouping or check the saved library records.');
      }
      if (!deps.figureLibrary) throw new Meteor.Error(500, 'Image library is not configured');
      const entries: SparcFigureInspection[] = [];
      for (let offset = 0; offset < snapshot.clusters.length; offset += SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize) {
        entries.push(...await deps.figureLibrary.inspectEntries(snapshot.clusters.slice(offset, offset + SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize).map(cluster => cluster.representativeAssetId)));
      }
      const byId = new Map(entries.map(entry => [entry._id, entry]));
      return { snapshotId: snapshot.snapshotId, total: snapshot.total, clusters: snapshot.clusters.map(cluster => {
        const entry = byId.get(cluster.representativeAssetId);
        if (!entry) throw new Meteor.Error(500, 'An image group is missing its representative');
        return { ...cluster, representativeAssetId: currentSparcFigureAssetId(entry) };
      }) };
    },
    async listSparcLibraryImages(this: Context, params: { afterId?: string; snapshotId?: string; clusterId?: string; cursor?: string } = {}): Promise<SparcLibraryImagePage> {
      await authorize(this);
      if (!params || typeof params !== 'object' || Array.isArray(params)
        || Object.keys(params).some(key => !['afterId', 'snapshotId', 'clusterId', 'cursor'].includes(key))) throw new Meteor.Error(400, 'Invalid image library request');
      if (!deps.figureLibrary) throw new Meteor.Error(500, 'SPARC figure library is not configured');
      if (params.snapshotId !== undefined || params.clusterId !== undefined || params.cursor !== undefined) {
        if (!deps.figureBrowse || typeof params.snapshotId !== 'string' || !/^[a-f0-9]{24}$/.test(params.snapshotId)
          || typeof params.clusterId !== 'string' || !/^[a-f0-9]{24}$/.test(params.clusterId) || params.afterId !== undefined) {
          throw new Meteor.Error(400, 'Invalid image group request');
        }
        const state = await deps.figureBrowse.store.state();
        const snapshot = await deps.figureBrowse.store.snapshot(params.snapshotId);
        if (!snapshot || state.current !== snapshot.snapshotId || state.revision !== snapshot.sourceRevision) throw new Meteor.Error('sparc-library-changed', 'The image library changed. Reopen the groups to refresh it.');
        if (!snapshot.clusters.some(cluster => cluster.id === params.clusterId)) throw new Meteor.Error(404, 'Image group not found');
        let cursor: { similarity: number; assetId: string } | undefined;
        if (params.cursor !== undefined) {
          if (typeof params.cursor !== 'string' || params.cursor.length > 100) throw new Meteor.Error(400, 'Invalid image group cursor');
          const [score, assetId, extra] = params.cursor.split(',');
          const similarity = Number(score);
          if (!score || !Number.isFinite(similarity) || similarity < -1 || similarity > 1 || !assetId || !/^[a-zA-Z0-9]{1,20}$/.test(assetId) || extra !== undefined) throw new Meteor.Error(400, 'Invalid image group cursor');
          cursor = { similarity, assetId };
        }
        const members = await deps.figureBrowse.store.members(snapshot.snapshotId, params.clusterId, cursor);
        const page = members.slice(0, SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize);
        const entries = await deps.figureLibrary.inspectEntries(page.map(member => member.assetId));
        const entryById = new Map(entries.map(entry => [entry._id, entry]));
        const ordered = page.map(member => {
          const entry = entryById.get(member.assetId);
          if (!entry) throw new Meteor.Error(500, 'A grouped figure is missing its completed canonical asset');
          return entry;
        });
        const images = await inspectImages(ordered);
        const last = page[page.length - 1];
        return { images, nextCursor: members.length > SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize && last ? `${last.similarity},${last.assetId}` : null };
      }
      const afterId = params?.afterId === undefined ? '' : bounded(params.afterId, 'Image cursor', 20);
      if (afterId && !/^[a-zA-Z0-9]+$/.test(afterId)) throw new Meteor.Error(400, 'Invalid image cursor');
      const entries = await deps.figureLibrary.inspectPage(afterId);
      const page = entries.slice(0, SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize);
      const images = await inspectImages(page);
      return { images, nextCursor: entries.length > SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize ? page[page.length - 1]!._id : null };
    },
    async setSparcLibraryImageReusable(this: Context, params: { assetId: string; reusable: boolean }) {
      await authorize(this);
      const assetId = bounded(params?.assetId, 'Image asset identity', 20);
      if (!/^[a-zA-Z0-9]+$/.test(assetId) || typeof params?.reusable !== 'boolean') {
        throw new Meteor.Error(400, 'A valid image identity and boolean reuse status are required');
      }
      if (!deps.figureLibrary) throw new Meteor.Error(500, 'SPARC figure library is not configured');
      const entry = await deps.figureLibrary.findEntry(assetId);
      const asset = entry?.ready ? await findShared(currentSparcFigureAssetId(entry), entry.version) : undefined;
      if (!asset || asset.meta.ready !== true || !await deps.figureLibrary.setReusable(assetId, params.reusable)) {
        throw new Meteor.Error(404, 'Completed library image not found');
      }
      return { assetId, reusable: params.reusable };
    },
    async replaceSparcLibraryImage(this: Context, params: { libraryId: string; expectedAssetId: string; description: string; mediaType: string; base64: string }) {
      const userId = await authorize(this); this.unblock?.();
      const libraryId = bounded(params?.libraryId, 'Library identity', 20);
      const expectedAssetId = bounded(params?.expectedAssetId, 'Current image identity', 20);
      if (![libraryId, expectedAssetId].every(id => /^[a-zA-Z0-9]+$/.test(id))) throw new Meteor.Error(400, 'Invalid image identity');
      if (!deps.figureLibrary || !deps.figureVersions) throw new Meteor.Error(500, 'Image replacement is not configured');
      const description = bounded(params?.description, 'Figure description', 2048);
      if (/[<>]/.test(description)) throw new Meteor.Error(400, 'Figure description must be plain text without markup');
      let raster;
      try { raster = parseSparcRaster(params?.mediaType, params?.base64); }
      catch (error) { throw new Meteor.Error(400, (error as Error).message); }
      const identity = digest(JSON.stringify(['human-replacement', userId, libraryId, expectedAssetId, description,
        raster.mediaType, createHash('sha256').update(raster.bytes).digest('hex')]));
      const assetId = identity.slice(0, 20);
      // Share the existing generation lease: retries across replicas cannot overwrite an admitted file.
      return await deps.figureLibrary.withLock(async () => {
        const entry = await deps.figureLibrary!.findEntry(libraryId);
        if (!entry?.ready) throw new Meteor.Error(404, 'Completed library image not found');
        const admitted = await deps.figureVersions!.find(assetId);
        if (!admitted && currentSparcFigureAssetId(entry) !== expectedAssetId) throw new Meteor.Error(409, 'This image has changed. Reload the library before replacing it.');
        let asset = await findShared(assetId, entry.version);
        if (asset && asset.meta.replacementIdentity !== identity) throw new Meteor.Error(409, 'Replacement identity collision');
        if (!asset) {
          if (admitted) throw new Meteor.Error(500, 'An admitted replacement is missing its saved image');
          if (await deps.DynamicAssets.collection.findOneAsync({ _id: assetId })) throw new Meteor.Error(409, 'Replacement identity collision');
          const previous = await findShared(expectedAssetId, entry.version);
          if (!previous || previous.meta.ready !== true) throw new Meteor.Error(500, 'The current image is missing its completed asset');
          const fileName = `teaching-figure.${raster.extension}`;
          const file = await deps.DynamicAssets.writeAsync(raster.bytes, { fileId: assetId, fileName, userId, type: raster.mediaType,
            meta: { public: false, uploadPurpose: PURPOSE, figureLibraryVersion: entry.version, replacementIdentity: identity,
              humanReplacement: true, replacedAt: new Date(), fileName, description,
              tutorMessage: previous.meta.tutorMessage, ...(previous.meta.displayWidth === undefined ? {} : { displayWidth: previous.meta.displayWidth }),
              ready: deps.storageBoundary.backend === 'local' } });
          if (file._id !== assetId) throw new Meteor.Error(500, 'Image storage changed the replacement identity');
          asset = await findShared(assetId, entry.version);
          if (!asset) throw new Meteor.Error(500, 'Image storage did not persist the replacement');
        }
        await completeStorage(asset);
        const updated = await deps.figureVersions!.publish({ libraryId, expectedAssetId, assetId, identity, userId });
        return (await inspectImages([updated]))[0]!;
      });
    },
    async listSparcLibraryImageVersions(this: Context, params: { libraryId: string; beforeRevision?: number }): Promise<SparcLibraryImageHistory> {
      await authorize(this);
      const libraryId = bounded(params?.libraryId, 'Library identity', 20);
      if (!/^[a-zA-Z0-9]+$/.test(libraryId)) throw new Meteor.Error(400, 'Invalid library identity');
      if (!deps.figureLibrary || !deps.figureVersions) throw new Meteor.Error(500, 'Image history is not configured');
      const entry = await deps.figureLibrary.findEntry(libraryId);
      if (!entry?.ready) throw new Meteor.Error(404, 'Completed library image not found');
      const currentRevision = entry.revision ?? 0;
      const before = params.beforeRevision ?? currentRevision;
      if (!Number.isSafeInteger(before) || before < 0 || before > currentRevision) throw new Meteor.Error(400, 'Invalid image history cursor');
      const rows = await deps.figureVersions.history(libraryId, before);
      const page = rows.slice(0, SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize);
      const assets = page.length ? await deps.DynamicAssets.collection.find({ _id: { $in: page.map(row => row._id) },
        'meta.uploadPurpose': PURPOSE, 'meta.public': false, 'meta.ready': true },
        { fields: { _id: 1, 'meta.description': 1, 'meta.figureLibraryVersion': 1, 'meta.humanReplacement': 1 } }).fetchAsync() : [];
      const byId = new Map(assets.map(asset => [asset._id, asset]));
      const versions = page.map(row => {
        const asset = byId.get(row._id);
        if (!asset || asset.meta.figureLibraryVersion !== entry.version) throw new Meteor.Error(500, 'An old version is missing its saved image');
        return { assetId: row._id, revision: row.revision, createdAt: row.createdAt.toISOString(),
          model: asset.meta.humanReplacement === true ? 'Human replacement' : entry.imageModel,
          description: bounded(asset.meta.description, 'Saved figure description', 2048) };
      });
      return { versions, nextCursor: rows.length > SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize ? page[page.length - 1]!.revision : null };
    },
  };
}
