import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { getActiveUiLocale } from '../lib/interfaceLocaleState';
import { translatePlatformString } from '../lib/interfaceI18n';
import type { PlatformStringKey } from '../lib/interfaceI18nResources';
import type { RecoverableWarning, RecoverableWarningCursor, RecoverableWarningPage } from '../../common/recoverableWarnings';
import './recoverableWarningLog.html';

type Instance = Blaze.TemplateInstance & {
  warningPage: ReactiveVar<RecoverableWarningPage | null>;
  pending: ReactiveVar<boolean>;
  failed: ReactiveVar<boolean>;
  disposed: boolean;
};

async function loadPage(instance: Instance, cursor: RecoverableWarningCursor | null) {
  if (instance.pending.get()) return;
  instance.pending.set(true);
  instance.failed.set(false);
  try {
    const page = await Meteor.callAsync('getRecoverableWarnings', cursor) as RecoverableWarningPage;
    if (!instance.disposed) instance.warningPage.set(page);
  } catch {
    if (!instance.disposed) instance.failed.set(true);
  } finally {
    if (!instance.disposed) instance.pending.set(false);
  }
}

Template.recoverableWarningLog.onCreated(function(this: Instance) {
  this.warningPage = new ReactiveVar<RecoverableWarningPage | null>(null);
  this.pending = new ReactiveVar(false);
  this.failed = new ReactiveVar(false);
  this.disposed = false;
  void loadPage(this, null);
});
Template.recoverableWarningLog.onDestroyed(function(this: Instance) { this.disposed = true; });
Template.recoverableWarningLog.helpers({
  warningText(key: PlatformStringKey) {
    return translatePlatformString(getActiveUiLocale(), key);
  },
  warningMessage(warning: RecoverableWarning) {
    if (warning.code === 'sparc.staleQuestion' || warning.code === 'sparc.contentRemovalCheckFailed') return JSON.stringify(warning);
    if (warning.code === 'autotutor.outputLimit') {
      return translatePlatformString(getActiveUiLocale(), 'adminTests.warningOutputLimit', {
        operation: warning.operation, field: warning.field, size: warning.observedSize,
        limit: warning.limit, unit: warning.unit, attempts: warning.attempts,
        outcome: translatePlatformString(getActiveUiLocale(), `adminTests.warningOutputLimit.${warning.outcome}`),
      });
    }
    return translatePlatformString(getActiveUiLocale(), 'adminTests.warningMismatch', { count: warning.mismatchCount });
  },
  warningTime(date: Date) { return date.toLocaleString(getActiveUiLocale()); },
  rows() { return (Template.instance() as Instance).warningPage.get()?.rows; },
  hasOlder() { return Boolean((Template.instance() as Instance).warningPage.get()?.nextCursor); },
  pending() { return (Template.instance() as Instance).pending.get(); },
  failed() { return (Template.instance() as Instance).failed.get(); },
});
Template.recoverableWarningLog.events({
  'click .refresh-recoverable-warnings'(_event: Event, instance: Instance) { void loadPage(instance, null); },
  'click .older-recoverable-warnings'(_event: Event, instance: Instance) {
    const cursor = instance.warningPage.get()?.nextCursor;
    if (cursor) void loadPage(instance, cursor);
  },
});
