export type AdminMessageLevel = 'info' | 'success' | 'error';

export type AdminMessage = Readonly<{
  level: AdminMessageLevel;
  text: string;
}>;

export type AdminServerStatus = Readonly<{
  diskSpacePercent: string;
  remainingSpace: string;
  diskSpace: string;
  diskSpaceUsed: string;
  error: string | null;
}>;

export type AdminVerbosityLevel = '0' | '1' | '2';

export function normalizeVerbosityLevel(value: unknown): AdminVerbosityLevel {
  return String(parseLoggingVerbosityLevel(value)) as AdminVerbosityLevel;
}

export function normalizeServerStatus(value: unknown): AdminServerStatus {
  const source = value && typeof value === 'object'
    ? value as Partial<AdminServerStatus>
    : {};
  return {
    diskSpacePercent: typeof source.diskSpacePercent === 'string' ? source.diskSpacePercent : '',
    remainingSpace: typeof source.remainingSpace === 'string' ? source.remainingSpace : '',
    diskSpace: typeof source.diskSpace === 'string' ? source.diskSpace : '',
    diskSpaceUsed: typeof source.diskSpaceUsed === 'string' ? source.diskSpaceUsed : '',
    error: typeof source.error === 'string' && source.error ? source.error : null,
  };
}

export function radioChecked(current: AdminVerbosityLevel | null, option: unknown): string {
  return current && current === String(option) ? 'checked' : '';
}

import { parseLoggingVerbosityLevel } from '../../common/loggingSettings';
