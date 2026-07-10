export type DisclosureView = Readonly<{ open: boolean }>;

export type DisclosureController = Readonly<{
  getView: () => DisclosureView;
  toggle: (trigger: HTMLElement, panel: HTMLElement, focusInitial?: boolean) => boolean;
  open: (trigger: HTMLElement, panel: HTMLElement, focusInitial?: boolean) => boolean;
  close: (restoreFocus?: boolean) => boolean;
  handleTriggerKeydown: (
    event: Pick<KeyboardEvent, 'key' | 'preventDefault'>,
    trigger: HTMLElement,
    panel: HTMLElement,
  ) => boolean;
  handlePanelKeydown: (event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => boolean;
  closeFromOutside: (target: Node | null, disclosureRoot: Node) => boolean;
  destroy: () => void;
}>;

const INITIAL_FOCUS_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function createDisclosureController(
  onChange: (view: DisclosureView) => void,
): DisclosureController {
  let view: DisclosureView = { open: false };
  let trigger: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let destroyed = false;

  function publish(open: boolean): void {
    view = { open };
    if (!destroyed) {
      onChange(view);
    }
  }

  function focusFirst(): void {
    panel?.querySelector<HTMLElement>(INITIAL_FOCUS_SELECTOR)?.focus();
  }

  function close(restoreFocus = false): boolean {
    if (!view.open) {
      return false;
    }
    publish(false);
    if (restoreFocus && trigger?.isConnected) {
      trigger.focus();
    }
    trigger = null;
    panel = null;
    return true;
  }

  function open(
    nextTrigger: HTMLElement,
    nextPanel: HTMLElement,
    focusInitial = false,
  ): boolean {
    if (destroyed) {
      throw new Error('Cannot open a destroyed disclosure controller.');
    }
    trigger = nextTrigger;
    panel = nextPanel;
    publish(true);
    if (focusInitial) {
      queueMicrotask(focusFirst);
    }
    return true;
  }

  function toggle(
    nextTrigger: HTMLElement,
    nextPanel: HTMLElement,
    focusInitial = false,
  ): boolean {
    return view.open
      ? close(false)
      : open(nextTrigger, nextPanel, focusInitial);
  }

  return {
    getView(): DisclosureView {
      return view;
    },
    toggle,
    open,
    close,
    handleTriggerKeydown(event, nextTrigger, nextPanel): boolean {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        return open(nextTrigger, nextPanel, true);
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        return toggle(nextTrigger, nextPanel, false);
      }
      if (event.key === 'Escape' && view.open) {
        event.preventDefault();
        return close(true);
      }
      return false;
    },
    handlePanelKeydown(event): boolean {
      if (event.key !== 'Escape' || !view.open) {
        return false;
      }
      event.preventDefault();
      return close(true);
    },
    closeFromOutside(target, disclosureRoot): boolean {
      if (!view.open || (target && disclosureRoot.contains(target))) {
        return false;
      }
      return close(false);
    },
    destroy(): void {
      destroyed = true;
      view = { open: false };
      trigger = null;
      panel = null;
    },
  };
}
