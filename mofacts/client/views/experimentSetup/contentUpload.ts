import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './contentUpload.html';
import './contentUpload.css';
import { meteorCallAsync, clientConsole } from '../..';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveDict } from 'meteor/reactive-dict';
import { currentUserHasRole } from '../../lib/roleUtils';
import { buildStimuliFromNormalizedItems, buildTutorFromNormalizedItems, getImportFileNames } from '../../lib/importCompositionBuilder';
import type { NormalizedImportItem } from '../../lib/normalizedImportTypes';
import './apkgWizard';
import './imsccWizard';
export {doFileUpload};

const FlowRouter = (globalThis as any).FlowRouter;
const MeteorAny = Meteor as any;
const TdfsCollection = (globalThis as any).Tdfs;
const DynamicAssetsCollection = (globalThis as any).DynamicAssets;

declare global {
  interface Window {
    initSqlJs?: any;
  }
}


// Throttle assets helper to prevent reactive loops during processPackageUpload
let assetsHelperLastRun = 0;
let assetsHelperCachedResult: any[] = [];
let lastPendingSnapshot: any = null;
let lastAssetsHelperStateLog = '';
const ASSETS_HELPER_THROTTLE = 1000; // 1 second
let lastSessionAssetsRefresh: any = null;
const CONTENT_UPLOAD_LIST_LIMIT = 50;
const DEBUG_SKIP_PACKAGE_PROCESSING = false;
const SUMMARY_FETCH_THROTTLE = 1500;

type ManualDraftSummary = {
  _id: string;
  lessonName: string;
  currentStep: number;
  stepLabel: string;
  status: string;
  promptType?: string | null;
  responseType?: string | null;
  updatedAt?: Date | string | null;
};

function formatManualDraftTimestamp(value: unknown) {
  if (!value) return '';
  const dateValue = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(dateValue.getTime())) {
    return '';
  }
  return dateValue.toLocaleString();
}

function fetchManualContentDrafts(template: any) {
  template.manualDraftsLoading.set(true);
  template.manualDraftsError.set(null);

  MeteorAny.callAsync('listManualContentDrafts')
    .then((drafts: ManualDraftSummary[]) => {
      template.manualDrafts.set(Array.isArray(drafts) ? drafts : []);
      template.manualDraftsLoading.set(false);
    })
    .catch((error: unknown) => {
      clientConsole(1, '[MANUAL DRAFTS] Failed to load drafts:', error);
      template.manualDrafts.set([]);
      template.manualDraftsError.set(error instanceof Error ? error.message : String(error));
      template.manualDraftsLoading.set(false);
    });
}

