import { Meteor } from 'meteor/meteor';
import { requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { resolvePreferredApiKey, type ApiKeyResolutionDeps } from '../lib/apiKeyResolution';
import { callOpenRouterEmbeddings } from '../../common/lib/openRouterClient';
import { SPARC_EMBEDDING_MODEL } from '../../common/lib/sparcEmbeddingModel';
import { createMongoSparcVideoCatalog, sparcVideoCatalogTargets } from '../lib/sparcVideoCatalog';
import type { SparcVideoRange } from '../../../learning-components/runtime/sparcVideo';

type Context = { userId?: string | null; unblock?: () => void };
export function createSparcVideoCatalogMethods(deps: {
  getMethodAuthorizationDeps(): MethodAuthorizationDeps; getApiKeyResolutionDeps(): ApiKeyResolutionDeps;
  loadTdf(id: string): Promise<Record<string, any> | undefined>;
}) {
  const authorize = (context: Context) => requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId: context.userId, roles: ['admin'] });
  const targets = async (tdfId: string) => {
    if (typeof tdfId !== 'string' || !tdfId || tdfId.length > 200) throw new Meteor.Error(400, 'Invalid lesson identity');
    const tdf = await deps.loadTdf(tdfId);
    if (!tdf) throw new Meteor.Error(404, 'Lesson not found');
    try { return sparcVideoCatalogTargets(tdfId, tdf); }
    catch (error) {
      if (error instanceof Error) throw new Meteor.Error(400, error.message);
      throw error;
    }
  };
  const selected = async (tdfId: string, id: string) => {
    const target = (await targets(tdfId)).find(row => row.id === id);
    if (!target) throw new Meteor.Error(409, 'The authored target changed; restart catalog preparation');
    return target;
  };
  const service = (userId: string) => createMongoSparcVideoCatalog({
    credentials() {
      const keys = (Meteor.settings as { private?: { sparcVideoCatalog?: { youtubeApiKey?: string; supadataApiKey?: string } } }).private?.sparcVideoCatalog;
      if (!keys?.youtubeApiKey?.trim() || !keys.supadataApiKey?.trim()) throw new Meteor.Error(503, 'Configure private.sparcVideoCatalog.youtubeApiKey and supadataApiKey before building a catalog');
      return { youtubeApiKey: keys.youtubeApiKey, supadataApiKey: keys.supadataApiKey };
    },
    async embed(texts, tdfId) {
      const key = await resolvePreferredApiKey(deps.getApiKeyResolutionDeps(), { userId, tdfId, kind: 'openrouter' });
      if (!key.apiKey) throw new Meteor.Error(403, 'Video preparation requires the configured embedding service');
      return (await callOpenRouterEmbeddings({ apiKey: key.apiKey, model: SPARC_EMBEDDING_MODEL, input: texts })).embeddings;
    },
  });
  return {
    async getSparcVideoCatalogTargets(this: Context, tdfId: string) {
      await authorize(this); return targets(tdfId);
    },
    async prepareSparcVideoCatalogTarget(this: Context, tdfId: string, id: string) {
      const userId = await authorize(this); this.unblock?.();
      const target = await selected(tdfId, id);
      return service(userId).prepare(target);
    },
    async saveSparcVideoCatalogPassages(this: Context, tdfId: string, id: string, ranges: SparcVideoRange[]) {
      const userId = await authorize(this); this.unblock?.();
      const target = await selected(tdfId, id);
      return service(userId).save(target, ranges);
    },
  };
}
