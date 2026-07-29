export type LessonFamilySelector = Record<string, any>;

type AsyncCursor<T> = {
  fetchAsync(): Promise<T[]>;
};

export type LessonFamilyTdfCollection = {
  find(selector: LessonFamilySelector, options?: LessonFamilySelector): AsyncCursor<any>;
  findOneAsync(selector: LessonFamilySelector, options?: LessonFamilySelector): Promise<any | null | undefined>;
};

export type LessonFamilyResolverDeps = {
  tdfs: LessonFamilyTdfCollection;
};

export const LESSON_FAMILY_ROOT_FIELDS = {
  _id: 1,
  'content.fileName': 1,
  'content.tdfs.tutor.setspec.condition': 1,
  'content.tdfs.tutor.setspec.conditionTdfIds': 1,
};

export const LESSON_FAMILY_RESET_FIELDS = {
  ...LESSON_FAMILY_ROOT_FIELDS,
  'content.tdfs.tutor.setspec.stimulusfile': 1,
};

export const LESSON_FAMILY_CHILD_FIELDS = {
  _id: 1,
  'content.fileName': 1,
};

export type LessonFamilyRefSets = {
  conditionFileNames: string[];
  conditionTdfIds: string[];
  childLookupRefs: string[];
};

export function normalizeLessonFamilyRef(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function normalizeLessonFamilyRefs(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = new Set<string>();
  for (const value of values) {
    const normalized = normalizeLessonFamilyRef(value);
    if (normalized) out.add(normalized);
  }
  return Array.from(out);
}

function addAll(target: Set<string>, values: string[]) {
  for (const value of values) {
    target.add(value);
  }
}

export function getLessonFamilySetspec(tdf: any): Record<string, unknown> {
  return tdf?.content?.tdfs?.tutor?.setspec || {};
}

export function collectLessonFamilyRefs(rootTdfs: any[]): LessonFamilyRefSets {
  const conditionFileNames = new Set<string>();
  const conditionTdfIds = new Set<string>();
  for (const rootTdf of rootTdfs) {
    const validation = validateConditionFamilyTutor(rootTdf?.content?.tdfs?.tutor, {
      requireCanonicalIds: true,
    });
    if (validation.isConditionRoot && validation.errors.length > 0) {
      throw new Meteor.Error(
        'tdf-identity-repair-required',
        'This lesson family requires an identity repair before it can be used.',
      );
    }
    addAll(conditionFileNames, validation.conditionFileNames);
    addAll(conditionTdfIds, validation.conditionTdfIds);
  }
  return {
    conditionFileNames: Array.from(conditionFileNames),
    conditionTdfIds: Array.from(conditionTdfIds),
    childLookupRefs: Array.from(conditionTdfIds),
  };
}

export function buildConditionChildSelector(
  conditionFileNames: string[],
  conditionTdfIds: string[] = []
): LessonFamilySelector | null {
  const tdfIds = normalizeLessonFamilyRefs(conditionTdfIds);
  return tdfIds.length > 0 ? { _id: { $in: tdfIds } } : null;
}

export function buildParentRootSelector(
  childRefs: string[],
  childTdfIds: string[] = childRefs
): LessonFamilySelector | null {
  const normalizedChildTdfIds = normalizeLessonFamilyRefs(childTdfIds);
  return normalizedChildTdfIds.length > 0
    ? { 'content.tdfs.tutor.setspec.conditionTdfIds': { $in: normalizedChildTdfIds } }
    : null;
}

export function buildConditionVisibilityTerms(rootTdfs: any[]): LessonFamilySelector[] {
  const refs = collectLessonFamilyRefs(rootTdfs);
  const terms: LessonFamilySelector[] = [];
  if (refs.conditionTdfIds.length > 0) {
    terms.push({ _id: { $in: refs.conditionTdfIds } });
  }
  return terms;
}

export function createLessonFamilyResolver(deps: LessonFamilyResolverDeps) {
  async function findRootsForChildRefs(params: {
    childRefs: string[];
    childTdfIds?: string[];
    fields?: LessonFamilySelector;
  }) {
    const selector = buildParentRootSelector(params.childRefs, params.childTdfIds ?? params.childRefs);
    if (!selector) {
      return [];
    }
    return await deps.tdfs.find(selector, {
      fields: params.fields ?? LESSON_FAMILY_ROOT_FIELDS,
    }).fetchAsync();
  }

  async function findRootsForChildTdfs(childTdfs: any[], fields?: LessonFamilySelector) {
    const childTdfIds = normalizeLessonFamilyRefs(childTdfs.map((tdf) => tdf?._id));
    const params: {
      childRefs: string[];
      childTdfIds: string[];
      fields?: LessonFamilySelector;
    } = {
      childRefs: childTdfIds,
      childTdfIds,
    };
    if (fields) {
      params.fields = fields;
    }
    return await findRootsForChildRefs(params);
  }

  async function findConditionChildrenForRoots(rootTdfs: any[], fields?: LessonFamilySelector) {
    const refs = collectLessonFamilyRefs(rootTdfs);
    const selector = buildConditionChildSelector(refs.conditionFileNames, refs.conditionTdfIds);
    if (!selector) {
      return [];
    }
    return await deps.tdfs.find(selector, {
      fields: fields ?? LESSON_FAMILY_CHILD_FIELDS,
    }).fetchAsync();
  }

  async function resolveConditionChildIdsForRoots(rootTdfs: any[]) {
    const refs = collectLessonFamilyRefs(rootTdfs);
    const childIds = new Set<string>(refs.conditionTdfIds);
    const children = await findConditionChildrenForRoots(rootTdfs, { _id: 1 });
    for (const child of children) {
      const childId = normalizeLessonFamilyRef(child?._id);
      if (childId) {
        childIds.add(childId);
      }
    }
    return Array.from(childIds);
  }

  async function resolveConditionChildIdsForRootIds(rootTdfIds: string[], fields?: LessonFamilySelector) {
    const normalizedRootIds = normalizeLessonFamilyRefs(rootTdfIds);
    if (normalizedRootIds.length === 0) {
      return [];
    }
    const roots = await deps.tdfs.find(
      { _id: { $in: normalizedRootIds } },
      { fields: fields ?? LESSON_FAMILY_ROOT_FIELDS }
    ).fetchAsync();
    return await resolveConditionChildIdsForRoots(roots);
  }

  async function resolveLessonFamilyForTdf(tdfId: string, fields: LessonFamilySelector = LESSON_FAMILY_RESET_FIELDS) {
    const normalizedTdfId = normalizeLessonFamilyRef(tdfId);
    if (!normalizedTdfId) {
      return null;
    }
    const target = await deps.tdfs.findOneAsync({ _id: normalizedTdfId }, { fields });
    if (!target) {
      return null;
    }

    const roots = await findRootsForChildRefs({
      childRefs: [normalizedTdfId],
      childTdfIds: [normalizedTdfId],
      fields,
    });
    const familyRoots = [target, ...roots];
    const children = await findConditionChildrenForRoots(familyRoots, fields);
    return { target, roots: familyRoots, children };
  }

  function buildChildToRootMap(rootTdfs: any[], childTdfs: any[] = []) {
    const childByRef = new Map<string, any>();
    for (const child of childTdfs) {
      const childId = normalizeLessonFamilyRef(child?._id);
      if (childId) childByRef.set(childId, child);
    }

    const childToRootMap = new Map<string, string>();
    for (const rootTdf of rootTdfs) {
      const rootId = normalizeLessonFamilyRef(rootTdf?._id);
      if (!rootId) {
        continue;
      }
      const refs = collectLessonFamilyRefs([rootTdf]);
      for (const childRef of refs.childLookupRefs) {
        childToRootMap.set(childRef, rootId);
        const child = childByRef.get(childRef);
        const childId = normalizeLessonFamilyRef(child?._id);
        if (childId) childToRootMap.set(childId, rootId);
      }
    }
    return childToRootMap;
  }

  return {
    findRootsForChildRefs,
    findRootsForChildTdfs,
    findConditionChildrenForRoots,
    resolveConditionChildIdsForRoots,
    resolveConditionChildIdsForRootIds,
    resolveLessonFamilyForTdf,
    buildChildToRootMap,
  };
}
import { Meteor } from 'meteor/meteor';
import { validateConditionFamilyTutor } from '../../common/lib/tdfIdentityContract';
