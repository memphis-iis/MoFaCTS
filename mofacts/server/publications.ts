import { publishLessonEditorFields } from './lib/publishLessonEditorFields';
import { DEFAULT_AUDIO_SETTINGS } from '../common/personalAudioSettings';
import { Roles } from 'meteor/alanning:roles';
import { Meteor } from 'meteor/meteor';
import {
    canViewDashboardTdf,
    hasSharedTdfAccess,
    isTdfOwner,
} from './lib/contentAccessPolicy';
import {
    createTdfPublicationAccessResolver,
    normalizeIdList,
    normalizeStimSetIds,
    normalizeOptionalStringId,
} from './lib/tdfPublicationAccess';
import { createLessonFamilyResolver } from './lib/tdfLessonFamilyResolver';
import {
    createExperimentTargetFamilyResolver,
    normalizeExperimentTarget,
} from './lib/experimentTargetFamilyResolver';
import { collectionMongoName } from '../common/collectionOwnership';
import { enrolledCourseLessonIds } from './lib/enrolledCourseLessons';
import { DynamicSettings } from '../common/Collections';
import { CLIENT_VERBOSITY_SETTING } from '../common/loggingSettings';
import { themeRegistry } from './lib/themeRegistry';
import { ensurePublishedDeploymentBrandProfile } from './lib/deploymentBrandProfileRegistry';
import { DEPLOYMENT_BRAND_PROFILE_KEY } from '../common/deploymentBrandProfile';
import { publishAdminUserPage } from './lib/adminUserPagePublication';
import { DEFAULT_PUBLICATION_VERIFICATIONS, NAMED_PUBLICATION_VERIFICATIONS } from '../common/securityAudit/verificationCatalog.ts';
import { registerDefaultPublication } from './securitySurfaces/registerDefaultPublication.ts';
import { registerNamedPublication } from './securitySurfaces/registerNamedPublication.ts';
import { participantProgressLessonIds } from './lib/participantProgressScope';
import { participantConnectionRoot } from './lib/participantSession';

const publicBranding = Object.freeze({ kind: 'public', applicationRateLimit: 'none' } as const);
const adminPublication = Object.freeze({ kind: 'role', role: 'admin' } as const);

// Use Meteor.roleAssignment — set unconditionally by alanning:roles v4 at
// package load time. The named export RoleAssignmentCollection resolves to
// undefined in the webpack bundle due to module loading order.
const getRoleAssignment = () => (Meteor as any).roleAssignment;

function normalizePageRequest(page: unknown, limit: unknown, maximumLimit = 200) {
    const normalizedPage = Number(page);
    const normalizedLimit = Number(limit);
    if (!Number.isInteger(normalizedPage) || normalizedPage < 0) return undefined;
    if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > maximumLimit) {
        return undefined;
    }
    return { page: normalizedPage, limit: normalizedLimit };
}

function buildFilteredUsersSelector(filter: unknown) {
    const normalizedFilter = typeof filter === 'string' ? filter.trim() : '';
    if (!normalizedFilter) return {};
    return {
        $or: [
            { username: { $regex: normalizedFilter, $options: 'i' } },
            { email_canonical: { $regex: normalizedFilter, $options: 'i' } },
            { 'emails.address': { $regex: normalizedFilter, $options: 'i' } },
        ],
    };
}

// Auto-publish the current user's role assignments so client-side
// minimongo is populated for synchronous role checks in roleUtils.ts.
registerDefaultPublication(Meteor, 'publication:default:role-assignments-self', DEFAULT_PUBLICATION_VERIFICATIONS.roles, function publishCurrentRoleAssignments() {
  if (!this.userId) return this.ready();
  return getRoleAssignment().find({'user._id': this.userId});
});

export const DYNAMIC_ASSET_PUBLICATION_FIELDS = {
    _id: 1,
    // FilesCollection.link reads these persisted routing fields from each document.
    _downloadRoute: 1,
    _collectionName: 1,
    public: 1,
    name: 1,
    fileName: 1,
    type: 1,
    size: 1,
    uploadedAt: 1,
    userId: 1,
    path: 1,
    meta: 1,
    ext: 1,
    extension: 1,
    extensionWithDot: 1,
    isImage: 1,
    isAudio: 1,
    isVideo: 1,
    versions: 1
};

export const TDF_RUNTIME_SECRET_EXCLUSION_FIELDS = {
    conditionAllocation: 0,
    'content.tdfs.tutor.setspec.speechAPIKey': 0,
    'content.tdfs.tutor.setspec.textToSpeechAPIKey': 0,
    'content.tdfs.tutor.setspec.openRouterApiKey': 0
};

