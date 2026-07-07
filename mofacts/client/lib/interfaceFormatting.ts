import {
  formatInterfaceDateTime,
  formatInterfaceNumber,
  formatInterfacePercent,
} from '../../common/lib/interfaceFormatting';
import { getActiveUiLocale } from './interfaceLocaleState';

export function formatActiveInterfaceNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return formatInterfaceNumber(getActiveUiLocale(), value, options);
}

export function formatActiveInterfacePercent(value: number, options?: Intl.NumberFormatOptions): string {
  return formatInterfacePercent(getActiveUiLocale(), value, options);
}

export function formatActiveInterfaceDateTime(
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatInterfaceDateTime(getActiveUiLocale(), value, options);
}

