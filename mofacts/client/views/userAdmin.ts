import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { _ as underscore } from 'meteor/underscore';
const _ = underscore as any;
import './userAdmin.html';
import './shared/adminUi/adminUi';
import { Mongo } from 'meteor/mongo';
import { userHasRole } from '../lib/roleUtils';
import { getErrorMessage } from '../lib/errorUtils';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';
import { formatActiveInterfaceDateTime, formatActiveInterfaceNumber } from '../lib/interfaceFormatting';

import { legacyTrim } from '../../common/underscoreCompat';

// Client-side collection for user counts
const UserCounts = new Mongo.Collection('user_counts');
const FilteredUserPageIds = new Mongo.Collection('filtered_user_page_ids');
const MeteorCompat = Meteor as typeof Meteor & { callAsync: (name: string, ...args: any[]) => Promise<any> };
declare const UserDashboardCache: Mongo.Collection<any>;

const USERS_PER_PAGE = 50;
const NEWS_EMAIL_SUBJECT = 'MoFaCTS News';
const NEWS_EMAIL_BODY = [
  'Hello,',
  '',
  'Here is the latest MoFaCTS news:',
  '',
  '- ',
  '',
  'Best,',
  'The MoFaCTS Team',
].join('\n');

type SortDirection = 'asc' | 'desc';
type RoleName = 'admin' | 'teacher';
type RoleFlags = Record<RoleName, boolean>;
type RoleStateOverrides = Record<string, Partial<RoleFlags>>;
type AdminApiKeyMetadata = {
  openRouter?: { configured?: boolean; unusable?: boolean; keyUpdatedAt?: unknown; modelUpdatedAt?: unknown; updatedBy?: unknown; model?: string };
  googleTts?: { configured?: boolean; unusable?: boolean; keyUpdatedAt?: unknown; updatedBy?: unknown };
  googleSpeech?: { configured?: boolean; unusable?: boolean; keyUpdatedAt?: unknown; updatedBy?: unknown };
};
type UserAdminRoleChangeResult = {
  targetUserId?: unknown;
  targetRoles?: Partial<Record<RoleName, unknown>>;
};

function userAdminText(key: Parameters<typeof translatePlatformString>[1], values?: Parameters<typeof translatePlatformString>[2]): string {
  return translatePlatformString(getActiveUiLocale(), key, values);
}

function messageIcon(messageType: string): string {
  if (messageType === 'success') return 'fa-check-circle';
  if (messageType === 'warning') return 'fa-exclamation-triangle';
  if (messageType === 'danger' || messageType === 'error') return 'fa-times-circle';
  return 'fa-info-circle';
}

function getPagedUserIds(): string[] {
  return FilteredUserPageIds.find({}, { sort: { userId: 1 } })
    .fetch()
    .map((doc: any) => doc.userId)
    .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
}

function buildNewsEmailMailto(emails: string[]): string {
  const params = [
    `bcc=${encodeURIComponent(emails.join(','))}`,
    `subject=${encodeURIComponent(NEWS_EMAIL_SUBJECT)}`,
    `body=${encodeURIComponent(NEWS_EMAIL_BODY)}`,
  ].join('&');
  return `mailto:?${params}`;
}

function getDisplayIdentifier(user: any): { displayIdentifier: string; hasIdentifierInvariantViolation: boolean } {
  const identifierRaw = String(user?.email_canonical || user?.emails?.[0]?.address || user?.username || '').trim();
  const hasIdentifierInvariantViolation = identifierRaw.length === 0;
  return {
    displayIdentifier: hasIdentifierInvariantViolation
      ? `[MISSING USER IDENTIFIER] userId=${String(user?._id || 'unknown')}`
      : identifierRaw,
    hasIdentifierInvariantViolation
  };
}

function formatOneDecimal(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '0.0';
}

function formatWholeNumber(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatActiveInterfaceNumber(Math.round(numeric)) : formatActiveInterfaceNumber(0);
}

function formatMinutes(value: unknown): string {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return userAdminText('admin.minutesShort', { minutes: 0 });
  }
  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  if (hours > 0 && remainingMinutes > 0) {
    return userAdminText('admin.hoursMinutesShort', { hours, minutes: remainingMinutes });
  }
  if (hours > 0) {
    return userAdminText('admin.hoursShort', { hours });
  }
  return userAdminText('admin.minutesShort', { minutes: remainingMinutes });
}

function formatDate(value: unknown): string {
  if (!value) {
    return userAdminText('admin.noDate');
  }
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) {
    return userAdminText('admin.invalidDate');
  }
  return formatActiveInterfaceDateTime(date, { dateStyle: 'medium' });
}

function formatStatusDate(value: unknown): string {
  if (!value) {
    return userAdminText('admin.noDate');
  }
  return formatDate(value);
}

function rowTargetLabel(user: any): string {
  return String(user?.displayIdentifier || user?._id || '').trim();
}

function rowActionLabel(actionKey: Parameters<typeof translatePlatformString>[1], user: any): string {
  const action = userAdminText(actionKey);
  const target = rowTargetLabel(user);
  return target ? `${action}: ${target}` : action;
}

