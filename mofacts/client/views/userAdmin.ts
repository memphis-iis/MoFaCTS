import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { _ as underscore } from 'meteor/underscore';
const _ = underscore as any;
import './userAdmin.html';
import { Mongo } from 'meteor/mongo';
import { userHasRole } from '../lib/roleUtils';
import { getErrorMessage } from '../lib/errorUtils';

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
  return Number.isFinite(numeric) ? String(Math.round(numeric)) : '0';
}

function formatMinutes(value: unknown): string {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0m';
  }
  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remainingMinutes}m`;
}

function formatDate(value: unknown): string {
  if (!value) {
    return 'None';
  }
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }
  return date.toLocaleDateString();
}

function formatStatusDate(value: unknown): string {
  if (!value) {
    return 'never';
  }
  return formatDate(value);
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
    instance.apiKeyMessage.set('Failed to load API key alternatives: ' + getErrorMessage(error));
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
  if (!cache) {
    return {
      usageStatus: 'missing-cache',
      usageCellClass: 'text-muted',
      totalTrialsDisplay: 'No cache',
      accuracyDisplay: 'No cache',
      totalTimeDisplay: 'No cache',
      averageSessionDaysDisplay: 'No cache',
      averageItemsPracticedDisplay: 'No cache',
      lastActivityDisplay: 'No cache',
      cacheUpdatedDisplay: 'No cache',
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
  if (!usageSummary) {
    return {
      usageStatus: 'needs-refresh',
      usageCellClass: 'text-warning',
      totalTrialsDisplay: 'Refresh needed',
      accuracyDisplay: 'Refresh needed',
      totalTimeDisplay: 'Refresh needed',
      averageSessionDaysDisplay: 'Refresh needed',
      averageItemsPracticedDisplay: 'Refresh needed',
      lastActivityDisplay: 'Refresh needed',
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

Template.userAdmin.helpers({
  canManageUsers: function() {
    const currentUser = Meteor.user();
    return userHasRole(currentUser, 'admin');
  },

  userRoleEditList: function() {
    // Establish reactive dependency on role-assignment collection so the helper
    // reruns on both add AND remove (not just remove).
    (Meteor as any).roleAssignment?.find({}).fetch();
    const canManageUsers = userHasRole(Meteor.user(), 'admin');
    const instance = Template.instance() as any;
    const sortField = String(instance.sortField.get() || 'identifier');
    const sortDirection = instance.sortDirection.get() as SortDirection;
    const pagedUserIds = getPagedUserIds();
    const roleStateOverrides = instance.roleStateOverrides.get() as RoleStateOverrides;

    if (pagedUserIds.length === 0) {
      return [];
    }

    // Only render the users explicitly included in the active paged subscription.
    const users = Meteor.users.find({ _id: { $in: pagedUserIds } }).fetch();

    // Process roles for display (O(n) single pass)
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

    return `${usersWithUsageCache}/${usersWithIdentifiers} users have cached usage summaries; ${totalTrials} cached trials; ${activeUsers} active users${usersNeedingRefresh > 0 ? `; ${usersNeedingRefresh} need refresh` : ''}.`;
  },

  isRefreshingUsage: function() {
    return (Template.instance() as any).isRefreshingUsage.get();
  },

  usageRefreshMessage: function() {
    return (Template.instance() as any).usageRefreshMessage.get();
  },

  usageRefreshAlertClass: function() {
    const messageType = (Template.instance() as any).usageRefreshMessageType.get();
    if (messageType === 'success') return 'alert-success';
    if (messageType === 'warning') return 'alert-warning';
    if (messageType === 'danger') return 'alert-danger';
    return 'alert-info';
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
    const messageType = (Template.instance() as any).newsEmailMessageType.get();
    if (messageType === 'success') return 'alert-success';
    if (messageType === 'warning') return 'alert-warning';
    if (messageType === 'danger') return 'alert-danger';
    return 'alert-info';
  },

  newsEmailAttrs: function() {
    const isPreparing = (Template.instance() as any).isPreparingNewsEmail.get();
    return isPreparing ? { disabled: true } : {};
  },

  apiKeyMessage: function() {
    return (Template.instance() as any).apiKeyMessage.get();
  },

  apiKeyAlertClass: function() {
    const messageType = (Template.instance() as any).apiKeyMessageType.get();
    if (messageType === 'success') return 'alert-success';
    if (messageType === 'warning') return 'alert-warning';
    if (messageType === 'danger') return 'alert-danger';
    return 'alert-info';
  },

  apiKeyActionAttrs: function() {
    return (Template.instance() as any).apiKeyBusy.get() ? { disabled: true } : {};
  },

  adminOpenRouterModel: function() {
    return String(apiKeyMetadata(Template.instance()).openRouter?.model || '');
  },

  openRouterKeyPlaceholder: function() {
    const data = apiKeyMetadata(Template.instance()).openRouter;
    return data?.configured || data?.unusable ? 'Configured; enter to replace' : 'Enter OpenRouter key';
  },

  openRouterKeyStatus: function() {
    const data = apiKeyMetadata(Template.instance()).openRouter;
    if (data?.unusable) return 'Stored key cannot be decrypted; enter a new OpenRouter key to replace it';
    return data?.configured ? `Configured; key updated ${formatStatusDate(data.keyUpdatedAt)}` : 'No admin-provided OpenRouter key configured';
  },

  openRouterModelStatus: function() {
    const data = apiKeyMetadata(Template.instance()).openRouter;
    return data?.model ? `Model updated ${formatStatusDate(data.modelUpdatedAt)}` : 'No admin OpenRouter model configured';
  },

  googleTtsKeyPlaceholder: function() {
    const data = apiKeyMetadata(Template.instance()).googleTts;
    return data?.configured || data?.unusable ? 'Configured; enter to replace' : 'Enter Google TTS key';
  },

  googleTtsKeyStatus: function() {
    const data = apiKeyMetadata(Template.instance()).googleTts;
    if (data?.unusable) return 'Stored key cannot be decrypted; enter a new Google TTS key to replace it';
    return data?.configured ? `Configured; key updated ${formatStatusDate(data.keyUpdatedAt)}` : 'No admin-provided Google TTS key configured';
  },

  googleSpeechKeyPlaceholder: function() {
    const data = apiKeyMetadata(Template.instance()).googleSpeech;
    return data?.configured || data?.unusable ? 'Configured; enter to replace' : 'Enter Google Speech Recognition key';
  },

  googleSpeechKeyStatus: function() {
    const data = apiKeyMetadata(Template.instance()).googleSpeech;
    if (data?.unusable) return 'Stored key cannot be decrypted; enter a new Google Speech Recognition key to replace it';
    return data?.configured ? `Configured; key updated ${formatStatusDate(data.keyUpdatedAt)}` : 'No admin-provided Google SR key configured';
  },

  sortIndicator: function(field: string) {
    const instance = Template.instance() as any;
    if (instance.sortField.get() !== field) {
      return '';
    }
    return instance.sortDirection.get() === 'asc' ? '^' : 'v';
  },

  isLoading: function() {
    return (Template.instance() as any).isLoading.get();
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

  showingRange: function() {
    const instance = Template.instance() as any;
    const page = instance.currentPage.get();
    const countDoc = UserCounts.findOne('filtered') as any;
    const total = countDoc ? countDoc.count : 0;

    const start = page * USERS_PER_PAGE + 1;
    const end = Math.min((page + 1) * USERS_PER_PAGE, total);

    return `${start}-${end} of ${total}`;
  }
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

  'click .sortable-useradmin': function(event: any, instance: any) {
    event.preventDefault();
    const sortField = legacyTrim($(event.currentTarget).data('sortfield'));
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
    instance.newsEmailMessage.set('Preparing MoFaCTS news email recipients...');

    try {
      const result = await MeteorCompat.callAsync('userAdminNewsEmailRecipients');
      const emails = Array.isArray(result?.emails)
        ? result.emails.filter((email: unknown): email is string => typeof email === 'string' && email.includes('@'))
        : [];

      if (emails.length === 0) {
        instance.newsEmailMessageType.set('warning');
        instance.newsEmailMessage.set('No user email addresses were found.');
        return;
      }

      window.location.href = buildNewsEmailMailto(emails);
      instance.newsEmailMessageType.set('success');
      instance.newsEmailMessage.set(`Opened MoFaCTS news email compose with ${emails.length} BCC recipient${emails.length === 1 ? '' : 's'}.`);
    } catch (error: unknown) {
      instance.newsEmailMessageType.set('danger');
      instance.newsEmailMessage.set('Failed to prepare news email recipients: ' + getErrorMessage(error));
    } finally {
      instance.isPreparingNewsEmail.set(false);
    }
  },

  'click #refreshUsageCaches': async function(event: any, instance: any) {
    event.preventDefault();
    const userIds = getPagedUserIds();
    if (userIds.length === 0) {
      instance.usageRefreshMessageType.set('warning');
      instance.usageRefreshMessage.set('No users are available on this page to refresh.');
      return;
    }

    instance.isRefreshingUsage.set(true);
    instance.usageRefreshMessageType.set('info');
    instance.usageRefreshMessage.set(`Refreshing usage caches for ${userIds.length} users...`);

    try {
      const result = await MeteorCompat.callAsync('refreshUserAdminUsageCaches', userIds);
      const refreshedCount = Array.isArray(result?.refreshed) ? result.refreshed.length : 0;
      const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0;
      if (failedCount > 0) {
        instance.usageRefreshMessageType.set('warning');
        instance.usageRefreshMessage.set(`Refreshed ${refreshedCount} users; ${failedCount} failed. First failure: ${result.failed[0].userId}: ${result.failed[0].error}`);
      } else {
        instance.usageRefreshMessageType.set('success');
        instance.usageRefreshMessage.set(`Refreshed usage caches for ${refreshedCount} users.`);
      }
    } catch (error: unknown) {
      instance.usageRefreshMessageType.set('danger');
      instance.usageRefreshMessage.set('Failed to refresh usage caches: ' + getErrorMessage(error));
    } finally {
      instance.isRefreshingUsage.set(false);
    }
  },

  'click #saveAdminOpenRouterAlternative': async function(event: any, instance: any) {
    event.preventDefault();
    instance.apiKeyBusy.set(true);
    instance.apiKeyMessageType.set('info');
    instance.apiKeyMessage.set('Saving OpenRouter alternative...');
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
      instance.apiKeyMessage.set('Saved OpenRouter API key alternative metadata.');
    } catch (error: unknown) {
      instance.apiKeyMessageType.set('danger');
      instance.apiKeyMessage.set('Failed to save OpenRouter alternative: ' + getErrorMessage(error));
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
    instance.apiKeyMessage.set('Saving API key alternative...');
    try {
      const result = await MeteorCompat.callAsync('saveAdminApiKeyAlternative', provider, {
        apiKey: input?.value || '',
      });
      instance.apiKeyMetadata.set(result);
      if (input) input.value = '';
      instance.apiKeyMessageType.set('success');
      instance.apiKeyMessage.set('Saved API key alternative metadata.');
    } catch (error: unknown) {
      instance.apiKeyMessageType.set('danger');
      instance.apiKeyMessage.set('Failed to save API key alternative: ' + getErrorMessage(error));
    } finally {
      instance.apiKeyBusy.set(false);
    }
  },

  'click .btn-admin-api-key-delete': async function(event: any, instance: any) {
    event.preventDefault();
    const provider = legacyTrim($(event.currentTarget).data('provider'));
    instance.apiKeyBusy.set(true);
    instance.apiKeyMessageType.set('info');
    instance.apiKeyMessage.set('Deleting API key alternative...');
    try {
      const result = await MeteorCompat.callAsync('deleteAdminApiKeyAlternative', provider);
      instance.apiKeyMetadata.set(result);
      ['adminOpenRouterKey', 'adminGoogleTtsKey', 'adminGoogleSpeechKey'].forEach((id) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = '';
      });
      instance.apiKeyMessageType.set('success');
      instance.apiKeyMessage.set('Deleted API key alternative.');
    } catch (error: unknown) {
      instance.apiKeyMessageType.set('danger');
      instance.apiKeyMessage.set('Failed to delete API key alternative: ' + getErrorMessage(error));
    } finally {
      instance.apiKeyBusy.set(false);
    }
  },

  'click #doUploadUsers': function(event: any) {
    event.preventDefault();
    doFileUpload('#upload-users', 'USERS');
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
    } catch (error: unknown) {
      const disp = 'Failed to handle request. Error:' + getErrorMessage(error);
      
      alert(disp);
    }
  },

  'click .btn-user-delete': async function(event: any) {
    event.preventDefault();

    const btnTarget = $(event.currentTarget);
    const userId = legacyTrim(btnTarget.data('userid'));
    const displayIdentifier = legacyTrim(btnTarget.data('displayidentifier'));
    const confirmed = confirm(
      `Delete user "${displayIdentifier || userId}"?\n\nThis only works for accounts that do not own any lessons, uploaded assets, themes, or teacher-owned courses.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await MeteorCompat.callAsync('userAdminDeleteUser', userId);
    } catch (error: unknown) {
      const disp = 'Failed to delete user. Error: ' + getErrorMessage(error);
      alert(disp);
    }
  },

    
  });

async function doFileUpload(fileElementSelector: string, fileDescrip: string): Promise<void> {
  _.each($(fileElementSelector).prop('files'), function(file: any) {
    const name = file.name;
    const fileReader = new FileReader();

    fileReader.onload = async function() {
      

      try {
        const result = await MeteorCompat.callAsync('insertNewUsers', name, fileReader.result);
        
        if (result.length > 0) {
          
          alert('The ' + fileDescrip + ' file was not saved: ' + JSON.stringify(result));
        } else {
          
          alert('Your ' + fileDescrip + ' file was saved');
          // Now we can clear the selected file
          $(fileElementSelector).val('');
          $(fileElementSelector).parent().find('.file-info').html('');
          // No need to manually refresh - Meteor reactivity handles it automatically!
        }
      } catch (error: unknown) {
        
        alert('There was a critical failure saving your ' + fileDescrip + ' file:' + getErrorMessage(error));
      }
    };

    fileReader.readAsBinaryString(file);
  });

  
}







