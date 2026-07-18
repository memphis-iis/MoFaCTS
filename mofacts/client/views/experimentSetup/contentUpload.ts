import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import './contentUpload.html';
import './contentUpload.css';
import './aiContentCreator';
import { meteorCallAsync, clientConsole } from '../..';
import { ReactiveVar } from 'meteor/reactive-var';
import { ReactiveDict } from 'meteor/reactive-dict';
import { Tracker } from 'meteor/tracker';
import { Random } from 'meteor/random';
import { currentUserHasRole } from '../../lib/roleUtils';
import { buildStimuliFromNormalizedItems, buildTutorFromNormalizedItems, getImportFileNames } from '../../lib/importCompositionBuilder';
import type { NormalizedImportItem } from '../../lib/normalizedImportTypes';
import { getUploadIntegrity } from '../../lib/uploadIntegrity';
import { ensureSqlJs } from '../../lib/sqlJsLoader';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { hasPublicCreatorDisplayName } from '../../lib/contentCreatorIdentity';
import {
  rejectLoad,
  resolveLoad,
  startLoad,
  type LoadableState,
} from '../../lib/adminUi/loadableState';
import { createTemplateLifetime, type TemplateLifetime } from '../../lib/adminUi/templateLifetime';
import { createScopedAsyncCommandRegistry, type ScopedAsyncCommandRegistry } from '../../lib/adminUi/scopedAsyncCommandRegistry';
import {
  createInlineConfirmationController,
  type InlineConfirmationController,
  type InlineConfirmationView,
} from '../../lib/adminUi/inlineConfirmationController';
import '../shared/adminUi/adminUi';
import './apkgWizard';
import './imsccWizard';
import {
  buildRowSummaryPresentation,
  normalizeContentUploadListResult,
  normalizeContentUploadSummaryMap,
  normalizeUploadQuotaStatus,
  type ContentUploadListResult,
  type ContentUploadSummaryMap,
  type UploadQuotaStatus,
} from './contentUploadState';
export {doFileUpload};

const FlowRouter = (globalThis as any).FlowRouter;
const MeteorAny = Meteor as any;
const TdfsCollection = (globalThis as any).Tdfs;
const DynamicAssetsCollection = (globalThis as any).DynamicAssets;

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

// Reactive trigger for forcing UI refresh after deletions
const assetsRefreshTrigger = new ReactiveVar(0);
const assetRowRefreshTrigger = new ReactiveVar(0);
const pendingPackageDeletes = new ReactiveDict();
const ACCESS_MESSAGE_TIMEOUT_MS = 6000;
const UPLOAD_MESSAGE_TIMEOUT_MS = 8000;
const CDN_ASSET_REF_REGEX = /^\/?cdn\/storage\/Assets\/([^/]+)\/original\/([^/?#]+)$/i;
const DYNAMIC_ASSET_REF_REGEX = /^\/?dynamic-assets\/([A-Za-z0-9_-]+)(?:\/|$)/i;

type UploadMessageLevel = 'info' | 'success' | 'warning' | 'error';
type ContentCommandResult = Readonly<{ text: string; level?: UploadMessageLevel }>;
type InlineConfirmation = {
  placement: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  level: UploadMessageLevel;
};

type ContentUploadConfirmationContext = {
  resolve: (confirmed: boolean) => void;
};

type ContentUploadConfirmationPresentation = {
  placement: string;
  view: InlineConfirmationView;
};

type ContentUploadInstance = Blaze.TemplateInstance & {
  listPresentation: ReactiveVar<LoadableState<ContentUploadListResult>>;
  summaryPresentation: ReactiveVar<LoadableState<ContentUploadSummaryMap>>;
  quotaPresentation: ReactiveVar<LoadableState<UploadQuotaStatus>>;
  listLifetime: TemplateLifetime;
  summaryLifetime: TemplateLifetime;
  quotaLifetime: TemplateLifetime;
  nextListRequestId: number;
  nextSummaryRequestId: number;
  nextQuotaRequestId: number;
  commandRegistry: ScopedAsyncCommandRegistry<ContentCommandResult>;
};

function contentText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function uploadErrorText(error: any): string {
  return String(error?.reason || error?.message || error || '');
}

function readyLoadValue<T>(state: LoadableState<T>): T | null {
  return state.status === 'ready'
    || state.status === 'empty'
    || state.status === 'refreshing'
    || state.status === 'refresh-error'
    ? state.value
    : null;
}

function loadErrorMessage<T>(state: LoadableState<T>): string {
  return state.status === 'error' || state.status === 'refresh-error' ? state.message : '';
}

function loadPending<T>(state: LoadableState<T>): boolean {
  return state.status === 'idle' || state.status === 'loading' || state.status === 'refreshing';
}

function contentListFailureText(error: unknown): string {
  return `${contentText('content.uploadedContent')} ${contentText('content.failed')}: ${uploadErrorText(error)}`;
}

function summaryFailureText(error: unknown): string {
  return `${contentText('content.summary')} ${contentText('content.failed')}: ${uploadErrorText(error)}`;
}

function summaryRowFailureText(): string {
  return `${contentText('content.summary')} ${contentText('content.failed')}`;
}

function quotaFailureText(error: unknown): string {
  return `${contentText('content.uploadQuota')} ${contentText('content.failed')}: ${uploadErrorText(error)}`;
}

function missingSummaryText(): string {
  return `${contentText('content.summary')} ${contentText('content.notFoundMarker')}`;
}

function translationStatusText(status: string): string {
  if (status === 'author-provided') return contentText('manualCreator.translationStatusAuthorProvided');
  if (status === 'not-translated') return contentText('manualCreator.translationStatusNotTranslated');
  if (status === 'draft') return contentText('manualCreator.translationStatusDraft');
  if (status === 'reviewed') return contentText('manualCreator.translationStatusReviewed');
  return status;
}

function buildLanguageMetadataRows(summary: any): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const contentLanguage = String(summary?.contentLanguage || '').trim();
  const recommendedUiLocales = Array.isArray(summary?.recommendedUiLocales)
    ? summary.recommendedUiLocales.map((locale: unknown) => String(locale || '').trim()).filter(Boolean)
    : [];
  const translationStatus = String(summary?.translationStatus || '').trim();

  if (contentLanguage) {
    rows.push({ label: contentText('manualCreator.contentLanguage'), value: contentLanguage });
  }
  if (recommendedUiLocales.length > 0) {
    rows.push({ label: contentText('manualCreator.recommendedUiLocales'), value: recommendedUiLocales.join(', ') });
  }
  if (translationStatus) {
    rows.push({ label: contentText('manualCreator.translationStatus'), value: translationStatusText(translationStatus) });
  }
  return rows;
}

function uploadMessageIcon(level: UploadMessageLevel) {
  if (level === 'success') return 'fa-check-circle';
  if (level === 'warning') return 'fa-exclamation-triangle';
  if (level === 'error') return 'fa-times-circle';
  return 'fa-info-circle';
}

function contentUploadRefreshToken(): string {
  return `${assetsRefreshTrigger.get()}-${Session.get('assetsRefreshTrigger') || 0}`;
}

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

function setUploadMessage(template: any, text: string, level: UploadMessageLevel = 'info', scope = 'package') {
  if (!template?.uploadMessages) {
    return;
  }
  const message = {
    text,
    level,
    icon: uploadMessageIcon(level),
    scope,
  };
  template.uploadMessages.set({ ...template.uploadMessages.get(), [scope]: message });
  const existingTimer = template.uploadMessageTimers.get(scope);
  if (existingTimer) {
    Meteor.clearTimeout(existingTimer);
  }
  template.uploadMessageTimers.delete(scope);
  if (level !== 'success') return;
  const timer = Meteor.setTimeout(() => {
    const latest = template.uploadMessages.get()[scope];
    if (latest?.text === text && latest?.level === level && latest?.scope === scope) {
      const messages = { ...template.uploadMessages.get() };
      delete messages[scope];
      template.uploadMessages.set(messages);
    }
    template.uploadMessageTimers.delete(scope);
  }, UPLOAD_MESSAGE_TIMEOUT_MS);
  template.uploadMessageTimers.set(scope, timer);
}

function clearUploadMessage(template: any, scope = 'package') {
  if (!template?.uploadMessages) {
    return;
  }
  const timer = template.uploadMessageTimers.get(scope);
  if (timer) {
    Meteor.clearTimeout(timer);
    template.uploadMessageTimers.delete(scope);
  }
  const messages = { ...template.uploadMessages.get() };
  delete messages[scope];
  template.uploadMessages.set(messages);
}

function getPackageUploadFiles(fileList: any): File[] {
  return Array.from(fileList || [])
    .filter((file: any): file is File => Boolean(file?.name) && /\.zip$/i.test(String(file.name)));
}

function resetPackageFileInput() {
  $('#upload-file').val('');
}

function queuePackageUploads(fileList: any, template: any) {
  if (!hasPublicCreatorDisplayName(Meteor.user())) {
    resetPackageFileInput();
    FlowRouter.go('/profile?contentCreator=required');
    return;
  }
  const files = getPackageUploadFiles(fileList);
  if (files.length === 0) {
    setUploadMessage(template, contentText('content.noFilesSelected'), 'warning');
    resetPackageFileInput();
    return;
  }

  const runQueue = async () => {
    for (const file of files) {
      await doPackageUpload(file, template);
    }
    resetPackageFileInput();
  };

  template.packageUploadQueue = (template.packageUploadQueue || Promise.resolve())
    .then(runQueue)
    .catch((error: any) => {
      clientConsole(1, '[UPLOAD] Package upload queue failed:', error);
      setUploadMessage(template, contentText('content.packageProcessingFailed', { error: uploadErrorText(error) }), 'error');
      resetPackageFileInput();
    });
}

function closeContentConfirmation(template: any, result = false) {
  const controller = template?.inlineConfirmationController as InlineConfirmationController<ContentUploadConfirmationContext> | undefined;
  if (!controller) return;
  const context = controller.getContext();
  const closed = result ? controller.complete() : controller.cancel();
  if (closed) {
    context?.resolve(result);
  }
}

function requestContentConfirmation(template: any, confirmation: InlineConfirmation): Promise<boolean> {
  if (!template?.inlineConfirmationController) {
    return Promise.resolve(false);
  }
  closeContentConfirmation(template, false);
  return new Promise((resolve) => {
    template.inlineConfirmationPlacement = confirmation.placement;
    const trigger = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : template.find('.content-upload-root');
    template.inlineConfirmationController.open({
      confirmationId: `content-confirmation-${Random.id()}`,
      title: confirmation.title,
      message: confirmation.message,
      confirmLabel: confirmation.confirmLabel,
      cancelLabel: confirmation.cancelLabel,
      severity: confirmation.level === 'error' ? 'danger' : 'warning',
      context: { resolve },
    }, trigger);
    Tracker.afterFlush(() => template.inlineConfirmationController.focusInitial(template.firstNode?.parentNode || document));
  });
}

function inlineConfirmationPlacement(template: any) {
  return (template?.inlineConfirmation?.get() as ContentUploadConfirmationPresentation | null)?.placement || '';
}

function assetActionPlacement(tdfId: string) {
  return `asset:${tdfId}:actions`;
}

function mediaPlacement(tdfId: string) {
  return `media:${tdfId}`;
}

function accessCommandScope(tdfId: string): string {
  return `access:${tdfId}`;
}

function isSparcPageDisplay(display: any) {
  return display
    && typeof display === 'object'
    && Array.isArray(display.nodes);
}

function tdfHasSparcPages(tdf: any) {
  const sparcPages = tdf?.rawStimuliFile?.setspec?.sparcPages;
  if (!Array.isArray(sparcPages)) {
    return false;
  }
  return sparcPages.some((page: any) => isSparcPageDisplay(page?.display));
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
  };
  template.accessMessages.set(next);
  assetsHelperLastRun = 0;
  assetsHelperCachedResult = [];

  const existingTimer = template.accessMessageTimers?.get?.(tdfId);
  if (existingTimer) Meteor.clearTimeout(existingTimer);
  if (level !== 'success') return;
  const timer = Meteor.setTimeout(() => {
    const latest = template.accessMessages.get() || {};
    if (!latest[tdfId] || latest[tdfId].text !== text) {
      return;
    }
    const cleaned = { ...latest };
    delete cleaned[tdfId];
    template.accessMessages.set(cleaned);
    assetsHelperLastRun = 0;
    assetsHelperCachedResult = [];
    template.accessMessageTimers?.delete?.(tdfId);
  }, ACCESS_MESSAGE_TIMEOUT_MS);
  template.accessMessageTimers?.set?.(tdfId, timer);
}