function apiKeyMetadata(instance: any): AdminApiKeyMetadata {
  return instance.apiKeyMetadata.get() || {};
}

function getPublishedRoleFlags(userId: string): RoleFlags {
  return {
    admin: userHasRole({ _id: userId }, 'admin'),
    teacher: userHasRole({ _id: userId }, 'teacher'),
  };
}

function getDisplayedRoleFlag(userId: string, roleName: RoleName, roleStateOverrides: RoleStateOverrides): boolean {
  const overriddenValue = roleStateOverrides[userId]?.[roleName];
  return typeof overriddenValue === 'boolean'
    ? overriddenValue
    : getPublishedRoleFlags(userId)[roleName];
}

function applyConfirmedRoleState(instance: any, result: UserAdminRoleChangeResult): void {
  const targetUserId = typeof result?.targetUserId === 'string' ? result.targetUserId.trim() : '';
  const targetRoles = result?.targetRoles;
  if (!targetUserId || typeof targetRoles?.admin !== 'boolean' || typeof targetRoles?.teacher !== 'boolean') {
    throw new Error('Role change completed without authoritative role state.');
  }

  const currentOverrides = instance.roleStateOverrides.get() as RoleStateOverrides;
  instance.roleStateOverrides.set({
    ...currentOverrides,
    [targetUserId]: {
      admin: targetRoles.admin,
      teacher: targetRoles.teacher,
    },
  });
}

function clearSyncedRoleStateOverrides(instance: any): void {
  const currentOverrides = instance.roleStateOverrides.get() as RoleStateOverrides;
  const nextOverrides: RoleStateOverrides = {};
  let changed = false;

  for (const [userId, roles] of Object.entries(currentOverrides)) {
    const publishedRoles = getPublishedRoleFlags(userId);
    const remainingRoles: Partial<RoleFlags> = {};

    for (const roleName of ['admin', 'teacher'] as RoleName[]) {
      if (typeof roles[roleName] !== 'boolean') {
        continue;
      }
      if (roles[roleName] === publishedRoles[roleName]) {
        changed = true;
      } else {
        remainingRoles[roleName] = roles[roleName];
      }
    }

    if (Object.keys(remainingRoles).length > 0) {
      nextOverrides[userId] = remainingRoles;
    }
  }

  if (changed) {
    instance.roleStateOverrides.set(nextOverrides);
  }
}

async function refreshAdminApiKeyMetadata(instance: any): Promise<void> {
  try {
    instance.apiKeyMetadata.set(await MeteorCompat.callAsync('getAdminApiKeyAlternativeMetadata'));
  } catch (error: unknown) {
    instance.apiKeyMessageType.set('danger');
    instance.apiKeyMessage.set(userAdminText('admin.apiKeysLoadFailed', { error: getErrorMessage(error) }));
  }
}

