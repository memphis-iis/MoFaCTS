type ModalOptions = {
  backdrop?: boolean | 'static';
  keyboard?: boolean;
  focus?: boolean;
};

function getBootstrapModalConstructor() {
  return (globalThis as any).bootstrap?.Modal || null;
}

function resolveModalElement(idOrElement: string | HTMLElement): HTMLElement | null {
  if (typeof idOrElement !== 'string') {
    return idOrElement;
  }
  return document.getElementById(idOrElement);
}

export function getBootstrapModal(idOrElement: string | HTMLElement, options?: ModalOptions): any | null {
  const element = resolveModalElement(idOrElement);
  const Modal = getBootstrapModalConstructor();
  if (!element || !Modal) {
    return null;
  }
  return Modal.getOrCreateInstance(element, options);
}

export function showBootstrapModal(idOrElement: string | HTMLElement, options?: ModalOptions): void {
  getBootstrapModal(idOrElement, options)?.show();
}

export function hideBootstrapModal(idOrElement: string | HTMLElement): void {
  getBootstrapModal(idOrElement)?.hide();
}

export function disposeBootstrapModal(idOrElement: string | HTMLElement): void {
  const element = resolveModalElement(idOrElement);
  const Modal = getBootstrapModalConstructor();
  if (!element || !Modal) {
    return;
  }
  Modal.getInstance(element)?.dispose();
}

export function cleanupBootstrapModalState(): void {
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}
