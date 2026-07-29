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

    const root = roots[0];
    const validation = validateConditionFamilyTutor(root?.content?.tdfs?.tutor, {
      requireCanonicalIds: true,
    });
    if (validation.errors.length > 0) {
      throw new Meteor.Error(
        'tdf-identity-repair-required',
        'This experiment lesson requires an identity repair before it can be used.',
      );
    }

    if (!validation.isConditionRoot) {
      return { root, children: [], tdfIds: [String(root._id)] };
    }

    const children = await deps.Tdfs.find({
      _id: { $in: validation.conditionTdfIds },
      ownerId: root.ownerId,
      tdfAvailability: 'available',
    }).fetchAsync();
    const childFileNameById = new Map<string, string>(
      children.map((child: any) => [String(child._id), String(child?.content?.fileName || '')]),
    );
    const alignmentErrors = assertConditionFilenameIdAlignment(
      validation.conditionFileNames,
      validation.conditionTdfIds,
      childFileNameById,
    );
    if (children.length !== validation.conditionTdfIds.length || alignmentErrors.length > 0) {
      throw new Meteor.Error(
        'tdf-identity-repair-required',
        'This experiment lesson has missing or misaligned condition content.',
      );
    }

    const childById = new Map(children.map((child: any) => [String(child._id), child]));
    const orderedChildren = validation.conditionTdfIds.map((id) => childById.get(id));
    return {
      root,
      children: orderedChildren,
      tdfIds: [String(root._id), ...validation.conditionTdfIds],
    };
  };
}