// ===== Admin user-page snapshots =====
// User membership is a page snapshot: Change Streams cannot represent a moving
// skip/limit window without polling. Role assignments stay live for those IDs.
registerNamedPublication(Meteor, 'filteredUsers', {
    policy: adminPublication, dataEgress: 'admin-user-page', verification: NAMED_PUBLICATION_VERIFICATIONS.filteredUsers,
}, async function(filter = '', page = 0, limit = 50) {
    const pageRequest = normalizePageRequest(page, limit);
    if (!pageRequest) return this.ready();
    const query = buildFilteredUsersSelector(filter);

    const pagedUsers = await (Meteor.users.find(query, {
        fields: { username: 1, email_canonical: 1, emails: 1 },
        sort: { username: 1 },
        skip: pageRequest.page * pageRequest.limit,
        limit: pageRequest.limit,
    }) as any).fetchAsync();

    return publishAdminUserPage(this, pagedUsers, getRoleAssignment());
});

// Publish total count for pagination UI
registerNamedPublication(Meteor, 'filteredUsersCount', {
    policy: adminPublication, dataEgress: 'admin-user-count', verification: NAMED_PUBLICATION_VERIFICATIONS.filteredUsersCount,
}, async function(filter = '') {
    const query = buildFilteredUsersSelector(filter);

    // Use Counts package pattern - publish to a virtual collection
    const count = await (Meteor.users.find(query) as any).countAsync();

    // Publish to a client-side only collection
    const self = this;
    self.added('user_counts', 'filtered', { count });
    self.ready();

    // No reactivity needed - count updates on re-subscribe
});

registerNamedPublication(Meteor, 'userAdminDashboardUsage', {
    policy: adminPublication, dataEgress: 'admin-dashboard-usage', verification: NAMED_PUBLICATION_VERIFICATIONS.userAdminDashboardUsage,
}, async function(userIds: any[] = []) {
    if (participantConnectionRoot(this)) return this.ready();
    const normalizedUserIds = normalizeIdList(userIds).slice(0, 100);
    if (normalizedUserIds.length === 0) {
        return this.ready();
    }

    return UserDashboardCache.find(
        { userId: { $in: normalizedUserIds } },
        {
            fields: {
                userId: 1,
                usageSummary: 1,
                lastUpdated: 1,
                version: 1
            }
        }
    );
});

// ===== PHASE 1.5 OPTIMIZATION: Theme Publication =====
// Publish theme settings reactively instead of using method calls
// This allows clients to get automatic updates when theme changes
registerNamedPublication(Meteor, 'theme', {
    policy: publicBranding, dataEgress: 'theme-settings', verification: NAMED_PUBLICATION_VERIFICATIONS.theme,
}, async function() {
    await themeRegistry.ensureActiveTheme();
    return DynamicSettings.find({key: 'customTheme'});
});

registerNamedPublication(Meteor, 'themeLibrary', {
    policy: publicBranding, dataEgress: 'theme-settings', verification: NAMED_PUBLICATION_VERIFICATIONS.themeLibrary,
}, function() {
    return DynamicSettings.find({key: 'themeLibrary'});
});

registerNamedPublication(Meteor, 'deploymentBrandProfile', {
    policy: publicBranding, dataEgress: 'deployment-brand-profile', verification: NAMED_PUBLICATION_VERIFICATIONS.deploymentBrandProfile,
}, async function() {
    await ensurePublishedDeploymentBrandProfile();
    return DynamicSettings.find({ key: DEPLOYMENT_BRAND_PROFILE_KEY });
});

// ===== PHASE 2: Dashboard Cache Publication =====
// Publish user's pre-computed dashboard statistics
// This provides O(1) dashboard loading instead of N queries
registerNamedPublication(Meteor, 'dashboardCache', {
    policy: { kind: 'authenticated-self', delivery: 'sync' },
    dataEgress: 'own-dashboard-cache', verification: NAMED_PUBLICATION_VERIFICATIONS.dashboardCache,
}, function() {
    if (participantConnectionRoot(this)) return this.ready();
    return UserDashboardCache.find(
        { userId: this.userId },
        {
            fields: {
                userId: 1,
                tdfStats: 1,
                learnerTdfConfigs: 1,
                summary: 1,
                usageSummary: 1,
                lastUpdated: 1,
                version: 1
            }
        }
    );
});

