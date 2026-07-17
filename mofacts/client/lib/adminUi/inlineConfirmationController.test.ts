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

  it('retains scoped placement context and restores trigger focus on completion', function() {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const views: string[] = [];
    const controller = createInlineConfirmationController<{
      placement: 'row';
      action: 'delete';
      recordId: string;
    }>((view) => views.push(view.status));
    controller.open({
      confirmationId: 'user-delete-confirmation',
      title: 'Delete user',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      severity: 'danger',
      context: { placement: 'row', action: 'delete', recordId: 'user-1' },
    }, trigger);

    expect(controller.getContext()).to.deep.equal({
      placement: 'row',
      action: 'delete',
      recordId: 'user-1',
    });
    expect(controller.complete()).to.equal(true);
    expect(document.activeElement).to.equal(trigger);
    expect(views).to.deep.equal(['open', 'closed']);
  });

  it('does not publish state after destruction', function() {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const views: string[] = [];
    const controller = createInlineConfirmationController(
      (view) => views.push(view.status),
    );
    controller.open({
      confirmationId: 'delete-confirmation',
      title: 'Delete',
      message: 'Delete record.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      severity: 'danger',
      context: { recordId: 'record-1' },
    }, trigger);

    controller.destroy();
    expect(controller.setPending(true)).to.equal(false);
    expect(controller.complete()).to.equal(false);
    expect(views).to.deep.equal(['open']);
  });

  it('owns trigger confirmation attributes only while open', function() {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-controls', 'existing-region');
    document.body.appendChild(trigger);
    const controller = createInlineConfirmationController(() => undefined);
    controller.open({
      confirmationId: 'attribute-confirmation',
      title: 'Confirm',
      message: 'Confirm action.',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      severity: 'warning',
      context: undefined,
    }, trigger);

    expect(trigger.getAttribute('aria-controls')).to.equal('attribute-confirmation');
    expect(trigger.getAttribute('aria-expanded')).to.equal('true');

    controller.cancel();
    expect(trigger.getAttribute('aria-controls')).to.equal('existing-region');
    expect(trigger.hasAttribute('aria-expanded')).to.equal(false);
  });

  it('removes owned trigger attributes when destroyed without restoring focus', function() {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const controller = createInlineConfirmationController(() => undefined);
    controller.open({
      confirmationId: 'destroyed-confirmation',
      title: 'Confirm',
      message: 'Confirm action.',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      severity: 'warning',
      context: undefined,
    }, trigger);

    controller.destroy();

    expect(trigger.hasAttribute('aria-controls')).to.equal(false);
    expect(trigger.hasAttribute('aria-expanded')).to.equal(false);
    expect(document.activeElement).not.to.equal(trigger);
  });
});
