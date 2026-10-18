import type { SparcVideoSegment } from '../../../learning-components/runtime/sparcVideo';
import { Meteor } from 'meteor/meteor';
import { requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { resolvePreferredApiKey, type ApiKeyResolutionDeps } from '../lib/apiKeyResolution';
import { callOpenRouterEmbeddings } from '../../common/lib/openRouterClient';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { createMoveLibraryService, type MoveStore } from '../lib/sparcMoveLibraryService';
import type { SparcPrimitiveQuery, SparcPrimitiveContent, SparcPrimitiveReference } from '../../../learning-components/units/sparcsession/sparcMoveLibrary';

type Context = { userId?: string | null; unblock?: () => void };
export function createSparcMoveLibraryMethods(deps: { store: MoveStore; minimumSimilarity?: number | undefined; questionNovelty?: number | undefined;
  getMethodAuthorizationDeps(): MethodAuthorizationDeps; getApiKeyResolutionDeps(): ApiKeyResolutionDeps;
  videoReuseStatus?(videos: readonly SparcVideoSegment[]): Promise<Map<string, boolean>>; videoCandidates?(vector: number[], tdfId: string): Promise<SparcVideoSegment[]>;
  verifyFigure(assetId: string): Promise<void>; figureReusable(assetId: string): Promise<boolean>; timing?(stage: string, ms: number, count?: number): void }) {
  const auth = (ctx: Context) => requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId: ctx.userId, roles: ['admin'] });
  const service = (userId: string) => createMoveLibraryService({ store: deps.store, embeddingModel: SPARC_FIGURE_LIBRARY_SETTINGS.embeddingModel,
    ...(deps.videoReuseStatus ? { videoReuseStatus: deps.videoReuseStatus } : {}),
    ...(deps.timing ? { timing: deps.timing } : {}),
    ...(deps.minimumSimilarity === undefined ? {} : { minimumSimilarity: deps.minimumSimilarity }), verifyFigure: deps.verifyFigure, figureReusable: deps.figureReusable,
    ...(deps.questionNovelty === undefined ? {} : { questionNovelty: deps.questionNovelty }),
    async embed(text, query) {
      const credentials = await resolvePreferredApiKey(deps.getApiKeyResolutionDeps(), { userId, tdfId: query.tdfId, kind: 'openrouter' });
      if (!credentials.apiKey) throw new Meteor.Error(403, 'Move retrieval requires the configured embedding service');
      const result = await callOpenRouterEmbeddings({ apiKey: credentials.apiKey, model: SPARC_FIGURE_LIBRARY_SETTINGS.embeddingModel, input: [text] });
      return result.embeddings[0]!;
    } });
  return {
    async lookupSparcPrimitive(this: Context, query: SparcPrimitiveQuery) {
      const userId = await auth(this); this.unblock?.();
      const result = await service(userId).lookup(userId, query);
      if (result.status === 'generate' && query.context.kind === 'richContent' && deps.videoCandidates) {
        const request = await deps.store.request(result.ticket);
        if (!request || request.userId !== userId) throw new Meteor.Error(403, 'Video retrieval requires the saved primitive request');
        return { ...result, videos: await deps.videoCandidates(request.embedding, query.tdfId) };
      }
      return result;
    },
    async publishSparcPrimitive(this: Context, ticket: string, content: SparcPrimitiveContent) {
      const userId = await auth(this); this.unblock?.(); return service(userId).publish(userId, ticket, content);
    },
    async presentSparcPrimitive(this: Context, query: SparcPrimitiveQuery, reference: SparcPrimitiveReference, nodeId: string) {
      const userId = await auth(this); return service(userId).present(userId, query, reference, nodeId);
    },
    async listSparcMoveLibrary(this: Context, kind: string | null = null, after = '') {
      await auth(this);
      if (typeof after !== 'string' || after.length > 64 || (kind !== null && !['feedback', 'explanation', 'richContent', 'question'].includes(kind))) throw new Meteor.Error(400, 'Invalid library page');
      const entries = await deps.store.list(kind ?? undefined, after);
      return { entries: entries.map(({ _id, kind, content, target, move, createdAt }) => ({ id: _id, kind, content, target, move, createdAt })),
        nextCursor: entries.length === 25 ? entries.at(-1)!._id : null };
    },
    async reviseSparcPrimitive(this: Context, id: string, content: SparcPrimitiveContent) {
      const userId = await auth(this); this.unblock?.();
      if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Meteor.Error(400, 'Invalid library entry');
      return service(userId).revise(userId, id, content);
    },
  };
}