registerNamedPublication(Meteor, 'files.assets.all', {
    policy: { kind: 'authenticated', delivery: 'async' }, dataEgress: 'accessible-asset-metadata',
    verification: NAMED_PUBLICATION_VERIFICATIONS['files.assets.all'],
}, async function() {

    const accessibleStimSetIds = await tdfPublicationAccess.resolveAssetStimuliSetIds(this.userId as string);
    // Course-only metadata is delivered once per subscription. A later file
    // change must not be streamed under a grant that may already have ended.
    const assigned = await resolveAssignedRootTdfIdsForUser(this.userId as string);
    const snapshotIds: string[] = [];
    if (assigned.length) {
        const fields = { stimuliSetId: 1, 'content.tdfs.tutor.setspec.condition': 1, 'content.tdfs.tutor.setspec.conditionTdfIds': 1 };
        const roots = await Tdfs.find({ _id: { $in: assigned } }, { fields }).fetchAsync();
        const children = await lessonFamilyResolver.findConditionChildrenForRoots(roots, { stimuliSetId: 1 });
        const independent = new Set(accessibleStimSetIds);
        const courseSets = normalizeStimSetIds([...roots, ...children].map(tdf => tdf.stimuliSetId)).filter(id => !independent.has(id));
        if (courseSets.length) {
            const files = await DynamicAssets.collection.find(
                { userId: { $ne: this.userId }, 'meta.stimuliSetId': { $in: courseSets } },
                { fields: DYNAMIC_ASSET_PUBLICATION_FIELDS }
            ).fetchAsync();
            for (const { _id, ...metadata } of files) {
                this.added(collectionMongoName('DynamicAssets'), _id, metadata);
                snapshotIds.push(_id);
            }
        }
    }
    const assetQuery = accessibleStimSetIds.length > 0
        ? {
            $or: [
                { userId: this.userId },
                { 'meta.stimuliSetId': { $in: accessibleStimSetIds } }
            ]
        }
        : { userId: this.userId };

    const liveQuery = snapshotIds.length ? { ...assetQuery, _id: { $nin: snapshotIds } } : assetQuery;
    return DynamicAssets.collection.find(liveQuery, { fields: DYNAMIC_ASSET_PUBLICATION_FIELDS });
});

registerNamedPublication(Meteor, 'assets', {
    policy: { kind: 'authenticated', delivery: 'async' }, dataEgress: 'stimulus-set-asset-metadata',
    verification: NAMED_PUBLICATION_VERIFICATIONS.assets,
}, async function(ownerId: any, stimSetId: any) {
    if (!stimSetId) {
        return this.ready();
    }

    const stimSetCandidates: any[] = [];
    if (typeof stimSetId === 'number' && Number.isFinite(stimSetId)) {
        stimSetCandidates.push(stimSetId, String(stimSetId));
    } else if (typeof stimSetId === 'string') {
        const trimmed = stimSetId.trim();
        if (trimmed.length > 0) {
            stimSetCandidates.push(trimmed);
            const asNumber = Number(trimmed);
            if (Number.isFinite(asNumber)) {
                stimSetCandidates.push(asNumber);
            }
        }
    }
    const uniqueStimSetCandidates = [...new Set(stimSetCandidates)];
    if (uniqueStimSetCandidates.length === 0) {
        return this.ready();
    }

    const tdf = await Tdfs.findOneAsync(
        { stimuliSetId: { $in: uniqueStimSetCandidates } },
        { fields: { ownerId: 1, accessors: 1 } }
    );
    if (!tdf) {
        throw new Meteor.Error('not-found', 'TDF not found for assets');
    }
    const matchingTdfs = await Tdfs.find(
        { stimuliSetId: { $in: uniqueStimSetCandidates } },
        { fields: { ownerId: 1, accessors: 1 } }
    ).fetchAsync();
    const hasContentUploadAccess = matchingTdfs.some((doc: any) =>
        isTdfOwner(this.userId, doc) || hasSharedTdfAccess(this.userId, doc)
    );
    if (!hasContentUploadAccess) {
        throw new Meteor.Error('not-authorized', 'Only owner or shared accessor can access assets from content upload');
    }

    return DynamicAssets.collection.find(
        { "meta.stimuliSetId": { $in: uniqueStimSetCandidates } },
        { fields: DYNAMIC_ASSET_PUBLICATION_FIELDS }
    );
});

