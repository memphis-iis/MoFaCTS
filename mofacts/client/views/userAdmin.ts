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

const USERS_PER_PAGE = 50;

Template.userAdmin.onCreated(function(this: any) {
  this.filter = new ReactiveVar('');
  this.currentPage = new ReactiveVar(0);
  this.isLoading = new ReactiveVar(true);
  this.autoruns = [];

  // Debounce timer for filter changes
  this.filterDebounceTimer = null;
});

Template.userAdmin.onRendered(function(this: any) {
  const instance = this;

  // Autorun to reactively subscribe when filter or page changes
  const autorun = this.autorun(() => {
    const filter = instance.filter.get();
    const page = instance.currentPage.get();

    // Keep readiness tied to the active subscription handles only.
    // This avoids stale onReady callbacks from a prior stopped subscription.
    const usersSub = instance.subscribe('filteredUsers', filter, page, USERS_PER_PAGE);
    const countSub = instance.subscribe('filteredUsersCount', filter);
    instance.isLoading.set(!(usersSub.ready() && countSub.ready()));
  });
  instance.autoruns.push(autorun);
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
    const pagedUserIds = FilteredUserPageIds.find({}, { sort: { userId: 1 } })
      .fetch()
      .map((doc: any) => doc.userId)
      .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);

    if (pagedUserIds.length === 0) {
      return [];
    }

    // Only render the users explicitly included in the active paged subscription.
    const users = Meteor.users.find({ _id: { $in: pagedUserIds } }).fetch();

    // Process roles for display (O(n) single pass)
    return users.map((user: any) => {
      const identifierRaw = String(user?.email_canonical || user?.emails?.[0]?.address || user?.username || '').trim();
      const hasIdentifierInvariantViolation = identifierRaw.length === 0;
      const displayIdentifier = hasIdentifierInvariantViolation
        ? `[MISSING USER IDENTIFIER] userId=${String(user?._id || 'unknown')}`
        : identifierRaw;
      user.teacher = false;
      user.admin = false;
      user.canManageUsers = canManageUsers;
      user.displayIdentifier = displayIdentifier;
      user.hasIdentifierInvariantViolation = hasIdentifierInvariantViolation;

      user.teacher = userHasRole(user, 'teacher');
      user.admin = userHasRole(user, 'admin');
      return user;
    }).sort((a: any, b: any) => {
      const aViolation = !!a.hasIdentifierInvariantViolation;
      const bViolation = !!b.hasIdentifierInvariantViolation;
      if (aViolation !== bViolation) {
        return aViolation ? 1 : -1;
      }
      return String(a.displayIdentifier || '').localeCompare(String(b.displayIdentifier || ''));
    });
  },

  hasIdentifierInvariantViolations: function() {
    const pagedUserIds = FilteredUserPageIds.find({})
      .fetch()
      .map((doc: any) => doc.userId)
      .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
    const users = pagedUserIds.length > 0
      ? Meteor.users.find({ _id: { $in: pagedUserIds } }).fetch()
      : [];
    return users.some((user: any) => {
      const identifierRaw = String(user?.email_canonical || user?.emails?.[0]?.address || user?.username || '').trim();
      return identifierRaw.length === 0;
    });
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
    }, 300);
  },

  'click #prevPage': function(event: any, instance: any) {
    event.preventDefault();
    const current = instance.currentPage.get();
    if (current > 0) {
      instance.currentPage.set(current - 1);
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
      await MeteorCompat.callAsync('userAdminRoleChange', userId, roleAction, roleName);
      

      // Role update is reactive; no manual refresh needed.
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







