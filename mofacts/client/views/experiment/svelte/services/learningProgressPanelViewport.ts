export type LearningProgressDocument = {
  readonly documentElement?: {
    readonly classList?: {
      toggle(className: string, force?: boolean): void;
    };
  };
};

export type LearningProgressWindow = {
  dispatchEvent(event: Event): boolean;
  setTimeout(handler: () => void, timeoutMs: number): unknown;
};

export function progressPanelDisabled(settings: { disableProgressReport?: unknown } | null | undefined): boolean {
  const value = settings?.disableProgressReport;
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function setLearningProgressViewportOpen(params: {
  readonly documentRef: LearningProgressDocument | null | undefined;
  readonly open: boolean;
}): void {
  params.documentRef?.documentElement?.classList?.toggle(
    'learning-progress-panel-viewport-open',
    params.open,
  );
}

export async function notifyLearningProgressLayoutChange(params: {
  readonly windowRef: LearningProgressWindow | null | undefined;
  readonly waitForDomUpdate: () => Promise<void>;
  readonly resizeDelayMs?: number;
}): Promise<void> {
  if (!params.windowRef) {
    return;
  }
  await params.waitForDomUpdate();
  params.windowRef.dispatchEvent(new Event('resize'));
  params.windowRef.setTimeout(() => {
    params.windowRef?.dispatchEvent(new Event('resize'));
  }, params.resizeDelayMs ?? 260);
}
