export function hasPublicCreatorDisplayName(user: unknown): boolean {
  const displayName = (user as { profile?: { displayName?: unknown } } | null | undefined)
    ?.profile?.displayName;
  return typeof displayName === 'string' && displayName.trim().length > 0;
}
