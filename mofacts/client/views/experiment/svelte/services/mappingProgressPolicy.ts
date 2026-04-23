// Stage 2 mapping policy helper.
// Conservative by design: if progress is ambiguous, treat as progressed.

type MappingProgressState = {
  currentUnitNumber?: unknown;
  questionIndex?: unknown;
  clusterIndex?: unknown;
  shufIndex?: unknown;
  overallOutcomeHistory?: unknown;
  overallStudyHistory?: unknown;
};

type MeteorSettingsPublicLike = {
  features?: {
    strictMappingMismatchEnforcement?: boolean | string;
  };
  strictMappingMismatchEnforcement?: boolean | string;
};

function getMeteorPublicSettings(): MeteorSettingsPublicLike | undefined {
  return (globalThis as typeof globalThis & {
    Meteor?: {
      settings?: {
        public?: MeteorSettingsPublicLike;
      };
    };
  }).Meteor?.settings?.public;
}

export function hasMeaningfulMappingProgress(state: MappingProgressState | null | undefined): boolean {
  if (!state || typeof state !== 'object') {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(state, 'currentUnitNumber')) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(state, 'questionIndex')) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(state, 'clusterIndex')) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(state, 'shufIndex')) {
    return true;
  }

  if (Array.isArray(state.overallOutcomeHistory) && state.overallOutcomeHistory.length > 0) {
    return true;
  }

  if (Array.isArray(state.overallStudyHistory) && state.overallStudyHistory.length > 0) {
    return true;
  }

  return false;
}

export function isStrictMappingMismatchEnforcementEnabled(): boolean {
  const meteorSettings = getMeteorPublicSettings();
  const raw =
    meteorSettings?.features?.strictMappingMismatchEnforcement ??
    meteorSettings?.strictMappingMismatchEnforcement;

  if (typeof raw === 'boolean') {
    return raw;
  }

  if (typeof raw === 'string') {
    return raw.trim().toLowerCase() === 'true';
  }

  // Default enabled per rollout policy.
  return true;
}
