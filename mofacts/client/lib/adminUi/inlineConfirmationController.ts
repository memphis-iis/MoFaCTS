export type ConfirmationSeverity = 'warning' | 'danger';

export type InlineConfirmationView = Readonly<{
  status: 'closed' | 'open';
  confirmationId: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  severity: ConfirmationSeverity;
  pending: boolean;
  inputLabel: string;
  inputValueRequired: boolean;
}>;

export type InlineConfirmationOptions<TContext> = Readonly<{
  confirmationId: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  severity: ConfirmationSeverity;
  context: TContext;
  inputLabel?: string;
  inputValueRequired?: boolean;
}>;

export type InlineConfirmationController<TContext> = Readonly<{
  getView: () => InlineConfirmationView;
  getContext: () => TContext | undefined;
  open: (options: InlineConfirmationOptions<TContext>, trigger: HTMLElement) => void;
  focusInitial: (root?: ParentNode) => boolean;
  cancel: () => boolean;
  setPending: (pending: boolean) => boolean;
  complete: () => boolean;
  handleKeydown: (event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => boolean;
  destroy: () => void;
}>;

const CLOSED_VIEW: InlineConfirmationView = {
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
};

export function createInlineConfirmationController<TContext>(
  onChange: (view: InlineConfirmationView) => void,
  returnFocusFallback?: () => HTMLElement | null,
): InlineConfirmationController<TContext> {
  let view = CLOSED_VIEW;
  let context: TContext | undefined;
  let trigger: HTMLElement | null = null;
  let destroyed = false;

  function publish(nextView: InlineConfirmationView): void {
    view = nextView;
    if (!destroyed) {
      onChange(view);
    }
  }

  function restoreFocus(): void {
    const target = trigger?.isConnected ? trigger : returnFocusFallback?.();
    target?.focus();
  }

  function close(restore: boolean): boolean {
    if (view.status !== 'open') {
      return false;
    }
    publish(CLOSED_VIEW);
    context = undefined;
    if (restore) {
      restoreFocus();
    }
    trigger = null;
    return true;
  }

  return {
    getView(): InlineConfirmationView {
      return view;
    },
    getContext(): TContext | undefined {
      return context;
    },
    open(options: InlineConfirmationOptions<TContext>, nextTrigger: HTMLElement): void {
      if (destroyed) {
        throw new Error('Cannot open a destroyed inline confirmation controller.');
      }
      if (view.status === 'open' && view.pending) {
        throw new Error('Cannot replace a pending inline confirmation.');
      }
      if (!options.confirmationId.trim()) {
        throw new Error('Inline confirmation requires a non-empty ID.');
      }
      if (view.status === 'open' && !view.pending) {
        close(true);
      }
      trigger = nextTrigger;
      context = options.context;
      publish({
        status: 'open',
        confirmationId: options.confirmationId,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        severity: options.severity,
        pending: false,
        inputLabel: options.inputLabel ?? '',
        inputValueRequired: options.inputValueRequired === true,
      });
    },
    focusInitial(root: ParentNode = document): boolean {
      if (view.status !== 'open') {
        return false;
      }
      const element = root.querySelector<HTMLElement>(
        `#${CSS.escape(view.confirmationId)} [data-confirmation-initial-focus]`,
      );
      element?.focus();
      return Boolean(element);
    },
    cancel(): boolean {
      if (view.status !== 'open' || view.pending) {
        return false;
      }
      return close(true);
    },
    setPending(pending: boolean): boolean {
      if (view.status !== 'open') {
        return false;
      }
      publish({ ...view, pending });
      return true;
    },
    complete(): boolean {
      return close(true);
    },
    handleKeydown(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): boolean {
      if (event.key !== 'Escape' || view.status !== 'open' || view.pending) {
        return false;
      }
      event.preventDefault();
      return close(true);
    },
    destroy(): void {
      destroyed = true;
      view = CLOSED_VIEW;
      context = undefined;
      trigger = null;
    },
  };
}
