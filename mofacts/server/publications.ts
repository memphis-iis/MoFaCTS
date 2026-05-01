import { Roles } from 'meteor/alanning:roles';
import { Meteor } from 'meteor/meteor';
import {
    canViewDashboardTdf,
    hasSharedTdfAccess,
    isTdfOwner,
} from './lib/contentAccessPolicy';

// Use Meteor.roleAssignment — set unconditionally by alanning:roles v4 at
// package load time. The named export RoleAssignmentCollection resolves to
// undefined in the webpack bundle due to module loading order.
const getRoleAssignment = () => (Meteor as any).roleAssignment;

// Auto-publish the current user's role assignments so client-side
// minimongo is populated for synchronous role checks in roleUtils.ts.
Meteor.publish(null, function() {
  if (!this.userId) return this.ready();
  return getRoleAssignment().find({'user._id': this.userId});
});

function normalizeOptionalStringId(value: any) {
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

function normalizeIdList(ids: any) {
    if (!Array.isArray(ids)) return [];
    const out = new Set<string>();
    for (const id of ids) {
        const normalized = normalizeOptionalStringId(id);
        if (normalized) out.add(normalized);
    }
    return Array.from(out);
}

// ===== PHASE 3: Paginated Users Publication =====
// Server-side filtering and pagination for userAdmin page
// Eliminates O(n²) client-side iteration
Meteor.publish('filteredUsers', async function(filter = '', page = 0, limit = 50) {
    // Security check - must be admin or teacher
    if (!this.userId) {
        return this.ready();
    }

    const isAdmin = await Roles.userIsInRoleAsync(this.userId, ['admin']);
    const isTeacher = await Roles.userIsInRoleAsync(this.userId, ['teacher']);

    if (!isAdmin && !isTeacher) {
        return this.ready();
    }

    // Build query with server-side filtering
    const query: any = {};
    if (filter && filter.length > 0) {
        query.$or = [
            { username: { $regex: filter, $options: 'i' } },
            { email_canonical: { $regex: filter, $options: 'i' } },
            { 'emails.address': { $regex: filter, $options: 'i' } }
        ];
    }

    // For admins: also publish all role-assignment docs so the client
    // roleUtils can correctly display and toggle roles for any user.
    // There are only ever a small number of assigned roles so this is cheap.
    const pagedUsersCursor = Meteor.users.find(query, {
        fields: { username: 1, email_canonical: 1, emails: 1 },
        sort: { username: 1 },
        skip: page * limit,
        limit: limit
    });

    const pagedUsersHandle = pagedUsersCursor.observeChanges({
        added: (id: string) => {
            this.added('filtered_user_page_ids', id, { userId: id });
        },
        removed: (id: string) => {
            this.removed('filtered_user_page_ids', id);
        }
    });

    this.onStop(() => {
        pagedUsersHandle.stop();
    });

    const cursors: any[] = [
        pagedUsersCursor
    ];

    if (isAdmin) {
        cursors.push(getRoleAssignment().find({}));
    }

    return cursors;
});

// Publish total count for pagination UI
Meteor.publish('filteredUsersCount', async function(filter = '') {
    // Security check - must be admin or teacher
    if (!this.userId) {
        return this.ready();
    }

    const isAdmin = await Roles.userIsInRoleAsync(this.userId, ['admin']);
    const isTeacher = await Roles.userIsInRoleAsync(this.userId, ['teacher']);

    if (!isAdmin && !isTeacher) {
        return this.ready();
    }

    // Build query with server-side filtering
    const query: any = {};
    if (filter && filter.length > 0) {
        query.$or = [
            { username: { $regex: filter, $options: 'i' } },
            { email_canonical: { $regex: filter, $options: 'i' } },
            { 'emails.address': { $regex: filter, $options: 'i' } }
        ];
    }

    // Use Counts package pattern - publish to a virtual collection
    const count = await (Meteor.users.find(query) as any).countAsync();

    // Publish to a client-side only collection
    const self = this;
    self.added('user_counts', 'filtered', { count });
    self.ready();

    // No reactivity needed - count updates on re-subscribe
});

// ===== PHASE 1.5 OPTIMIZATION: Theme Publication =====
// Publish theme settings reactively instead of using method calls
// This allows clients to get automatic updates when theme changes
Meteor.publish('theme', function() {
    // Theme is public data - available to all users (even unauthenticated)
    // This is safe because theme only contains visual styling, no sensitive data
    return DynamicSettings.find({key: 'customTheme'});
});

Meteor.publish('themeLibrary', function() {
    return DynamicSettings.find({key: 'themeLibrary'});
});

// ===== PHASE 1.7: User History Publication =====
// Publish user's practice history for dashboard statistics
// Security: Only publishes user's own history with sparse fields
// This eliminates N+1 query pattern in learning dashboard
Meteor.publish('userHistory', function(tdfId: any) {
    // Security check - must be authenticated
    if (!this.userId) {
        return this.ready();
    }

    // Query parameters - only user's own history
    const query: any = {
        userId: this.userId,
        levelUnitType: 'model'
    };

    // If tdfId provided, filter by specific TDF
    if (tdfId) {
        query.TDFId = tdfId;
    }

    // Sparse fields - only what dashboard needs for stats calculation
    // This reduces data transfer and client memory usage
    const fields = {
        userId: 1,
        TDFId: 1,
        outcome: 1,
        CFEndLatency: 1,
        CFFeedbackLatency: 1,
        itemId: 1,
        CFStimFileIndex: 1,
        problemName: 1,
        recordedServerTime: 1,
        levelUnitType: 1
    };

    return Histories.find(query, { fields });
});

// ===== PHASE 2: Dashboard Cache Publication =====
// Publish user's pre-computed dashboard statistics
// This provides O(1) dashboard loading instead of N queries
Meteor.publish('dashboardCache', function() {
    // Security check - must be authenticated
    if (!this.userId) {
        return this.ready();
    }

    // Only publish user's own cache
    return UserDashboardCache.find(
        { userId: this.userId },
        {
            fields: {
                userId: 1,
                tdfStats: 1,
                summary: 1,
                lastUpdated: 1,
                version: 1
            }
        }
    );
});

Meteor.publish('files.assets.all', async function () {
    // Security: Filter assets based on user role and ownership
    if (!this.userId) {
        return this.ready(); // No data for unauthenticated users
    }

    const normalizeStimSetIds = (ids: any[] = []) => {
        const out = new Set();
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
    };

    let tdfQuery: any = {
        $or: [
            { ownerId: this.userId },
            { 'accessors.userId': this.userId }
        ]
    };

    if (await Roles.userIsInRoleAsync(this.userId, ['admin'])) {
        tdfQuery = {};
    } else if (await Roles.userIsInRoleAsync(this.userId, ['teacher'])) {
        tdfQuery = {
            $or: [
                { ownerId: this.userId },
                { 'accessors.userId': this.userId },
                { 'content.tdfs.tutor.setspec.userselect': 'true' },
                { 'content.tdfs.tutor.setspec.experimentTarget': { $exists: true, $ne: null } }
            ]
        };
    } else {
        const user = await (Meteor.users as any).findOneAsync(
            { _id: this.userId },
            { fields: { accessedTDFs: 1, profile: 1, loginParams: 1 } }
        );
        const accessedTdfIds = Array.isArray(user?.accessedTDFs) ? user.accessedTDFs : [];
        const historicalTdfIds = (await Histories.find(
            { userId: this.userId },
            { fields: { TDFId: 1 } }
        ).fetchAsync()).map((h: any) => h.TDFId);
        const uniqueHistoricalTdfIds = [...new Set(historicalTdfIds)];
        const experimentTarget =
            typeof user?.profile?.experimentTarget === 'string'
                ? user.profile.experimentTarget.trim().toLowerCase()
                : '';

        tdfQuery = {
            $or: [
                { ownerId: this.userId },
                { 'accessors.userId': this.userId },
                { _id: { $in: accessedTdfIds } },
                { _id: { $in: uniqueHistoricalTdfIds } },
                { 'content.tdfs.tutor.setspec.userselect': 'true' }
            ]
        };

        if (experimentTarget) {
            tdfQuery = {
                $or: [
                    ...(tdfQuery.$or || []),
                    { 'content.tdfs.tutor.setspec.experimentTarget': experimentTarget }
                ]
            };
        }
    }

    const accessibleTdfs = await Tdfs.find(
        tdfQuery,
        {
            fields: {
                stimuliSetId: 1,
                'content.tdfs.tutor.setspec.condition': 1
            }
        }
    ).fetchAsync();

    const conditionRefs = new Set();
    for (const tdf of accessibleTdfs) {
        const refs = tdf?.content?.tdfs?.tutor?.setspec?.condition;
        if (Array.isArray(refs)) {
            for (const ref of refs) {
                if (typeof ref === 'string' && ref.trim().length > 0) {
                    conditionRefs.add(ref.trim());
                }
            }
        }
    }

    let conditionStimSetIds = [];
    if (conditionRefs.size > 0) {
        conditionStimSetIds = (await Tdfs.find(
            {
                $or: [
                    { _id: { $in: Array.from(conditionRefs) } },
                    { 'content.fileName': { $in: Array.from(conditionRefs) } }
                ]
            },
            { fields: { stimuliSetId: 1 } }
        ).fetchAsync())
            .map((tdf: any) => tdf.stimuliSetId);
    }

    const userForExperimentAssets = await (Meteor.users as any).findOneAsync(
        { _id: this.userId },
        { fields: { profile: 1 } }
    );
    const participantExperimentTarget =
        typeof userForExperimentAssets?.profile?.experimentTarget === 'string'
            ? userForExperimentAssets.profile.experimentTarget.trim().toLowerCase()
            : '';

    let participantExperimentStimSetIds: any[] = [];
    if (participantExperimentTarget) {
        const participantRoot = await Tdfs.findOneAsync(
            { 'content.tdfs.tutor.setspec.experimentTarget': participantExperimentTarget },
            { fields: { stimuliSetId: 1, 'content.tdfs.tutor.setspec.condition': 1 } }
        );

        const participantConditionRefs = Array.isArray(participantRoot?.content?.tdfs?.tutor?.setspec?.condition)
            ? participantRoot.content.tdfs.tutor.setspec.condition
            : [];

        const participantConditionStimSetIds = participantConditionRefs.length > 0
            ? (await Tdfs.find(
                {
                    $or: [
                        { _id: { $in: participantConditionRefs } },
                        { 'content.fileName': { $in: participantConditionRefs } }
                    ]
                },
                { fields: { stimuliSetId: 1 } }
            ).fetchAsync()).map((tdf: any) => tdf.stimuliSetId)
            : [];

        participantExperimentStimSetIds = [
            participantRoot?.stimuliSetId,
            ...participantConditionStimSetIds
        ].filter((id) => id !== null && id !== undefined && String(id).trim() !== '');
    }

    const rawStimSetIds = accessibleTdfs
        .map((tdf: any) => tdf.stimuliSetId)
        .concat(conditionStimSetIds)
        .concat(participantExperimentStimSetIds);
    const accessibleStimSetIds = normalizeStimSetIds(rawStimSetIds);

    const uniqueStimSetIds = [...new Set(accessibleStimSetIds)];
    const assetQuery = uniqueStimSetIds.length > 0
        ? {
            $or: [
                { userId: this.userId },
                { 'meta.stimuliSetId': { $in: uniqueStimSetIds } }
            ]
        }
        : { userId: this.userId };

    return DynamicAssets.collection.find(assetQuery);
});

Meteor.publish('assets', async function(ownerId: any, stimSetId: any) {
    // Security: Require authentication to access stimulus assets
    if (!this.userId) {
        return this.ready();
    }
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

    return DynamicAssets.collection.find({ "meta.stimuliSetId": { $in: uniqueStimSetCandidates } });
});

Meteor.publish('ownedFiles', function() {
    return [Tdfs.find({'ownerId': Meteor.userId()})]
});

Meteor.publish('accessableFiles', async function() {
    const accessableFileIds = (await (Meteor.users as any).findOneAsync({_id: this.userId})).accessedTDFs;
    return Tdfs.find({_id: {$in: accessableFileIds}})
});

Meteor.publish('userExperimentState', function(tdfId: any) {
    if (tdfId && typeof tdfId === 'object') {
        const normalizedIds = normalizeIdList(tdfId);
        if (!normalizedIds.length) {
            return this.ready();
        }
        return GlobalExperimentStates.find({userId: this.userId, TDFId: {$in: normalizedIds}});
    } else if (tdfId !== null && tdfId !== undefined) {
        const normalizedTdfId = normalizeOptionalStringId(tdfId);
        if (!normalizedTdfId) {
            return this.ready();
        }
        return GlobalExperimentStates.find({userId: this.userId, TDFId: normalizedTdfId});
    }
    return this.ready();
});

Meteor.publish('allUserExperimentState', function() {
    return GlobalExperimentStates.find({userId: this.userId});
});

Meteor.publish('currentTdf', async function(tdfId: any) {
    // Security: Require authentication to access TDF content
    if (!this.userId) {
        return this.ready();
    }
    const assignedRootIds = new Set(await resolveAssignedRootTdfIdsForUser(this.userId as string));
    const canAccessRequestedTdf = async (requestedId: string) => {
        const tdf = await Tdfs.findOneAsync(
            { _id: requestedId },
            { fields: { _id: 1, ownerId: 1, accessors: 1, 'content.tdfs.tutor.setspec.userselect': 1 } }
        );
        if (!tdf) {
            return false;
        }
        return canViewDashboardTdf(this.userId, tdf) || assignedRootIds.has(requestedId);
    };

    if (tdfId && typeof tdfId === 'object') {
        const normalizedIds = normalizeIdList(tdfId);
        if (!normalizedIds.length) {
            return this.ready();
        }
        const allowedIds: string[] = [];
        for (const requestedId of normalizedIds) {
            if (await canAccessRequestedTdf(requestedId)) {
                allowedIds.push(requestedId);
            }
        }
        if (!allowedIds.length) {
            return this.ready();
        }
        return Tdfs.find({ _id: { $in: allowedIds } });
    }

    const normalizedTdfId = normalizeOptionalStringId(tdfId);
    if (!normalizedTdfId) {
        return this.ready();
    }
    if (!await canAccessRequestedTdf(normalizedTdfId)) {
        return this.ready();
    }
    return Tdfs.find({ _id: normalizedTdfId });
});

// Publication for content/TDF editor - returns TDF with full content for editing
Meteor.publish('tdfForEdit', async function(tdfId: any) {
    if (!this.userId) return this.ready();
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

    return Tdfs.find({ _id: tdfId }, { fields: editFields });
});

// Lightweight publication for editor initial load - excludes full stimuli array
// Use this for faster initial page load, then fetch stimuli separately if needed
Meteor.publish('tdfForEditMetadata', async function(tdfId: any) {
    if (!this.userId) return this.ready();
    if (!tdfId) return this.ready();

    // Metadata fields only - excludes large stimuli array (~90% payload reduction)
    const metadataFields = {
        stimuliSetId: 1,
        stimulusFileName: 1,
        ownerId: 1,
        accessors: 1,
        'content.fileName': 1,
        'content.tdfs.tutor.setspec': 1,
        // Include rawStimuliFile structure info but not full data
        'rawStimuliFile.setspec.clusters': 1
        // Explicitly EXCLUDES: stimuli (large array)
    };

    const tdf = await Tdfs.findOneAsync({ _id: tdfId }, { fields: { ownerId: 1, accessors: 1 } });
    if (!tdf) {
        throw new Meteor.Error('not-found', 'TDF not found');
    }
    if (!isTdfOwner(this.userId, tdf)) {
        throw new Meteor.Error('not-authorized', 'Only owner can edit this TDF');
    }

    return Tdfs.find({ _id: tdfId }, { fields: metadataFields });
});

// ===== LIGHTWEIGHT TDF LISTING PUBLICATION =====
// For dashboard/listing pages - excludes large 'unit' arrays (50-70% bandwidth savings)
// Use this for pages that only need TDF metadata, not full content
const TDF_LISTING_FIELDS = {
    _id: 1,
    stimuliSetId: 1,
    ownerId: 1,
    accessors: 1,
    'content.fileName': 1,
    'content.isMultiTdf': 1,
    'content.tdfs.tutor.setspec': 1
    // Explicitly EXCLUDES: content.tdfs.tutor.unit (large array)
};

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

async function resolveAssignedRootTdfIdsForUser(userId: string) {
    const enrollmentRows = await SectionUserMap.find(
        { userId },
        { fields: { sectionId: 1 } }
    ).fetchAsync();
    const sectionIds = enrollmentRows
        .map((row: any) => normalizeOptionalStringId(row?.sectionId))
        .filter((id: string | null): id is string => !!id);
    if (sectionIds.length === 0) {
        return [];
    }

    const sections = await Sections.find(
        { _id: { $in: sectionIds } },
        { fields: { courseId: 1 } }
    ).fetchAsync();
    const courseIds = sections
        .map((section: any) => normalizeOptionalStringId(section?.courseId))
        .filter((id: string | null): id is string => !!id);
    if (courseIds.length === 0) {
        return [];
    }

    const assignmentRows = await Assignments.find(
        { courseId: { $in: [...new Set(courseIds)] } },
        { fields: { TDFId: 1 } }
    ).fetchAsync();
    return assignmentRows
        .map((row: any) => normalizeOptionalStringId(row?.TDFId))
        .filter((id: string | null): id is string => !!id);
}

Meteor.publish('allTdfsListing', async function() {
    // Security: Filter TDFs based on user role and access permissions
    if (!this.userId) {
        return this.ready();
    }

    // Admins can see all TDFs
    if (await Roles.userIsInRoleAsync(this.userId, ['admin'])) {
        return Tdfs.find({}, { fields: TDF_LISTING_FIELDS });
    }

    // Teachers can see their own TDFs, TDFs they have access to, public TDFs, and all TDFs with experimentTarget
    if (await Roles.userIsInRoleAsync(this.userId, ['teacher'])) {
        return Tdfs.find({
            $or: [
                { ownerId: this.userId },
                { 'accessors.userId': this.userId },
                { 'content.tdfs.tutor.setspec.userselect': 'true' },
                { 'content.tdfs.tutor.setspec.experimentTarget': { $exists: true, $ne: null } }
            ]
        }, { fields: TDF_LISTING_FIELDS });
    }

    // Students can see:
    // 1. TDFs with userselect='true' (self-selectable)
    // 2. TDFs they have practiced (have history for) - for progress reporting
    const historicalTdfIds = (await Histories.find(
        { userId: this.userId },
        { fields: { TDFId: 1 } }
    ).fetchAsync()).map((h: any) => h.TDFId);

    const uniqueHistoricalTdfIds = [...new Set(historicalTdfIds)];
    const user = await (Meteor.users as any).findOneAsync(
        { _id: this.userId },
        { fields: { accessedTDFs: 1 } }
    );
    const accessedTdfIds = normalizeIdList(user?.accessedTDFs || []);

    return Tdfs.find({
        $or: [
            { ownerId: this.userId },
            { 'accessors.userId': this.userId },
            { 'content.tdfs.tutor.setspec.userselect': 'true' },
            { _id: { $in: uniqueHistoricalTdfIds } },
            { _id: { $in: accessedTdfIds } }
        ]
    }, { fields: TDF_LISTING_FIELDS });
});

// ===== DASHBOARD TDF LISTING =====
// Like allTdfsListing, but only shows condition TDFs when their parent is accessible.
Meteor.publish('dashboardTdfsListing', async function() {
    if (!this.userId) {
        return this.ready();
    }

    const [allDocs, assignedRootIds] = await Promise.all([
        Tdfs.find(
            {},
            {
                fields: {
                    _id: 1,
                    ownerId: 1,
                    accessors: 1,
                    'content.tdfs.tutor.setspec.userselect': 1
                }
            }
        ).fetchAsync(),
        resolveAssignedRootTdfIdsForUser(this.userId)
    ]);

    const assignedRootIdSet = new Set(assignedRootIds);
    const visibleIds = allDocs
        .filter((tdf: any) =>
        canViewDashboardTdf(this.userId, tdf) || assignedRootIdSet.has(String(tdf?._id || ''))
    )
        .map((tdf: any) => String(tdf?._id || ''))
        .filter((id: string) => id.length > 0);
    if (visibleIds.length === 0) {
        return this.ready();
    }
    return Tdfs.find({ _id: { $in: visibleIds } }, { fields: TDF_LISTING_FIELDS });
});

Meteor.publish('tdfForContentUploadDetails', async function(tdfId: any) {
    if (!this.userId || !tdfId || typeof tdfId !== 'string') {
        return this.ready();
    }
    const tdf = await Tdfs.findOneAsync(
        { _id: tdfId },
        { fields: { ownerId: 1, accessors: 1 } }
    );
    if (!tdf || !(isTdfOwner(this.userId, tdf) || hasSharedTdfAccess(this.userId, tdf))) {
        return this.ready();
    }
    return Tdfs.find({ _id: tdfId }, { fields: TDF_CONTENT_UPLOAD_DETAIL_FIELDS });
});

Meteor.publish('contentUploadOwners', async function(ownerIds: any[] = []) {
    if (!this.userId || !Array.isArray(ownerIds) || ownerIds.length === 0) {
        return this.ready();
    }

    const requestedIds = ownerIds.filter((id: any) => typeof id === 'string');
    if (requestedIds.length === 0) {
        return this.ready();
    }

    const allowedOwnerIds = (await Tdfs.find(
        {
            ownerId: this.userId
        },
        { fields: { ownerId: 1 } }
    ).fetchAsync())
        .map((tdf: any) => tdf.ownerId)
        .filter((id: any) => typeof id === 'string' && id.length > 0) as string[];

    const uniqueOwnerIds = [...new Set(allowedOwnerIds)];
    if (uniqueOwnerIds.length === 0) {
        return this.ready();
    }

    return Meteor.users.find(
        { _id: { $in: uniqueOwnerIds } },
        { fields: { username: 1, profile: 1 } }
    );
});

// ===== FULL TDF PUBLICATION =====
// For pages that need full TDF content (card, experiment, etc.)
Meteor.publish('allTdfs', async function() {
    // Security: Filter TDFs based on user role and access permissions
    if (!this.userId) {
        return this.ready(); // No data for unauthenticated users
    }

    // Admins can see all TDFs
    if (await Roles.userIsInRoleAsync(this.userId, ['admin'])) {
        return Tdfs.find();
    }

    // Teachers can see their own TDFs, TDFs they have access to, public TDFs, and all TDFs with experimentTarget
    if (await Roles.userIsInRoleAsync(this.userId, ['teacher'])) {
        return Tdfs.find({
            $or: [
                { ownerId: this.userId },
                { 'accessors.userId': this.userId },
                { 'content.tdfs.tutor.setspec.userselect': 'true' },
                { 'content.tdfs.tutor.setspec.experimentTarget': { $exists: true, $ne: null } }
            ]
        });
    }

    // Students can see:
    // 1. TDFs with userselect='true' (self-selectable)
    // 2. TDFs they have practiced (have history for) - for progress reporting

    // Get TDF IDs the student has history for
    const historicalTdfIds = (await Histories.find(
        { userId: this.userId },
        { fields: { TDFId: 1 } }
    ).fetchAsync()).map((h: any) => h.TDFId);

    // Get unique TDF IDs
    const uniqueHistoricalTdfIds = [...new Set(historicalTdfIds)];

    return Tdfs.find({
        $or: [
            { ownerId: this.userId },
            { 'accessors.userId': this.userId },
            { 'content.tdfs.tutor.setspec.userselect': 'true' },
            { _id: { $in: uniqueHistoricalTdfIds } }
        ]
    });
});

Meteor.publish('ownedTdfs', async function(ownerId: any) {
    // Security: Only allow users to query their own TDFs or if they're admin
    if (!this.userId) {
        return this.ready();
    }

    // Users can only query their own TDFs unless they're admin
    // METEOR 3 FIX: await the async Roles.userIsInRoleAsync() call
    if (ownerId !== this.userId && !(await Roles.userIsInRoleAsync(this.userId, ['admin']))) {
        return this.ready(); // Return empty result
    }

    return Tdfs.find({'ownerId': ownerId});
});

Meteor.publish('tdfByExperimentTarget', async function(experimentTarget: any, experimentConditions: any = undefined) {
    // Security: Require authentication
    if (!this.userId) {
        return this.ready();
    }

    const normalizedTarget = typeof experimentTarget === 'string'
        ? experimentTarget.trim().toLowerCase()
        : '';
    if (!normalizedTarget) {
        return this.ready();
    }

    const targetQuery = { "content.tdfs.tutor.setspec.experimentTarget": normalizedTarget };
    let query: any = targetQuery;
    if (experimentConditions && Array.isArray(experimentConditions) && experimentConditions.length > 0) {
        const normalizedConditions = normalizeIdList(experimentConditions);
        query = normalizedConditions.length
            ? { $or: [{ "content.fileName": { $in: normalizedConditions } }, targetQuery] }
            : targetQuery;
    }

    // Security: Filter results based on user role and permissions
    if (await Roles.userIsInRoleAsync(this.userId, ['admin'])) {
        return Tdfs.find(query);
    }

    if (await Roles.userIsInRoleAsync(this.userId, ['teacher'])) {
        // Teachers can see their own TDFs, TDFs they have access to, and public TDFs
        return Tdfs.find({
            $and: [
                query,
                {
                    $or: [
                        { ownerId: this.userId },
                        { 'accessors.userId': this.userId },
                        { 'content.tdfs.tutor.setspec.userselect': 'true' }
                    ]
                }
            ]
        });
    }

    // Students: resolve canonical root+condition ids and verify participant access to target.
    const rootTdf = await Tdfs.findOneAsync(
        targetQuery,
        { fields: { _id: 1, 'content.tdfs.tutor.setspec.condition': 1 } }
    );
    if (!rootTdf?._id) {
        return this.ready();
    }

    const conditionRefs = Array.isArray(rootTdf?.content?.tdfs?.tutor?.setspec?.condition)
        ? rootTdf.content.tdfs.tutor.setspec.condition
        : [];
    const normalizedConditionRefs = normalizeIdList(conditionRefs);
    const conditionDocs = normalizedConditionRefs.length > 0
        ? await Tdfs.find(
            {
                $or: [
                    { _id: { $in: normalizedConditionRefs } },
                    { 'content.fileName': { $in: normalizedConditionRefs } }
                ]
            },
            { fields: { _id: 1 } }
        ).fetchAsync()
        : [];
    const allowedIds = Array.from(new Set<string>([
        String(rootTdf._id),
        ...conditionDocs.map((doc: any) => String(doc._id)),
    ]));

    const user = await (Meteor.users as any).findOneAsync(
        this.userId,
        { fields: { accessedTDFs: 1, profile: 1 } }
    );
    const accessedTDFs = normalizeIdList(user?.accessedTDFs || []);
    const profileTarget = typeof user?.profile?.experimentTarget === 'string'
        ? user.profile.experimentTarget.trim().toLowerCase()
        : '';
    const hasParticipantTargetAccess = profileTarget === normalizedTarget || accessedTDFs.includes(String(rootTdf._id));
    if (!hasParticipantTargetAccess) {
        return this.ready();
    }

    return Tdfs.find({
        $and: [
            query,
            { _id: { $in: allowedIds } }
        ]
    });
});

Meteor.publish('Assignments', async function(courseId: any) {
    // Security: Require authentication to access course assignments
    if (!this.userId) {
        return this.ready();
    }

    if (typeof courseId !== 'string' || !courseId.trim()) {
        return this.ready();
    }

    // Verify user has access to this course
    const course = await Courses.findOneAsync({ _id: courseId });
    if (!course) {
        return this.ready();
    }

    // Check if user is teacher of this course, enrolled student, or admin
    const isTeacherForCourse = String((course as any).teacherUserId || '') === this.userId;
    const isAdmin = await Roles.userIsInRoleAsync(this.userId, ['admin']);
    let isEnrolledStudent = false;
    if (!isAdmin && !isTeacherForCourse) {
        const sectionIds = (await Sections.find(
            { courseId },
            { fields: { _id: 1 } }
        ).fetchAsync()).map((section: any) => section._id);
        if (sectionIds.length > 0) {
            const enrollment = await SectionUserMap.findOneAsync({
                sectionId: { $in: sectionIds },
                userId: this.userId
            });
            isEnrolledStudent = !!enrollment;
        }
    }

    if (!isTeacherForCourse && !isEnrolledStudent && !isAdmin) {
        return this.ready();
    }

    return Assignments.find({courseId: courseId});
});

Meteor.publish('settings', async function() {
    // Security: Only admins should see system settings
    // METEOR 3 FIX: await the async Roles.userIsInRoleAsync() call
    if (!this.userId || !(await Roles.userIsInRoleAsync(this.userId, ['admin']))) {
        return this.ready();
    }
    return DynamicSettings.find();
});

Meteor.publish('clientRuntimeSettings', function() {
    if (!this.userId) {
        return this.ready();
    }

    return DynamicSettings.find(
        { key: 'clientVerbosityLevel' },
        { fields: { key: 1, value: 1 } }
    );
});

// Publish user's audio settings
Meteor.publish('userAudioSettings', async function() {
    if (!this.userId) {
        return this.ready();
    }

    const user = await (Meteor.users as any).findOneAsync({ _id: this.userId }, { fields: { audioSettings: 1, audioPromptMode: 1, audioInputMode: 1 } });

    if (!user.audioSettings) {
        const DEFAULT_AUDIO_SETTINGS = {
            audioPromptMode: 'silent',
            audioPromptQuestionVolume: 0,
            audioPromptQuestionSpeakingRate: 1,
            audioPromptVoice: 'en-US-Standard-A',
            audioPromptFeedbackVolume: 0,
            audioPromptFeedbackSpeakingRate: 1,
            audioPromptFeedbackVoice: 'en-US-Standard-A',
            audioInputMode: false,
            audioInputSensitivity: 60,
        };

        const initialSettings = {
            ...DEFAULT_AUDIO_SETTINGS,
            audioPromptMode: user.audioPromptMode || DEFAULT_AUDIO_SETTINGS.audioPromptMode,
            audioInputMode: user.audioInputMode || DEFAULT_AUDIO_SETTINGS.audioInputMode,
        };

        // Save initialized settings
        await (Meteor.users as any).updateAsync(
            { _id: this.userId },
            { $set: { audioSettings: initialSettings } }
        );
    }

    // IMPORTANT: Include roles and preferences fields to prevent flash/issues
    // When this subscription merges with client minimongo, it needs to preserve
    // essential fields like roles and preferences, otherwise helpers will temporarily fail
    return Meteor.users.find(
        { _id: this.userId },
        {
            fields: {
                audioSettings: 1,
                preferences: 1,
                lastSessionId: 1,
                lastSessionIdTimestamp: 1
            }
        }
    );
});
