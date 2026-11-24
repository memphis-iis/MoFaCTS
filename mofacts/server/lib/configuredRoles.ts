type Role = 'admin' | 'teacher';
type Settings = { admins?: unknown[]; teachers?: unknown[] } | undefined;
type Identity = { username?: string; email?: string; email_canonical?: string; emails?: Array<{ address?: string }> };

export function configuredRoleNames(settings: Settings, role: Role): string[] {
  const names = settings?.[role === 'admin' ? 'admins' : 'teachers'];
  return Array.isArray(names) ? names.map(value => String(value || '').trim()).filter(Boolean) : [];
}

export function configuredLoginIdentity(user: Identity) {
  return user.emails?.[0]?.address || user.email || user.username;
}

export function startupRoleIdentifier(name: string, isEmail: (value: string) => boolean) {
  const value = name.trim();
  return isEmail(value) ? value.toLowerCase() : value;
}

export function roleGrantedBySettings(settings: Settings, role: Role, user: Identity, isEmail: (value: string) => boolean, siteOwner?: string) {
  const login = configuredLoginIdentity(user)?.trim().toLowerCase();
  const startup = [user.username, user.email_canonical, ...(user.emails || []).map(email => email.address)];
  if (role === 'admin' && siteOwner && startup.includes(startupRoleIdentifier(siteOwner, isEmail))) return true;
  return configuredRoleNames(settings, role).some(name =>
    name.toLowerCase() === login || startup.includes(startupRoleIdentifier(name, isEmail)));
}
