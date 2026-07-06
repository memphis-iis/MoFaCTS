import { ReactiveDict } from 'meteor/reactive-dict';

export type DebugParms = {
  probParmsDisplay?: boolean;
};

const debugRuntimeState = new ReactiveDict('debugRuntimeState');

const DebugRuntimeKeys = Object.freeze({
  DEBUG_PARMS: 'debugParms',
});

export function getDebugParms(): DebugParms | undefined {
  const value = debugRuntimeState.get(DebugRuntimeKeys.DEBUG_PARMS) as DebugParms | undefined;
  return value ? { ...value } : undefined;
}

export function setDebugParms(value: DebugParms | undefined): void {
  debugRuntimeState.set(DebugRuntimeKeys.DEBUG_PARMS, value ? { ...value } : undefined);
}

export function resetDebugRuntimeState(): void {
  setDebugParms(undefined);
}

resetDebugRuntimeState();
