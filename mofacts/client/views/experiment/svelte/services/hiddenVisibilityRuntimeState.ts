import { ReactiveDict } from 'meteor/reactive-dict';

const hiddenVisibilityRuntimeState = new ReactiveDict('hiddenVisibilityRuntimeState');

const HiddenVisibilityKeys = Object.freeze({
  HIDDEN_ITEMS: 'hiddenItems',
  NUM_VISIBLE_CARDS: 'numVisibleCards',
  WAS_REPORTED_FOR_REMOVAL: 'wasReportedForRemoval',
});

const HIDDEN_VISIBILITY_DEFAULTS = Object.freeze({
  [HiddenVisibilityKeys.HIDDEN_ITEMS]: [],
  [HiddenVisibilityKeys.NUM_VISIBLE_CARDS]: 0,
  [HiddenVisibilityKeys.WAS_REPORTED_FOR_REMOVAL]: false,
});

export function resetHiddenVisibilityRuntimeState(): void {
  Object.entries(HIDDEN_VISIBILITY_DEFAULTS).forEach(([key, value]) => {
    hiddenVisibilityRuntimeState.set(key, Array.isArray(value) ? value.slice() : value);
  });
}

export function getHiddenItems(): unknown[] {
  return (hiddenVisibilityRuntimeState.get(HiddenVisibilityKeys.HIDDEN_ITEMS) as unknown[] | undefined) || [];
}

export function setHiddenItems(value: unknown[] | undefined = []): void {
  const next = Array.isArray(value) ? value.slice() : [];
  hiddenVisibilityRuntimeState.set(HiddenVisibilityKeys.HIDDEN_ITEMS, next);
}

export function addHiddenItem(item: unknown): void {
  const current = getHiddenItems();
  if (current.includes(item)) return;
  setHiddenItems([...current, item]);
}

export function resetHiddenItems(): void {
  setHiddenItems([]);
}

export function getNumVisibleCards(): number {
  return (hiddenVisibilityRuntimeState.get(HiddenVisibilityKeys.NUM_VISIBLE_CARDS) as number | undefined) || 0;
}

export function setNumVisibleCards(value: number): void {
  hiddenVisibilityRuntimeState.set(HiddenVisibilityKeys.NUM_VISIBLE_CARDS, value);
}

export function adjustNumVisibleCards(delta: number): void {
  setNumVisibleCards(getNumVisibleCards() + delta);
}

export function wasReportedForRemoval(): boolean {
  return hiddenVisibilityRuntimeState.get(HiddenVisibilityKeys.WAS_REPORTED_FOR_REMOVAL) === true;
}

export function setWasReportedForRemoval(value: unknown): void {
  hiddenVisibilityRuntimeState.set(HiddenVisibilityKeys.WAS_REPORTED_FOR_REMOVAL, Boolean(value));
}

resetHiddenVisibilityRuntimeState();
