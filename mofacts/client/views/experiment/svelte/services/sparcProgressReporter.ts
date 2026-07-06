import {
  type SparcProgressReporterConfig,
} from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
import {
  resolveSparcControllerDisplay,
  type SparcControllerDisplay,
} from './sparcController';

type DeliverySettingsLike = Record<string, unknown> | null | undefined;

export type SparcProgressReporterState = {
  readonly isSparcDisplay: boolean;
  readonly progressReporter: SparcProgressReporterConfig | null;
  readonly requestsSidebar: boolean;
  readonly requestsDocument: boolean;
  readonly effectiveProgressDisabled: boolean;
  readonly deliverySettings: Record<string, unknown>;
};

function isLearningProgressNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }
  const candidate = node as {
    atomType?: unknown;
    children?: unknown;
    panels?: unknown;
  };
  if (candidate.atomType === 'learning-progress') {
    return true;
  }
  if (Array.isArray(candidate.children) && candidate.children.some(isLearningProgressNode)) {
    return true;
  }
  if (Array.isArray(candidate.panels)) {
    return candidate.panels.some((panel) => {
      if (!panel || typeof panel !== 'object') {
        return false;
      }
      const children = (panel as { children?: unknown }).children;
      return Array.isArray(children) && children.some(isLearningProgressNode);
    });
  }
  return false;
}

export function sparcDisplayHasDocumentProgress(display: SparcControllerDisplay): boolean {
  return Array.isArray(display.nodes) && display.nodes.some(isLearningProgressNode);
}

export function resolveSparcProgressReporterState(params: {
  readonly display: Record<string, unknown> | undefined;
  readonly deliverySettings: DeliverySettingsLike;
}): SparcProgressReporterState {
  const baseDeliverySettings = params.deliverySettings || {};
  const display = resolveSparcControllerDisplay(params.display, '[SPARC Progress Reporter]');
  if (!display) {
    return {
      isSparcDisplay: false,
      progressReporter: null,
      requestsSidebar: false,
      requestsDocument: false,
      effectiveProgressDisabled: baseDeliverySettings.disableProgressReport === true,
      deliverySettings: baseDeliverySettings,
    };
  }

  const progressReporter = display.progressReporter || null;
  const documentNodeRequestsProgress = sparcDisplayHasDocumentProgress(display);
  const requestsSidebar = progressReporter?.placement === 'sidebar';
  const requestsDocument = progressReporter?.placement === 'document' || (!progressReporter && documentNodeRequestsProgress);
  const effectiveProgressDisabled = baseDeliverySettings.disableProgressReport === true || !requestsSidebar;

  return {
    isSparcDisplay: true,
    progressReporter,
    requestsSidebar,
    requestsDocument,
    effectiveProgressDisabled,
    deliverySettings: effectiveProgressDisabled
      ? {
          ...baseDeliverySettings,
          disableProgressReport: true,
        }
      : baseDeliverySettings,
  };
}

