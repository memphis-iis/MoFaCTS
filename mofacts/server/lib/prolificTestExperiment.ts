import { validateConditionFamilyTutor, assertConditionFilenameIdAlignment } from '../../common/lib/tdfIdentityContract';
import { prolificCompletionUrl } from '../../common/prolific';

type Dependencies = { Tdfs: any; Histories: any; states: any; assignments: any; studies: any; participants: any;
  saveContent: (ownerId: string, root: any, content: any) => Promise<unknown> };

/** Exact family reads and indexed existence checks; never loads learner records. */
export function createProlificTestExperiment(deps: Dependencies) {
  async function family(ownerId: string, rootId: string) {
    const root = await deps.Tdfs.findOneAsync({ _id: rootId, ownerId });
    if (!root || root.tdfAvailability !== 'available') throw new Error('prolific.accessDenied');
    const validation = validateConditionFamilyTutor(root.content?.tdfs?.tutor, { requireCanonicalIds: true });
    if (validation.errors.length || validation.conditionTdfIds.length > 100) throw new Error('prolific.invalidConfiguration');
    if (await deps.Tdfs.findOneAsync({ 'content.tdfs.tutor.setspec.conditionTdfIds': rootId }, { fields: { _id: 1 } })) throw new Error('prolific.invalidConfiguration');
    const children = validation.conditionTdfIds.length ? await deps.Tdfs.find({ _id: { $in: validation.conditionTdfIds }, ownerId }, { limit: 100 }).fetchAsync() : [];
    if (children.length !== validation.conditionTdfIds.length || children.some((c: any) => c.tdfAvailability !== 'available')
      || assertConditionFilenameIdAlignment(validation.conditionFileNames, validation.conditionTdfIds,
        new Map(children.map((c: any) => [String(c._id), String(c.content?.fileName || '')]))).length) throw new Error('prolific.invalidConfiguration');
    return { root, rows: [root, ...children].sort((a: any, b: any) => a._id.localeCompare(b._id)) };
  }
  async function unused(ownerId: string, rootId: string, operation?: any) {
    const { root, rows } = await family(ownerId, rootId);
    const ids = rows.map((r: any) => r._id);
    for (const row of rows) {
      const spec = row.content.tdfs.tutor.setspec;
      if ([true, 'true'].includes(spec.experimentPasswordRequired)) throw new Error('prolific.invalidConfiguration');
      if (spec.experimentTarget && !(operation && row._id === rootId && spec.experimentTarget === operation.studyId)) throw new Error('prolific.experimentUsed');
      if (Array.isArray(row.conditionCounts) && row.conditionCounts.some((n: unknown) => Number(n) !== 0)) throw new Error('prolific.experimentUsed');
    }
    const existing = await deps.studies.findOneAsync({ rootTdfId: { $in: ids } });
    if (existing && !(operation && existing.ownerId === ownerId && existing.studyId === operation.studyId
      && existing.testSetupOperationId === operation._id)) throw new Error('prolific.experimentUsed');
    for (const [collection, query] of [
      [deps.Histories, { TDFId: { $in: ids } }], [deps.states, { TDFId: { $in: ids } }],
      [deps.assignments, { TDFId: { $in: ids } }], [deps.assignments, { memberTdfIds: { $in: ids } }],
      [deps.participants, { rootTdfId: { $in: ids } }],
    ] as const) if (await collection.findOneAsync(query, { fields: { _id: 1 } })) throw new Error('prolific.experimentUsed');
    return { root, rows };
  }
  async function inspect(ownerId: string, rootId: string) {
    const { root, rows } = await unused(ownerId, rootId);
    return { name: root.content.tdfs.tutor.setspec.lessonname,
      revisions: Object.fromEntries(rows.map((r: any) => [r._id, Number.isInteger(r.tdfRevision) ? r.tdfRevision : 0])) };
  }
  async function configure(ownerId: string, o: any) {
    const { root, rows } = await unused(ownerId, o.rootTdfId, o);
    const url = prolificCompletionUrl(`https://app.prolific.com/submissions/complete?cc=${o.completionCode}`);
    const spec = root.content.tdfs.tutor.setspec;
    const alreadyConfigured = spec.experimentTarget === o.studyId && spec.prolificCompletionUrl === url;
    if (rows.length !== Object.keys(o.revisions).length || rows.some((r: any) =>
      (r.tdfRevision ?? 0) !== o.revisions[r._id] + (alreadyConfigured && r._id === root._id ? 1 : 0))) throw new Error('prolific.setupChanged');
    if (!alreadyConfigured) {
      const content = structuredClone(root.content);
      content.tdfs.tutor.setspec.experimentTarget = o.studyId;
      content.tdfs.tutor.setspec.prolificCompletionUrl = url;
      await deps.saveContent(ownerId, root, content);
    }
    // A retry may finish a previously saved configuration, but cannot replace another binding.
    const current = await unused(ownerId, o.rootTdfId, o);
    if (current.root.content.tdfs.tutor.setspec.experimentTarget !== o.studyId
      || current.root.content.tdfs.tutor.setspec.prolificCompletionUrl !== url
      || current.rows.some((r: any) => (r.tdfRevision ?? 0) !== o.revisions[r._id] + (r._id === root._id ? 1 : 0))) throw new Error('prolific.setupChanged');
    const binding = { ownerId, rootTdfId: o.rootTdfId, studyId: o.studyId, accountId: o.accountId,
      workspaceId: o.workspaceId, projectId: o.projectId, reminderText: o.reminderText, currency: o.currency,
      testSetupOperationId: o._id, sourceStudyId: o.sourceStudyId, testUrl: o.testUrl, updatedAt: new Date() };
    await deps.studies.upsertAsync({ ownerId, rootTdfId: o.rootTdfId, studyId: o.studyId }, { $set: binding });
  }
  return { inspect, configure };
}