async function addAccessorsForTdf(template: any, tdfId: any) {
  const rawInput = String($("#add-access-" + tdfId).val() || "");
  const usernames = rawInput.split(',')
    .map(name => name.trim())
    .filter(Boolean);

  if (usernames.length === 0) {
    setAccessMessage(template, tdfId, contentText('content.enterAtLeastOneEmail'), 'warning');
    return;
  }

  const uniqueUsernames = [...new Set(usernames)];
  await template.commandRegistry.run(accessCommandScope(String(tdfId)), async () => {
    const tdf = TdfsCollection.findOne({ _id: tdfId });
    let currentAccessors = Array.isArray(tdf?.accessors) ? tdf.accessors : null;
    if (!currentAccessors) {
      template?.ensureTdfDetails?.(tdfId);
      currentAccessors = await MeteorAny.callAsync('getAccessorsTDFID', tdfId);
    }
    const lookup = await MeteorAny.callAsync('resolveUsersForTdf', tdfId, uniqueUsernames);
    if (lookup.missing && lookup.missing.length > 0) {
      throw new Error(contentText('content.userNotFound', { users: lookup.missing.join(', ') }));
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
    assetsHelperLastRun = 0;
    assetsHelperCachedResult = [];
    assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
    return {
      text: addedCount > 0 ? contentText('content.sharedWithUsers', { count: addedCount }) : contentText('content.noNewUsersAdded'),
    };
  }, {
    getErrorMessage: (error: any) => contentText('content.addAccessError', { error: uploadErrorText(error) }),
    onFailure: (error: any) => clientConsole(1, '[ACCESS] Add access failed:', error),
  });
}

function invalidateAssetsRows(): void {
  assetsHelperLastRun = 0;
  assetsHelperCachedResult = [];
}

function listValue(instance: ContentUploadInstance): ContentUploadListResult | null {
  return readyLoadValue(instance.listPresentation.get());
}

function summaryMapValue(instance: ContentUploadInstance): ContentUploadSummaryMap {
  return readyLoadValue(instance.summaryPresentation.get()) || {};
}

function loadContentUploadList(instance: ContentUploadInstance, limit: number): void {
  const requestId = ++instance.nextListRequestId;
  const generation = instance.listLifetime.begin();
  instance.listPresentation.set(startLoad(instance.listPresentation.get(), requestId));
  clientConsole(2, '[CONTENT UPLOAD] Fetching list ids via method', 'limit:', limit);

  MeteorAny.callAsync('getContentUploadListIds', { limit })
    .then((result: any) => {
      if (!instance.listLifetime.isCurrent(generation)) return;
      const listResult = normalizeContentUploadListResult(result);
      instance.listPresentation.set(resolveLoad(
        instance.listPresentation.get(),
        requestId,
        listResult,
        (value) => value.ids.length === 0,
      ));
      invalidateAssetsRows();
    })
    .catch((err: any) => {
      if (!instance.listLifetime.isCurrent(generation)) return;
      instance.listPresentation.set(rejectLoad(
        instance.listPresentation.get(),
        requestId,
        { message: contentListFailureText(err), retryable: true },
      ));
      if (!readyLoadValue(instance.listPresentation.get())) {
        instance.summaryPresentation.set({ status: 'empty', value: {} });
      }
      invalidateAssetsRows();
      clientConsole(1, '[CONTENT UPLOAD] List fetch failed:', err);
    });
}

function loadContentUploadSummaries(instance: ContentUploadInstance, ids: string[]): void {
  const requestId = ++instance.nextSummaryRequestId;
  const generation = instance.summaryLifetime.begin();
  if (ids.length === 0) {
    instance.summaryPresentation.set({ status: 'empty', value: {} });
    invalidateAssetsRows();
    return;
  }

  instance.summaryPresentation.set(startLoad(instance.summaryPresentation.get(), requestId));
  MeteorAny.callAsync('getContentUploadSummariesForIds', ids)
    .then((summaries: any) => {
      if (!instance.summaryLifetime.isCurrent(generation)) return;
      const map = normalizeContentUploadSummaryMap(summaries);
      instance.summaryPresentation.set(resolveLoad(
        instance.summaryPresentation.get(),
        requestId,
        map,
        () => false,
      ));
      invalidateAssetsRows();
    })
    .catch((err: any) => {
      if (!instance.summaryLifetime.isCurrent(generation)) return;
      instance.summaryPresentation.set(rejectLoad(
        instance.summaryPresentation.get(),
        requestId,
        { message: summaryFailureText(err), retryable: true },
      ));
      invalidateAssetsRows();
      clientConsole(1, '[CONTENT UPLOAD] Summary fetch failed:', err);
    });
}

function loadUploadQuotaStatus(instance: ContentUploadInstance): void {
  const requestId = ++instance.nextQuotaRequestId;
  const generation = instance.quotaLifetime.begin();
  instance.quotaPresentation.set(startLoad(instance.quotaPresentation.get(), requestId));
  MeteorAny.callAsync('getUploadQuotaStatus')
    .then((status: any) => {
      if (!instance.quotaLifetime.isCurrent(generation)) return;
      instance.quotaPresentation.set(resolveLoad(
        instance.quotaPresentation.get(),
        requestId,
        normalizeUploadQuotaStatus(status),
        () => false,
      ));
    })
    .catch((err: any) => {
      if (!instance.quotaLifetime.isCurrent(generation)) return;
      instance.quotaPresentation.set(rejectLoad(
        instance.quotaPresentation.get(),
        requestId,
        { message: quotaFailureText(err), retryable: true },
      ));
      clientConsole(1, '[QUOTA] Error loading quota status:', err);
    });
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
  packageUploadMessage() {
    return (Template.instance() as any).uploadMessages?.get()?.package || null;
  },
  assetUploadMessage(tdfId: any) {
    return (Template.instance() as any).uploadMessages?.get()?.[`asset:${String(tdfId || '')}`] || null;
  },
  mediaUploadMessage(tdfId: any) {
    return (Template.instance() as any).uploadMessages?.get()?.[`media:${String(tdfId || '')}`] || null;
  },
  contentCommandAttrs(scopeType: string, tdfId: any) {
    const scope = `${String(scopeType || 'asset')}:${String(tdfId || '')}`;
    const pending = (Template.instance() as ContentUploadInstance).commandRegistry.getState(scope).status === 'pending';
    return pending ? { disabled: true, 'aria-busy': 'true' } : {};
  },
  adminUploadMessage() {
    return (Template.instance() as any).uploadMessages?.get()?.admin || null;
  },
  contentListUploadMessage() {
    return (Template.instance() as any).uploadMessages?.get()?.['content-list'] || null;
  },
  inlineConfirmationView() {
    return ((Template.instance() as any).inlineConfirmation?.get() as ContentUploadConfirmationPresentation | null)?.view || null;
  },
  assetActionConfirmationOpen(tdfId: any) {
    return inlineConfirmationPlacement(Template.instance()) === assetActionPlacement(String(tdfId || ''));
  },
  mediaConfirmationOpen(tdfId: any) {
    return inlineConfirmationPlacement(Template.instance()) === mediaPlacement(String(tdfId || ''));
  },
  uploadConfirmationOpen() {
    return inlineConfirmationPlacement(Template.instance()) === 'upload-package';
  },
  adminDangerConfirmationOpen() {
    return inlineConfirmationPlacement(Template.instance()) === 'admin-danger';
  },
  quotaStatus() {
    const state = (Template.instance() as ContentUploadInstance).quotaPresentation.get();
    return readyLoadValue(state) || { unlimited: true };
  },
  quotaStatusError() {
    return loadErrorMessage((Template.instance() as ContentUploadInstance).quotaPresentation.get());
  },
  listErrorText() {
    return loadErrorMessage((Template.instance() as ContentUploadInstance).listPresentation.get());
  },
  summaryErrorText() {
    return loadErrorMessage((Template.instance() as ContentUploadInstance).summaryPresentation.get());
  },
  assets: function(this: any) {
    try {
      const template = (Template.instance() as ContentUploadInstance & any);
      const listState = template.listPresentation.get();
      const summaryState = template.summaryPresentation.get();
      const currentList = listValue(template);
      const summaryMap = summaryMapValue(template);
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

      const listIds = currentList?.ids || [];
      const listLoading = loadPending(listState);
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
            const summaryPresentation = buildRowSummaryPresentation({
              summary,
              summaryStatus: summaryState.status,
              loadingText: contentText('common.loading'),
              missingText: missingSummaryText(),
              failureText: summaryRowFailureText(),
            });
            thisTdf.lessonName = summaryPresentation.lessonName;
            thisTdf.packageFile = summary?.packageFile || null;
            thisTdf.packageAssetId = summary?.packageAssetId || null;
            thisTdf._id = tdfId;
            thisTdf.stimuliSetId = summary?.stimuliSetId || null;
            thisTdf.errors = [...summaryPresentation.errors];
            thisTdf.stimFileInfo = [];
            thisTdf.stimFilesCount = null;
            thisTdf.fileName = summary?.fileName || 'unknown.xml';
            thisTdf.languageMetadataRows = buildLanguageMetadataRows(summary);

            thisTdf.isOwnTdf = summary?.ownerId === Meteor.userId();
            thisTdf.isPublic = summary?.isPublic ?? false;
            thisTdf.checkedIfPublic = thisTdf.isPublic ? 'checked' : null;
            thisTdf.publicPrivateLabel = thisTdf.isPublic ? 'Public' : 'Private';
            thisTdf.publicVisibilityLocked = Boolean(summary?.publicVisibilityLocked);
            thisTdf.publicVisibilityLockReason = String(summary?.publicVisibilityLockReason || '');
            thisTdf.publicPrivateToggleAttrs = thisTdf.publicVisibilityLocked
              ? { disabled: true, title: thisTdf.publicVisibilityLockReason || 'This content is locked private.' }
              : {};
            thisTdf.summaryLoading = summaryPresentation.summaryLoading;
            thisTdf.accessMessageText = accessMessages?.[tdfId]?.text || null;
            thisTdf.accessMessageLevel = accessMessages?.[tdfId]?.level || 'info';

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
            thisTdf.assetsCount = typeof thisTdf.assetCount === 'number' ? thisTdf.assetCount : null;

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
  listReady() {
    const state = (Template.instance() as ContentUploadInstance).listPresentation.get();
    return !loadPending(state);
  },
  listDisplayReady() {
    const template = (Template.instance() as ContentUploadInstance & any);
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
    const template = (Template.instance() as ContentUploadInstance & any);
    if (!template || loadPending(template.listPresentation.get())) {
      return false;
    }
    const ids = listValue(template)?.ids || [];
    const hasIds = Array.isArray(ids) && ids.length > 0;
    const pendingUploads = template.pendingUploads ? template.pendingUploads.all() : {};
    const hasPending = Object.values(pendingUploads || {}).some(Boolean);
    return !hasIds && !hasPending;
  },
  canLoadMore() {
    const template = (Template.instance() as ContentUploadInstance & any);
    if (loadPending(template.listPresentation.get())) {
      return false;
    }
    const currentList = listValue(template);
    return currentList ? currentList.hasMore : false;
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

  Template.contentUpload.onCreated(function(this: ContentUploadInstance & any) {
    this.currentUpload = new ReactiveVar(false);
    this.curFilesToUpload = new ReactiveVar([]);
    this.uploadMessages = new ReactiveVar({});
    this.uploadMessageTimers = new Map();
    this.commandRegistry = createScopedAsyncCommandRegistry<ContentCommandResult>((scope, state) => {
      if (scope.startsWith('access:')) {
        const tdfId = scope.slice('access:'.length);
        if (state.status === 'pending') setAccessMessage(this, tdfId, contentText('common.loading'), 'info');
        else if (state.status === 'error') setAccessMessage(this, tdfId, state.message, 'error');
        else if (state.status === 'success' && state.result.text) {
          setAccessMessage(this, tdfId, state.result.text, state.result.level || 'success');
        }
        return;
      }
      if (state.status === 'pending') setUploadMessage(this, contentText('common.loading'), 'info', scope);
      else if (state.status === 'error') setUploadMessage(this, state.message, 'error', scope);
      else if (state.status === 'success') {
        if (state.result.text) setUploadMessage(this, state.result.text, state.result.level || 'success', scope);
        else clearUploadMessage(this, scope);
      }
    });
    this.packageUploadQueue = Promise.resolve();
    this.inlineConfirmation = new ReactiveVar<ContentUploadConfirmationPresentation | null>(null);
    this.inlineConfirmationPlacement = '';
    this.inlineConfirmationController = createInlineConfirmationController<ContentUploadConfirmationContext>(
      (view) => {
        this.inlineConfirmation.set(view.status === 'open'
          ? { placement: this.inlineConfirmationPlacement, view }
          : null);
        if (view.status === 'closed') this.inlineConfirmationPlacement = '';
      },
      () => this.find('.content-upload-root'),
    );
    this.pendingUploads = new ReactiveDict(); // Track pending package uploads
    this.autoruns = [];
    this.detailSubs = new Map();
    this.assetSubs = new Map();
  this.listPresentation = new ReactiveVar<LoadableState<ContentUploadListResult>>({ status: 'idle' });
  this.summaryPresentation = new ReactiveVar<LoadableState<ContentUploadSummaryMap>>({ status: 'idle' });
  this.quotaPresentation = new ReactiveVar<LoadableState<UploadQuotaStatus>>({ status: 'idle' });
  this.listLifetime = createTemplateLifetime();
  this.summaryLifetime = createTemplateLifetime();
  this.quotaLifetime = createTemplateLifetime();
  this.nextListRequestId = 0;
  this.nextSummaryRequestId = 0;
  this.nextQuotaRequestId = 0;
  this.lastListFetchKey = null;
  this.lastListFetch = 0;
  this.summaryFetchKey = null;
    this.lastSummaryFetch = 0;
    this.listLimit = new ReactiveVar(CONTENT_UPLOAD_LIST_LIMIT);
    this.lastDdpStatus = null;
    this.accessMessages = new ReactiveVar({});
    this.accessMessageTimers = new Map();
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
    const refreshToken = contentUploadRefreshToken();
    const key = `${limit}-${refreshToken}`;
    const now = Date.now();
    if (this.lastListFetchKey === key && (now - this.lastListFetch) < SUMMARY_FETCH_THROTTLE) {
      return;
    }
    this.lastListFetchKey = key;
    this.lastListFetch = now;

    loadContentUploadList(this, limit);
  }));

  this.autoruns.push(this.autorun(() => {
    const ids = listValue(this)?.ids || [];
    const refreshToken = contentUploadRefreshToken();
    if (!Array.isArray(ids) || ids.length === 0) {
      this.summaryPresentation.set({ status: 'empty', value: {} });
      return;
    }
    const key = `${ids.slice().sort().join(',')}-${refreshToken}`;
    const now = Date.now();
    if (this.summaryFetchKey === key && (now - this.lastSummaryFetch) < SUMMARY_FETCH_THROTTLE) {
      return;
    }
    this.summaryFetchKey = key;
    this.lastSummaryFetch = now;

    loadContentUploadSummaries(this, ids);
  }));

  this.autoruns.push(this.autorun(() => {
    const status = Meteor.status();
    if (status.status !== this.lastDdpStatus) {
      clientConsole(1, '[DDP] status:', status.status, 'connected:', status.connected, 'retryCount:', status.retryCount);
      this.lastDdpStatus = status.status;
    }
  }));

  this.autoruns.push(this.autorun(() => {
    const listLoading = loadPending(this.listPresentation.get());
    const summaryLoading = loadPending(this.summaryPresentation.get());
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

  loadUploadQuotaStatus(this);

});

Template.contentUpload.onDestroyed(function(this: ContentUploadInstance & any) {
  // Clean up autoruns
  this.autoruns.forEach((ar: any) => ar.stop());
  this.listLifetime.destroy();
  this.summaryLifetime.destroy();
  this.quotaLifetime.destroy();
  this.commandRegistry.destroy();
  if (this.overlayTimer) {
    clearTimeout(this.overlayTimer);
    this.overlayTimer = null;
  }
  if (this.pendingUploadTickInterval) {
    clearInterval(this.pendingUploadTickInterval);
    this.pendingUploadTickInterval = null;
  }
  for (const timer of this.uploadMessageTimers.values()) Meteor.clearTimeout(timer);
  this.uploadMessageTimers.clear();
  for (const timer of this.accessMessageTimers.values()) Meteor.clearTimeout(timer);
  this.accessMessageTimers.clear();
  const confirmationContext = this.inlineConfirmationController.getContext() as ContentUploadConfirmationContext | undefined;
  this.inlineConfirmationController.destroy();
  confirmationContext?.resolve(false);

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
  'click [data-content-quota-retry]'(event: any, template: ContentUploadInstance & any) {
    event.preventDefault();
    loadUploadQuotaStatus(template);
  },
  'click [data-content-list-retry]'(event: any, _template: ContentUploadInstance & any) {
    event.preventDefault();
    assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
  },
  'click [data-content-summary-retry]'(event: any, template: ContentUploadInstance & any) {
    event.preventDefault();
    const ids = listValue(template)?.ids || [];
    loadContentUploadSummaries(template, ids);
  },
  'click .admin-confirmation-confirm': function(event: any, template: any) {
    event.preventDefault();
    if (template.inlineConfirmationController.getView().pending) return;
    closeContentConfirmation(template, true);
  },
  'click .admin-confirmation-cancel': function(event: any, template: any) {
    event.preventDefault();
    closeContentConfirmation(template, false);
  },
  'keydown .content-upload-root': function(event: KeyboardEvent, template: any) {
    const controller = template.inlineConfirmationController as InlineConfirmationController<ContentUploadConfirmationContext>;
    const context = controller.getContext();
    if (controller.handleKeydown(event)) {
      context?.resolve(false);
    }
  },

  // Toggle TDF public/private setting
  'change .public-private-toggle': async function(event: any, template: any) {
    const tdfId = event.currentTarget.getAttribute('data-tdfid');
    const isPublic = event.currentTarget.checked;
    const scope = `asset:${tdfId}`;
    await template.commandRegistry.run(scope, async () => {
      await MeteorAny.callAsync('setTdfUserSelect', tdfId, isPublic);
      // Refresh the assets list
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
      return { text: '' };
    }, {
      getErrorMessage: (err: any) => contentText('content.visibilityChangeError', { error: uploadErrorText(err) }),
      onFailure: (err: any) => {
        clientConsole(1, '[PUBLIC/PRIVATE] Error toggling public/private setting:', err);
        event.currentTarget.checked = !isPublic;
      },
    });
  },

  // Open content editor for TDF (stimuli editing)
  'click #content-edit-btn': function(event: any, template: any) {
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

    const routeToEditor = (selectedTdf: any) => {
      const editorRoute = tdfHasSparcPages(selectedTdf) ? '/sparcEdit/' : '/contentEdit/';
      FlowRouter.go(editorRoute + tdfId + stimFileParam);
    };

    const selectedTdf = TdfsCollection.findOne({ _id: tdfId });
    if (selectedTdf) {
      routeToEditor(selectedTdf);
      return;
    }

    template?.ensureTdfDetails?.(tdfId);
    const detailSub = template?.detailSubs?.get?.(tdfId);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    const computation = Tracker.autorun((run: any) => {
      const loadedTdf = TdfsCollection.findOne({ _id: tdfId });
      if (loadedTdf) {
        run.stop();
        button.disabled = false;
        button.removeAttribute('aria-busy');
        routeToEditor(loadedTdf);
        return;
      }
      if (detailSub?.ready?.()) {
        run.stop();
        button.disabled = false;
        button.removeAttribute('aria-busy');
        setUploadMessage(template, contentText('content.contentDetailsLoadFailed'), 'error', `asset:${tdfId}`);
      }
    });

    setTimeout(() => {
      if (!computation.stopped) {
        computation.stop();
        button.disabled = false;
        button.removeAttribute('aria-busy');
        setUploadMessage(template, contentText('content.contentDetailsStillLoading'), 'warning', `asset:${tdfId}`);
      }
    }, 10000);
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
  'click #copy-tdf-btn': async function(event: any, template: any) {
    event.preventDefault();
    if (!hasPublicCreatorDisplayName(Meteor.user())) {
      FlowRouter.go('/profile?contentCreator=required');
      return;
    }
    const tdfId = event.currentTarget.value;

    const confirmed = await requestContentConfirmation(template, {
      placement: assetActionPlacement(String(tdfId || '')),
      title: contentText('content.createPrivateCopy'),
      message: contentText('content.privateCopyMessage'),
      confirmLabel: contentText('content.createCopy'),
      cancelLabel: contentText('content.cancel'),
      level: 'warning'
    });
    if (!confirmed) {
      return;
    }

    const scope = `asset:${tdfId}`;
    await template.commandRegistry.run(scope, async () => {
      const result = await MeteorAny.callAsync('copyTdf', tdfId);
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
      return { text: contentText('content.copyCreated', { name: result.newName }) };
    }, {
      getErrorMessage: (error: any) => contentText('content.copyError', { error: uploadErrorText(error) }),
      onFailure: (error: any) => clientConsole(1, 'Error copying TDF:', error),
    });
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

  'dragenter .package-drop-zone, dragover .package-drop-zone': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('drag-over');
  },

  'dragleave .package-drop-zone': function(event: any) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget)) {
      event.currentTarget.classList.remove('drag-over');
    }
  },

  'drop .package-drop-zone': function(event: any, template: any) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
    clearUploadMessage(template);
    queuePackageUploads(event.originalEvent?.dataTransfer?.files || event.dataTransfer?.files, template);
  },

  'keydown .package-drop-zone': function(event: any) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    $('#upload-file').trigger('click');
  },

  // Admin/Teachers - upload MoFaCTS package files
  'change #upload-file': function(event: any, template: any) {
    clearUploadMessage(template);
    queuePackageUploads(event.currentTarget.files, template);
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

      

      const SQL = await ensureSqlJs();
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
          deliverySettings: {
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
      setUploadMessage(template, contentText('content.apkgConvertError', { error: uploadErrorText(error) }), 'error');
    } finally {
      // Clear file input
      $('#upload-apkg').val('');
    }
  },  
  'click .show-stimuli-btn': function(event: any, template: any){
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-file');
    const panel = $('#stimuli-' + tdfId);
    if (panel.attr('hidden')) {
      template.ensureTdfDetails(tdfId);
      panel.removeAttr('hidden');
      event.currentTarget.setAttribute('aria-expanded', 'true');
    } else {
      panel.attr('hidden', 'true');
      event.currentTarget.setAttribute('aria-expanded', 'false');
    }
  },
  'click .show-manage-access-btn': function(event: any, template: any){
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-file');
    const panel = $('#manage-access-' + tdfId);
    if (panel.attr('hidden')) {
      template.ensureTdfDetails(tdfId);
      panel.removeAttr('hidden');
      event.currentTarget.setAttribute('aria-expanded', 'true');
    } else {
      panel.attr('hidden', 'true');
      event.currentTarget.setAttribute('aria-expanded', 'false');
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
    'click #tdf-download-btn': async function(event: any, template: any){
      event.preventDefault();
      const tdfId = event.currentTarget.getAttribute('data-tdfid');
      if (!tdfId) {
        setUploadMessage(template, contentText('content.packageDownloadMissingLesson'), 'error', `asset:${tdfId || ''}`);
        return;
      }

      await template.commandRegistry.run(`asset:${tdfId}`, async () => {
        const result = await MeteorAny.callAsync('getPackageDownloadLink', tdfId);
        if (!result || !result.link) {
          throw new Error(contentText('content.packageDownloadMissingLink'));
        }
        window.open(result.link);
        return { text: '' };
      }, {
        getErrorMessage: (error: any) => contentText('content.packageDownloadError', { error: uploadErrorText(error) }),
        onFailure: (error: any) => clientConsole(1, '[DOWNLOAD] Package download failed:', error),
      });
    },
  'click #package-delete-btn': async function(event: any, template: any){
      event.preventDefault();
      const packageAssetId = event.currentTarget.getAttribute('value');
      const packageFile = event.currentTarget.getAttribute('data-package-file');
      const fileName = event.currentTarget.getAttribute('data-filename') || 'this package';
      const row = $(event.currentTarget).closest('tr');
      const tdfId = row.find('#content-edit-btn').attr('value') || packageAssetId || fileName;

      const confirmed = await requestContentConfirmation(template, {
        placement: assetActionPlacement(String(tdfId || '')),
        title: contentText('content.deletePackage'),
        message: contentText('content.deletePackageMessage', { filename: fileName }),
        confirmLabel: contentText('content.deletePackage'),
        cancelLabel: contentText('content.cancel'),
        level: 'error'
      });
      if (!confirmed) {
        return;
      }
      
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
      await template.commandRegistry.run(`asset:${tdfId}`, async () => {
        try {
          await MeteorAny.callAsync('deletePackageFile', packageAssetId);
          
          // Invalidate cache and trigger reactive refresh
          assetsHelperLastRun = 0;
          assetsHelperCachedResult = [];
          assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
          setUploadMessage(template, contentText('content.deletedPackage', { filename: fileName }), 'success', 'content-list');
          return { text: contentText('content.deletedPackage', { filename: fileName }) };
        } finally {
          pendingPackageDeletes.set(pendingKey, undefined);
        }
      }, {
        getErrorMessage: (error: any) => contentText('content.deletePackageError', { error: uploadErrorText(error) }),
        onFailure: (error: any) => clientConsole(1, 'Delete error:', error),
      });
    },
  'click #reset-conditions-btn': function(event: any){
    const tdfId = event.currentTarget.getAttribute('value')
    MeteorAny.callAsync('resetTdfConditionCounts',tdfId);
  },

  'click #assetDeleteButton': function(event: any){
    const assetId = event.currentTarget.getAttribute('value')
    MeteorAny.callAsync('removeAssetById', assetId);
  },

  'click .stim-download-btn': async function(event: any, template: any){
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-tdfid');
    if (!tdfId) {
      setUploadMessage(template, contentText('content.stimulusDownloadMissingLesson'), 'error', `asset:${tdfId || ''}`);
      return;
    }

    await template.commandRegistry.run(`asset:${tdfId}`, async () => {
      const result = await MeteorAny.callAsync('getStimuliFileForTdf', tdfId);
      if (!result || !result.stimFile) {
        throw new Error(contentText('content.stimulusDownloadMissingFile'));
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
      return { text: '' };
    }, {
      getErrorMessage: (error: any) => contentText('content.stimulusDownloadError', { error: uploadErrorText(error) }),
      onFailure: (error: any) => clientConsole(1, '[DOWNLOAD] Stimulus download failed:', error),
    });
  },
  'click #deleteAllAssetsConfirm': async function(e: any, template: any) {
    e.preventDefault();
    const confirmed = await requestContentConfirmation(template, {
      placement: 'admin-danger',
      title: contentText('content.deleteAllUploadedFiles'),
      message: contentText('content.deleteAllWarning'),
      confirmLabel: contentText('content.deleteAllUploadedFiles'),
      cancelLabel: contentText('content.cancel'),
      level: 'error'
    });
    if (!confirmed) {
      return;
    }
    
    MeteorAny.callAsync('deleteAllFiles',
      function(error: any, result: any) {
        if (error) {
          setUploadMessage(template, contentText('content.errorDeletingFiles', { error: uploadErrorText(error) }), 'error', 'admin');
        } else {
          setUploadMessage(template, contentText('content.deletedFiles', { count: result }), 'success', 'admin');
        }
      }
    );
  },
  'click .imageLink'(e: any, template: any) {
    const url = $(e.currentTarget).data('link');

    // MO8: Use DOM createElement for security and proper image optimization
    // SECURITY: Prevents XSS via proper DOM API instead of HTML string concatenation
    const popup = window.open();
    if (!popup) {
      setUploadMessage(template, contentText('content.popupBlocked'), 'warning');
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
  'click .add-access-btn': async function(event: any, template: any){
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
  'click .remove-access-btn': async function(event: any, template: any){
    const tdfId = event.currentTarget.getAttribute('value');
    const revokedAccessorId = event.currentTarget.getAttribute('data-user');
    await template.commandRegistry.run(accessCommandScope(String(tdfId)), async () => {
      const tdf = TdfsCollection.findOne({ _id: tdfId });
      let currentAccessors = Array.isArray(tdf?.accessors) ? tdf.accessors : null;
      if (!currentAccessors) {
        template?.ensureTdfDetails?.(tdfId);
        currentAccessors = await MeteorAny.callAsync('getAccessorsTDFID', tdfId);
      }
      const remainingAccessors = currentAccessors.filter((accessor: any) => accessor.userId !== revokedAccessorId);
      await MeteorAny.callAsync('assignAccessors', tdfId, remainingAccessors, [revokedAccessorId]);
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
      return { text: contentText('content.userAccessRemoved') };
    }, {
      getErrorMessage: (error: any) => contentText('content.removeAccessError', { error: uploadErrorText(error) }),
      onFailure: (error: any) => clientConsole(1, '[ACCESS] Remove access failed:', error),
    });
  },
  'click .transfer-btn': async function(event: any, template: any){
    const tdfId = event.currentTarget.getAttribute('value');
    const newOwnerUsername = String(($('#transfer-' + tdfId).val() || '')).trim();
    if (!newOwnerUsername) {
      setAccessMessage(template, tdfId, contentText('content.enterNewOwner'), 'warning');
      return;
    }

    await template.commandRegistry.run(accessCommandScope(String(tdfId)), async () => {
      const lookup = await MeteorAny.callAsync('resolveUsersForTdf', tdfId, [newOwnerUsername]);
      if (lookup.missing && lookup.missing.length > 0) {
        throw new Error(contentText('content.userNotFound', { users: lookup.missing.join(', ') }));
      }

      const newOwner = lookup.users[0];
      await MeteorAny.callAsync('transferDataOwnership', tdfId, newOwner);
      $('#transfer-' + tdfId).val('');
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
      return {
        text: contentText('content.ownershipTransferred', { owner: newOwner.displayIdentifier || newOwner.username || 'new owner' }),
      };
    }, {
      getErrorMessage: (error: any) => contentText('content.transferOwnershipError', { error: uploadErrorText(error) }),
      onFailure: (error: any) => clientConsole(1, '[ACCESS] Transfer ownership failed:', error),
    });
  },
  'click #load-more-tdfs': function(event: any, template: any){
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
    const stimSetId = stimSetIdRaw && stimSetIdRaw.trim().length > 0 ? stimSetIdRaw.trim() : null;
    const panel = $(`#media-manager-${tdfId}`);
    if (panel.attr('hidden')) {
      template.ensureAssetsSubscription(tdfId, stimSetId);
      panel.removeAttr('hidden');
      event.currentTarget.setAttribute('aria-expanded', 'true');
    } else {
      panel.attr('hidden', 'true');
      event.currentTarget.setAttribute('aria-expanded', 'false');
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
  'click .btn-delete-media': async function(event: any, template: any) {
    event.preventDefault();
    event.stopPropagation();

    const assetId = event.currentTarget.getAttribute('data-assetid');
    const filename = event.currentTarget.getAttribute('data-filename');
    const panel = $(event.currentTarget).closest('.media-manager-panel');
    const tdfId = (panel.attr('id') || '').replace('media-manager-', '');

    if (!assetId) {
      setUploadMessage(template, contentText('content.cannotDeleteAssetMissing'), 'error', `media:${tdfId}`);
      return;
    }

    const confirmed = await requestContentConfirmation(template, {
      placement: mediaPlacement(String(tdfId || '')),
      title: contentText('content.deleteMediaFile'),
      message: contentText('content.deleteFileMessage', { filename: filename || '' }),
      confirmLabel: contentText('content.deleteFile'),
      cancelLabel: contentText('content.cancel'),
      level: 'error'
    });
    if (!confirmed) {
      return;
    }

    await template.commandRegistry.run(`media:${tdfId}`, async () => {
      await MeteorAny.callAsync('removeAssetById', assetId);
      // Refresh the assets list
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
      return { text: '' };
    }, {
      getErrorMessage: (error: any) => contentText('content.errorDeletingFile', { error: uploadErrorText(error) }),
      onFailure: (error: any) => clientConsole(1, '[MEDIA] Delete error:', error),
    });
  },

  // Delete selected files (batch delete)
  'click .delete-selected-media': async function(event: any, template: any) {
    event.preventDefault();
    const tdfId = event.currentTarget.getAttribute('data-tdfid');
    const panel = $(`#media-manager-${tdfId}`);
    const selectedCheckboxes = panel.find('.media-select-checkbox:checked');

    if (selectedCheckboxes.length === 0) {
      setUploadMessage(template, contentText('content.noFilesSelected'), 'warning', `media:${tdfId}`);
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
      setUploadMessage(template, contentText('content.noValidFilesSelected'), 'warning', `media:${tdfId}`);
      return;
    }

    const filesPreview = `${filenames.slice(0, 5).join(', ')}${filenames.length > 5 ? ', ...' : ''}`;
    const confirmMsg = assetIds.length === 1
      ? contentText('content.deleteFileMessage', { filename: filenames[0] || '' })
      : contentText('content.deleteFilesMessage', { count: assetIds.length, files: filesPreview });

    const confirmed = await requestContentConfirmation(template, {
      placement: mediaPlacement(String(tdfId || '')),
      title: contentText('content.deleteSelectedMedia'),
      message: confirmMsg,
      confirmLabel: assetIds.length === 1 ? contentText('content.deleteFile') : contentText('content.deleteFiles'),
      cancelLabel: contentText('content.cancel'),
      level: 'error'
    });
    if (!confirmed) {
      return;
    }

    await template.commandRegistry.run(`media:${tdfId}`, async () => {
      await MeteorAny.callAsync('removeMultipleAssets', assetIds);
      
      // Refresh the assets list
      assetsHelperLastRun = 0;
      assetsHelperCachedResult = [];
      assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
      return { text: '' };
    }, {
      getErrorMessage: (error: any) => contentText('content.errorDeletingFiles', { error: uploadErrorText(error) }),
      onFailure: (error: any) => clientConsole(1, '[MEDIA] Batch delete error:', error),
    });
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
    setUploadMessage(template, contentText('content.mediaListLoading'), 'warning', `media:${tdfId}`);
    return;
  }

  // Validate file types
  const validTypes = ['image/', 'audio/', 'video/'];
  const validFiles = Array.from(files).filter((file: any) =>
    validTypes.some(type => file.type.startsWith(type))
  );

  if (validFiles.length === 0) {
    setUploadMessage(template, contentText('content.noValidMediaFiles'), 'warning', `media:${tdfId}`);
    return;
  }

  if (validFiles.length !== files.length) {
    const skipped = files.length - validFiles.length;
    setUploadMessage(template, contentText('content.mediaFilesSkipped', { count: skipped }), 'warning', `media:${tdfId}`);
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
        const confirmed = await requestContentConfirmation(template, {
          placement: mediaPlacement(String(tdfId || '')),
          title: contentText('content.overwriteMediaFile'),
          message: contentText('content.mediaFileExistsOverwrite', { filename: file.name }),
          confirmLabel: contentText('content.overwriteFile'),
          cancelLabel: contentText('content.skip'),
          level: 'warning'
        });
        if (!confirmed) {
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
      setUploadMessage(template, contentText('content.uploadMediaError', { filename: file.name, error: uploadErrorText(error) }), 'error', `media:${tdfId}`);
    }
  }

  // Hide progress immediately, then refresh
  progressContainer.hide();
  progressBar.css('width', '0%');
  statusText.text('Upload complete!');
  if (completed === total) {
    setUploadMessage(template, contentText('content.uploadedMediaFiles', { count: completed }), 'success', `media:${tdfId}`);
  }

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
  const template = (Template.instance() as any);
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
      setUploadMessage(template, contentText('content.existingPackageCheckError', { error: uploadErrorText(error) }), 'error');
      continue;
    }
    if (existingFile) {
      //atempts to delete existing file
      try {
        // Security: Use server method instead of direct client remove
        MeteorAny.callAsync('removeAssetById', existingFile._id);
      } catch (e) {
        
        setUploadMessage(template, contentText('content.deleteExistingFileError'), 'error');
      }
    } else {
      await doPackageUpload(file, (Template.instance() as any));
    }
  } else {
      const name = file.name;
      const fileType = file.fileType;
      const fileDescrip = file.fileDescrip;
      if (name.indexOf('<') != -1 || name.indexOf('>') != -1 || name.indexOf(':') != -1 ||
        name.indexOf('"') != -1 || name.indexOf('/') != -1 || name.indexOf('|') != -1 ||
        name.indexOf('?') != -1 || name.indexOf('*') != -1) {
        setUploadMessage(template, contentText('content.invalidFilenameCharacters'), 'warning');
      } else {
        const fileData = await readFileAsDataURL(file);
        

        try {
          const result: any = await meteorCallAsync('saveContentFile', fileType, name, fileData, Meteor.userId());
          if (!result.result) {
            if(result.data && result.data.res == 'awaitClientTDF'){
              const reasons = Array.isArray(result.data.reason) ? result.data.reason : [];
              const confirmed = await requestContentConfirmation(template, {
                placement: 'upload-package',
                title: contentText('content.overwriteExistingContent'),
                message: contentText('content.previousFileOverwriteMessage', { filename: result.data.TDF.content.fileName }),
                confirmLabel: contentText('content.overwriteContent'),
                cancelLabel: contentText('content.cancel'),
                level: 'warning'
              });
              if(confirmed){
                try {
                  await MeteorAny.callAsync('tdfUpdateConfirmed', result.data.TDF, false, reasons);
                } catch (err: any) {
                  setUploadMessage(template, contentText('content.confirmationFailed', { error: uploadErrorText(err) }), 'error');
                }
              }
            } else {
              
              errorStack.push(contentText('content.fileSaveError', { fileDescription: fileDescrip, error: result.errmsg || '' }));
            }
          }
        } catch (error: any) {
          
          errorStack.push(contentText('content.fileCriticalSaveError', { fileDescription: fileDescrip, error: uploadErrorText(error) }));
        }
      }
    }

    $('#stimUploadLoadingSymbol').hide()
    
    if (errorStack.length == 0) {
      setUploadMessage(template, contentText('content.filesSaved'), 'success');
    } else {
      setUploadMessage(template, contentText('content.fileUploadErrors', { count: errorStack.length, errors: errorStack.join('; ') }), 'error');
    }

    //force the stimDisplayTypeMap to refresh on next card load
    Session.set('stimDisplayTypeMap', undefined);

    //clear the file upload fields
    $('#upload-file').val('');

     // Now we can clear the selected file
    $('#upload-file').val('');
    $('#upload-file').parent().find('.file-info').html('');
    }
  }



async function doPackageUpload(file: any, template: any): Promise<{ fileName: string; error?: string; skipped?: boolean }>{
  let existingFile = null;
  try {
    existingFile = await MeteorAny.callAsync('getUserAssetByName', file.name);
  } catch (error: any) {
    clientConsole(1, '[UPLOAD] Failed to check existing package:', error);
    setUploadMessage(template, contentText('content.existingPackageCheckError', { error: uploadErrorText(error) }), 'error');
    return { fileName: file.name, error: uploadErrorText(error) };
  }

  if (existingFile) {
    const confirmed = await requestContentConfirmation(template, {
      placement: 'upload-package',
      title: contentText('content.overwriteExistingPackage'),
      message: contentText('content.packageOverwriteMessage', { filename: file.name }),
      confirmLabel: contentText('content.overwritePackage'),
      cancelLabel: contentText('content.cancel'),
      level: 'warning'
    });
    if (confirmed) {
      // Security: Use server method instead of direct client remove
      await MeteorAny.callAsync('removeAssetById', existingFile._id);
    } else {
      setUploadMessage(template, contentText('content.uploadCanceledPackage', { filename: file.name }), 'warning');
      return { fileName: file.name, skipped: true };
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
  setUploadMessage(template, contentText('content.uploadingFile', { filename: file.name }), 'info');

  // Force immediate UI refresh
  assetsHelperLastRun = 0;
  assetsHelperCachedResult = [];

  let uploadIntegrity: { expectedSize: number; sha256?: string } = { expectedSize: Number(file?.size) || 0 };
  try {
    template.pendingUploads.set(tempId, {
      ...template.pendingUploads.get(tempId),
      status: "checking",
      progress: 0
    });
    uploadIntegrity = await getUploadIntegrity(file);
  } catch (error) {
    clientConsole(1, '[UPLOAD] Could not compute package checksum; continuing with size check only:', error);
  }

  return await new Promise<{ fileName: string; error?: string; skipped?: boolean }>((resolve) => {
    const finish = (result: { fileName: string; error?: string; skipped?: boolean }) => {
      resolve(result);
    };

    const upload = DynamicAssetsCollection.insert({
      file: file,
      chunkSize: 'dynamic',
      meta: {
        expectedSize: uploadIntegrity.expectedSize,
        sha256: uploadIntegrity.sha256
      }
    }, false);

    upload.on('start', function (this: any) {
      template.currentUpload.set(this);

      // OPTIMISTIC UI: Replace temp ID with actual upload ID
      const actualId = this._id;
      const pendingData = template.pendingUploads.get(tempId);
      if (!pendingData || typeof pendingData.fileName !== 'string') {
        const message = 'Pending package upload metadata is missing before upload start.';
        template.pendingUploads.set(tempId, {
          uploadId: tempId,
          fileName: file.name,
          status: "error",
          lessonName: file.name.replace(/\.zip$/i, ''),
          progress: 0,
          error: message
        });
        setUploadMessage(template, message, 'error');
        finish({ fileName: file.name, error: message });
        return;
      }
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
        const message = contentText('content.uploadFailedForFile', { filename: file.name, error: uploadErrorText(error) });
        if (uploadData) {
          template.pendingUploads.set(pendingUploadId, {
            ...uploadData,
            status: "error",
            error: message,
            progress: 0
          });
          setUploadMessage(template, message, 'error');
          assetsHelperLastRun = 0;
          assetsHelperCachedResult = [];
        }
        clientConsole(1, '[UPLOAD] Upload failed:', error);
        finish({ fileName: file.name, error: message });
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
            const message = contentText('content.processingDisabledDebug');
            if (uploadData) {
              template.pendingUploads.set(pendingUploadId, {
                ...uploadData,
                status: "error",
                packageAssetId: packageAssetId,
                error: message
              });
              setUploadMessage(template, message, 'warning');
              assetsHelperLastRun = 0;
              assetsHelperCachedResult = [];
            }
            finish({ fileName: file.name, error: message });
            return;
          }

          (async () => {
            try {
              const result = await MeteorAny.callAsync('processPackageUpload', fileObj._id, Meteor.userId(), link, emailToggle, uploadIntegrity);

              for (const res of (result.results || [])) {
                if (res.data && res.data.res == 'awaitClientTDF') {
                  let reason = []
                  const reasons = Array.isArray(res.data.reason) ? res.data.reason : [];
                  if(reasons.includes('prevTDFExists'))
                    reason.push(contentText('content.previousTdfOverwriteMessage', { filename: res.data.TDF.content.fileName }))
                  if(reasons.includes(`prevStimExists`))
                    reason.push(contentText('content.previousStimOverwriteMessage', { filename: res.data.TDF.content.tdfs.tutor.setspec.stimulusfile }))

                  const confirmed = await requestContentConfirmation(template, {
                    placement: 'upload-package',
                    title: contentText('content.overwriteExistingContent'),
                    message: reason.join(' '),
                    confirmLabel: contentText('content.overwriteContent'),
                    cancelLabel: contentText('content.cancel'),
                    level: 'warning'
                  });
                  if(confirmed){
                    try {
                      await MeteorAny.callAsync('tdfUpdateConfirmed', res.data.TDF, false, reasons);
                    } catch (err: any) {
                      // OPTIMISTIC UI: Update error state (no alert)
                      const uploadData = template.pendingUploads.get(pendingUploadId);
                      const message = contentText('content.confirmationFailed', { error: uploadErrorText(err) });
                      if (uploadData) {
                        template.pendingUploads.set(pendingUploadId, {
                          ...uploadData,
                          status: "error",
                          packageAssetId: packageAssetId,
                          error: message
                        });
                        setUploadMessage(template, message, 'error');
                        assetsHelperLastRun = 0;
                        assetsHelperCachedResult = [];
                      }
                      clientConsole(1, '[UPLOAD] Confirmation failed:', err);
                      finish({ fileName: file.name, error: message });
                      return;
                    }
                  }
                }
                else if(!res.result) {
                  // OPTIMISTIC UI: Update error state (no alert)
                  const uploadData = template.pendingUploads.get(pendingUploadId);
                  const message = res.errmsg
                    ? contentText('content.packageProcessingFailed', { error: res.errmsg })
                    : contentText('content.packageProcessingFailed', { error: '' });
                  if (uploadData) {
                    template.pendingUploads.set(pendingUploadId, {
                      ...uploadData,
                      status: "error",
                      packageAssetId: packageAssetId,
                      error: message
                    });
                    setUploadMessage(template, message, 'error');
                    assetsHelperLastRun = 0;
                    assetsHelperCachedResult = [];
                  }
                  clientConsole(1, '[UPLOAD] Package processing failed:', res.errmsg);
                  finish({ fileName: file.name, error: message });
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
                setUploadMessage(template, contentText('content.uploadedPackageRefreshing', { filename: file.name }), 'success');
              }

              // Invalidate cache and trigger reactive refresh after successful upload
              assetsHelperLastRun = 0;
              assetsHelperCachedResult = [];
              assetsRefreshTrigger.set(assetsRefreshTrigger.get() + 1);
              finish({ fileName: file.name });
            } catch (err: any) {
              // OPTIMISTIC UI: Update error state (no alert)
              const uploadData = template.pendingUploads.get(pendingUploadId);
              const message = contentText('content.packageProcessingFailed', { error: uploadErrorText(err) });
              if (uploadData) {
                template.pendingUploads.set(pendingUploadId, {
                  ...uploadData,
                  status: "error",
                  packageAssetId: packageAssetId,
                  error: message
                });
                setUploadMessage(template, message, 'error');
                assetsHelperLastRun = 0;
                assetsHelperCachedResult = [];
              }
              clientConsole(1, '[UPLOAD] Processing error:', err);
              finish({ fileName: file.name, error: message });
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
            setUploadMessage(template, contentText('content.uploadedFile', { filename: file.name }), 'success');
          }
          assetsHelperLastRun = 0;
          assetsHelperCachedResult = [];
          setTimeout(() => {
            template.pendingUploads.set(pendingUploadId, undefined);
            assetsHelperLastRun = 0;
            assetsHelperCachedResult = [];
          }, 500);
          finish({ fileName: file.name });
        }
      }
    });
    upload.start();
  });
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








