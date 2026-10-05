import { Tracker } from 'meteor/tracker';
import { createInlineConfirmationController, type InlineConfirmationView } from './adminUi/inlineConfirmationController';
import { translatePlatformString } from './interfaceI18n';
import { getActiveUiLocale } from './interfaceLocaleState';
import type { ContentUpdateConfirmation, ContentUpdateReview, ContentUpdateWarning } from '../../common/lib/contentUpdateWarnings';

function warningText(warnings: ContentUpdateWarning[]): string {
  return warnings.map(code => translatePlatformString(getActiveUiLocale(), code === 'questions-removed'
    ? 'content.questionsRemovedWarning' : 'content.unitSequenceChangedWarning')).join(' ');
}

export function formatPackageUpdateWarnings(updates: Array<{
  lessonName?: string; fileName?: string; tdfId?: string; structuralWarnings: ContentUpdateWarning[];
}>): string {
  return updates.map(entry => [translatePlatformString(getActiveUiLocale(), 'content.previousTdfOverwriteMessage', {
    filename: entry.lessonName || entry.fileName || entry.tdfId || '',
  }), warningText(entry.structuralWarnings)].filter(Boolean).join(' ')).join(' ');
}

/** Preserve one proposed payload across owner review and the confirmed write. */
export async function saveEditedContent(options: {
  callAsync: (method: string, ...args: any[]) => Promise<any>;
  method: 'saveTdfContent' | 'saveTdfStimuli';
  args: unknown[];
  confirm: (review: ContentUpdateReview) => Promise<boolean>;
}): Promise<boolean> {
  const proposed = structuredClone(options.args);
  let result = await options.callAsync(options.method, ...structuredClone(proposed));
  if (result?.status === 'confirmation-required') {
    if (!await options.confirm(result)) return false;
    const confirmation: ContentUpdateConfirmation = { expectedRevision: result.expectedRevision, confirmed: true };
    result = await options.callAsync(options.method, ...structuredClone(proposed), confirmation);
  }
  if (result?.success !== true) throw new Error('Content saving did not return a completion result.');
  return true;
}

export function createContentUpdateConfirmation(
  onChange: (view: InlineConfirmationView | null) => void,
  getTrigger: () => HTMLElement | null,
) {
  let resolve: ((confirmed: boolean) => void) | undefined;
  const controller = createInlineConfirmationController<void>(view => {
    onChange(view.status === 'open' ? view : null);
    if (view.status === 'closed' && resolve) {
      const pending = resolve;
      resolve = undefined;
      pending(false);
    }
  }, getTrigger);
  return {
    request(review: ContentUpdateReview): Promise<boolean> {
      const trigger = getTrigger();
      if (!trigger) throw new Error('Content update confirmation requires its save control.');
      controller.cancel();
      return new Promise<boolean>(done => {
        resolve = done;
        controller.open({
          confirmationId: 'content-structural-update-confirmation',
          title: translatePlatformString(getActiveUiLocale(), 'content.overwriteExistingContent'),
          message: [review.lessonName, warningText(review.structuralWarnings)].filter(Boolean).join(' '),
          confirmLabel: translatePlatformString(getActiveUiLocale(), 'content.overwriteContent'),
          cancelLabel: translatePlatformString(getActiveUiLocale(), 'content.cancel'),
          severity: 'warning', context: undefined,
        }, trigger);
        Tracker.afterFlush(() => controller.focusInitial());
      });
    },
    confirm(): boolean {
      if (!resolve) return false;
      const done = resolve;
      resolve = undefined;
      controller.complete();
      done(true);
      return true;
    },
    cancel: () => controller.cancel(),
    handleKeydown: (event: KeyboardEvent) => controller.handleKeydown(event),
    destroy(): void {
      controller.cancel();
      controller.destroy();
    },
  };
}
