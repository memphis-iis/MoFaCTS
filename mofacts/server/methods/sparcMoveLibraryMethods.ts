import type { SparcVideoSegment } from '../../../learning-components/runtime/sparcVideo';
import { requireSparcLessonAccess } from '../lib/sparcLessonAccess';
import { Meteor } from 'meteor/meteor';
import { requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { createMoveLibraryService, SparcAcceptedContentChangedError, type MoveStore } from '../lib/sparcMoveLibraryService';
import type { SparcPrimitiveQuery, SparcPrimitiveContent, SparcPrimitiveTicket } from '../../../learning-components/units/sparcsession/sparcMoveLibrary';
import type { SparcRetrievalSelection } from '../../common/lib/sparcRetrieval';
import { SparcContentAlreadyUsedError } from '../lib/sparcContentUse';

type Context = { userId?: string | null; unblock?: () => void };
export function createSparcMoveLibraryMethods(deps: { store: MoveStore;
  getMethodAuthorizationDeps(): MethodAuthorizationDeps;
  videoReuseStatus?(videos: readonly SparcVideoSegment[]): Promise<Map<string, boolean>>;
  verifyFigure(assetId: string): Promise<void> }) {
  const auth = (ctx: Context) => requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId: ctx.userId, roles: ['admin'] });
  const service = () => createMoveLibraryService({ store: deps.store, embeddingModel: SPARC_FIGURE_LIBRARY_SETTINGS.embeddingModel,
    ...(deps.videoReuseStatus ? { videoReuseStatus: deps.videoReuseStatus } : {}),
    verifyFigure: deps.verifyFigure });
  const checked = async <T>(work: Promise<T>): Promise<T> => {
    try { return await work; }
    catch (error) {
      if (error instanceof SparcContentAlreadyUsedError) throw new Meteor.Error('sparc-content-already-used',
        'The selected instructional content has already been used. This turn was not accepted.');
      if (error instanceof SparcAcceptedContentChangedError) throw new Meteor.Error('sparc-accepted-content-changed',
        'Saved instructional content changed after acceptance. The saved decision was not replaced.');
      throw error;
    }
  };
  return {
    async lookupSparcPrimitive(this: Context, query: SparcPrimitiveQuery, selection: SparcRetrievalSelection, embedding: number[]) {
      const userId = await requireSparcLessonAccess(deps.getMethodAuthorizationDeps(), this.userId, query?.tdfId); this.unblock?.();
      return checked(service().lookup(userId, query, selection, embedding));
    },
    async publishSparcPrimitive(this: Context, ticket: SparcPrimitiveTicket, content: SparcPrimitiveContent) {
      const userId = await requireSparcLessonAccess(deps.getMethodAuthorizationDeps(), this.userId, ticket?.query?.tdfId); this.unblock?.(); return checked(service().publish(userId, ticket, content));
    },
    async reviseSparcPrimitive(this: Context, id: string, content: SparcPrimitiveContent) {
      const userId = await auth(this); this.unblock?.();
      if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Meteor.Error(400, 'Invalid library entry');
      return service().revise(userId, id, content);
    },
  };
}
