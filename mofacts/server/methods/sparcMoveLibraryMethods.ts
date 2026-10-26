import type { SparcVideoSegment } from '../../../learning-components/runtime/sparcVideo';
import { requireSparcLessonAccess } from '../lib/sparcLessonAccess';
import { Meteor } from 'meteor/meteor';
import { requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { createMoveLibraryService, type MoveStore } from '../lib/sparcMoveLibraryService';
import type { SparcPrimitiveQuery, SparcPrimitiveContent, SparcPrimitiveTicket } from '../../../learning-components/units/sparcsession/sparcMoveLibrary';
import type { SparcRetrievalSelection } from '../../common/lib/sparcRetrieval';

type Context = { userId?: string | null; unblock?: () => void };
export function createSparcMoveLibraryMethods(deps: { store: MoveStore;
  getMethodAuthorizationDeps(): MethodAuthorizationDeps;
  videoReuseStatus?(videos: readonly SparcVideoSegment[]): Promise<Map<string, boolean>>;
  verifyFigure(assetId: string): Promise<void> }) {
  const auth = (ctx: Context) => requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId: ctx.userId, roles: ['admin'] });
  const service = () => createMoveLibraryService({ store: deps.store, embeddingModel: SPARC_FIGURE_LIBRARY_SETTINGS.embeddingModel,
    ...(deps.videoReuseStatus ? { videoReuseStatus: deps.videoReuseStatus } : {}),
    verifyFigure: deps.verifyFigure });
  return {
    async lookupSparcPrimitive(this: Context, query: SparcPrimitiveQuery, selection: SparcRetrievalSelection, embedding: number[]) {
      const userId = await requireSparcLessonAccess(deps.getMethodAuthorizationDeps(), this.userId, query?.tdfId); this.unblock?.();
      return service().lookup(userId, query, selection, embedding);
    },
    async publishSparcPrimitive(this: Context, ticket: SparcPrimitiveTicket, content: SparcPrimitiveContent) {
      const userId = await requireSparcLessonAccess(deps.getMethodAuthorizationDeps(), this.userId, ticket?.query?.tdfId); this.unblock?.(); return service().publish(userId, ticket, content);
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
      return service().revise(userId, id, content);
    },
  };
}
