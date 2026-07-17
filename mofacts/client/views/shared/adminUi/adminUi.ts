import { Template } from 'meteor/templating';
import type { InlineConfirmationView } from '../../../lib/adminUi/inlineConfirmationController';
import './adminUi.html';
import './adminUi.css';

type StatusVariant = 'info' | 'success' | 'warning' | 'error';

export type AdminStatusTemplateData = Readonly<{
  id?: string;
  className?: string;
  variant?: StatusVariant;
  title?: string;
  text: string;
  urgent?: boolean;
}>;

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

function statusIsUrgent(data: AdminStatusTemplateData | undefined): boolean {
  return data?.urgent === true || statusVariant(data?.variant) === 'error';
}

Template.adminStatus.helpers({
  statusIdAttrs() {
    const id = (Template.currentData() as AdminStatusTemplateData | undefined)?.id;
    return typeof id === 'string' && id.trim() ? { id: id.trim() } : {};
  },
  statusClassName() {
    const className = (Template.currentData() as AdminStatusTemplateData | undefined)?.className;
    return typeof className === 'string' ? className.trim() : '';
  },
  statusVariant() {
    return statusVariant((Template.currentData() as AdminStatusTemplateData | undefined)?.variant);
  },
  statusIcon() {
    return STATUS_ICONS[statusVariant(
      (Template.currentData() as AdminStatusTemplateData | undefined)?.variant,
    )];
  },
  statusRole() {
    return statusIsUrgent(Template.currentData() as AdminStatusTemplateData | undefined)
      ? 'alert'
      : 'status';
  },
  statusLive() {
    return statusIsUrgent(Template.currentData() as AdminStatusTemplateData | undefined)
      ? 'assertive'
      : 'polite';
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