function getTimeValue(value: unknown): number {
  if (!value) {
    return 0;
  }
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function buildUsageDisplay(user: any) {
  const cache = UserDashboardCache.findOne({ userId: user._id }) as any;
  const noCache = userAdminText('admin.noCache');
  if (!cache) {
    return {
      usageStatus: 'missing-cache',
      usageCellClass: 'text-muted',
      totalTrialsDisplay: noCache,
      accuracyDisplay: noCache,
      totalTimeDisplay: noCache,
      averageSessionDaysDisplay: noCache,
      averageItemsPracticedDisplay: noCache,
      lastActivityDisplay: noCache,
      cacheUpdatedDisplay: noCache,
      usageSort: {
        totalTrials: Number.NEGATIVE_INFINITY,
        weightedAccuracy: Number.NEGATIVE_INFINITY,
        totalTimeMinutes: Number.NEGATIVE_INFINITY,
        averageSessionDays: Number.NEGATIVE_INFINITY,
        averageItemsPracticed: Number.NEGATIVE_INFINITY,
        lastActivityDate: Number.NEGATIVE_INFINITY,
        cacheUpdated: Number.NEGATIVE_INFINITY
      }
    };
  }

  const usageSummary = cache.usageSummary;
  const refreshNeeded = userAdminText('admin.refreshNeeded');
  if (!usageSummary) {
    return {
      usageStatus: 'needs-refresh',
      usageCellClass: 'text-warning',
      totalTrialsDisplay: refreshNeeded,
      accuracyDisplay: refreshNeeded,
      totalTimeDisplay: refreshNeeded,
      averageSessionDaysDisplay: refreshNeeded,
      averageItemsPracticedDisplay: refreshNeeded,
      lastActivityDisplay: refreshNeeded,
      cacheUpdatedDisplay: formatDate(cache.lastUpdated),
      usageSort: {
        totalTrials: Number.NEGATIVE_INFINITY,
        weightedAccuracy: Number.NEGATIVE_INFINITY,
        totalTimeMinutes: Number.NEGATIVE_INFINITY,
        averageSessionDays: Number.NEGATIVE_INFINITY,
        averageItemsPracticed: Number.NEGATIVE_INFINITY,
        lastActivityDate: Number.NEGATIVE_INFINITY,
        cacheUpdated: getTimeValue(cache.lastUpdated)
      }
    };
  }

  return {
    usageStatus: 'ready',
    usageCellClass: '',
    totalTrialsDisplay: formatWholeNumber(usageSummary.totalTrials),
    accuracyDisplay: `${formatOneDecimal(usageSummary.weightedAccuracy)}%`,
    totalTimeDisplay: formatMinutes(usageSummary.totalTimeMinutes),
    averageSessionDaysDisplay: formatOneDecimal(usageSummary.averageSessionDays),
    averageItemsPracticedDisplay: formatOneDecimal(usageSummary.averageItemsPracticed),
    lastActivityDisplay: formatDate(usageSummary.lastActivityDate),
    cacheUpdatedDisplay: formatDate(cache.lastUpdated),
    usageSort: {
      totalTrials: Number(usageSummary.totalTrials || 0),
      weightedAccuracy: Number(usageSummary.weightedAccuracy || 0),
      totalTimeMinutes: Number(usageSummary.totalTimeMinutes || 0),
      averageSessionDays: Number(usageSummary.averageSessionDays || 0),
      averageItemsPracticed: Number(usageSummary.averageItemsPracticed || 0),
      lastActivityDate: getTimeValue(usageSummary.lastActivityDate),
      cacheUpdated: getTimeValue(cache.lastUpdated)
    }
  };
}

Template.userAdmin.onCreated(function(this: any) {
  this.filter = new ReactiveVar('');
  this.currentPage = new ReactiveVar(0);
  this.isLoading = new ReactiveVar(true);
  this.isRefreshingUsage = new ReactiveVar(false);
  this.usageRefreshMessage = new ReactiveVar('');
  this.usageRefreshMessageType = new ReactiveVar('info');
  this.isPreparingNewsEmail = new ReactiveVar(false);
  this.newsEmailMessage = new ReactiveVar('');
  this.newsEmailMessageType = new ReactiveVar('info');
  this.adminMessage = new ReactiveVar('');
  this.adminMessageType = new ReactiveVar('info');
  this.selectedDeleteUser = new ReactiveVar(null);
  this.apiKeyMetadata = new ReactiveVar(null);
  this.apiKeyBusy = new ReactiveVar(false);
  this.apiKeyMessage = new ReactiveVar('');
  this.apiKeyMessageType = new ReactiveVar('info');
  this.sortField = new ReactiveVar('identifier');
  this.sortDirection = new ReactiveVar('asc' as SortDirection);
  this.roleStateOverrides = new ReactiveVar({} as RoleStateOverrides);
  this.autoruns = [];

  // Debounce timer for filter changes
  this.filterDebounceTimer = null;
});

Template.userAdmin.onRendered(function(this: any) {
  const instance = this;
  void refreshAdminApiKeyMetadata(instance);

  // Autorun to reactively subscribe when filter or page changes
  const autorun = this.autorun(() => {
    const filter = instance.filter.get();
    const page = instance.currentPage.get();

    // Keep readiness tied to the active subscription handles only.
    // This avoids stale onReady callbacks from a prior stopped subscription.
    const usersSub = instance.subscribe('filteredUsers', filter, page, USERS_PER_PAGE);
    const countSub = instance.subscribe('filteredUsersCount', filter);
    const usageUserIds = getPagedUserIds();
    const usageSub = usageUserIds.length > 0
      ? instance.subscribe('userAdminDashboardUsage', usageUserIds)
      : { ready: () => true };
    instance.isLoading.set(!(usersSub.ready() && countSub.ready() && usageSub.ready()));
  });
  instance.autoruns.push(autorun);

  const roleStateAutorun = this.autorun(() => {
    (Meteor as any).roleAssignment?.find({}).fetch();
    clearSyncedRoleStateOverrides(instance);
  });
  instance.autoruns.push(roleStateAutorun);
});

Template.userAdmin.onDestroyed(function(this: any) {
  // Clean up autoruns
  this.autoruns.forEach((ar: any) => ar.stop());

  // Clear debounce timer
  if (this.filterDebounceTimer) {
    clearTimeout(this.filterDebounceTimer);
  }
});

function buildUserRoleEditRows(instance: any): any[] {
  // Establish reactive dependency on role-assignment collection so the helper
  // reruns on both add AND remove (not just remove).
  (Meteor as any).roleAssignment?.find({}).fetch();
  const canManageUsers = userHasRole(Meteor.user(), 'admin');
  const sortField = String(instance.sortField.get() || 'identifier');
  const sortDirection = instance.sortDirection.get() as SortDirection;
  const pagedUserIds = getPagedUserIds();
  const roleStateOverrides = instance.roleStateOverrides.get() as RoleStateOverrides;

  if (pagedUserIds.length === 0) {
    return [];
  }

  // Only render the users explicitly included in the active paged subscription.
  const users = Meteor.users.find({ _id: { $in: pagedUserIds } }).fetch();

  return users.map((user: any) => {
    const { displayIdentifier, hasIdentifierInvariantViolation } = getDisplayIdentifier(user);
    const usageDisplay = buildUsageDisplay(user);
    user.teacher = false;
    user.admin = false;
    user.canManageUsers = canManageUsers;
    user.displayIdentifier = displayIdentifier;
    user.hasIdentifierInvariantViolation = hasIdentifierInvariantViolation;
    Object.assign(user, usageDisplay);

    user.teacher = getDisplayedRoleFlag(user._id, 'teacher', roleStateOverrides);
    user.admin = getDisplayedRoleFlag(user._id, 'admin', roleStateOverrides);
    return user;
  }).sort((a: any, b: any) => {
    const aViolation = !!a.hasIdentifierInvariantViolation;
    const bViolation = !!b.hasIdentifierInvariantViolation;
    if (aViolation !== bViolation) {
      return aViolation ? 1 : -1;
    }
    let compareValue = 0;
    if (sortField === 'identifier') {
      compareValue = String(a.displayIdentifier || '').localeCompare(String(b.displayIdentifier || ''));
    } else {
      compareValue = Number(a.usageSort?.[sortField] ?? Number.NEGATIVE_INFINITY) -
        Number(b.usageSort?.[sortField] ?? Number.NEGATIVE_INFINITY);
    }
    return sortDirection === 'asc' ? compareValue : -compareValue;
  });
}

Template.userAdmin.helpers({
  canManageUsers: function() {
    const currentUser = Meteor.user();
    return userHasRole(currentUser, 'admin');
  },

  userAdminText: function(key: Parameters<typeof translatePlatformString>[1]) {
    return userAdminText(key);
  },

  hasIdentifierInvariantViolations: function() {
    const pagedUserIds = getPagedUserIds();
    const users = pagedUserIds.length > 0
      ? Meteor.users.find({ _id: { $in: pagedUserIds } }).fetch()
      : [];
    return users.some((user: any) => {
      return getDisplayIdentifier(user).hasIdentifierInvariantViolation;
    });
  },

  usageAggregateSummary: function() {
    const pagedUserIds = getPagedUserIds();
    const users = pagedUserIds.length > 0
      ? Meteor.users.find({ _id: { $in: pagedUserIds } }).fetch()
      : [];
    let usersWithIdentifiers = 0;
    let usersWithUsageCache = 0;
    let usersNeedingRefresh = 0;
    let totalTrials = 0;
    let activeUsers = 0;

    for (const user of users) {
      if (getDisplayIdentifier(user).hasIdentifierInvariantViolation) {
        continue;
      }
      usersWithIdentifiers++;
      const cache = UserDashboardCache.findOne({ userId: user._id }) as any;
      if (!cache) {
        continue;
      }
      if (!cache.usageSummary) {
        usersNeedingRefresh++;
        continue;
      }
      usersWithUsageCache++;
      totalTrials += Number(cache.usageSummary.totalTrials || 0);
      if (cache.usageSummary.lastActivityDate) {
        activeUsers++;
      }
    }

    const needsRefresh = usersNeedingRefresh > 0
      ? userAdminText('admin.usageAggregateNeedsRefresh', { count: formatActiveInterfaceNumber(usersNeedingRefresh) })
      : '';
    return userAdminText('admin.usageAggregateSummary', {
      cached: formatActiveInterfaceNumber(usersWithUsageCache),
      total: formatActiveInterfaceNumber(usersWithIdentifiers),
      trials: formatActiveInterfaceNumber(totalTrials),
      active: formatActiveInterfaceNumber(activeUsers),
      needsRefresh,
    });
  },

  isRefreshingUsage: function() {
    return (Template.instance() as any).isRefreshingUsage.get();
  },

  usageRefreshMessage: function() {
    return (Template.instance() as any).usageRefreshMessage.get();
  },

  usageRefreshAlertClass: function() {
    return (Template.instance() as any).usageRefreshMessageType.get();
  },

  usageRefreshIcon: function() {
    return messageIcon((Template.instance() as any).usageRefreshMessageType.get());
  },

  refreshUsageAttrs: function() {
    const isRefreshing = (Template.instance() as any).isRefreshingUsage.get();
    return isRefreshing ? { disabled: true } : {};
  },

  isPreparingNewsEmail: function() {
    return (Template.instance() as any).isPreparingNewsEmail.get();
  },

  newsEmailMessage: function() {
    return (Template.instance() as any).newsEmailMessage.get();
  },

  newsEmailAlertClass: function() {
    return (Template.instance() as any).newsEmailMessageType.get();
  },

  newsEmailIcon: function() {
    return messageIcon((Template.instance() as any).newsEmailMessageType.get());
  },

  newsEmailAttrs: function() {
    const isPreparing = (Template.instance() as any).isPreparingNewsEmail.get();
    return isPreparing ? { disabled: true } : {};
  },

  apiKeyMessage: function() {
    return (Template.instance() as any).apiKeyMessage.get();
  },

  apiKeyAlertClass: function() {
    return (Template.instance() as any).apiKeyMessageType.get();
  },

  apiKeyIcon: function() {
    return messageIcon((Template.instance() as any).apiKeyMessageType.get());
  },

  adminMessage: function() {
    return (Template.instance() as any).adminMessage.get();
  },

  adminMessageClass: function() {
    return (Template.instance() as any).adminMessageType.get();
  },

  adminMessageIcon: function() {
    return messageIcon((Template.instance() as any).adminMessageType.get());
  },

  selectedDeleteUser: function() {
    return (Template.instance() as any).selectedDeleteUser.get();
  },

  apiKeyActionAttrs: function() {
    return (Template.instance() as any).apiKeyBusy.get() ? { disabled: true } : {};
  },

  adminOpenRouterModel: function() {
    return String(apiKeyMetadata(Template.instance()).openRouter?.model || '');
  },

  openRouterKeyPlaceholder: function() {
    const data = apiKeyMetadata(Template.instance()).openRouter;
    return data?.configured || data?.unusable
      ? userAdminText('admin.configuredEnterToReplace')
      : userAdminText('admin.enterOpenRouterKey');
  },

  openRouterKeyStatus: function() {
    const data = apiKeyMetadata(Template.instance()).openRouter;
    if (data?.unusable) return userAdminText('admin.storedKeyCannotDecrypt', { label: 'OpenRouter' });
    return data?.configured
      ? userAdminText('admin.configuredKeyUpdated', { date: formatStatusDate(data.keyUpdatedAt) })
      : userAdminText('admin.noAdminOpenRouterKey');
  },

  openRouterModelStatus: function() {
    const data = apiKeyMetadata(Template.instance()).openRouter;
    return data?.model
      ? userAdminText('admin.modelUpdated', { date: formatStatusDate(data.modelUpdatedAt) })
      : userAdminText('admin.noAdminOpenRouterModel');
  },

  googleTtsKeyPlaceholder: function() {
    const data = apiKeyMetadata(Template.instance()).googleTts;
    return data?.configured || data?.unusable
      ? userAdminText('admin.configuredEnterToReplace')
      : userAdminText('admin.enterGoogleTtsKey');
  },

  googleTtsKeyStatus: function() {
    const data = apiKeyMetadata(Template.instance()).googleTts;
    if (data?.unusable) return userAdminText('admin.storedKeyCannotDecrypt', { label: 'Google TTS' });
    return data?.configured
      ? userAdminText('admin.configuredKeyUpdated', { date: formatStatusDate(data.keyUpdatedAt) })
      : userAdminText('admin.noAdminGoogleTtsKey');
  },

  googleSpeechKeyPlaceholder: function() {
    const data = apiKeyMetadata(Template.instance()).googleSpeech;
    return data?.configured || data?.unusable
      ? userAdminText('admin.configuredEnterToReplace')
      : userAdminText('admin.enterGoogleSpeechKey');
  },

  googleSpeechKeyStatus: function() {
    const data = apiKeyMetadata(Template.instance()).googleSpeech;
    if (data?.unusable) return userAdminText('admin.storedKeyCannotDecrypt', { label: 'Google Speech Recognition' });
    return data?.configured
      ? userAdminText('admin.configuredKeyUpdated', { date: formatStatusDate(data.keyUpdatedAt) })
      : userAdminText('admin.noAdminGoogleSrKey');
  },

  isLoading: function() {
    return (Template.instance() as any).isLoading.get();
  },

  userAdminTableLabel: function() {
    return userAdminText('admin.userList');
  },

  userAdminTableData: function() {
    const instance = Template.instance() as any;
    return {
      rows: buildUserRoleEditRows(instance),
      canManageUsers: userHasRole(Meteor.user(), 'admin'),
      isLoading: instance.isLoading.get(),
      selectedDeleteUser: instance.selectedDeleteUser.get(),
      sortField: String(instance.sortField.get() || 'identifier'),
      sortDirection: instance.sortDirection.get() as SortDirection,
    };
  },

  currentFilter: function() {
    return (Template.instance() as any).filter.get();
  },

  currentPage: function() {
    return (Template.instance() as any).currentPage.get() + 1; // 1-indexed for display
  },

  totalPages: function() {
    const countDoc = UserCounts.findOne('filtered') as any;
    if (!countDoc) return 1;
    return Math.ceil(countDoc.count / USERS_PER_PAGE) || 1;
  },

  totalUsers: function() {
    const countDoc = UserCounts.findOne('filtered') as any;
    return countDoc ? countDoc.count : 0;
  },

  hasPrevPage: function() {
    return (Template.instance() as any).currentPage.get() > 0;
  },

  hasNextPage: function() {
    const countDoc = UserCounts.findOne('filtered') as any;
    if (!countDoc) return false;
    const totalPages = Math.ceil(countDoc.count / USERS_PER_PAGE);
    return (Template.instance() as any).currentPage.get() < totalPages - 1;
  },

  // Return disabled attribute object for Blaze (can't use {{#unless}} in attributes)
  prevPageAttrs: function() {
    const hasPrev = (Template.instance() as any).currentPage.get() > 0;
    return hasPrev ? {} : { disabled: true };
  },

  nextPageAttrs: function() {
    const countDoc = UserCounts.findOne('filtered') as any;
    if (!countDoc) return { disabled: true };
    const totalPages = Math.ceil(countDoc.count / USERS_PER_PAGE);
    const hasNext = (Template.instance() as any).currentPage.get() < totalPages - 1;
    return hasNext ? {} : { disabled: true };
  },

  showingUsersText: function() {
    const instance = Template.instance() as any;
    const page = instance.currentPage.get();
    const countDoc = UserCounts.findOne('filtered') as any;
    const total = countDoc ? countDoc.count : 0;
    const start = total > 0 ? page * USERS_PER_PAGE + 1 : 0;
    const end = Math.min((page + 1) * USERS_PER_PAGE, total);
    return userAdminText('admin.showingUsers', {
      start: formatActiveInterfaceNumber(start),
      end: formatActiveInterfaceNumber(end),
      total: formatActiveInterfaceNumber(total),
    });
  },

  pageOfText: function() {
    const instance = Template.instance() as any;
    const countDoc = UserCounts.findOne('filtered') as any;
    const totalPages = countDoc ? Math.ceil(countDoc.count / USERS_PER_PAGE) || 1 : 1;
    return userAdminText('admin.pageOf', { page: instance.currentPage.get() + 1, total: totalPages });
  },

  deleteUserMessageText: function(identifier: string) {
    return userAdminText('admin.deleteUserMessage', { identifier });
  }
});

Template.userAdminTable.helpers({
  userAdminText: function(key: Parameters<typeof translatePlatformString>[1]) {
    return userAdminText(key);
  },

  userAdminTableColumnCount: function(canManageUsers: boolean) {
    return canManageUsers ? 10 : 9;
  },

  roleTogglesLabel: function(user: any) {
    const target = rowTargetLabel(user);
    const label = userAdminText('admin.roleToggles');
    return target ? `${label}: ${target}` : label;
  },

  roleToggleLabel: function(key: Parameters<typeof translatePlatformString>[1], user: any) {
    return rowActionLabel(key, user);
  },

  deleteUserActionLabel: function(user: any) {
    return rowActionLabel('admin.deleteUser', user);
  },

  deleteUserConfirmationOpen: function(userId: string) {
    return Template.instance().data?.selectedDeleteUser?.userId === userId;
  },

  deleteUserMessageText: function(identifier: string) {
    return userAdminText('admin.deleteUserMessage', { identifier });
  },
});

Template.userAdminSortableHeader.helpers({
  sortAria: function(field: string) {
    if (this.sortField !== field) {
      return 'none';
    }
    return this.sortDirection === 'desc' ? 'descending' : 'ascending';
  },

  sortIndicator: function(field: string) {
    if (this.sortField !== field) {
      return '';
    }
    return this.sortDirection === 'desc' ? 'v' : '^';
  },
});

Template.userAdmin.events({
  'input #filter': function(event: any, instance: any) {
    event.preventDefault();
    const value = event.target.value;

    // Debounce filter changes to avoid excessive re-subscriptions
    if (instance.filterDebounceTimer) {
      clearTimeout(instance.filterDebounceTimer);
    }

    instance.filterDebounceTimer = setTimeout(() => {
      instance.filter.set(value);
      instance.currentPage.set(0); // Reset to first page on filter change
      instance.usageRefreshMessage.set('');
      instance.newsEmailMessage.set('');
    }, 300);
  },

  'click .user-admin-sort-button': function(event: any, instance: any) {
    event.preventDefault();
    const sortField = legacyTrim((event.currentTarget as HTMLElement).dataset.sortfield);
    if (!sortField) {
      return;
    }
    if (instance.sortField.get() === sortField) {
      instance.sortDirection.set(instance.sortDirection.get() === 'asc' ? 'desc' : 'asc');
    } else {
      instance.sortField.set(sortField);
      instance.sortDirection.set(sortField === 'identifier' ? 'asc' : 'desc');
    }
  },

  'click #prevPage': function(event: any, instance: any) {
    event.preventDefault();
    const current = instance.currentPage.get();
    if (current > 0) {
      instance.currentPage.set(current - 1);
      instance.usageRefreshMessage.set('');
      instance.newsEmailMessage.set('');
    }
  },

  'click #nextPage': function(event: any, instance: any) {
    event.preventDefault();
    const countDoc = UserCounts.findOne('filtered') as any;
    if (!countDoc) return;

    const totalPages = Math.ceil(countDoc.count / USERS_PER_PAGE);
    const current = instance.currentPage.get();

    if (current < totalPages - 1) {
      instance.currentPage.set(current + 1);
      instance.usageRefreshMessage.set('');
      instance.newsEmailMessage.set('');
    }
  },

  'click #composeNewsEmail': async function(event: any, instance: any) {
    event.preventDefault();
    instance.isPreparingNewsEmail.set(true);
    instance.newsEmailMessageType.set('info');
    instance.newsEmailMessage.set(userAdminText('admin.preparingNewsEmailRecipients'));

    try {
      const result = await MeteorCompat.callAsync('userAdminNewsEmailRecipients');
      const emails = Array.isArray(result?.emails)
        ? result.emails.filter((email: unknown): email is string => typeof email === 'string' && email.includes('@'))
        : [];

      if (emails.length === 0) {
        instance.newsEmailMessageType.set('warning');
        instance.newsEmailMessage.set(userAdminText('admin.noUserEmailsFound'));
        return;
      }

      window.location.href = buildNewsEmailMailto(emails);
      instance.newsEmailMessageType.set('success');
      instance.newsEmailMessage.set(userAdminText('admin.openedNewsEmailCompose', { count: emails.length }));
    } catch (error: unknown) {
      instance.newsEmailMessageType.set('danger');
      instance.newsEmailMessage.set(userAdminText('admin.prepareNewsEmailFailed', { error: getErrorMessage(error) }));
    } finally {
      instance.isPreparingNewsEmail.set(false);
    }
  },

  'click #refreshUsageCaches': async function(event: any, instance: any) {
    event.preventDefault();
    const userIds = getPagedUserIds();
    if (userIds.length === 0) {
      instance.usageRefreshMessageType.set('warning');
      instance.usageRefreshMessage.set(userAdminText('admin.noUsersToRefresh'));
      return;
    }

    instance.isRefreshingUsage.set(true);
    instance.usageRefreshMessageType.set('info');
    instance.usageRefreshMessage.set(userAdminText('admin.refreshingUsageCaches', { count: userIds.length }));

    try {
      const result = await MeteorCompat.callAsync('refreshUserAdminUsageCaches', userIds);
      const refreshedCount = Array.isArray(result?.refreshed) ? result.refreshed.length : 0;
      const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0;
      if (failedCount > 0) {
        instance.usageRefreshMessageType.set('warning');
        instance.usageRefreshMessage.set(userAdminText('admin.refreshedUsersSomeFailed', {
          refreshed: refreshedCount,
          failed: failedCount,
          userId: result.failed[0].userId,
          error: result.failed[0].error,
        }));
      } else {
        instance.usageRefreshMessageType.set('success');
        instance.usageRefreshMessage.set(userAdminText('admin.refreshedUsageCaches', { count: refreshedCount }));
      }
    } catch (error: unknown) {
      instance.usageRefreshMessageType.set('danger');
      instance.usageRefreshMessage.set(userAdminText('admin.refreshUsageCachesFailed', { error: getErrorMessage(error) }));
    } finally {
      instance.isRefreshingUsage.set(false);
    }
  },

  'click #saveAdminOpenRouterAlternative': async function(event: any, instance: any) {
    event.preventDefault();
    instance.apiKeyBusy.set(true);
    instance.apiKeyMessageType.set('info');
    instance.apiKeyMessage.set(userAdminText('admin.savingOpenRouterAlternative'));
    try {
      const apiKeyInput = document.getElementById('adminOpenRouterKey') as HTMLInputElement | null;
      const modelInput = document.getElementById('adminOpenRouterModel') as HTMLInputElement | null;
      const result = await MeteorCompat.callAsync('saveAdminApiKeyAlternative', 'openrouter', {
        apiKey: apiKeyInput?.value || '',
        model: modelInput?.value || '',
      });
      instance.apiKeyMetadata.set(result);
      if (apiKeyInput) apiKeyInput.value = '';
      instance.apiKeyMessageType.set('success');
      instance.apiKeyMessage.set(userAdminText('admin.savedOpenRouterAlternative'));
    } catch (error: unknown) {
      instance.apiKeyMessageType.set('danger');
      instance.apiKeyMessage.set(userAdminText('admin.saveOpenRouterAlternativeFailed', { error: getErrorMessage(error) }));
    } finally {
      instance.apiKeyBusy.set(false);
    }
  },

  'click .btn-admin-api-key-save': async function(event: any, instance: any) {
    event.preventDefault();
    const provider = legacyTrim($(event.currentTarget).data('provider'));
    const inputSelector = legacyTrim($(event.currentTarget).data('input'));
    const input = inputSelector ? document.querySelector(inputSelector) as HTMLInputElement | null : null;
    instance.apiKeyBusy.set(true);
    instance.apiKeyMessageType.set('info');
    instance.apiKeyMessage.set(userAdminText('admin.savingApiKeyAlternative'));
    try {
      const result = await MeteorCompat.callAsync('saveAdminApiKeyAlternative', provider, {
        apiKey: input?.value || '',
      });
      instance.apiKeyMetadata.set(result);
      if (input) input.value = '';
      instance.apiKeyMessageType.set('success');
      instance.apiKeyMessage.set(userAdminText('admin.savedApiKeyAlternative'));
    } catch (error: unknown) {
      instance.apiKeyMessageType.set('danger');
      instance.apiKeyMessage.set(userAdminText('admin.saveApiKeyAlternativeFailed', { error: getErrorMessage(error) }));
    } finally {
      instance.apiKeyBusy.set(false);
    }
  },

  'click .btn-admin-api-key-delete': async function(event: any, instance: any) {
    event.preventDefault();
    const provider = legacyTrim($(event.currentTarget).data('provider'));
    instance.apiKeyBusy.set(true);
    instance.apiKeyMessageType.set('info');
    instance.apiKeyMessage.set(userAdminText('admin.deletingApiKeyAlternative'));
    try {
      const result = await MeteorCompat.callAsync('deleteAdminApiKeyAlternative', provider);
      instance.apiKeyMetadata.set(result);
      ['adminOpenRouterKey', 'adminGoogleTtsKey', 'adminGoogleSpeechKey'].forEach((id) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = '';
      });
      instance.apiKeyMessageType.set('success');
      instance.apiKeyMessage.set(userAdminText('admin.deletedApiKeyAlternative'));
    } catch (error: unknown) {
      instance.apiKeyMessageType.set('danger');
      instance.apiKeyMessage.set(userAdminText('admin.deleteApiKeyAlternativeFailed', { error: getErrorMessage(error) }));
    } finally {
      instance.apiKeyBusy.set(false);
    }
  },

  'click #doUploadUsers': function(event: any) {
    event.preventDefault();
    doFileUpload('#upload-users', 'USERS', Template.instance());
  },

  'change #upload-users': function(event: any) {
    const input = $(event.currentTarget);
    $('#users-file-info').html(input.val());
  },

  // Need admin and teacher buttons
  'click .btn-user-change': async function(event: any) {
    event.preventDefault();

    const btnTarget = $(event.currentTarget);
    const userId = legacyTrim(btnTarget.data('userid'));
    const roleAction = legacyTrim(btnTarget.data('roleaction'));
    const roleName = legacyTrim(btnTarget.data('rolename'));

    

    try {
      const result = await MeteorCompat.callAsync('userAdminRoleChange', userId, roleAction, roleName);
      applyConfirmedRoleState(Template.instance(), result as UserAdminRoleChangeResult);
      const instance = Template.instance() as any;
      instance.adminMessageType.set('success');
      instance.adminMessage.set(userAdminText('admin.updatedRoleForUser', { role: roleName }));
    } catch (error: unknown) {
      const instance = Template.instance() as any;
      instance.adminMessageType.set('danger');
      instance.adminMessage.set(userAdminText('admin.requestFailed', { error: getErrorMessage(error) }));
    }
  },

  'click .btn-user-delete': function(event: any, instance: any) {
    event.preventDefault();

    const btnTarget = $(event.currentTarget);
    const userId = legacyTrim(btnTarget.data('userid'));
    const displayIdentifier = legacyTrim(btnTarget.data('displayidentifier'));
    instance.selectedDeleteUser.set({ userId, displayIdentifier });
  },

  'click .btn-user-delete-cancel': function(event: any, instance: any) {
    event.preventDefault();
    instance.selectedDeleteUser.set(null);
  },

  'click .btn-user-delete-confirm': async function(event: any, instance: any) {
    event.preventDefault();

    const btnTarget = $(event.currentTarget);
    const userId = legacyTrim(btnTarget.data('userid'));

    try {
      await MeteorCompat.callAsync('userAdminDeleteUser', userId);
      instance.selectedDeleteUser.set(null);
      instance.adminMessageType.set('success');
      instance.adminMessage.set(userAdminText('admin.userDeleted'));
    } catch (error: unknown) {
      instance.adminMessageType.set('danger');
      instance.adminMessage.set(userAdminText('admin.deleteUserFailed', { error: getErrorMessage(error) }));
    }
  },

    
  });

async function doFileUpload(fileElementSelector: string, fileDescrip: string, instance: any): Promise<void> {
  _.each($(fileElementSelector).prop('files'), function(file: any) {
    const name = file.name;
    const fileReader = new FileReader();

    fileReader.onload = async function() {
      

      try {
        const result = await MeteorCompat.callAsync('insertNewUsers', name, fileReader.result);
        
        if (result.length > 0) {
          instance.adminMessageType.set('danger');
          instance.adminMessage.set(userAdminText('admin.userFileNotSaved', { fileDescription: fileDescrip, error: JSON.stringify(result) }));
        } else {
          instance.adminMessageType.set('success');
          instance.adminMessage.set(userAdminText('admin.userFileSaved', { fileDescription: fileDescrip }));
          // Now we can clear the selected file
          $(fileElementSelector).val('');
          $(fileElementSelector).parent().find('.file-info').html('');
          // No need to manually refresh - Meteor reactivity handles it automatically!
        }
      } catch (error: unknown) {
        instance.adminMessageType.set('danger');
        instance.adminMessage.set(userAdminText('admin.userFileCriticalSaveFailed', { fileDescription: fileDescrip, error: getErrorMessage(error) }));
      }
    };

    fileReader.readAsBinaryString(file);
  });

  
}







