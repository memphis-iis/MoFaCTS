import {
    buildConditionChildSelector,
    buildConditionVisibilityTerms,
    createLessonFamilyResolver,
} from './tdfLessonFamilyResolver';

export type PublicationSelector = Record<string, any>;

type AsyncCursor<T> = {
    fetchAsync(): Promise<T[]>;
};

export type TdfPublicationCollection = {
    find(selector: PublicationSelector, options?: PublicationSelector): AsyncCursor<any>;
    findOneAsync(selector: PublicationSelector, options?: PublicationSelector): Promise<any | null | undefined>;
};

export type UserPublicationCollection = {
    findOneAsync(selector: PublicationSelector, options?: PublicationSelector): Promise<any | null | undefined>;
};

export type PublicationRoles = {
    userIsInRoleAsync(userId: string, roles: string[]): Promise<boolean>;
};

export type TdfPublicationAccessResolverDeps = {
    tdfs: TdfPublicationCollection;
    users: UserPublicationCollection;
    roles: PublicationRoles;
    resolveAssignedRootTdfIdsForUser(userId: string): Promise<string[]>;
};

export type TdfPublicationAccessResolverOptions = {
    cacheTtlMs?: number;
    maxCacheEntries?: number;
    now?: () => number;
};

type CacheEntry<T> = {
    expiresAt: number;
    promise: Promise<T>;
};