registerNamedPublication(Meteor, 'userExperimentState', {
    policy: { kind: 'authenticated-self', delivery: 'sync' },
    dataEgress: 'own-experiment-progress', verification: NAMED_PUBLICATION_VERIFICATIONS.userExperimentState,
}, function(tdfId: any) {
    const multiple = tdfId && typeof tdfId === 'object';
    const lessonId = multiple ? null : normalizeOptionalStringId(tdfId);
    const requested = multiple ? normalizeIdList(tdfId) : lessonId ? [lessonId] : [];
    if (!requested.length) return this.ready();
    const userId = this.userId;
    const scope = participantProgressLessonIds(this, Tdfs);
    if (!scope) {
        return GlobalExperimentStates.find({ userId, TDFId: multiple ? { $in: requested } : lessonId });
    }
    return scope.then(allowed => {
        const visible = requested.filter(id => allowed.includes(id));
        if (!visible.length) return this.ready();
        return GlobalExperimentStates.find({ userId, TDFId: { $in: visible } });
    });
});

registerNamedPublication(Meteor, 'currentTdf', {
    policy: { kind: 'authenticated', delivery: 'async' }, dataEgress: 'runtime-lesson',
    verification: NAMED_PUBLICATION_VERIFICATIONS.currentTdf,
}, async function(tdfId: unknown) {
    const id = normalizeOptionalStringId(tdfId);
    if (!id) return this.ready();

    const tdf = await Tdfs.findOneAsync(
        { _id: id },
        { fields: { _id: 1, ownerId: 1, accessors: 1, tdfAvailability: 1, 'content.tdfs.tutor.setspec.userselect': 1 } }
    );
    if (!tdf || tdf.tdfAvailability === 'repair-required' || !await canViewDashboardTdf(this.userId, tdf)) {
        return this.ready();
    }

    const assignedRoots = await resolveAssignedRootTdfIdsForUser(this.userId as string);
    if (assignedRoots.includes(id)) return this.ready();
    const assignedConditions = await lessonFamilyResolver.resolveConditionChildIdsForRootIds(assignedRoots);
    if (assignedConditions.includes(id)) return this.ready();
    return Tdfs.find({ _id: id }, { fields: TDF_RUNTIME_SECRET_EXCLUSION_FIELDS });
});

// Publication for content/TDF editor - returns TDF with full content for editing
registerNamedPublication(Meteor, 'tdfForEdit', {
    policy: { kind: 'authenticated', delivery: 'async' }, dataEgress: 'owner-editor-content',
    verification: NAMED_PUBLICATION_VERIFICATIONS.tdfForEdit,
}, async function(tdfId: any) {
    if (!tdfId) return this.ready();

    // Fields needed for both content editor (stimuli) and TDF editor (full content)
    const editFields = {
        rawStimuliFile: 1,
        stimuli: 1,
        stimuliSetId: 1,
        stimulusFileName: 1,
        ownerId: 1,
        accessors: 1,
        content: 1  // Full TDF content for TDF editor
    };

    const tdf = await Tdfs.findOneAsync({ _id: tdfId }, { fields: { ownerId: 1, accessors: 1 } });
    if (!tdf) {
        throw new Meteor.Error('not-found', 'TDF not found');
    }
    if (!isTdfOwner(this.userId, tdf)) {
        throw new Meteor.Error('not-authorized', 'Only owner can edit this TDF');
    }

    return publishLessonEditorFields(this, { _id: tdfId, ownerId: tdf.ownerId }, editFields, true);
});

const TDF_CONTENT_UPLOAD_DETAIL_FIELDS = {
    _id: 1,
    stimuli: 1,
    stimuliSetId: 1,
    conditionCounts: 1,
    packageFile: 1,
    packageAssetId: 1,
    ownerId: 1,
    accessors: 1,
    rawStimuliFile: 1,
    'content.fileName': 1,
    'content.tdfs.tutor.setspec': 1
};

function resolveAssignedRootTdfIdsForUser(userId: string) {
    return enrolledCourseLessonIds({ SectionUserMap, Sections, Courses, Assignments }, userId, true);
}

const tdfPublicationAccess = createTdfPublicationAccessResolver({
    tdfs: Tdfs as any,
    users: Meteor.users as any,
    roles: Roles
});
const lessonFamilyResolver = createLessonFamilyResolver({ tdfs: Tdfs as any });
const resolveExperimentTargetFamily = createExperimentTargetFamilyResolver({ Tdfs: Tdfs as any });

