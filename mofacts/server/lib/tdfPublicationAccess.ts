import {
    buildConditionChildSelector,
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
    conditionRefs: string[],
    conditionTdfIds: string[] = []
) {
    if (conditionRefs.length === 0 && conditionTdfIds.length === 0) {
        return [];
    }
    const selector = buildConditionChildSelector(conditionRefs, conditionTdfIds);
    if (!selector) {
        return [];
    }
    return (await tdfs.find(
        selector,
        { fields: { stimuliSetId: 1 } }
    ).fetchAsync()).map((tdf: any) => tdf.stimuliSetId);
}

export function createTdfPublicationAccessResolver(deps: TdfPublicationAccessResolverDeps) {
    const lessonFamilies = createLessonFamilyResolver({ tdfs: deps.tdfs });

    async function resolveAssetStimuliSetIds(userId: string) {
        const [isAdmin, isTeacher, user] = await Promise.all([
            deps.roles.userIsInRoleAsync(userId, ['admin']),
            deps.roles.userIsInRoleAsync(userId, ['teacher']),
            deps.users.findOneAsync(
                { _id: userId },
                { fields: { 'profile.experimentTarget': 1 } }
            )
        ]);

        let tdfQuery: PublicationSelector;
        if (isAdmin) {
            tdfQuery = {};
        } else if (isTeacher) {
            tdfQuery = teacherListingSelector(userId);
        } else {
            const visibilityTerms: PublicationSelector[] = [
                { ownerId: userId },
                { 'accessors.userId': userId },
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
                    'content.tdfs.tutor.setspec.condition': 1,
                    'content.tdfs.tutor.setspec.conditionTdfIds': 1
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
                { fields: { stimuliSetId: 1, 'content.tdfs.tutor.setspec.condition': 1, 'content.tdfs.tutor.setspec.conditionTdfIds': 1 } }
            );
            const participantConditionRefs = Array.isArray(participantRoot?.content?.tdfs?.tutor?.setspec?.condition)
                ? participantRoot.content.tdfs.tutor.setspec.condition
                : [];
            const participantConditionTdfIds = Array.isArray(participantRoot?.content?.tdfs?.tutor?.setspec?.conditionTdfIds)
                ? normalizeIdList(participantRoot.content.tdfs.tutor.setspec.conditionTdfIds)
                : [];
            const participantConditionStimSetIds = await conditionStimSetIdsForRefs(
                deps.tdfs,
                participantConditionTdfIds.length > 0 ? [] : normalizeIdList(participantConditionRefs),
                participantConditionTdfIds
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

    return { resolveAssetStimuliSetIds };
}
