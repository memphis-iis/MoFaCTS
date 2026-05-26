export type EngineInitPolicyEngineLike = {
  unitType?: unknown;
  __unitNumber?: unknown;
  __tdfId?: unknown;
  __unitName?: unknown;
};

export type EngineInitPolicyInput = {
  existingEngine?: EngineInitPolicyEngineLike | null | undefined;
  expectedUnitType?: unknown;
  currentUnitNumber: number;
  currentTdfId?: unknown;
  currentUnitName?: unknown;
};

export type EngineInitPolicy = {
  shouldInitEngine: boolean;
  engineUnitContextChanged: boolean;
};

function normalizeEngineUnitNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeUnitName(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function resolveSvelteEngineInitPolicy(input: EngineInitPolicyInput): EngineInitPolicy {
  const existingEngine = input.existingEngine || null;
  const existingEngineUnitNumber = normalizeEngineUnitNumber(existingEngine?.__unitNumber);
  const existingEngineTdfId = existingEngine?.__tdfId || null;
  const existingEngineUnitName = normalizeUnitName(existingEngine?.__unitName);
  const currentTdfId = input.currentTdfId || null;
  const currentUnitName = normalizeUnitName(input.currentUnitName);

  const engineUnitContextChanged = !!existingEngine && (
    existingEngineUnitNumber !== input.currentUnitNumber ||
    existingEngineTdfId !== currentTdfId ||
    existingEngineUnitName !== currentUnitName
  );

  return {
    engineUnitContextChanged,
    shouldInitEngine: !existingEngine ||
      (typeof input.expectedUnitType === 'string' && existingEngine.unitType !== input.expectedUnitType) ||
      engineUnitContextChanged ||
      existingEngine?.unitType === 'unknown',
  };
}
