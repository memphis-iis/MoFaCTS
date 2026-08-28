import { isPublicDemoKind, type PublicDemoKind } from '../../common/publicDemoContract';

export const PUBLIC_DEMO_SESSION_STORAGE_KEY = 'mofacts.publicDemo.v1';

export type StoredPublicDemoSession = {
  kind: PublicDemoKind;
  experimentTarget: string;
  expiresAt: string;
};

export function isPublicDemoAccount(user: unknown): boolean {
  return (user as { profile?: { createdBy?: unknown } } | null)?.profile?.createdBy === 'publicDemo';
}

export function readStoredPublicDemoSession(): StoredPublicDemoSession | null {
  const raw = window.sessionStorage.getItem(PUBLIC_DEMO_SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<StoredPublicDemoSession>;
    if (!isPublicDemoKind(value.kind) || typeof value.experimentTarget !== 'string' || typeof value.expiresAt !== 'string') {
      clearStoredPublicDemoSession();
      return null;
    }
    return value as StoredPublicDemoSession;
  } catch {
    clearStoredPublicDemoSession();
    return null;
  }
}

export function writeStoredPublicDemoSession(value: StoredPublicDemoSession): void {
  window.sessionStorage.setItem(PUBLIC_DEMO_SESSION_STORAGE_KEY, JSON.stringify(value));
}

export function clearStoredPublicDemoSession(): void {
  window.sessionStorage.removeItem(PUBLIC_DEMO_SESSION_STORAGE_KEY);
}

export function publicDemoOverviewPath(kind: PublicDemoKind): string {
  if (kind === 'teacher') return '/#teachers';
  if (kind === 'researcher') return '/#researchers';
  return '/#students';
}