registerNamedPublication(Meteor, 'tdfForContentUploadDetails', {
    policy: { kind: 'authenticated', delivery: 'async' }, dataEgress: 'owner-or-shared-upload-details',
    verification: NAMED_PUBLICATION_VERIFICATIONS.tdfForContentUploadDetails,
}, async function(tdfId: any) {
    if (!tdfId || typeof tdfId !== 'string') {
        return this.ready();
    }
    const tdf = await Tdfs.findOneAsync(
        { _id: tdfId },
        { fields: { ownerId: 1, accessors: 1 } }
    );
    if (!tdf || !(isTdfOwner(this.userId, tdf) || hasSharedTdfAccess(this.userId, tdf))) {
        return this.ready();
    }
    return publishLessonEditorFields(this, { _id: tdfId, $or: [{ ownerId: this.userId }, { 'accessors.userId': this.userId }] }, TDF_CONTENT_UPLOAD_DETAIL_FIELDS, false);
});

registerNamedPublication(Meteor, 'tdfByExperimentTarget', {
    policy: { kind: 'authenticated', delivery: 'async' }, dataEgress: 'experiment-lesson-family',
    verification: NAMED_PUBLICATION_VERIFICATIONS.tdfByExperimentTarget,
}, async function(experimentTarget: any) {

    const normalizedTarget = normalizeExperimentTarget(experimentTarget);
    if (!normalizedTarget) {
        return this.ready();
    }

    const isAdmin = await Roles.userIsInRoleAsync(this.userId, ['admin']);
    const isTeacher = await Roles.userIsInRoleAsync(this.userId, ['teacher']);
    let rootAccessSelector: any = {};
    if (isTeacher && !isAdmin) {
        rootAccessSelector = {
            $or: [
                { ownerId: this.userId },
                { 'accessors.userId': this.userId },
                { 'content.tdfs.tutor.setspec.userselect': 'true' },
            ],
        };
    } else if (!isAdmin) {
        const user = await (Meteor.users as any).findOneAsync(
            this.userId,
            { fields: { 'profile.experimentTarget': 1 } },
        );
        const profileTarget = normalizeExperimentTarget(user?.profile?.experimentTarget);
        if (profileTarget !== normalizedTarget) {
            rootAccessSelector = { $or: [{ ownerId: this.userId }, { 'accessors.userId': this.userId }] };
        }
    }

    const family = await resolveExperimentTargetFamily(normalizedTarget, rootAccessSelector);
    if (!family) return this.ready();
    return Tdfs.find(
        { _id: { $in: family.tdfIds } },
        { fields: TDF_RUNTIME_SECRET_EXCLUSION_FIELDS },
    );
});

registerNamedPublication(Meteor, 'settings', {
    policy: adminPublication, dataEgress: 'system-settings', verification: NAMED_PUBLICATION_VERIFICATIONS.settings,
}, function() {
    return DynamicSettings.find();
});

registerNamedPublication(Meteor, 'clientRuntimeSettings', {
    policy: { kind: 'authenticated', delivery: 'sync' },
    dataEgress: 'client-log-setting', verification: NAMED_PUBLICATION_VERIFICATIONS.clientRuntimeSettings,
}, function() {
    return DynamicSettings.find(
        { _id: CLIENT_VERBOSITY_SETTING.id },
        { fields: { key: 1, value: 1 } }
    );
});

// Publish user's audio settings
registerNamedPublication(Meteor, 'userAudioSettings', {
    policy: { kind: 'authenticated-self', delivery: 'async' },
    dataEgress: 'own-audio-settings', verification: NAMED_PUBLICATION_VERIFICATIONS.userAudioSettings,
}, async function() {
    const user = await (Meteor.users as any).findOneAsync({ _id: this.userId }, { fields: { audioSettings: 1, audioPromptMode: 1, audioInputMode: 1 } });

    if (!user.audioSettings) {
        const initialSettings = {
            ...DEFAULT_AUDIO_SETTINGS,
            audioPromptMode: user.audioPromptMode || DEFAULT_AUDIO_SETTINGS.audioPromptMode,
            audioInputMode: user.audioInputMode || DEFAULT_AUDIO_SETTINGS.audioInputMode,
        };

        // Save initialized settings
        await (Meteor.users as any).updateAsync(
            { _id: this.userId, audioSettings: null },
            { $set: { audioSettings: initialSettings } }
        );
    }

    // Session helpers read both session fields from the signed-in user.
    return Meteor.users.find(
        { _id: this.userId! },
        {
            fields: {
                audioSettings: 1,
                lastSessionId: 1,
                lastSessionIdTimestamp: 1
            }
        }
    );
});
