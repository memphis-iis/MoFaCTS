import { requireTargetUiLocale } from './interfaceLocales';

export function formatInterfaceNumber(
  rawLocale: string,
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  const locale = requireTargetUiLocale(rawLocale);
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatInterfacePercent(
  rawLocale: string,
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return formatInterfaceNumber(rawLocale, value, {
    style: 'percent',
    maximumFractionDigits: 0,
    ...options,
  });
}

export function formatInterfaceDateTime(
  rawLocale: string,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const locale = requireTargetUiLocale(rawLocale);
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid date value for interface formatting: ${String(value)}`);
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
}

