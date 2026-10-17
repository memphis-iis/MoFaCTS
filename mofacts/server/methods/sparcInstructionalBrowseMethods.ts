import { Meteor } from 'meteor/meteor';
import { requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { getSparcFigureBrowseOverview, type SparcFigureBrowseDeps, type BrowseMemberCursor } from '../lib/sparcFigureBrowseService';
import type { InstructionalComponentSummary } from '../lib/sparcInstructionalBrowseStorage';

export function createSparcInstructionalBrowseMethods(deps: {
  getMethodAuthorizationDeps(): MethodAuthorizationDeps;
  browse: Omit<SparcFigureBrowseDeps, 'descriptions'>;
  inspect(ids: string[]): Promise<InstructionalComponentSummary[]>;
  page(after: string): Promise<{ entries: InstructionalComponentSummary[]; nextCursor: string | null }>;
}) {
  const authorize = (userId?: string | null) => requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId, roles: ['admin'] });
  const ordered = async (ids: string[]) => {
    const byId = new Map((await deps.inspect(ids)).map(entry => [entry.id, entry]));
    return ids.map(id => { const entry = byId.get(id); if (!entry) throw new Error('Grouped instructional component is missing'); return entry; });
  };
  return {
    async getSparcLibraryClusters(this: { userId?: string | null; unblock?: () => void }) {
      await authorize(this.userId); this.unblock?.();
      const snapshot = await getSparcFigureBrowseOverview({ ...deps.browse, descriptions: async ids => new Map((await deps.inspect(ids)).map(entry => [entry.id, entry.image?.description ?? entry.content!.text])) });
      const representatives = await ordered(snapshot.clusters.map(cluster => cluster.representativeAssetId));
      return { snapshotId: snapshot.snapshotId, total: snapshot.total, clusters: snapshot.clusters.map((cluster, i) => ({ ...cluster, representative: representatives[i]! })) };
    },
    async listSparcInstructionalComponents(this: { userId?: string | null }, params: { after?: string; snapshotId?: string; clusterId?: string; cursor?: string } = {}) {
      await authorize(this.userId);
      if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).some(key => !['after', 'snapshotId', 'clusterId', 'cursor'].includes(key))) throw new Meteor.Error(400, 'Invalid instructional library request');
      const validId = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9]{1,64}$/.test(id);
      if (params.snapshotId !== undefined || params.clusterId !== undefined || params.cursor !== undefined) {
        if (typeof params.snapshotId !== 'string' || !/^[a-f0-9]{24}$/.test(params.snapshotId) || typeof params.clusterId !== 'string' || !/^[a-f0-9]{24}$/.test(params.clusterId) || params.after !== undefined) throw new Meteor.Error(400, 'Invalid instructional group');
        const state = await deps.browse.store.state(), snapshot = await deps.browse.store.snapshot(params.snapshotId);
        if (!snapshot || state.current !== snapshot.snapshotId || state.revision !== snapshot.sourceRevision) throw new Meteor.Error('sparc-library-changed', 'The instructional library changed. Reopen Groups to refresh it.');
        if (!snapshot.clusters.some(cluster => cluster.id === params.clusterId)) throw new Meteor.Error(404, 'Instructional group not found');
        let cursor: BrowseMemberCursor | undefined;
        if (params.cursor !== undefined) {
          if (typeof params.cursor !== 'string' || params.cursor.length > 100) throw new Meteor.Error(400, 'Invalid group cursor');
          const [kind, score, id, extra] = params.cursor.split(','); const similarity = Number(score);
          if (!kind || !['explanation', 'feedback', 'image', 'question', 'richContent'].includes(kind)
            || !score || !Number.isFinite(similarity) || similarity < -1 || similarity > 1 || !validId(id) || extra !== undefined) throw new Meteor.Error(400, 'Invalid group cursor');
          cursor = { kind, similarity, assetId: id! };
        }
        const members = await deps.browse.store.members(params.snapshotId, params.clusterId, cursor), page = members.slice(0, 24), last = page.at(-1);
        return { entries: await ordered(page.map(member => member.assetId)), nextCursor: members.length > 24 && last ? `${last.kind},${last.similarity},${last.assetId}` : null };
      }
      if (params.after !== undefined && !validId(params.after)) throw new Meteor.Error(400, 'Invalid component cursor');
      return deps.page(params.after ?? '');
    },
  };
}
