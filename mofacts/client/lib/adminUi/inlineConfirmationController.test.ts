import { expect } from 'chai';
import { createInlineConfirmationController } from './inlineConfirmationController';

describe('admin UI inline confirmation controller', function() {
  afterEach(function() {
    document.body.replaceChildren();
  });

  it('focuses confirmation, cancels with Escape, and restores its trigger', function() {
    const trigger = document.createElement('button');
    const region = document.createElement('div');
    const cancel = document.createElement('button');
    region.id = 'delete-confirmation';
    cancel.dataset.confirmationInitialFocus = 'true';
    region.append(cancel);
    document.body.append(trigger, region);
    trigger.focus();
    const controller = createInlineConfirmationController<{ jobId: string }>(() => undefined);
    controller.open({
      confirmationId: 'delete-confirmation',
      title: 'Delete backup',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      severity: 'danger',
      context: { jobId: 'job-1' },
    }, trigger);

    expect(controller.focusInitial()).to.equal(true);
    expect(document.activeElement).to.equal(cancel);
    let prevented = false;
    expect(controller.handleKeydown({
      key: 'Escape',
      preventDefault: () => {
        prevented = true;
      },
    })).to.equal(true);
    expect(prevented).to.equal(true);
    expect(document.activeElement).to.equal(trigger);
  });

  it('blocks cancellation while pending and restores fallback focus after row removal', function() {
    const trigger = document.createElement('button');
    const fallback = document.createElement('div');
    fallback.tabIndex = -1;
    document.body.append(trigger, fallback);
    const controller = createInlineConfirmationController(
      () => undefined,
      () => fallback,
    );
    controller.open({
      confirmationId: 'restore-confirmation',
      title: 'Restore backup',
      message: 'Restore data.',
      confirmLabel: 'Restore',
      cancelLabel: 'Cancel',
      severity: 'danger',
      context: { jobId: 'job-1' },
    }, trigger);
    controller.setPending(true);

    expect(controller.cancel()).to.equal(false);
    expect(() => controller.open({
      confirmationId: 'replacement-confirmation',
      title: 'Replacement',
      message: 'Replace pending work.',
      confirmLabel: 'Replace',
      cancelLabel: 'Cancel',
      severity: 'danger',
      context: { jobId: 'job-2' },
    }, trigger)).to.throw('Cannot replace a pending inline confirmation.');
    expect(controller.getContext()).to.deep.equal({ jobId: 'job-1' });
    trigger.remove();
    expect(controller.complete()).to.equal(true);
    expect(document.activeElement).to.equal(fallback);
  });
});