export function normalizeOptionalStringId(value: any) {
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

export function normalizeIdList(ids: any) {
    if (!Array.isArray(ids)) return [];
    const out = new Set<string>();
    for (const id of ids) {
        const normalized = normalizeOptionalStringId(id);
        if (normalized) out.add(normalized);
    }
    return Array.from(out);
}

export function normalizeStimSetIds(ids: any[] = []) {
    const out = new Set<string | number>();
    for (const id of ids) {
        if (id === null || id === undefined) {
            continue;
        }
        if (typeof id === 'number' && Number.isFinite(id)) {
            out.add(id);
            out.add(String(id));
            continue;
        }
        if (typeof id === 'string') {
            const trimmed = id.trim();
            if (!trimmed.length) {
                continue;
            }
            out.add(trimmed);
            const asNumber = Number(trimmed);
            if (Number.isFinite(asNumber)) {
                out.add(asNumber);
            }
        }
    }
    return Array.from(out);
}

function experimentTargetFromUser(user: any) {
    return typeof user?.profile?.experimentTarget === 'string'
        ? user.profile.experimentTarget.trim().toLowerCase()
        : '';
}

function baseVisibilityTerms(userId: string): PublicationSelector[] {
    return [
        { ownerId: userId },
        { 'accessors.userId': userId },
        { 'content.tdfs.tutor.setspec.userselect': 'true' }
    ];
}

function teacherListingSelector(userId: string) {
    return {
        $or: [
            { ownerId: userId },
            { 'accessors.userId': userId },
            { 'content.tdfs.tutor.setspec.userselect': 'true' },
            { 'content.tdfs.tutor.setspec.experimentTarget': { $exists: true, $ne: null } }
        ]
    };
}

async function conditionStimSetIdsForRefs(
    tdfs: TdfPublicationCollection,
    conditionRefs: string[]
) {
    if (conditionRefs.length === 0) {
        return [];
    }
    const selector = buildConditionChildSelector(conditionRefs);
    if (!selector) {
        return [];
    }
    return (await tdfs.find(
        selector,
        { fields: { stimuliSetId: 1 } }
    ).fetchAsync()).map((tdf: any) => tdf.stimuliSetId);
}

export function createTdfPublicationAccessResolver(
    deps: TdfPublicationAccessResolverDeps,
    options: TdfPublicationAccessResolverOptions = {}
) {
    const cacheTtlMs = options.cacheTtlMs ?? 5000;
    const maxCacheEntries = options.maxCacheEntries ?? 200;
    const now = options.now ?? (() => Date.now());
    const cache = new Map<string, CacheEntry<any>>();
    const lessonFamilies = createLessonFamilyResolver({ tdfs: deps.tdfs });

    function pruneCache() {
        const current = now();
        for (const [key, entry] of cache.entries()) {
            if (entry.expiresAt <= current) {
                cache.delete(key);
            }
        }
        while (cache.size > maxCacheEntries) {
            const oldestKey = cache.keys().next().value as string | undefined;
            if (!oldestKey) {
                break;
            }
            cache.delete(oldestKey);
        }
    }

    function cached<T>(key: string, loader: () => Promise<T>) {
        const current = now();
        const cachedEntry = cache.get(key);
        if (cachedEntry && cachedEntry.expiresAt > current) {
            return cachedEntry.promise as Promise<T>;
        }

        const promise = loader();
        cache.set(key, { expiresAt: current + cacheTtlMs, promise });
        pruneCache();

        promise.catch(() => {
            const currentEntry = cache.get(key);
            if (currentEntry?.promise === promise) {
                cache.delete(key);
            }
        });

        return promise;
    }

    async function resolveListingSelectorUncached(userId: string) {
        if (await deps.roles.userIsInRoleAsync(userId, ['admin'])) {
            return {};
        }
        if (await deps.roles.userIsInRoleAsync(userId, ['teacher'])) {
            return teacherListingSelector(userId);
        }

        const user = await deps.users.findOneAsync(
            { _id: userId },
            { fields: { accessedTDFs: 1 } }
        );
        const accessedTdfIds = normalizeIdList(user?.accessedTDFs || []);
        const visibilityTerms: PublicationSelector[] = baseVisibilityTerms(userId);
        if (accessedTdfIds.length > 0) {
            visibilityTerms.push({ _id: { $in: accessedTdfIds } });
        } else {
            visibilityTerms.push({ _id: { $in: [] } });
        }
        return { $or: visibilityTerms };
    }

    async function resolveDashboardSelectorUncached(userId: string) {
        const [assignedRootIds, user] = await Promise.all([
            deps.resolveAssignedRootTdfIdsForUser(userId),
            deps.users.findOneAsync(
                { _id: userId },
                { fields: { accessedTDFs: 1 } }
            )
        ]);

        const explicitDashboardIds = [
            ...new Set([
                ...normalizeIdList(assignedRootIds),
                ...normalizeIdList(user?.accessedTDFs || [])
            ])
        ];
        const visibilityTerms: PublicationSelector[] = baseVisibilityTerms(userId);
        if (explicitDashboardIds.length > 0) {
            visibilityTerms.push({ _id: { $in: explicitDashboardIds } });
        }

        const accessibleRoots = await deps.tdfs.find(
            { $or: visibilityTerms },
            {
                fields: {
                    _id: 1,
                    'content.fileName': 1,
                    'content.tdfs.tutor.setspec.condition': 1,
                    'content.tdfs.tutor.setspec.conditionTdfIds': 1
                }
            }
        ).fetchAsync();

        visibilityTerms.push(...buildConditionVisibilityTerms(accessibleRoots));

        return { $or: visibilityTerms };
    }

    async function resolveAssetStimuliSetIdsUncached(userId: string) {
        const [isAdmin, isTeacher, user] = await Promise.all([
            deps.roles.userIsInRoleAsync(userId, ['admin']),
            deps.roles.userIsInRoleAsync(userId, ['teacher']),
            deps.users.findOneAsync(
                { _id: userId },
                { fields: { accessedTDFs: 1, profile: 1, loginParams: 1 } }
            )
        ]);

        let tdfQuery: PublicationSelector;
        if (isAdmin) {
            tdfQuery = {};
        } else if (isTeacher) {
            tdfQuery = teacherListingSelector(userId);
        } else {
            const accessedTdfIds = normalizeIdList(user?.accessedTDFs || []);
            const visibilityTerms: PublicationSelector[] = [
                { ownerId: userId },
                { 'accessors.userId': userId },
                { _id: { $in: accessedTdfIds } },
                { 'content.tdfs.tutor.setspec.userselect': 'true' }
            ];
            const experimentTarget = experimentTargetFromUser(user);
            if (experimentTarget) {
                visibilityTerms.push({ 'content.tdfs.tutor.setspec.experimentTarget': experimentTarget });
            }
            tdfQuery = { $or: visibilityTerms };
        }

        const accessibleTdfs = await deps.tdfs.find(
            tdfQuery,
            {
                fields: {
                    stimuliSetId: 1,
                    'content.tdfs.tutor.setspec.condition': 1
                }
            }
        ).fetchAsync();

        const conditionTdfs = await lessonFamilies.findConditionChildrenForRoots(
            accessibleTdfs,
            { stimuliSetId: 1 }
        );
        const conditionStimSetIds = conditionTdfs.map((tdf: any) => tdf.stimuliSetId);
        const participantExperimentTarget = experimentTargetFromUser(user);

        let participantExperimentStimSetIds: any[] = [];
        if (participantExperimentTarget) {
            const participantRoot = await deps.tdfs.findOneAsync(
                { 'content.tdfs.tutor.setspec.experimentTarget': participantExperimentTarget },
                { fields: { stimuliSetId: 1, 'content.tdfs.tutor.setspec.condition': 1 } }
            );
            const participantConditionRefs = Array.isArray(participantRoot?.content?.tdfs?.tutor?.setspec?.condition)
                ? participantRoot.content.tdfs.tutor.setspec.condition
                : [];
            const participantConditionStimSetIds = await conditionStimSetIdsForRefs(
                deps.tdfs,
                normalizeIdList(participantConditionRefs)
            );
            participantExperimentStimSetIds = [
                participantRoot?.stimuliSetId,
                ...participantConditionStimSetIds
            ].filter((id) => id !== null && id !== undefined && String(id).trim() !== '');
        }

        return normalizeStimSetIds(
            accessibleTdfs
                .map((tdf: any) => tdf.stimuliSetId)
                .concat(conditionStimSetIds)
                .concat(participantExperimentStimSetIds)
        );
    }

    return {
        resolveListingSelector(userId: string) {
            return cached(`listing:${userId}`, () => resolveListingSelectorUncached(userId));
        },
        resolveDashboardSelector(userId: string) {
            return cached(`dashboard:${userId}`, () => resolveDashboardSelectorUncached(userId));
        },
        resolveAssetStimuliSetIds(userId: string) {
            return cached(`assets:${userId}`, () => resolveAssetStimuliSetIdsUncached(userId));
        },
        clearCacheForUser(userId?: string) {
            if (!userId) {
                cache.clear();
                return;
            }
            for (const key of Array.from(cache.keys())) {
                if (key.endsWith(`:${userId}`)) {
                    cache.delete(key);
                }
            }
        }
    };
}