// Reactive trigger for forcing UI refresh after deletions
const assetsRefreshTrigger = new ReactiveVar(0);
const assetRowRefreshTrigger = new ReactiveVar(0);
const pendingPackageDeletes = new ReactiveDict();
const ACCESS_MESSAGE_TIMEOUT_MS = 6000;
const CDN_ASSET_REF_REGEX = /^\/?cdn\/storage\/Assets\/([^/]+)\/original\/([^/?#]+)$/i;
const DYNAMIC_ASSET_REF_REGEX = /^\/?dynamic-assets\/([A-Za-z0-9_-]+)(?:\/|$)/i;

function parseMediaAssetReference(reference: unknown) {
  const raw = typeof reference === 'string' ? reference.trim() : '';
  if (!raw) {
    return { raw: '', fileName: '', assetId: '', isExternal: false };
  }
  if (/^(?:https?:|data:|blob:|\/\/|#)/i.test(raw)) {
    return { raw, fileName: '', assetId: '', isExternal: true };
  }

  const normalized = decodeURIComponent(raw.split('?')[0]?.split('#')[0] || raw);
  const cdnMatch = normalized.match(CDN_ASSET_REF_REGEX);
  const dynamicMatch = normalized.match(DYNAMIC_ASSET_REF_REGEX);
  const fileName = decodeURIComponent(cdnMatch?.[2] || normalized.split('/').pop() || '');
  const assetId = cdnMatch?.[1] || dynamicMatch?.[1] || '';

  return { raw: normalized, fileName, assetId, isExternal: false };
}

function mediaReferenceExistsInAssets(reference: unknown, assetNameSet: Set<string>, assetIdSet: Set<string>) {
  const parsed = parseMediaAssetReference(reference);
  if (!parsed.raw || parsed.isExternal) {
    return true;
  }
  if (parsed.assetId) {
    return assetIdSet.has(parsed.assetId);
  }
  if (parsed.fileName) {
    return assetNameSet.has(parsed.fileName);
  }
  return false;
}

function buildAccessMessageClass(level: any) {
  if (level === 'success') return 'alert-success';
  if (level === 'warning') return 'alert-warning';
  if (level === 'error') return 'alert-danger';
  return 'alert-info';
}

function setAccessMessage(template: any, tdfId: any, text: any, level: any = 'info') {
  if (!template?.accessMessages || !tdfId) {
    return;
  }
  const current = template.accessMessages.get() || {};
  const next = { ...current };
  next[tdfId] = {
    text,
    level,
    className: buildAccessMessageClass(level)
  };
  template.accessMessages.set(next);
  assetsHelperLastRun = 0;
  assetsHelperCachedResult = [];

  Meteor.setTimeout(() => {
    const latest = template.accessMessages.get() || {};
    if (!latest[tdfId] || latest[tdfId].text !== text) {
      return;
    }
    const cleaned = { ...latest };
    delete cleaned[tdfId];
    template.accessMessages.set(cleaned);
    assetsHelperLastRun = 0;
    assetsHelperCachedResult = [];
  }, ACCESS_MESSAGE_TIMEOUT_MS);
}

async function addAccessorsForTdf(template: any, tdfId: any) {
  const tdf = TdfsCollection.findOne({ _id: tdfId });
  let currentAccessors = Array.isArray(tdf?.accessors) ? tdf.accessors : null;
  if (!currentAccessors) {
    template?.ensureTdfDetails?.(tdfId);
    try {
      currentAccessors = await MeteorAny.callAsync('getAccessorsTDFID', tdfId);
    } catch (error: any) {
      clientConsole(1, '[ACCESS] Failed to fetch current accessors:', error);
      setAccessMessage(template, tdfId, 'Access list is still loading. Please try again.', 'warning');
      return;
    }
  }

  const rawInput = String($("#add-access-" + tdfId).val() || "");
  const usernames = rawInput.split(',')
    .map(name => name.trim())
    .filter(Boolean);

  if (usernames.length === 0) {
    setAccessMessage(template, tdfId, 'Enter at least one user email.', 'warning');
    return;
  }

  const uniqueUsernames = [...new Set(usernames)];

  try {
    const lookup = await MeteorAny.callAsync('resolveUsersForTdf', tdfId, uniqueUsernames);
    if (lookup.missing && lookup.missing.length > 0) {
      setAccessMessage(template, tdfId, 'User not found: ' + lookup.missing.join(', '), 'error');
      return;
    }

    const newAccessors = lookup.users.map((user: any) => ({
      userId: user._id,
      username: user.displayIdentifier || user.username
    }));

    const existingById = new Set(currentAccessors.map((accessor: any) => accessor.userId));
    const mergedAccessors = [...currentAccessors];
    for (const accessor of newAccessors) {
      if (!existingById.has(accessor.userId)) {
        mergedAccessors.push(accessor);
      }
    }

    await MeteorAny.callAsync('assignAccessors', tdfId, mergedAccessors, []);
    $('#add-access-' + tdfId).val('');
    const addedCount = Math.max(mergedAccessors.length - currentAccessors.length, 0);
    setAccessMessage(
      template,
      tdfId,
      addedCount > 0 ? `Shared with ${addedCount} user${addedCount === 1 ? '' : 's'}.` : 'No new users were added.',
      'success'
    );
    assetsHelperLastRun = 0;
    assetsHelperCachedResult = [];
    assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
  } catch (error: any) {
    clientConsole(1, '[ACCESS] Add access failed:', error);
    setAccessMessage(template, tdfId, 'Error adding access: ' + (error.reason || error.message), 'error');
  }
}

// Global helper for equality comparison in Blaze templates
Template.registerHelper('equals', function(a: any, b: any) {
  return a === b;
});

Template.contentUpload.helpers({
  TdfFiles: function(this: any) {
    return TdfsCollection.find();
  },
  currentUpload() {
    return (Template.instance() as any).currentUpload.get();
  },
  quotaStatus() {
    return (Template.instance() as any).quotaStatus.get();
  },
  manualDrafts() {
    const template = Template.instance() as any;
    const drafts = template.manualDrafts ? template.manualDrafts.get() : [];
    return (Array.isArray(drafts) ? drafts : []).map((draft: ManualDraftSummary) => ({
      ...draft,
      updatedAtLabel: formatManualDraftTimestamp(draft.updatedAt)
    }));
  },
  manualDraftsLoading() {
    const template = Template.instance() as any;
    return template.manualDraftsLoading ? template.manualDraftsLoading.get() : false;
  },
  manualDraftsError() {
    const template = Template.instance() as any;
    return template.manualDraftsError ? template.manualDraftsError.get() : null;
  },
  hasManualDrafts() {
    const template = Template.instance() as any;
    const drafts = template.manualDrafts ? template.manualDrafts.get() : [];
    return Array.isArray(drafts) && drafts.length > 0;
  },
  manualDraftToggleAttrs() {
    const template = Template.instance() as any;
    const drafts = template.manualDrafts ? template.manualDrafts.get() : [];
    const hasDrafts = Array.isArray(drafts) && drafts.length > 0;
    return hasDrafts ? {} : { disabled: true };
  },
  manualDraftCount() {
    const template = Template.instance() as any;
    const drafts = template.manualDrafts ? template.manualDrafts.get() : [];
    return Array.isArray(drafts) ? drafts.length : 0;
  },
  showManualDrafts() {
    const template = Template.instance() as any;
    return template.showManualDrafts ? template.showManualDrafts.get() : false;
  },
  assets: function(this: any) {
    try {
      const template = (Template.instance() as any);
      const summaryMap = template.summaryMap ? template.summaryMap.get() : {};
      const accessMessages = template.accessMessages ? template.accessMessages.get() : {};
      // Row-level refresh trigger (panel open/close/subscription attach) without
      // forcing list/summaries to refetch from the server.
      assetRowRefreshTrigger.get();
      const sessionRefresh = Session.get('assetsRefreshTrigger');
      if (sessionRefresh !== lastSessionAssetsRefresh) {
        lastSessionAssetsRefresh = sessionRefresh;
        assetsHelperLastRun = 0;
        assetsHelperCachedResult = [];
      }

      // Depend on refresh trigger to force re-run after deletions
      assetsRefreshTrigger.get();

      const listIds = template.listIds ? template.listIds.get() : [];
      const listLoading = template.listLoading ? template.listLoading.get() : false;
      const pendingUploadsSnapshot = template.pendingUploads ? template.pendingUploads.all() : {};
      const pendingKeysSnapshot = Object.keys(pendingUploadsSnapshot || {});
      if (pendingKeysSnapshot.length > 0 && template.pendingUploadTick) {
        template.pendingUploadTick.get();
      }
      const pendingSnapshot = pendingKeysSnapshot
        .map(key => {
          const entry = pendingUploadsSnapshot[key];
          const progress = entry?.progress ?? 0;
          return entry ? `${key}:${entry.status || ''}:${Math.floor(progress)}` : `${key}:`;
        })
        .join('|');
      const pendingSnapshotChanged = pendingSnapshot !== lastPendingSnapshot;
      if (pendingSnapshotChanged) {
        lastPendingSnapshot = pendingSnapshot;
      }
      const hasLiveRowSubs =
        (template.detailSubs && template.detailSubs.size > 0) ||
        (template.assetSubs && template.assetSubs.size > 0);

      // Throttle: Don't run more than once per second
      const now = Date.now();
      // Never throttle while row-level subscriptions are active, otherwise
      // readiness changes can be missed and "Loading..." labels may stick.
      if (now - assetsHelperLastRun < ASSETS_HELPER_THROTTLE && !pendingSnapshotChanged && !hasLiveRowSubs) {
        return assetsHelperCachedResult;
      }
      assetsHelperLastRun = now;

      const listReady = !listLoading || (Array.isArray(listIds) && listIds.length > 0);
      const allTDfs = listReady ? listIds : [];
      const stateLog = `ready=${listReady}|count=${allTDfs.length}|loading=${listLoading}|pendingChanged=${pendingSnapshotChanged}|liveSubs=${hasLiveRowSubs}`;
      if (stateLog !== lastAssetsHelperStateLog) {
        clientConsole(2, '[ASSETS HELPER] state:', stateLog);
        lastAssetsHelperStateLog = stateLog;
      }

      const pendingDeleteEntries = pendingPackageDeletes
        ? (Object.values(pendingPackageDeletes.all()).filter(Boolean) as any[])
        : [];
      const pendingDeletePackageIds = new Set();
      const pendingDeleteAssetIds = new Set();
      const pendingDeleteFileNames = new Set();
      for (const entry of pendingDeleteEntries) {
        if (entry.packageId) pendingDeletePackageIds.add(entry.packageId);
        if (entry.assetId) pendingDeleteAssetIds.add(entry.assetId);
        if (entry.fileName) pendingDeleteFileNames.add(entry.fileName);
      }

      // Build indexes for conditions and API key flags from summaries
      const conditionTargets = new Set();
      for (const summary of (Object.values(summaryMap as Record<string, any>) as any[])) {
        if (Array.isArray(summary?.conditions)) {
          summary.conditions.forEach((c: any) => conditionTargets.add(c.condition));
        }
      }

      const tdfSummaries = [];
      if (listReady) {
        for (const tdfId of allTDfs) {
          try {
            if (!tdfId) {
              clientConsole(1, '[ASSETS] Missing TDF id in list');
              continue;
            }

            const thisTdf: any = {};
            const summary = summaryMap?.[tdfId];
            thisTdf.lessonName = summary?.lessonName || 'Loading...';
            thisTdf.packageFile = summary?.packageFile || null;
            thisTdf.packageAssetId = summary?.packageAssetId || null;
            thisTdf._id = tdfId;
            thisTdf.stimuliSetId = summary?.stimuliSetId || null;
            thisTdf.errors = [];
            thisTdf.stimFileInfo = [];
            thisTdf.stimFilesCount = null;
            thisTdf.fileName = summary?.fileName || 'unknown.xml';

            thisTdf.isOwnTdf = summary?.ownerId === Meteor.userId();
            thisTdf.isPublic = summary?.isPublic ?? false;
            thisTdf.checkedIfPublic = thisTdf.isPublic ? 'checked' : null;
            thisTdf.publicPrivateLabel = thisTdf.isPublic ? 'Public' : 'Private';
            thisTdf.summaryLoading = !summary;
            thisTdf.accessMessageText = accessMessages?.[tdfId]?.text || null;
            thisTdf.accessMessageClass = accessMessages?.[tdfId]?.className || 'alert-info';

            const packageFileName = thisTdf.packageFile ? thisTdf.packageFile.split('/').pop() : null;
            const isPendingDelete = pendingDeletePackageIds.has(thisTdf.packageAssetId) ||
              (packageFileName && pendingDeleteFileNames.has(packageFileName)) ||
              (thisTdf.packageAssetId && pendingDeleteAssetIds.has(thisTdf.packageAssetId));
            if (isPendingDelete) {
              continue;
            }

            if (thisTdf.packageFile && !thisTdf.packageAssetId) {
              thisTdf.errors.push('Package asset ID is missing from stored metadata. Rebuild or re-upload this package before managing it.');
            }
            const isConditionalTarget = summary
              ? (conditionTargets.has(thisTdf.fileName) || conditionTargets.has(tdfId))
              : false;
            if (isConditionalTarget) {
              continue;
            }

            if (summary?.errors?.length) {
              summary.errors.forEach((err: any) => thisTdf.errors.push(err));
            }

            if (Array.isArray(summary?.conditions) && summary.conditions.length > 0) {
              thisTdf.conditions = summary.conditions;
            }

            const detailSub = template.detailSubs ? template.detailSubs.get(tdfId) : null;
            const detailDoc = TdfsCollection.findOne({ _id: tdfId });
            const detailsReady = detailSub ? detailSub.ready() : !!detailDoc;
            thisTdf.detailsReady = !!detailsReady;
            if (Array.isArray(detailDoc?.accessors)) {
              thisTdf.accessors = detailDoc.accessors;
              thisTdf.accessorsCount = detailDoc.accessors.length;
            } else {
              thisTdf.accessors = [];
              thisTdf.accessorsCount = 0;
            }

            if (detailsReady && Array.isArray(detailDoc?.stimuli)) {
              thisTdf.stimuliCount = detailDoc.stimuli.length;

              const stimFileInfo = [];
              const seenStimSetIds = new Set();
              for (const stim of detailDoc.stimuli) {
                if (stim?.stimuliSetId && !seenStimSetIds.has(stim.stimuliSetId)) {
                  seenStimSetIds.add(stim.stimuliSetId);
                  stimFileInfo.push({
                    stimuliSetId: stim.stimuliSetId,
                    fileName: stim.stimulusFileName
                  });
                }
              }
              thisTdf.stimFileInfo = stimFileInfo;
              thisTdf.stimFilesCount = stimFileInfo.length;
            } else {
              thisTdf.stimuliCount = null;
            }

            const assetSub = template.assetSubs ? template.assetSubs.get(tdfId) : null;
            const assetsReady = assetSub ? assetSub.ready() : false;
            thisTdf.assetsReady = !!assetsReady;
            thisTdf.assets = [];
            thisTdf.assetsCount = null;

            if (assetsReady && thisTdf.stimuliSetId) {
              const assetDocs = DynamicAssetsCollection.find({ 'meta.stimuliSetId': thisTdf.stimuliSetId }).fetch();
              thisTdf.assets = assetDocs.map((asset: any) => {
                const name = asset.name || '';
                const lowerName = name.toLowerCase();
                let fileType = 'unknown';
                if (/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/.test(lowerName)) {
                  fileType = 'image';
                } else if (/\.(mp3|wav|ogg|m4a|aac)$/.test(lowerName)) {
                  fileType = 'audio';
                } else if (/\.(mp4|webm|ogv|avi|mov)$/.test(lowerName)) {
                  fileType = 'video';
                } else if (typeof asset.type === 'string') {
                  if (asset.type.startsWith('image/')) fileType = 'image';
                  if (asset.type.startsWith('audio/')) fileType = 'audio';
                  if (asset.type.startsWith('video/')) fileType = 'video';
                }

                return {
                  filename: name,
                  fileType: fileType,
                  link: DynamicAssetsCollection.link({ ...asset }),
                  _id: asset._id
                };
              });
              thisTdf.assetsCount = thisTdf.assets.length;
            }

            if (detailsReady && assetsReady && Array.isArray(detailDoc?.stimuli)) {
              const assetNameSet: Set<string> = new Set();
              const assetIdSet: Set<string> = new Set();
              for (const asset of thisTdf.assets) {
                if (typeof asset?.filename === 'string' && asset.filename.length > 0) {
                  assetNameSet.add(asset.filename);
                }
                if (typeof asset?._id === 'string' && asset._id.length > 0) {
                  assetIdSet.add(asset._id);
                }
              }
              for (const stim of detailDoc.stimuli) {
                const mediaRefs = [stim.imageStimulus, stim.audioStimulus, stim.videoStimulus];
                for (const mediaRef of mediaRefs) {
                  if (typeof mediaRef !== 'string' || !mediaRef.trim()) {
                    continue;
                  }
                  if (!mediaReferenceExistsInAssets(mediaRef, assetNameSet, assetIdSet)) {
                    thisTdf.errors.push(`${mediaRef} not found. This will cause errors in the lesson.<br>`);
                  }
                }
              }
            }

            tdfSummaries.push(thisTdf);
          } catch (tdfError) {
            clientConsole(1, '[ASSETS] Error processing TDF:', tdfId, tdfError);
          }
        }
      }

      const pendingEntries = [];
      const pendingKeys = pendingKeysSnapshot;

      for (const uploadId of pendingKeys) {
        const pending = pendingUploadsSnapshot[uploadId];
        if (!pending) continue;

        const lessonNameFromZip = pending.lessonName || pending.fileName.replace(/\.zip$/i, '');
        const pendingPackageAssetId = pending.packageAssetId || pending.serverAssetId || null;
        const pendingStimuliSetId = pending.stimuliSetId;
        const realTdfExists = tdfSummaries.some(t =>
          t.lessonName === lessonNameFromZip ||
          t.fileName === pending.fileName ||
          (t.packageAssetId && pendingPackageAssetId && t.packageAssetId === pendingPackageAssetId) ||
          (
            pendingStimuliSetId !== undefined &&
            pendingStimuliSetId !== null &&
            t.stimuliSetId !== undefined &&
            t.stimuliSetId !== null &&
            String(t.stimuliSetId) === String(pendingStimuliSetId)
          )
        );

        if (realTdfExists) {
          template.pendingUploads.set(uploadId, undefined);
          continue;
        }

        pendingEntries.push({
          _id: `pending-${uploadId}`,
          lessonName: pending.lessonName,
          fileName: pending.fileName,
          stimuliCount: '...',
          accessors: [],
          accessorsCount: 0,
          packageFile: null,
          assets: [],
          errors: pending.error ? [pending.error] : [],
          stimFileInfo: [],
          stimFilesCount: 0,
          isOwnTdf: true,
          isPublic: false,
          checkedIfPublic: null,
          publicPrivateLabel: 'Private',
          conditions: null,
          packageAssetId: pendingPackageAssetId,
          packageFileLink: null,
          detailsReady: false,
          assetsReady: false,

          isPending: true,
          pendingStatus: pending.status,
          pendingProgress: pending.progress,
          pendingError: pending.error
        });
      }

      const merged = [...pendingEntries, ...tdfSummaries];

      assetsHelperCachedResult = merged;
      return merged;
    } catch (error: any) {
      clientConsole(1, '[ASSETS] Error in assets helper:', error);
      return assetsHelperCachedResult;
    }
  },
  'packagesUploaded': function(this: any) {
    const packages = DynamicAssetsCollection.find({userId: Meteor.userId()}).fetch();
    //get a link for each package
    packages.forEach(function(thispackage: any){
      thispackage.link = DynamicAssetsCollection.link({...thispackage});
    });
    
    return packages;
  },
  listReady() {
    const template = (Template.instance() as any);
    return template.listLoading ? !template.listLoading.get() : false;
  },
  listDisplayReady() {
    const template = (Template.instance() as any);
    return template.listDisplayReady ? template.listDisplayReady.get() : false;
  },
  overlayVisible() {
    const template = (Template.instance() as any);
    return template.overlayVisible ? template.overlayVisible.get() : false;
  },
  initialPaintDone() {
    const template = (Template.instance() as any);
    return template.initialPaintDone ? template.initialPaintDone.get() : false;
  },
  showEmptyState() {
    const template = (Template.instance() as any);
    if (!template || (template.listLoading && template.listLoading.get())) {
      return false;
    }
    const ids = template.listIds ? template.listIds.get() : [];
    const hasIds = Array.isArray(ids) && ids.length > 0;
    const pendingUploads = template.pendingUploads ? template.pendingUploads.all() : {};
    const hasPending = Object.values(pendingUploads || {}).some(Boolean);
    return !hasIds && !hasPending;
  },
  canLoadMore() {
    const template = (Template.instance() as any);
    if (!template.listLoading || template.listLoading.get()) {
      return false;
    }
    const hasMore = template.listHasMore ? template.listHasMore.get() : null;
    if (typeof hasMore === 'boolean') {
      return hasMore;
    }
    const count = template.listIds ? template.listIds.get().length : 0;
    const total = template.listTotalCount ? template.listTotalCount.get() : 0;
    return total > count;
  },
  'showDeleteAllButton': function(this: any){
    // Only show delete all button if user is admin AND setting is enabled
    const isAdmin = currentUserHasRole('admin');
    const settingEnabled = Meteor.settings.public.enableDeleteAllButton || false;
    return isAdmin && settingEnabled;
  },
  disabledAttr(isEnabled: any) {
    return isEnabled ? null : { disabled: true };
  },
  selectorDataAttr(conditions: any) {
    return conditions ? { 'data-has-selector': 'true' } : null;
  }
});

  Template.contentUpload.onCreated(function(this: any) {
    this.currentUpload = new ReactiveVar(false);
    this.curFilesToUpload = new ReactiveVar([]);
    this.quotaStatus = new ReactiveVar({ unlimited: true }); // Default to unlimited until loaded
    this.pendingUploads = new ReactiveDict(); // Track pending package uploads
    this.autoruns = [];
    this.detailSubs = new Map();
    this.assetSubs = new Map();
  this.listIds = new ReactiveVar([]);
  this.listTotalCount = new ReactiveVar(0);
  this.listHasMore = new ReactiveVar(false);
  this.listLoading = new ReactiveVar(false);
  this.listError = new ReactiveVar(null);
  this.lastListFetchKey = null;
  this.lastListFetch = 0;
  this.summaryMap = new ReactiveVar({});
  this.summaryLoading = new ReactiveVar(false);
  this.summaryFetchKey = null;
    this.lastSummaryFetch = 0;
    this.listLimit = new ReactiveVar(CONTENT_UPLOAD_LIST_LIMIT);
    this.lastDdpStatus = null;
    this.accessMessages = new ReactiveVar({});
  this.manualDrafts = new ReactiveVar([]);
  this.manualDraftsLoading = new ReactiveVar(false);
  this.manualDraftsError = new ReactiveVar(null);
  this.showManualDrafts = new ReactiveVar(false);
  this.initialPaintDone = new ReactiveVar(false);
  this.listDisplayReady = new ReactiveVar(false);
  this.overlayVisible = new ReactiveVar(false);
  this.overlayTimer = null;
  this.pendingUploadTick = new ReactiveVar(0);
  this.pendingUploadTickInterval = null;

  this.ensureTdfDetails = (tdfId: any) => {
    if (!tdfId) {
      clientConsole(1, '[CONTENT UPLOAD] Missing TDF ID for detail subscription.');
      return;
    }
    if (this.detailSubs.has(tdfId)) {
      return;
    }
    const sub = this.subscribe('tdfForContentUploadDetails', tdfId);
    this.detailSubs.set(tdfId, sub);
    assetsHelperLastRun = 0;
    assetsHelperCachedResult = [];
    assetRowRefreshTrigger.set(assetRowRefreshTrigger.get() + 1);
  };

  this.ensureAssetsSubscription = (tdfId: any, stimSetId: any) => {
    if (!tdfId) {
      clientConsole(1, '[CONTENT UPLOAD] Missing TDF ID for asset subscription.');
      return;
    }
    if (!stimSetId) {
      clientConsole(1, '[CONTENT UPLOAD] Missing stimuliSetId for asset subscription.', tdfId);
      return;
    }
    if (this.assetSubs.has(tdfId)) {
      return;
    }
    const sub = this.subscribe('assets', Meteor.userId(), stimSetId);
    this.assetSubs.set(tdfId, sub);
    assetsHelperLastRun = 0;
    assetsHelperCachedResult = [];
    assetRowRefreshTrigger.set(assetRowRefreshTrigger.get() + 1);
  };

  this.stopAssetsSubscription = (tdfId: any) => {
    const sub = this.assetSubs.get(tdfId);
    if (sub) {
      sub.stop();
      this.assetSubs.delete(tdfId);
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetRowRefreshTrigger.set(assetRowRefreshTrigger.get() + 1);
    }
  };

  this.autoruns.push(this.autorun(() => {
    const limit = this.listLimit.get();
    const refreshToken = assetsRefreshTrigger.get();
    const key = `${limit}-${refreshToken}`;
    const now = Date.now();
    if (this.lastListFetchKey === key && (now - this.lastListFetch) < SUMMARY_FETCH_THROTTLE) {
      return;
    }
    this.lastListFetchKey = key;
    this.lastListFetch = now;

    this.listLoading.set(true);
    this.listError.set(null);
    clientConsole(2, '[CONTENT UPLOAD] Fetching list ids via method', 'limit:', limit);

    MeteorAny.callAsync('getContentUploadListIds', { limit })
      .then((result: any) => {
        const ids = Array.isArray(result?.ids) ? result.ids : [];
        const totalCount = Number.isFinite(result?.totalCount) ? result.totalCount : ids.length;
        const hasMore = typeof result?.hasMore === 'boolean'
          ? result.hasMore
          : totalCount > ids.length;
        this.listIds.set(ids);
        this.listTotalCount.set(totalCount);
        this.listHasMore.set(hasMore);
        this.listLoading.set(false);
        assetsHelperLastRun = 0;
        assetsHelperCachedResult = [];
      })
      .catch((err: any) => {
        this.listIds.set([]);
        this.listTotalCount.set(0);
        this.listHasMore.set(false);
        this.listLoading.set(false);
        this.listError.set(err);
        clientConsole(1, '[CONTENT UPLOAD] List fetch failed:', err);
      });
  }));

  this.autoruns.push(this.autorun(() => {
    const ids = this.listIds.get();
    const refreshToken = assetsRefreshTrigger.get();
    if (!Array.isArray(ids) || ids.length === 0) {
      this.summaryLoading.set(false);
      this.summaryMap.set({});
      return;
    }
    const key = `${ids.slice().sort().join(',')}-${refreshToken}`;
    const now = Date.now();
    if (this.summaryFetchKey === key && (now - this.lastSummaryFetch) < SUMMARY_FETCH_THROTTLE) {
      return;
    }
    this.summaryFetchKey = key;
    this.lastSummaryFetch = now;

    this.summaryLoading.set(true);
    MeteorAny.callAsync('getContentUploadSummariesForIds', ids)
      .then((summaries: any) => {
        const map: Record<string, any> = {};
        summaries.forEach((summary: any) => {
          map[summary._id] = summary;
        });
        this.summaryMap.set(map);
        this.summaryLoading.set(false);
        assetsHelperLastRun = 0;
        assetsHelperCachedResult = [];
      })
      .catch((err: any) => {
        this.summaryLoading.set(false);
        clientConsole(1, '[CONTENT UPLOAD] Summary fetch failed:', err);
      });
  }));

  this.autoruns.push(this.autorun(() => {
    const status = Meteor.status();
    if (status.status !== this.lastDdpStatus) {
      clientConsole(1, '[DDP] status:', status.status, 'connected:', status.connected, 'retryCount:', status.retryCount);
      this.lastDdpStatus = status.status;
    }
  }));

  this.autoruns.push(this.autorun(() => {
    const listLoading = this.listLoading.get();
    const summaryLoading = this.summaryLoading.get();
    this.listDisplayReady.set(!listLoading && !summaryLoading);
  }));

  this.autoruns.push(this.autorun(() => {
    const isReady = this.listDisplayReady.get();
    if (isReady && !this.initialPaintDone.get()) {
      this.initialPaintDone.set(true);
    }
    if (isReady) {
      if (this.overlayTimer) {
        clearTimeout(this.overlayTimer);
        this.overlayTimer = null;
      }
      this.overlayVisible.set(false);
      return;
    }

    if (!this.overlayTimer && !this.overlayVisible.get()) {
      this.overlayTimer = setTimeout(() => {
        this.overlayVisible.set(true);
        this.overlayTimer = null;
      }, 300);
    }
  }));

  this.autoruns.push(this.autorun(() => {
    const pendingUploads = this.pendingUploads.all();
    const hasActivePendingUploads = Object.values(pendingUploads || {}).some((entry: any) => Boolean(entry));

    if (!hasActivePendingUploads) {
      if (this.pendingUploadTickInterval) {
        clearInterval(this.pendingUploadTickInterval);
        this.pendingUploadTickInterval = null;
      }
      return;
    }

    if (!this.pendingUploadTickInterval) {
      this.pendingUploadTickInterval = setInterval(() => {
        this.pendingUploadTick.set(Date.now());
      }, 500);
    }
  }));

  // Load upload quota status
  const self = this;
  MeteorAny.callAsync('getUploadQuotaStatus').then((status: any) => {
    self.quotaStatus.set(status);
  }).catch((err: any) => {
    clientConsole(1, '[QUOTA] Error loading quota status:', err);
  });

  fetchManualContentDrafts(this);

});

Template.contentUpload.onRendered(function(this: any) {
  // Template rendered - log subscription status
  
  
});

Template.contentUpload.onDestroyed(function(this: any) {
  // Clean up autoruns
  this.autoruns.forEach((ar: any) => ar.stop());
  if (this.overlayTimer) {
    clearTimeout(this.overlayTimer);
    this.overlayTimer = null;
  }
  if (this.pendingUploadTickInterval) {
    clearInterval(this.pendingUploadTickInterval);
    this.pendingUploadTickInterval = null;
  }

  if (this.detailSubs) {
    this.detailSubs.forEach((sub: any) => sub.stop());
    this.detailSubs.clear();
  }
  if (this.assetSubs) {
    this.assetSubs.forEach((sub: any) => sub.stop());
    this.assetSubs.clear();
  }

  // Clear pending uploads
  if (this.pendingUploads) {
    this.pendingUploads.clear();
  }
  pendingPackageDeletes.clear();

  // Clear throttle cache to free memory
  assetsHelperCachedResult = [];
});


// //////////////////////////////////////////////////////////////////////////
// Template events

Template.contentUpload.events({
  'click #open-manual-content-creator': function(event: any, _template: any) {
    event.preventDefault();
    FlowRouter.go('/contentCreate');
  },

  'click #toggle-manual-drafts': function(event: any, template: any) {
    event.preventDefault();
    const nextVisible = !(template.showManualDrafts?.get?.() || false);
    template.showManualDrafts.set(nextVisible);
    if (nextVisible) {
      fetchManualContentDrafts(template);
    }
  },

  'click .open-saved-manual-draft': function(event: any, _template: any) {
    event.preventDefault();
    const draftId = String(event.currentTarget.dataset.draftId || '');
    if (!draftId) {
      return;
    }
    FlowRouter.go('/contentCreate', {}, { draftId });
  },

  'click .delete-saved-manual-draft': async function(event: any, template: any) {
    event.preventDefault();
    const draftId = String(event.currentTarget.dataset.draftId || '');
    const lessonName = String(event.currentTarget.dataset.lessonName || 'this draft');
    if (!draftId) {
      return;
    }
    if (!confirm(`Delete saved draft "${lessonName}"?`)) {
      return;
    }

    try {
      await MeteorAny.callAsync('deleteManualContentDraft', draftId);
      fetchManualContentDrafts(template);
    } catch (error: unknown) {
      clientConsole(1, '[MANUAL DRAFTS] Failed to delete draft:', error);
      alert(`Error deleting draft: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  // Toggle TDF public/private setting
  'change .public-private-toggle': async function(event: any, _template: any) {
    const tdfId = event.currentTarget.getAttribute('data-tdfid');
    const isPublic = event.currentTarget.checked;

    try {
      await MeteorAny.callAsync('setTdfUserSelect', tdfId, isPublic);
      // Refresh the assets list
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
    } catch (err: any) {
      clientConsole(1, '[PUBLIC/PRIVATE] Error toggling public/private setting:', err);
      alert('Error changing public/private setting: ' + err.message);
      // Revert the checkbox state
      event.currentTarget.checked = !isPublic;
    }
  },

  // Open content editor for TDF (stimuli editing)
  'click #content-edit-btn': function(event: any, _template: any) {
    event.preventDefault();
    const button = event.currentTarget;
    const hasSelector = button.getAttribute('data-has-selector') === 'true';

    let tdfId = button.value; // Default: root TDF ID
    const row = $(button).closest('tr');

    if (hasSelector) {
      // Find the TDF selector in the same table row
      const tdfSelector = row.find('.condition-tdf-selector');
      if (tdfSelector.length > 0) {
        const selectedId = tdfSelector.val();
        // Use selected ID if valid, otherwise fall back to root
        tdfId = selectedId || tdfId;
      }
    }

    // Check for stim file selector in the same table row
    const stimSelector = row.find('.stim-file-selector');
    let stimFileParam = '';

    if (stimSelector.length > 0) {
      const selectedStimId = stimSelector.val();
      const selectedFilename = stimSelector.find('option:selected').data('filename');
      if (selectedStimId && selectedFilename) {
        // Pass stim file info as query params
        stimFileParam = `?stimFile=${encodeURIComponent(selectedFilename)}&stimId=${selectedStimId}`;
      }
    }

    FlowRouter.go('/contentEdit/' + tdfId + stimFileParam);
  },

  // Open TDF settings editor (schema-driven)
  'click #tdf-edit-btn': function(event: any, _template: any) {
    event.preventDefault();
    const button = event.currentTarget;
    const hasSelector = button.getAttribute('data-has-selector') === 'true';

    let tdfId = button.value; // Default: root TDF ID
    const row = $(button).closest('tr');

    if (hasSelector) {
      // Find the selector in the same table row
      const selector = row.find('.condition-tdf-selector');
      if (selector.length > 0) {
        const selectedId = selector.val();
        // Use selected ID if valid, otherwise fall back to root
        tdfId = selectedId || tdfId;
      }
    }

    FlowRouter.go('/tdfEdit/' + tdfId);
  },

  // Condition TDF selector change handler
  'change .condition-tdf-selector': function(event: any, _template: any) {
    const selectedTdfId = $(event.currentTarget).val();
    const rootTdfId = $(event.currentTarget).data('root-tdfid');

    clientConsole(2, `[CONDITION SELECT] Root: ${rootTdfId}, Selected: ${selectedTdfId}`);

    // Optional: Store selection in Session for persistence
    Session.set(`selectedConditionFor_${rootTdfId}`, selectedTdfId);
  },

  // Stim file selector change handler
  'change .stim-file-selector': function(event: any, _template: any) {
    const selectedStimId = $(event.currentTarget).val();
    const selectedFilename = $(event.currentTarget).find('option:selected').data('filename');
    const tdfId = $(event.currentTarget).data('tdf-id');

    clientConsole(2, `[STIM SELECT] TDF: ${tdfId}, Selected: ${selectedFilename} (${selectedStimId})`);

    // Optional: Store selection in Session for persistence
    Session.set(`selectedStimFor_${tdfId}`, { stimId: selectedStimId, filename: selectedFilename });
  },

  // Copy TDF to create a private copy
  'click #copy-tdf-btn': async function(event: any, _template: any) {
    event.preventDefault();
    const tdfId = event.currentTarget.value;

    if (!confirm('Create a private copy of this lesson?\n\nThe copy will be set to private and you will be the owner.')) {
      return;
    }

    try {
      const result = await MeteorAny.callAsync('copyTdf', tdfId);
      alert(`Copy created: "${result.newName}"`);
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
    } catch (error: any) {
      clientConsole(1, 'Error copying TDF:', error);
      alert('Error creating copy: ' + (error.reason || error.message));
    }
  },

  // Open Anki Import Wizard
  'click #open-apkg-wizard': function(_event: any, _template: any) {
    const wizardModal = $('#apkg-wizard-modal');
    if (wizardModal.is(':visible')) {
      wizardModal.slideUp();
    } else {
      wizardModal.slideDown();
      // Scroll to wizard
      setTimeout(() => {
        const wizardElement = wizardModal[0] as HTMLElement | undefined;
        wizardElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  },

  // Open Canvas IMSCC Import Wizard
  'click #open-imscc-wizard': function(_event: any, _template: any) {
    const wizardModal = $('#imscc-wizard-modal');
    if (wizardModal.is(':visible')) {
      wizardModal.slideUp();
    } else {
      wizardModal.slideDown();
      setTimeout(() => {
        const wizardElement = wizardModal[0] as HTMLElement | undefined;
        wizardElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  },

  // Admin/Teachers - upload a TDF file
  'change #upload-file': function(_event: any) {
    //get files array from reactive var
    const _files = (Template.instance() as any).curFilesToUpload.get();
    //add new files to array, appending the current file type from the dropdown
    for (const file of Array.from($('#upload-file').prop('files'))) {
      doPackageUpload(file, (Template.instance() as any));
    }
    //update reactive var with new array
    
    //clear file input
    $('#upload-file').val('');
  },
  // Admin/Teachers - upload and convert .apkg file
  'change #upload-apkg': async function(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    // Capture template instance before async operations
    const template = (Template.instance() as any);

    
    $('#apkg-status').show();

    try {
      // Import JSZip dynamically
      const JSZip = (await import('jszip')).default;

      // Load sql.js from CDN (includes WASM properly configured)
      const initSqlJs = window.initSqlJs || await new Promise((resolve: any, reject: any) => {
        // Check if already loading
        if (window.initSqlJs) {
          resolve(window.initSqlJs);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm';
        script.onload = () => resolve(window.initSqlJs);
        script.onerror = () => reject(new Error('Failed to load sql.js from CDN'));
        document.head.appendChild(script);
      });

      // Read .apkg file
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      

      // Get SQLite database
      let sqliteBytes;
      const c21 = zip.file('collection.anki21');
      const c2 = zip.file('collection.anki2');

      if (c21) {
        sqliteBytes = await c21.async('uint8array');
      } else if (c2) {
        sqliteBytes = await c2.async('uint8array');
      } else {
        throw new Error('No collection database found in .apkg file');
      }

      // Load media index
      let mediaIndex = {};
      const mediaJson = zip.file('media');
      if (mediaJson) {
        const txt = await mediaJson.async('string');
        mediaIndex = JSON.parse(txt || '{}');
      }

      

      // Open SQLite database with CDN-loaded sql.js (WASM properly configured)
      const SQL = await initSqlJs({
        locateFile: (file: any) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
      });
      const db = new SQL.Database(new Uint8Array(sqliteBytes));

      // Extract data (using simplified version of our converter)
      const result = await convertApkgData(db, mediaIndex, zip);

      

      // Build TDF and stims
      const deckName = result.deckName || 'Imported_Deck';
      const normalizedItems: NormalizedImportItem[] = result.cards.map((card: any) => ({
        prompt: {
          ...(card.prompt ? { text: card.prompt } : {}),
          ...(card.hasImage && card.media.length > 0 ? { imgSrc: card.media[0] } : {})
        },
        response: {
          correctResponse: card.answer
        },
        sourceType: 'freeResponse' as const
      }));
      const stims = buildStimuliFromNormalizedItems(normalizedItems);
      const tdf = buildTutorFromNormalizedItems(
        deckName,
        '<p>This lesson was imported from an Anki deck.</p><p>Study each card and type your answer when prompted.</p>',
        normalizedItems,
        {
          uiSettings: {
            displayPerformance: true,
            displayTimeoutBar: false
          }
        }
      );
      const { stimFileName, tdfFileName } = getImportFileNames(deckName);

      // Create ZIP file
      const outputZip = new JSZip();
      outputZip.file(tdfFileName, JSON.stringify(tdf, null, 2));
      outputZip.file(stimFileName, JSON.stringify(stims, null, 2));

      // Add media files
      for (const [numStr, filename] of Object.entries(mediaIndex as Record<string, string>)) {
        const entry = zip.file(numStr);
        if (entry) {
          const data = await entry.async('uint8array');
          outputZip.file(filename, data);
        }
      }

      // Generate ZIP blob
      const zipBlob = await outputZip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], `${deckName}.zip`, { type: 'application/zip' });

      

      // Upload through normal ZIP process
      $('#apkg-status').hide();
      await doPackageUpload(zipFile, template);

    } catch (error: any) {
      clientConsole(1, '[APKG] Conversion error:', error);
      $('#apkg-status').hide();
      alert('Failed to convert .apkg file: ' + error.message);
    } finally {
      // Clear file input
      $('#upload-apkg').val('');
    }
  },  
  'click #show_assets': function(event: any){
    event.preventDefault();
    //get data-file field
    const tdfId = event.currentTarget.getAttribute('data-file');
    
    //toggle the attribute hidden of assets-tdfid
    if($('#assets-'+tdfId).attr('hidden')){
      $('#assets-'+tdfId).removeAttr('hidden');
    } else {
      $('#assets-'+tdfId).attr('hidden', 'true');
    }
  },
  'click #show_stimuli': function(event: any, template: any){
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-file');
    const panel = $('#stimuli-' + tdfId);
    if (panel.attr('hidden')) {
      template.ensureTdfDetails(tdfId);
      panel.removeAttr('hidden');
    } else {
      panel.attr('hidden', 'true');
    }
  },
  'click #show_manage_access': function(event: any, template: any){
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-file');
    const panel = $('#manage-access-' + tdfId);
    if (panel.attr('hidden')) {
      template.ensureTdfDetails(tdfId);
      panel.removeAttr('hidden');
    } else {
      panel.attr('hidden', 'true');
    }
  },
  'click #doUpload': async function(_event: any) {
    //get files array from reactive var
    const files = (Template.instance() as any).curFilesToUpload.get();
    //call doFileUpload function for each file
    for (const file of files) {
      await doPackageUpload(file, (Template.instance() as any));
    }
  },
    'click #tdf-download-btn': async function(event: any){
      event.preventDefault();
      const tdfId = event.currentTarget.getAttribute('data-tdfid');
      if (!tdfId) {
        alert('Package download failed: lesson ID not found.');
        return;
      }

      try {
        const result = await MeteorAny.callAsync('getPackageDownloadLink', tdfId);
        if (!result || !result.link) {
          alert('Package download failed: link not available.');
          return;
        }
        window.open(result.link);
      } catch (error: any) {
        clientConsole(1, '[DOWNLOAD] Package download failed:', error);
        alert('Error downloading package: ' + (error.reason || error.message));
      }
    },
  'click #package-delete-btn': function(event: any){
      const packageAssetId = event.currentTarget.getAttribute('value');
      const packageFile = event.currentTarget.getAttribute('data-package-file');
      const _fileName = event.currentTarget.getAttribute('data-filename');
      
      const packageFileName = packageFile ? packageFile.split('/').pop() : null;
      const pendingKey = packageAssetId || Random.id();
      pendingPackageDeletes.set(pendingKey, {
        packageId: packageAssetId,
        fileName: packageFileName,
        assetId: packageAssetId,
        startedAt: new Date()
      });
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
      (async () => {
        try {
          await MeteorAny.callAsync('deletePackageFile', packageAssetId);
          
          // Invalidate cache and trigger reactive refresh
          assetsHelperLastRun = 0;
          assetsHelperCachedResult = [];
          assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
        } catch (error: any) {
          clientConsole(1, 'Delete error:', error);
          alert('Error deleting package: ' + error.message);
        } finally {
          pendingPackageDeletes.set(pendingKey, undefined);
        }
      })();
    },
  'click #reset-conditions-btn': function(event: any){
    const tdfId = event.currentTarget.getAttribute('value')
    MeteorAny.callAsync('resetTdfConditionCounts',tdfId);
  },

  'click #assetDeleteButton': function(event: any){
    const assetId = event.currentTarget.getAttribute('value')
    MeteorAny.callAsync('removeAssetById', assetId);
  },

  'click #stim-download-btn': async function(event: any){
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-tdfid');
    if (!tdfId) {
      alert('Stimulus download failed: lesson ID not found.');
      return;
    }

    try {
      const result = await MeteorAny.callAsync('getStimuliFileForTdf', tdfId);
      if (!result || !result.stimFile) {
        alert('Stimulus download failed: file not available.');
        return;
      }

      const rawName = result.fileName || 'stimuli.json';
      const safeName = rawName.replace(/[\\/]/g, '_');
      const blob = new Blob([JSON.stringify(result.stimFile, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      document.body.appendChild(link);
      link.style = 'display: none';
      link.href = url;
      link.download = safeName;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      clientConsole(1, '[DOWNLOAD] Stimulus download failed:', error);
      alert('Error downloading stimulus file: ' + (error.reason || error.message));
    }
  },
  'click #deleteAllAssetsConfirm': async function(e: any, _template: any) {
    e.preventDefault();
    if (!confirm('This will delete all files, remove all lessons, and remove all stimuli. This is not recoverable. Are you sure?')) {
      return;
    }
    
    MeteorAny.callAsync('deleteAllFiles',
      function(error: any, result: any) {
        if (error) {
          
          alert('Error deleting files: ' + error);
        } else {
          
          alert('Successfully deleted ' + result + ' files');
        }
      }
    );
  },
  'click .imageLink'(e: any) {
    const url = $(e.currentTarget).data('link');

    // MO8: Use DOM createElement for security and proper image optimization
    // SECURITY: Prevents XSS via proper DOM API instead of HTML string concatenation
    const popup = window.open();
    if (!popup) {
      alert('Popup was blocked by your browser.');
      return;
    }

    // Create proper HTML structure with image attributes
    const img = popup.document.createElement('img');
    img.src = url; // Safe - no string concatenation
    img.alt = 'Uploaded content preview'; // Accessibility
    img.loading = 'eager'; // Intentional preview, load immediately
    img.decoding = 'async'; // Non-blocking decode
    img.style.maxWidth = '100%'; // Ensure image fits in popup
    img.style.height = 'auto'; // Maintain aspect ratio

    popup.document.body.appendChild(img);
    popup.print();
  },
  'click #add-access-btn': async function(event: any, template: any){
    const tdfId = event.currentTarget.getAttribute('value');
    await addAccessorsForTdf(template, tdfId);
  },
  'keydown .js-accessor-input': async function(event: any, template: any) {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-id');
    await addAccessorsForTdf(template, tdfId);
  },
  'click #remove-access-btn': async function(event: any, template: any){
    const tdfId = event.currentTarget.getAttribute('value');
    const tdf = TdfsCollection.findOne({ _id: tdfId });
    let currentAccessors = Array.isArray(tdf?.accessors) ? tdf.accessors : null;
    if (!currentAccessors) {
      template?.ensureTdfDetails?.(tdfId);
      try {
        currentAccessors = await MeteorAny.callAsync('getAccessorsTDFID', tdfId);
      } catch (error: any) {
        clientConsole(1, '[ACCESS] Failed to fetch current accessors:', error);
        setAccessMessage(template, tdfId, 'Access list is still loading. Please try again.', 'warning');
        return;
      }
    }

    const revokedAccessorId = event.currentTarget.getAttribute('data-user');
    const remainingAccessors = currentAccessors.filter((accessor: any) => accessor.userId !== revokedAccessorId);

    try {
      await MeteorAny.callAsync('assignAccessors', tdfId, remainingAccessors, [revokedAccessorId]);
      setAccessMessage(template, tdfId, 'User access removed.', 'success');
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
    } catch (error: any) {
      clientConsole(1, '[ACCESS] Remove access failed:', error);
      setAccessMessage(template, tdfId, 'Error removing access: ' + (error.reason || error.message), 'error');
    }
  },
  'click #transfer-btn': async function(event: any, template: any){
    const tdfId = event.currentTarget.getAttribute('value');
    const newOwnerUsername = String(($('#transfer-' + tdfId).val() || '')).trim();
    if (!newOwnerUsername) {
      setAccessMessage(template, tdfId, 'Enter the new owner email.', 'warning');
      return;
    }

    try {
      const lookup = await MeteorAny.callAsync('resolveUsersForTdf', tdfId, [newOwnerUsername]);
      if (lookup.missing && lookup.missing.length > 0) {
        setAccessMessage(template, tdfId, 'User not found: ' + lookup.missing.join(', '), 'error');
        return;
      }

      const newOwner = lookup.users[0];
      await MeteorAny.callAsync('transferDataOwnership', tdfId, newOwner);
      $('#transfer-' + tdfId).val('');
      setAccessMessage(template, tdfId, 'Ownership transferred to ' + (newOwner.displayIdentifier || newOwner.username || 'new owner') + '.', 'success');
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
    } catch (error: any) {
      clientConsole(1, '[ACCESS] Transfer ownership failed:', error);
      setAccessMessage(template, tdfId, 'Error transferring ownership: ' + (error.reason || error.message), 'error');
    }
  },
  'click #load-more-TdfsCollection': function(event: any, template: any){
    event.preventDefault();
    const currentLimit = template.listLimit.get();
    template.listLimit.set(currentLimit + CONTENT_UPLOAD_LIST_LIMIT);
    assetsHelperLastRun = 0;
    assetsHelperCachedResult = [];
    assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
  },

  // ========== MEDIA MANAGER EVENTS ==========

  // Toggle media manager panel visibility
  'click .manage-media-btn': function(event: any, template: any) {
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-tdfid');
    const stimSetIdRaw = event.currentTarget.getAttribute('data-stimsetid');
    const stimSetId = stimSetIdRaw ? parseInt(stimSetIdRaw, 10) : null;
    const panel = $(`#media-manager-${tdfId}`);
    if (panel.attr('hidden')) {
      template.ensureAssetsSubscription(tdfId, stimSetId);
      panel.removeAttr('hidden');
    } else {
      panel.attr('hidden', 'true');
      template.stopAssetsSubscription(tdfId);
    }
  },

  // Drag and drop - dragover
  'dragover .media-drop-zone': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    $(event.currentTarget).addClass('drag-over');
  },

  // Drag and drop - dragleave
  'dragleave .media-drop-zone': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    $(event.currentTarget).removeClass('drag-over');
  },

  // Drag and drop - drop files
  'drop .media-drop-zone': async function(event: any, template: any) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = $(event.currentTarget);
    dropZone.removeClass('drag-over');

    const tdfId = dropZone.data('tdfid');
    const stimSetId = dropZone.data('stimsetid');
    const files = event.originalEvent.dataTransfer.files;

    if (files.length > 0) {
      await uploadMediaFiles(files, tdfId, stimSetId, template);
    }
  },

  // Click drop zone to open file picker
  'click .media-drop-zone': function(event: any) {
    // Don't trigger if clicking on the file input itself
    if (event.target.tagName === 'INPUT') return;
    const tdfId = event.currentTarget.getAttribute('data-tdfid');
    $(`.media-file-input[data-tdfid="${tdfId}"]`).click();
  },

  // File input change handler
  'change .media-file-input': async function(event: any, template: any) {
    const input = event.currentTarget;
    const tdfId = input.getAttribute('data-tdfid');
    const stimSetId = input.getAttribute('data-stimsetid');
    const files = input.files;

    if (files.length > 0) {
      await uploadMediaFiles(files, tdfId, stimSetId, template);
    }

    // Clear the input so the same file can be selected again
    input.value = '';
  },

  // Select all checkbox
  'change .select-all-media': function(event: any) {
    const tdfId = event.currentTarget.getAttribute('data-tdfid');
    const isChecked = event.currentTarget.checked;
    const panel = $(`#media-manager-${tdfId}`);

    panel.find('.media-select-checkbox').prop('checked', isChecked);
    updateDeleteButtonState(tdfId);
  },

  // Individual checkbox change
  'change .media-select-checkbox': function(event: any) {
    const checkbox = event.currentTarget;
    const panel = $(checkbox).closest('.media-manager-panel');
    const panelId = panel.attr('id') || '';
    const tdfId = panelId.replace('media-manager-', '');

    updateDeleteButtonState(tdfId);

    // Update "select all" checkbox state
    const allCheckboxes = panel.find('.media-select-checkbox');
    const checkedCheckboxes = panel.find('.media-select-checkbox:checked');
    const selectAll = panel.find('.select-all-media');

    if (checkedCheckboxes.length === 0) {
      selectAll.prop('checked', false);
      selectAll.prop('indeterminate', false);
    } else if (checkedCheckboxes.length === allCheckboxes.length) {
      selectAll.prop('checked', true);
      selectAll.prop('indeterminate', false);
    } else {
      selectAll.prop('checked', false);
      selectAll.prop('indeterminate', true);
    }
  },

  // Single file delete
  'click .btn-delete-media': async function(event: any) {
    event.preventDefault();
    event.stopPropagation();

    const assetId = event.currentTarget.getAttribute('data-assetid');
    const filename = event.currentTarget.getAttribute('data-filename');

    if (!assetId) {
      alert('Cannot delete: Asset ID not found');
      return;
    }

    if (!confirm(`Delete "${filename}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      await MeteorAny.callAsync('removeAssetById', assetId);
      // Refresh the assets list
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
    } catch (error: any) {
      clientConsole(1, '[MEDIA] Delete error:', error);
      alert('Error deleting file: ' + (error.reason || error.message));
    }
  },

  // Delete selected files (batch delete)
  'click .delete-selected-media': async function(event: any) {
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-tdfid');
    const panel = $(`#media-manager-${tdfId}`);
    const selectedCheckboxes = panel.find('.media-select-checkbox:checked');

    if (selectedCheckboxes.length === 0) {
      alert('No files selected');
      return;
    }

    // Collect asset IDs and filenames for confirmation
    const assetIds: any[] = [];
    const filenames: any[] = [];
    selectedCheckboxes.each(function(this: any) {
      const id = $(this).data('assetid');
      const name = $(this).data('filename');
      if (id) {
        assetIds.push(id);
        filenames.push(name);
      }
    });

    if (assetIds.length === 0) {
      alert('No valid files selected for deletion');
      return;
    }

    const confirmMsg = assetIds.length === 1
      ? `Delete "${filenames[0]}"?\n\nThis action cannot be undone.`
      : `Delete ${assetIds.length} files?\n\n${filenames.slice(0, 5).join('\n')}${filenames.length > 5 ? '\n...' : ''}\n\nThis action cannot be undone.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      await MeteorAny.callAsync('removeMultipleAssets', assetIds);
      
      // Refresh the assets list
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
    } catch (error: any) {
      clientConsole(1, '[MEDIA] Batch delete error:', error);
      alert('Error deleting files: ' + (error.reason || error.message));
    }
  }
});

// ========== MEDIA MANAGER HELPER FUNCTIONS ==========

// Update delete button state based on selection
function updateDeleteButtonState(tdfId: any) {
  const panel = $(`#media-manager-${tdfId}`);
  const checkedCount = panel.find('.media-select-checkbox:checked').length;
  const deleteBtn = panel.find('.delete-selected-media');

  deleteBtn.prop('disabled', checkedCount === 0);
  deleteBtn.find('.selected-count').text(checkedCount);
}

// Upload media files to a TDF
async function uploadMediaFiles(files: any, tdfId: any, stimSetId: any, template: any) {
  const progressContainer = $(`#upload-progress-${tdfId}`);
  const progressBar = progressContainer.find('.progress-bar');
  const statusText = progressContainer.find('.upload-status');

  const assetSub = template.assetSubs ? template.assetSubs.get(tdfId) : null;
  if (!assetSub || !assetSub.ready()) {
    alert('Media list is still loading. Please wait and try again.');
    return;
  }

  // Validate file types
  const validTypes = ['image/', 'audio/', 'video/'];
  const validFiles = Array.from(files).filter((file: any) =>
    validTypes.some(type => file.type.startsWith(type))
  );

  if (validFiles.length === 0) {
    alert('No valid media files selected. Please select image, audio, or video files.');
    return;
  }

  if (validFiles.length !== files.length) {
    const skipped = files.length - validFiles.length;
    alert(`${skipped} file(s) skipped: only image, audio, and video files are allowed.`);
  }

  progressContainer.show();
  let completed = 0;
  const total = validFiles.length;

  for (const file of validFiles as any[]) {
    statusText.text(`Uploading ${file.name} (${completed + 1}/${total})...`);

    try {
      // Check if file already exists
      const existingFile = DynamicAssetsCollection.findOne({ name: file.name, 'meta.stimuliSetId': stimSetId });
      if (existingFile) {
        if (!confirm(`File "${file.name}" already exists. Overwrite?`)) {
          completed++;
          continue;
        }
        // Remove existing file first
        await MeteorAny.callAsync('removeAssetById', existingFile._id);
      }

      // Upload using DynamicAssetsCollection
      await new Promise((resolve: any, reject: any) => {
        const upload = DynamicAssetsCollection.insert({
          file: file,
          meta: {
            stimuliSetId: stimSetId,
            public: true
          },
          chunkSize: 'dynamic'
        }, false);

        upload.on('progress', function(progress: any) {
          const overallProgress = ((completed + progress / 100) / total) * 100;
          progressBar.css('width', overallProgress + '%');
        });

        upload.on('end', function(error: any, fileObj: any) {
          if (error) {
            reject(error);
          } else {
            
            resolve(fileObj);
          }
        });

        upload.start();
      });

      completed++;
      progressBar.css('width', (completed / total) * 100 + '%');
    } catch (error: any) {
      clientConsole(1, '[MEDIA] Upload error for', file.name, ':', error);
      alert(`Error uploading ${file.name}: ${error.message || error}`);
    }
  }

  // Hide progress immediately, then refresh
  progressContainer.hide();
  progressBar.css('width', '0%');
  statusText.text('Upload complete!');

  // Refresh the assets list after a short delay to ensure UI updates
  setTimeout(() => {
    assetsHelperLastRun = 0;
    assetsHelperCachedResult = [];
    assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
  }, 300);
}


// //////////////////////////////////////////////////////////////////////////
// Our main logic for uploading files

async function doFileUpload(fileArray: any) {
  //reorder fileArray so that packages are uploaded first, then stimuli, then TdfsCollection
  fileArray.sort((a: any, b: any) => {
    if (a.fileType == 'package') {
      return -1;
    } else if (b.fileType == 'package') {
      return 1;
    } else if (a.fileType == 'stim') {
      return -1;
    } else if (b.fileType == 'stim') {
      return 1;
    } else {
      return 0;
    }
  });
  const files = fileArray;
  
  const errorStack = [];

  for (const file of files) {
  //check if file type is package
  if (file.fileType == 'package') {
    //check if package exists in DynamicAssetsCollection
    let existingFile = null;
    try {
      existingFile = await MeteorAny.callAsync('getUserAssetByName', file.name);
    } catch (error: any) {
      clientConsole(1, '[UPLOAD] Failed to check existing package:', error);
      alert('Error checking for existing package: ' + (error.reason || error.message));
      continue;
    }
    if (existingFile) {
      //atempts to delete existing file
      try {
        // Security: Use server method instead of direct client remove
        MeteorAny.callAsync('removeAssetById', existingFile._id);
      } catch (e) {
        
        alert('Error deleting existing file. Please try again. If this error persists, please file a bug report.');
      }
    } else {
      doPackageUpload(file, (Template.instance() as any));
    }
  } else {
      const name = file.name;
      const fileType = file.fileType;
      const fileDescrip = file.fileDescrip;
      if (name.indexOf('<') != -1 || name.indexOf('>') != -1 || name.indexOf(':') != -1 ||
        name.indexOf('"') != -1 || name.indexOf('/') != -1 || name.indexOf('|') != -1 ||
        name.indexOf('?') != -1 || name.indexOf('*') != -1) {
        alert('Please remove the following characters from your filename: < > : " / | ? *');
      } else {
        const fileData = await readFileAsDataURL(file);
        

        try {
          const result: any = await meteorCallAsync('saveContentFile', fileType, name, fileData, Meteor.userId());
          if (!result.result) {
            if(result.data && result.data.res == 'awaitClientTDF'){
              const reasons = Array.isArray(result.data.reason) ? result.data.reason : [];
              if (reasons.includes('breakingVersionRequired')) {
                alert(`This upload changes mapping semantics and cannot overwrite the existing lesson version.\n\nCreate/publish a new version (vN+1).\nFile Name: ${result.data.TDF.content.fileName}`);
                return;
              }
              if(confirm(`A previous file exists and will be overwritten. Continue?\nFile Name: ${result.data.TDF.content.fileName}`)){
                try {
                  await MeteorAny.callAsync('tdfUpdateConfirmed', result.data.TDF, false, reasons);
                } catch (err: any) {
                  alert(err);
                }
              }
            } else {
              
              errorStack.push('The ' + fileDescrip + ' file was not saved: ' + result.errmsg);
            }
          }
        } catch (error: any) {
          
          errorStack.push('There was a critical failure saving your ' + fileDescrip + ' file:' + error);
        }
      }
    }

    $('#stimUploadLoadingSymbol').hide()
    
    if (errorStack.length == 0) {
      alert("Files saved successfully. It may take a few minutes for the changes to take effect.");
    } else {
      alert('There were ' + errorStack.length + ' errors uploading files: ' + errorStack.join('\n'));
    }

    //force the stimDisplayTypeMap to refresh on next card load
    Session.set('stimDisplayTypeMap', undefined);

    //clear the file upload fields
    $('#upload-file').val('');

     // Now we can clear the selected file
    $('#upload-file').val('');
    $('#upload-file').parent().find('.file-info').html('');
    
    
    //alert('Upload complete');
    }
  }



async function doPackageUpload(file: any, template: any){
  let existingFile = null;
  try {
    existingFile = await MeteorAny.callAsync('getUserAssetByName', file.name);
  } catch (error: any) {
    clientConsole(1, '[UPLOAD] Failed to check existing package:', error);
    alert('Error checking for existing package: ' + (error.reason || error.message));
    return;
  }

  if (existingFile) {
    if (confirm(`Uploading this file will overwrite existing data. Continue?`)) {
      // Security: Use server method instead of direct client remove
      MeteorAny.callAsync('removeAssetById', existingFile._id);
    } else {
      return;
    }
  }

  // OPTIMISTIC UI: Create pending entry immediately
  const tempId = Random.id();
  template.pendingUploads.set(tempId, {
    uploadId: tempId,
    fileName: file.name,
    status: "uploading",
    lessonName: file.name.replace(/\.zip$/i, ''),
    progress: 0,
    error: null,
    startedAt: new Date(),
    startedAtMs: Date.now()
  });

  // Force immediate UI refresh
  assetsHelperLastRun = 0;
  assetsHelperCachedResult = [];

  const upload = DynamicAssetsCollection.insert({
    file: file,
    chunkSize: 'dynamic'
  }, false);

  upload.on('start', function (this: any) {
    template.currentUpload.set(this);

    // OPTIMISTIC UI: Replace temp ID with actual upload ID
    const actualId = this._id;
    const pendingData = template.pendingUploads.get(tempId);
    template.pendingUploads.set(tempId, undefined);
    template.pendingUploads.set(actualId, {
      ...pendingData,
      uploadId: actualId
    });

    // Refresh UI
    assetsHelperLastRun = 0;
    assetsHelperCachedResult = [];
  });

  // OPTIMISTIC UI: Track upload progress
  upload.on('progress', function (this: any, progress: any) {
    const uploadData = template.pendingUploads.get(this._id);
    if (uploadData) {
      template.pendingUploads.set(this._id, {
        ...uploadData,
        progress: progress
      });
      // UI refresh throttled by helper, no manual trigger needed
    }
  });

  upload.on('end', function (this: any, error: any, fileObj: any) {
    const pendingUploadId = this._id;
    const packageAssetId = fileObj?._id || null;
    if (error) {
      // OPTIMISTIC UI: Update to error state (no alert)
      const uploadData = template.pendingUploads.get(pendingUploadId);
      if (uploadData) {
        template.pendingUploads.set(pendingUploadId, {
          ...uploadData,
          status: "error",
          error: `Upload failed: ${error}`,
          progress: 0
        });
        assetsHelperLastRun = 0;
        assetsHelperCachedResult = [];
      }
      clientConsole(1, '[UPLOAD] Upload failed:', error);
    } else {
      const link = DynamicAssetsCollection.link({...fileObj});
      const fileExt = (fileObj.ext || (fileObj.name ? fileObj.name.split('.').pop() : null) || (file?.name ? file.name.split('.').pop() : null) || '').toLowerCase();
      if (fileExt === "zip") {
        // check if emailInsteadOfAlert is checked
        const emailToggle = $('#emailInsteadOfAlert').is(':checked') ? true : false;

        // OPTIMISTIC UI: Update status to processing
        const uploadData = template.pendingUploads.get(pendingUploadId);
        if (uploadData) {
          template.pendingUploads.set(pendingUploadId, {
            ...uploadData,
            status: "processing",
            packageAssetId: packageAssetId,
            // Keep below 100% until the processed lesson row is actually visible.
            progress: 95
          });
          assetsHelperLastRun = 0;
          assetsHelperCachedResult = [];
        }

        if (DEBUG_SKIP_PACKAGE_PROCESSING) {
          clientConsole(1, '[UPLOAD] Debug: skipping processPackageUpload for', fileObj._id);
          const uploadData = template.pendingUploads.get(pendingUploadId);
          if (uploadData) {
            template.pendingUploads.set(pendingUploadId, {
              ...uploadData,
              status: "error",
              packageAssetId: packageAssetId,
              error: "Processing disabled for debugging (upload stored only)"
            });
            assetsHelperLastRun = 0;
            assetsHelperCachedResult = [];
          }
          return;
        }

        (async () => {
          try {
            const result = await MeteorAny.callAsync('processPackageUpload', fileObj._id, Meteor.userId(), link, emailToggle);
            
            for (const res of (result.results || [])) {
              if (res.data && res.data.res == 'awaitClientTDF') {
                let reason = []
                const reasons = Array.isArray(res.data.reason) ? res.data.reason : [];
                if (reasons.includes('breakingVersionRequired')) {
                  const uploadData = template.pendingUploads.get(pendingUploadId);
                  if (uploadData) {
                    template.pendingUploads.set(pendingUploadId, {
                      ...uploadData,
                      status: "error",
                      packageAssetId: packageAssetId,
                      error: `Breaking change detected for ${res.data.TDF.content.fileName}. Publish a new version (vN+1) instead of overwrite.`
                    });
                    assetsHelperLastRun = 0;
                    assetsHelperCachedResult = [];
                  }
                  return;
                }
                if(res.data.reason.includes('prevTDFExists'))
                  reason.push(`Previous ${res.data.TDF.content.fileName} already exists, continuing the upload will overwrite the old file. Continue?`)
                if(res.data.reason.includes(`prevStimExists`))
                  reason.push(`Previous ${res.data.TDF.content.TdfsCollection.tutor.setspec.stimulusfile} already exists, continuing the upload will overwrite the old file. Continue?`)
                
                if(confirm(reason.join('\n'))){
                  try {
                    await MeteorAny.callAsync('tdfUpdateConfirmed', res.data.TDF, false, reasons);
                  } catch (err: any) {
                    // OPTIMISTIC UI: Update error state (no alert)
                    const uploadData = template.pendingUploads.get(pendingUploadId);
                    if (uploadData) {
                      template.pendingUploads.set(pendingUploadId, {
                        ...uploadData,
                        status: "error",
                        packageAssetId: packageAssetId,
                        error: `Confirmation failed: ${err}`
                      });
                      assetsHelperLastRun = 0;
                      assetsHelperCachedResult = [];
                    }
                    clientConsole(1, '[UPLOAD] Confirmation failed:', err);
                    return;
                  }
                }
              }
              else if(!res.result) {
                // OPTIMISTIC UI: Update error state (no alert)
                const uploadData = template.pendingUploads.get(pendingUploadId);
                if (uploadData) {
                  template.pendingUploads.set(pendingUploadId, {
                    ...uploadData,
                    status: "error",
                    packageAssetId: packageAssetId,
                    error: res.errmsg || "Package processing failed"
                  });
                  assetsHelperLastRun = 0;
                  assetsHelperCachedResult = [];
                }
                clientConsole(1, '[UPLOAD] Package processing failed:', res.errmsg);
                return
              }
            }
            // SUCCESS: Keep pending entry visible until the actual lesson row appears.
            const uploadData = template.pendingUploads.get(pendingUploadId);
            if (uploadData) {
              template.pendingUploads.set(pendingUploadId, {
                ...uploadData,
                status: "completed",
                progress: 100,
                packageAssetId: packageAssetId,
                stimuliSetId: result?.stimSetId ?? uploadData.stimuliSetId ?? null
              });
            }

            // Invalidate cache and trigger reactive refresh after successful upload
            assetsHelperLastRun = 0;
            assetsHelperCachedResult = [];
            assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
          } catch (err: any) {
            // OPTIMISTIC UI: Update error state (no alert)
            const uploadData = template.pendingUploads.get(pendingUploadId);
            if (uploadData) {
              template.pendingUploads.set(pendingUploadId, {
                ...uploadData,
                status: "error",
                packageAssetId: packageAssetId,
                error: err.message || err.toString()
              });
              assetsHelperLastRun = 0;
              assetsHelperCachedResult = [];
            }
            clientConsole(1, '[UPLOAD] Processing error:', err);
          }
        })();  
      } else {
        const uploadData = template.pendingUploads.get(pendingUploadId);
        if (uploadData) {
          template.pendingUploads.set(pendingUploadId, {
            ...uploadData,
            status: "completed",
            progress: 100
          });
        }
        assetsHelperLastRun = 0;
        assetsHelperCachedResult = [];
        setTimeout(() => {
          template.pendingUploads.set(pendingUploadId, undefined);
          assetsHelperLastRun = 0;
          assetsHelperCachedResult = [];
        }, 500);
      }
    }
  });
  upload.start();
  //return the filename
  return { fileName: file.name };
}

async function readFileAsDataURL(file: any) {
  const result = await new Promise((resolve: any) => {
    const fileReader = new FileReader();
    fileReader.onload = () => resolve(fileReader.result);
    fileReader.readAsText(file, 'UTF-8');
  });

  return result;
}

// //////////////////////////////////////////////////////////////////////////
// Anki .apkg conversion helper functions

const US = '\x1f'; // Anki field separator

function stripHtml(s: any) {
  return (s || '').replace(/<[^>]+>/g, '').trim();
}

function splitFields(fldsRaw: any) {
  return (fldsRaw || '').split(US);
}

function extractMediaRefs(fields: any) {
  const refs = new Set();
  for (const f of fields) {
    if (!f) continue;
    const regex = /<img[^>]+src=['"]([^'"]+)['"]|(?:\[sound:([^\]]+)\])/g;
    for (const m of f.matchAll(regex)) {
      const candidate = m[1] || m[2];
      if (candidate) refs.add(candidate);
    }
  }
  return [...refs];
}

function queryAll(db: any, sql: any) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function convertApkgData(db: any, mediaIndex: any, _zip: any) {
  // Get models and decks
  const colRows = queryAll(db, 'SELECT models, decks FROM col');
  const models = colRows.length > 0 ? JSON.parse(colRows[0].models || '{}') : {};
  const decks = colRows.length > 0 ? JSON.parse(colRows[0].decks || '{}') : {};

  // Build model index
  const modelIndex = new Map();
  for (const [id, m] of Object.entries(models as Record<string, any>)) {
    modelIndex.set(parseInt(id, 10), {
      name: m.name || `Model_${id}`,
      isCloze: (m.name || '').toLowerCase().includes('cloze')
    });
  }

  // Build deck index
  const deckIndex = new Map();
  for (const [id, d] of Object.entries(decks as Record<string, any>)) {
    deckIndex.set(parseInt(id, 10), d.name || `Deck_${id}`);
  }

  // Load notes
  const notes = new Map();
  for (const row of queryAll(db, 'SELECT id, guid, mid, flds, tags FROM notes')) {
    notes.set(row.id, {
      id: row.id,
      guid: row.guid,
      mid: row.mid,
      fields: splitFields(row.flds),
      tags: row.tags || ''
    });
  }

  // Process cards
  const cards = [];
  let primaryDeckName = null;

  for (const row of queryAll(db, 'SELECT id, nid, did, ord FROM cards')) {
    const { id: cid, nid, did, ord: _ord } = row;
    const note = notes.get(nid);
    if (!note) continue;

    const model = modelIndex.get(note.mid);
    const deckName = deckIndex.get(did) || `Deck_${did}`;
    if (!primaryDeckName) primaryDeckName = deckName;

    const isCloze = model ? model.isCloze : false;

    // Extract prompt and answer
    let prompt, answer;
    if (isCloze) {
      // Simplified cloze handling
      const text = note.fields[0] || '';
      prompt = stripHtml(text);
      answer = stripHtml(text);
    } else {
      // Basic card: field 0 = front, field 1 = back
      prompt = stripHtml(note.fields[0] || '');
      answer = stripHtml(note.fields[1] || '');
    }

    // Extract media
    const mediaRefs = extractMediaRefs(note.fields);
    const mediaNames = mediaRefs.map(r => {
      const n = Number(r);
      if (Number.isFinite(n) && String(n) === r && mediaIndex[r]) {
        return mediaIndex[r];
      }
      return r;
    });
    const hasImage = mediaNames.some(m => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(m));

    cards.push({
      id: cid,
      prompt,
      answer,
      media: mediaNames,
      hasImage,
      deck: deckName,
      tags: note.tags
    });
  }

  return {
    cards,
    deckName: primaryDeckName
  };
}








