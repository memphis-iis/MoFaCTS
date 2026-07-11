import type { UnitEngineExtension } from './UnitEngine';

export type UnitEngineFactory = () => Promise<UnitEngineExtension> | UnitEngineExtension;
export type UnitEngineFactoryWithDeps<TDeps> = (deps: TDeps) => Promise<UnitEngineExtension> | UnitEngineExtension;

const unitEngineFactories = new Map<string, UnitEngineFactory>();
const unitEngineFactoriesWithDeps = new Map<string, UnitEngineFactoryWithDeps<unknown>>();

export function registerUnitEngine(unitType: string, factory: UnitEngineFactory): void {
  const normalizedUnitType = String(unitType || '').trim();
  if (!normalizedUnitType) {
    throw new Error('Unit engine registration requires a non-empty unit type');
  }
  if (unitEngineFactories.has(normalizedUnitType)) {
    throw new Error(`Unit engine "${normalizedUnitType}" is already registered`);
  }
  if (unitEngineFactoriesWithDeps.has(normalizedUnitType)) {
    throw new Error(`Unit engine "${normalizedUnitType}" is already registered`);
  }
  unitEngineFactories.set(normalizedUnitType, factory);
}

export function registerUnitEngineWithDeps<TDeps>(
  unitType: string,
  factory: UnitEngineFactoryWithDeps<TDeps>,
): void {
  const normalizedUnitType = String(unitType || '').trim();
  if (!normalizedUnitType) {
    throw new Error('Unit engine registration requires a non-empty unit type');
  }
  if (unitEngineFactories.has(normalizedUnitType) || unitEngineFactoriesWithDeps.has(normalizedUnitType)) {
    throw new Error(`Unit engine "${normalizedUnitType}" is already registered`);
  }
  unitEngineFactoriesWithDeps.set(normalizedUnitType, factory as UnitEngineFactoryWithDeps<unknown>);
}

export function hasRegisteredUnitEngine(unitType: string): boolean {
  const normalizedUnitType = String(unitType || '').trim();
  return unitEngineFactories.has(normalizedUnitType) || unitEngineFactoriesWithDeps.has(normalizedUnitType);
}

export async function createRegisteredUnitEngine<TDeps>(
  unitType: string,
  deps?: TDeps,
): Promise<UnitEngineExtension> {
  const normalizedUnitType = String(unitType || '').trim();
  const factory = unitEngineFactories.get(normalizedUnitType);
  if (factory) {
    return await factory();
  }

  const factoryWithDeps = unitEngineFactoriesWithDeps.get(normalizedUnitType);
  if (factoryWithDeps) {
    return await factoryWithDeps(deps as unknown);
  }

  throw new Error(`No unit engine registered for "${normalizedUnitType}"`);
}

export function getRegisteredUnitEngineTypes(): string[] {
  return Array.from(new Set([
    ...unitEngineFactories.keys(),
    ...unitEngineFactoriesWithDeps.keys(),
  ])).sort();
}

export function resetUnitEngineRegistryForTests(): void {
  unitEngineFactories.clear();
  unitEngineFactoriesWithDeps.clear();
}
