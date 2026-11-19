import { Meteor } from 'meteor/meteor';

import {
  assertConditionFilenameIdAlignment,
  validateConditionFamilyTutor,
} from '../../common/lib/tdfIdentityContract';

type UnknownRecord = Record<string, unknown>;

export type ExperimentTargetFamily = {
  root: any;
  children: any[];
  tdfIds: string[];
};

type ResolverDeps = {
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
  };
};

export function normalizeExperimentTarget(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function resolveFamily(Tdfs: ResolverDeps['Tdfs'], root: any, childOptions?: UnknownRecord): Promise<ExperimentTargetFamily> {
  const validation = validateConditionFamilyTutor(root?.content?.tdfs?.tutor, { requireCanonicalIds: true });
  if (validation.errors.length > 0) {
    throw new Meteor.Error(
      'tdf-identity-repair-required',
      'This experiment lesson requires an identity repair before it can be used.',
    );
  }
  if (!validation.isConditionRoot) return { root, children: [], tdfIds: [String(root._id)] };

  const children = await Tdfs.find({
    _id: { $in: validation.conditionTdfIds },
    ownerId: root.ownerId,
    tdfAvailability: 'available',
  }, childOptions).fetchAsync();
  const childFileNameById = new Map<string, string>(
    children.map(child => [String(child._id), String(child?.content?.fileName || '')]),
  );
  const alignmentErrors = assertConditionFilenameIdAlignment(
    validation.conditionFileNames, validation.conditionTdfIds, childFileNameById,
  );
  if (children.length !== validation.conditionTdfIds.length || alignmentErrors.length > 0) {
    throw new Meteor.Error(
      'tdf-identity-repair-required',
      'This experiment lesson has missing or misaligned condition content.',
    );
  }
  const childById = new Map(children.map(child => [String(child._id), child]));
  return {
    root,
    children: validation.conditionTdfIds.map(id => childById.get(id)),
    tdfIds: [String(root._id), ...validation.conditionTdfIds],
  };
}

export async function resolveBoundExperimentLessonIds(Tdfs: ResolverDeps['Tdfs'], rootId: string): Promise<string[]> {
  const [root] = await Tdfs.find({ _id: rootId, tdfAvailability: 'available' }, {
    limit: 1,
    fields: { _id: 1, ownerId: 1, 'content.tdfs.tutor.setspec.condition': 1,
      'content.tdfs.tutor.setspec.conditionTdfIds': 1, 'content.tdfs.tutor.unit.type': 1 },
  }).fetchAsync();
  if (!root) return [];
  const { tdfIds } = await resolveFamily(Tdfs, root, { fields: { 'content.fileName': 1 } });
  if (tdfIds.length === 1) return tdfIds;

  // Legacy progress is keyed by account and lesson ID. A condition referenced
  // by another root does not identify a unique study for that standalone row.
  const field = 'content.tdfs.tutor.setspec.conditionTdfIds';
  const otherRoots = await Tdfs.find({ _id: { $ne: rootId }, [field]: { $in: tdfIds.slice(1) } },
    { fields: { [field]: 1 } }).fetchAsync();
  const sharedConditions = new Set(otherRoots.flatMap(other => other.content?.tdfs?.tutor?.setspec?.conditionTdfIds ?? []));
  return tdfIds.filter(id => id === rootId || !sharedConditions.has(id));
}

export function createExperimentTargetFamilyResolver(deps: ResolverDeps) {
  return async function resolveExperimentTargetFamily(
    experimentTarget: unknown,
    rootAccessSelector: UnknownRecord = {},
  ): Promise<ExperimentTargetFamily | null> {
    const normalizedTarget = normalizeExperimentTarget(experimentTarget);
    if (!normalizedTarget) return null;

    const roots = await deps.Tdfs.find({
      $and: [
        { 'content.tdfs.tutor.setspec.experimentTarget': normalizedTarget },
        { tdfAvailability: 'available' },
        rootAccessSelector,
      ],
    }, { limit: 2 }).fetchAsync();

    if (roots.length === 0) return null;
    if (roots.length > 1) {
      throw new Meteor.Error(
        'ambiguous-experiment-target',
        'More than one accessible lesson uses this experiment target.',
      );
    }

    return await resolveFamily(deps.Tdfs, roots[0]);
  };
}
