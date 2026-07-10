import { Template } from 'meteor/templating';
import type { InlineConfirmationView } from '../../../lib/adminUi/inlineConfirmationController';
import './adminUi.html';
import './adminUi.css';

type StatusVariant = 'info' | 'success' | 'warning' | 'error';

const STATUS_ICONS: Readonly<Record<StatusVariant, string>> = {
  info: 'fa-info-circle',
  success: 'fa-check-circle',
  warning: 'fa-exclamation-triangle',
  error: 'fa-times-circle',
};

function statusVariant(value: unknown): StatusVariant {
  if (value === 'success' || value === 'warning' || value === 'error') {
    return value;
  }
  return 'info';
}

Template.adminStatus.helpers({
  statusVariant() {
    return statusVariant((Template.currentData() as { variant?: unknown } | undefined)?.variant);
  },
  statusIcon() {
    return STATUS_ICONS[statusVariant((Template.currentData() as { variant?: unknown } | undefined)?.variant)];
  },
  statusRole() {
    return (Template.currentData() as { urgent?: boolean } | undefined)?.urgent ? 'alert' : 'status';
  },
  statusLive() {
    return (Template.currentData() as { urgent?: boolean } | undefined)?.urgent ? 'assertive' : 'polite';
  },
});

Template.adminEmptyState.helpers({
  emptyStateIcon() {
    const icon = (Template.currentData() as { icon?: unknown } | undefined)?.icon;
    return typeof icon === 'string' && icon.trim() ? icon : 'fa-inbox';
  },
});

Template.adminInlineConfirmation.helpers({
  confirmationPresentation() {
    const confirmation = (Template.currentData() as {
      confirmation?: InlineConfirmationView;
    } | undefined)?.confirmation;
    const view = confirmation ?? {
      status: 'closed',
      confirmationId: '',
      title: '',
      message: '',
      confirmLabel: '',
      cancelLabel: '',
      severity: 'warning',
      pending: false,
      inputLabel: '',
      inputValueRequired: false,
    } satisfies InlineConfirmationView;
    const confirmationId = view.confirmationId || 'admin-confirmation-inactive';
    return {
      ...view,
      confirmationId,
      titleId: `${confirmationId}-title`,
      messageId: `${confirmationId}-message`,
      inputId: `${confirmationId}-input`,
      visibilityClass: view.status === 'open' ? '' : 'admin-inline-confirmation-hidden',
      inputClass: view.inputValueRequired ? '' : 'admin-inline-confirmation-input-hidden',
      ariaHidden: view.status === 'open' ? 'false' : 'true',
      confirmButtonClass: view.severity === 'danger' ? 'btn-danger' : 'btn-warning',
    };
  },
});
