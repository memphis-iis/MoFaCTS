import { Meteor } from 'meteor/meteor';

type UserLike = {
  username?: unknown;
  email_canonical?: unknown;
  email_original?: unknown;
  emails?: Array<{ address?: unknown }>;
  profile?: Record<string, unknown>;
  services?: {
    memphisSaml?: {
      displayName?: unknown;
      nameID?: unknown;
      email?: unknown;
      mail?: unknown;
      eduPersonPrincipalName?: unknown;
    };
    google?: { email?: unknown };
    microsoft?: { mail?: unknown; userPrincipalName?: unknown; email?: unknown };
  };
};

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function initialsFromName(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return '';
  const withoutEmailDomain = cleaned.includes('@') ? (cleaned.split('@')[0] || cleaned) : cleaned;
  const parts = withoutEmailDomain.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]?.charAt(0) || ''}${parts[1]?.charAt(0) || ''}`.toUpperCase();
  return ((parts[0] || withoutEmailDomain) || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
}

export function getUserDisplayName(user: UserLike | null | undefined): string {
  return firstString(
    user?.profile?.displayName,
    user?.profile?.name,
    user?.services?.memphisSaml?.displayName,
    user?.profile?.username,
    user?.username,
    user?.email_original,
    user?.email_canonical,
    user?.emails?.[0]?.address,
    user?.services?.memphisSaml?.email,
    user?.services?.memphisSaml?.mail,
    user?.services?.memphisSaml?.eduPersonPrincipalName,
    user?.services?.memphisSaml?.nameID,
    user?.services?.google?.email,
    user?.services?.microsoft?.mail,
    user?.services?.microsoft?.userPrincipalName,
    user?.services?.microsoft?.email,
  );
}

export function getUserInitials(user: UserLike | null | undefined, fallback = 'M'): string {
  const visibleName = firstString(user?.profile?.displayName) || getUserDisplayName(user);
  return initialsFromName(visibleName) || fallback;
}

export function haveMeteorUser(): boolean {
  const user = Meteor.user() as UserLike | null;
  return Boolean(Meteor.userId() && user && getUserDisplayIdentifier(user));
}

export function getUserDisplayIdentifier(user: UserLike | null | undefined): string {
  return firstString(user?.username, user?.email_canonical, user?.emails?.[0]?.address);
}
