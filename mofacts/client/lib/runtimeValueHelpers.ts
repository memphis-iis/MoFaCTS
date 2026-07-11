import { legacyInt, legacyTrim } from '../../common/underscoreCompat';

export function extractDelimFields(source: unknown, destination: string[]): void {
  if (!source) return;
  for (const field of legacyTrim(String(source)).split(/\s/)) {
    const trimmed = legacyTrim(field);
    if (trimmed) destination.push(trimmed);
  }
}

export function rangeVal(source: unknown): number[] {
  const text = legacyTrim(String(source));
  const separator = text.indexOf('-');
  if (separator < 1) return [];
  const first = legacyInt(text.substring(0, separator));
  const last = legacyInt(text.substring(separator + 1));
  if (last < first) return [];
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length;
  while (currentIndex > 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex]!, array[currentIndex]!];
  }
  return array;
}

export function randomChoice<T>(array: T[] | null | undefined): T | undefined {
  return array?.length ? array[Math.floor(Math.random() * array.length)] : undefined;
}

export function search<T extends object, K extends keyof T>(key: T[K], property: K, values: T[]): T | undefined {
  return values.find((value) => value[property] == key);
}
